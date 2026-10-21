"""Allowlisted profile editor. No raw config, auth files, or model calls leave this script."""
import difflib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from uuid import uuid4

APP = Path(__file__).resolve().parent.parent
PROFILE_ROOT = Path(os.environ.get('HERMES_HOME', Path.home() / '.hermes')) / 'profiles'
DATA = Path(os.environ.get('HERMES_DATA_DIR', APP / 'data'))
HERMES = os.environ.get('HERMES_BIN', str(Path.home() / '.local/bin/hermes'))
BANNED_SKILLS = {'google-maps-list-builder'}
FIELDS = {'displayName', 'description', 'model', 'soul', 'enabledSkills'}


def yaml_load(file):
    import yaml
    return yaml.safe_load(file.read_text()) or {} if file.exists() else {}


def profile_dir(ident, root=PROFILE_ROOT):
    if not isinstance(ident, str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}', ident):
        raise ValueError('Invalid profile ID')
    parent = root.resolve()
    target = parent / ident
    if target.is_symlink() or not target.is_dir() or target.resolve().parent != parent:
        raise ValueError('Profile path is not a real local folder')
    for name in ['config.yaml', 'profile.yaml', 'SOUL.md', 'skills']:
        if (target / name).is_symlink():
            raise ValueError('Symlinked profile files cannot be edited')
    return target


def models_for(root, provider, current):
    models = {current}
    for file in root.glob('*/config.yaml'):
        if file.is_symlink() or file.parent.is_symlink():
            continue
        config = yaml_load(file)
        model = config.get('model', {})
        if isinstance(model, dict) and model.get('provider', '') == provider:
            value = model.get('default')
            if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./:@+-]{0,199}', value):
                models.add(value)
    return sorted(models - {''})


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_snapshot(ident, root=PROFILE_ROOT):
    folder = profile_dir(ident, root)
    config = yaml_load(folder / 'config.yaml')
    meta = yaml_load(folder / 'profile.yaml')
    model = config.get('model', {})
    provider = model.get('provider', '') if isinstance(model, dict) else ''
    model_name = model.get('default', '') if isinstance(model, dict) else str(model)
    skills = config.get('skills') or {}
    disabled = skills.get('disabled', []) if isinstance(skills, dict) else []
    if not isinstance(disabled, list):
        raise ValueError('Skills configuration needs review')
    available = sorted(p.name for p in (folder / 'skills').iterdir() if p.is_dir() and not p.is_symlink() and (p / 'SKILL.md').is_file() and not (p / 'SKILL.md').is_symlink() and p.name not in BANNED_SKILLS and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}', p.name)) if (folder / 'skills').exists() else []
    soul = (folder / 'SOUL.md').read_text() if (folder / 'SOUL.md').exists() else ''
    if re.search(r'\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{25,})\b', soul + str(meta.get('description') or '')):
        raise ValueError('Profile instructions contain credential-like text. Remove it outside this editor first.')
    state = {'displayName': str(meta.get('display_name') or ident), 'description': str(meta.get('description') or ''), 'model': model_name, 'soul': soul, 'enabledSkills': [s for s in available if s not in disabled]}
    # Only a digest of config is returned. Secrets and unrelated settings never enter backups.
    file_hashes = {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() if (folder / name).exists() else '' for name in ['config.yaml', 'profile.yaml', 'SOUL.md']}
    revision = digest({'files': file_hashes, 'availableSkills': available})
    return {'id': ident, 'state': state, 'revision': revision, 'provider': provider, 'availableModels': models_for(root, provider, model_name), 'availableSkills': available, 'capabilities': {'pause': False, 'dailyBudget': False}, 'runtimeNote': 'Pause and per-agent daily budgets are not supported by this editor. The global Agent runs switch still applies. New sessions read saved profile settings; existing sessions can keep their current prompt.'}


def validate(desired, current):
    if not isinstance(desired, dict) or set(desired) != FIELDS:
        raise ValueError('Only name, role text, model, SOUL and installed skills can be edited')
    for field, limit in [('displayName', 100), ('description', 4000), ('soul', 100000)]:
        if not isinstance(desired[field], str) or len(desired[field]) > limit or '\x00' in desired[field]:
            raise ValueError('Invalid profile text')
    if not desired['displayName'].strip():
        raise ValueError('Display name is required')
    if desired['model'] not in current['availableModels']:
        raise ValueError('Choose an existing model for this profile provider')
    if not isinstance(desired['enabledSkills'], list) or len(set(desired['enabledSkills'])) != len(desired['enabledSkills']) or any(s not in current['availableSkills'] for s in desired['enabledSkills']):
        raise ValueError('Choose only installed, allowed skills')
    # These are text instructions, never a credential editor.
    if re.search(r'\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{25,})\b', desired['soul'] + desired['description']):
        raise ValueError('Remove credential-like text. This editor never saves secrets.')
    return {**desired, 'displayName': desired['displayName'].strip(), 'enabledSkills': sorted(desired['enabledSkills'])}


def preview(current, desired):
    next_state = validate(desired, current)
    lines = list(difflib.unified_diff(json.dumps(current['state'], ensure_ascii=False, indent=2).splitlines(), json.dumps(next_state, ensure_ascii=False, indent=2).splitlines(), fromfile='Current profile fields', tofile='Proposed profile fields', lineterm=''))
    token = digest({'revision': current['revision'], 'state': next_state})
    return {'ok': True, 'state': next_state, 'revision': current['revision'], 'previewHash': token, 'diff': '\n'.join(lines), 'changed': bool(lines)}


