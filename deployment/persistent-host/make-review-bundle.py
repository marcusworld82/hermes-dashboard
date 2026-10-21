"""Build a source-only review archive. No upload, credentials, local data or activation."""
from pathlib import Path
import tarfile
import hashlib
import sys

root = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/hermes-host-review.tar.gz").resolve()
if destination.exists():
    raise SystemExit("Destination exists. Choose a fresh archive path.")
files = []
for folder in ("src", "scripts", "tests", "public", "deployment"):
    for file in (root / folder).rglob("*"):
        relative = file.relative_to(root)
        if file.is_symlink() or not file.is_file():
            continue
        if any(part.startswith(".") or part in {"__pycache__", "node_modules", "data"} for part in relative.parts):
            continue
        if file.suffix not in {".ts", ".tsx", ".js", ".mjs", ".mts", ".py", ".css", ".json", ".svg", ".md", ".service", ".example", ".conf"}:
            continue
        files.append(file)
for name in ("package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "eslint.config.mjs", "team.json"):
    file = root / name
    if file.is_file() and not file.is_symlink():
        files.append(file)
with tarfile.open(destination, "w:gz") as archive:
    for file in sorted(set(files)):
        archive.add(file, arcname="app/" + str(file.relative_to(root)), recursive=False)
print(f"Review archive: {destination}")
print(f"Files: {len(set(files))}")
print(f"SHA256: {hashlib.sha256(destination.read_bytes()).hexdigest()}")