def atomic_text(file, text):
    fd, name = tempfile.mkstemp(prefix=file.name + '.', dir=file.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, file)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def apply_state(ident, desired, root=PROFILE_ROOT, cli=None):
    folder = profile_dir(ident, root)
    current = read_snapshot(ident, root)
    before = current['state']
    def run(args):
        result = subprocess.run([HERMES, *args], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('Hermes rejected a profile change')
    cli = cli or run
    if desired['description'] != before['description']:
        cli(['profile', 'describe', ident, '--text', desired['description']])
    if desired['model'] != before['model']:
        cli(['-p', ident, 'config', 'set', 'model.default', desired['model']])
    if desired['enabledSkills'] != before['enabledSkills']:
        config = yaml_load(folder / 'config.yaml')
        previous = (config.get('skills') or {}).get('disabled', [])
        disabled = sorted(set(s for s in previous if s not in current['availableSkills']) | (set(current['availableSkills']) - set(desired['enabledSkills'])))
        cli(['-p', ident, 'config', 'set', 'skills.disabled', json.dumps(disabled)])
    if desired['displayName'] != before['displayName']:
        # Hermes exposes a metadata writer, but CLI rename would rename the actual profile ID.
        from hermes_cli.profiles import write_profile_meta
        write_profile_meta(folder, display_name=desired['displayName'])
    if desired['soul'] != before['soul']:
        atomic_text(folder / 'SOUL.md', desired['soul'])


def audit_files(ident, data=DATA):
    folder = data / 'agent-edits' / ident
    if folder.is_symlink() or folder.parent.is_symlink():
        raise ValueError('Symlinked audit folders cannot be used')
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    return folder


def save(ident, desired, expected_revision, preview_hash, root=PROFILE_ROOT, data=DATA, apply=None):
    current = read_snapshot(ident, root)
    if current['revision'] != expected_revision:
        raise ValueError('Profile changed. Preview the latest version before saving.')
    plan = preview(current, desired)
    if plan['previewHash'] != preview_hash or not plan['changed']:
        raise ValueError('Review a current diff before saving')
    folder = audit_files(ident, data)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid4().hex[:12]
    file = folder / (stamp + '.json')
    audit = {'id': stamp, 'profile': ident, 'at': datetime.now(timezone.utc).isoformat(), 'before': current['state'], 'after': plan['state'], 'beforeRevision': current['revision'], 'status': 'pending'}
    atomic_text(file, json.dumps(audit))
    apply = apply or (lambda target: apply_state(ident, target, root))
    try:
        apply(plan['state'])
        checked = read_snapshot(ident, root)
        if checked['state'] != plan['state']:
            raise RuntimeError('Profile save did not verify')
        audit['afterRevision'] = checked['revision']
        audit['status'] = 'saved'
        atomic_text(file, json.dumps(audit))
        return {'ok': True, 'auditId': stamp, **checked}
    except Exception:
        try:
            apply(current['state'])
            audit['status'] = 'rolled-back'
        except Exception:
            audit['status'] = 'needs-recovery'
        atomic_text(file, json.dumps(audit))
        raise RuntimeError('Profile save failed. Check the audit and current profile before retrying.')


def history(ident):
    return [{'id': v['id'], 'at': v['at'], 'status': v['status']} for file in sorted(audit_files(ident).glob('*.json'), reverse=True)[:20] if (v := json.loads(file.read_text()))]


def main(payload):
    ident = payload.get('id')
    team = json.loads((APP / 'team.json').read_text())
    if ident not in [a['id'] for a in team['agents']]:
        raise ValueError('Choose an agent in the Hermes roster')
    current = read_snapshot(ident)
    action = payload.get('action')
    if action == 'read':
        return {'ok': True, **current, 'history': history(ident)}
    if action == 'preview':
        return preview(current, payload.get('state'))
    lock_file = audit_files(ident) / 'editor.lock'
    with lock_file.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'save':
            return save(ident, payload.get('state'), payload.get('revision'), payload.get('previewHash'))
        if action == 'revert':
            audit_id = payload.get('auditId', '')
            if not re.fullmatch(r'\d{8}T\d{6}-[a-f0-9]{12}', audit_id):
                raise ValueError('Invalid audit ID')
            audit_file = audit_files(ident) / (audit_id + '.json')
            if audit_file.is_symlink():
                raise ValueError('Symlinked audit files cannot be used')
            audit = json.loads(audit_file.read_text())
            current = read_snapshot(ident)
            if audit.get('status') != 'saved' or current['revision'] != audit.get('afterRevision'):
                raise ValueError('Only the latest unchanged save can be reverted. Preview a new edit instead.')
            plan = preview(current, audit['before'])
            result = save(ident, audit['before'], current['revision'], plan['previewHash'])
            audit['status'] = 'reverted'
            atomic_text(audit_files(ident) / (audit_id + '.json'), json.dumps(audit))
            return result
    raise ValueError('Unsupported editor action')


if __name__ == '__main__':
    sys.path.insert(0, str(Path.home() / '.hermes/hermes-agent'))
    import hermes_bootstrap
    try:
        print(json.dumps(main(json.load(sys.stdin))))
    except Exception as error:
        # Our validation messages are fixed, never raw subprocess stderr or config contents.
        message = str(error) if isinstance(error, ValueError) else 'The profile operation was not confirmed. Check the current profile and audit before retrying.'
        print(json.dumps({'ok': False, 'error': message}))
