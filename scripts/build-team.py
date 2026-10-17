#!/usr/bin/env python3
"""Builds Marcus's agent team in Hermes from team.json.

Safe to run again: it creates missing profiles, rewrites each agent's SOUL.md,
profile.yaml and model settings, and copies skills that are not there yet.
It never deletes a profile or a skill. Run with Hermes's own Python so PyYAML is there:

  ~/.hermes/hermes-agent/venv/bin/python scripts/build-team.py
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

HOME = Path.home()
HERMES = HOME / ".local/bin/hermes"
PROFILES = HOME / ".hermes/profiles"
TEAM = json.loads((Path(__file__).resolve().parent.parent / "team.json").read_text())

# Where each skill's folder is copied from. Plugin and synced skills live outside ~/.claude/skills.
SKILL_DIRS = [HOME / ".claude/skills"]
SKILL_DIRS += sorted((HOME / ".claude/skills/synced").glob("*")) if (HOME / ".claude/skills/synced").exists() else []
SKILL_DIRS += sorted((HOME / ".claude/plugins/cache").glob("*/*/*/skills"))

VAULT = HOME / "Documents/second-brain"
FOUNDATION = VAULT / "AI Brain/2026-10-16-marcus-personal-brand-foundation.md"
SOCIAL_SPECS = VAULT / "Wiki/Social Media.md"
LYFE_SYSTEM = VAULT / "Wiki/Lyfe with Marcus Brand and Content System.md"


def find_skill(name):
    for root in SKILL_DIRS:
        p = root / name
        if (p / "SKILL.md").exists():
            return p.resolve()
    return None


def soul(agent, names):
    head = TEAM["head"]
    lines = [
        f"# {agent['name']}, {agent['title']}",
        "",
        f"You are {agent['name']}. {agent['description']}",
        "",
        "## Your job",
        *[f"- {j}" for j in agent["job"]],
        "",
        "## Who you work with",
    ]
    if agent["id"] == head:
        lines.append(f"- Your team: {agent['team']}")
    else:
        lines.append(f"- You report to {names[head]}, the head agent. Marcus can also message you directly; answer him the same way.")
    lines += [
        "- Quinn (QA) checks every deliverable before it reaches Marcus. When your work is ready, request a review with Quinn as the reviewer. Quinn's fail stands until fixed.",
        "- Hand work to another agent by creating or commenting on a Kanban card, never by doing their job yourself.",
        "",
        "## Rules from Marcus (always)",
        "- Never use em dashes. Use commas or periods.",
        "- Plain words a 12 year old could follow. Answer first. No filler, no warm-up sentences, no motivational wrap-ups.",
        "- Skip these words: delve, crucial, pivotal, robust, seamless, leverage, foster, unlock, navigate, elevate, utilize.",
        "- No made-up stats, quotes, results, clients or examples. Say what is checked and what is a guess.",
        "- If a request does not make sense or there is a better way, say so before doing it.",
        "- Spending money always waits for Marcus's OK: paid image or video generations, ads, tools, subscriptions, purchases. Give the cost and a limit when you ask.",
        "- Never put passwords, API keys or tokens in messages, cards, files or prompts.",
        "",
        "## Brand",
        f"- The main brand is Lyfe with Marcus (spelled L-Y-F-E), Marcus's personal brand. Read the foundation before any brand or content work: {FOUNDATION}",
        f"- The content system: {LYFE_SYSTEM}",
        f"- Social content must meet the specs in {SOCIAL_SPECS}.",
        "- For other brands (COAD, Zamari, Treasure, Lazy Money, Money Gap, client brands), use that brand's own foundation and brand kit. If none exists, say so.",
        "- Reveal House is not a focus. Do not default to it.",
    ]
    if agent.get("claudeDesk"):
        lines += [
            "",
            "## Claude desk (for writing)",
            f"- For {agent['claudeDesk']}, hand the writing to Claude Code on this Mac, which uses Marcus's Claude plan:",
            "  `claude -p \"<a complete brief: goal, audience, brand rules, length, format>\"`",
            "- Read what comes back, fix it to the brand voice and the rules above, then use it. You stay responsible for the result.",
        ]
    lines += ["", "## Tools", f"- {agent['tools']}. If a tool is not connected yet, say so and do the part you can."]
    knowledge = agent.get("extraKnowledge", [])
    if knowledge:
        lines += ["", "## Read before working", *[f"- {k}" for k in knowledge]]
    lines += [
        "",
        "## Memory",
        f"- Shipped projects are logged in Obsidian under {VAULT / 'Hermes/Pipeline'}. Check there before redoing past work.",
        "",
    ]
    return "\n".join(lines)


def run(args):
    return subprocess.run([str(HERMES), *args], capture_output=True, text=True, timeout=120)


def main():
    names = {a["id"]: a["name"] for a in TEAM["agents"]}
    existing = {p.name for p in PROFILES.iterdir()} if PROFILES.exists() else set()
    report = []
    for a in TEAM["agents"]:
        pid = a["id"]
        if pid not in existing:
            r = run(["profile", "create", pid, "--no-alias", "--description", a["description"]])
            if r.returncode != 0:
                print(f"FAILED to create {pid}: {r.stderr.strip()[-300:]}")
                sys.exit(1)
        pdir = PROFILES / pid
        (pdir / "SOUL.md").write_text(soul(a, names))
        (pdir / "profile.yaml").write_text(
            yaml.safe_dump({"description": a["description"], "description_auto": False, "display_name": a["name"]}, sort_keys=False)
        )
        cfg_path = pdir / "config.yaml"
        cfg = yaml.safe_load(cfg_path.read_text()) if cfg_path.exists() else {}
        cfg = cfg or {}
        cfg["model"] = {"default": a["model"], "provider": a["provider"], "base_url": ""}
        cfg["fallback_model"] = {"provider": a["fallback"]["provider"], "model": a["fallback"]["model"]}
        cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False))

        if pid == "sage":
            src = PROFILES / "treasuremanager/SOUL.md"
            if src.exists():
                shutil.copyfile(src, pdir / "TREASURE-BRIEF.md")

        sdir = pdir / "skills"
        sdir.mkdir(exist_ok=True)
        copied, missing = [], []
        for s in a["skills"]:
            dest = sdir / s
            if dest.exists():
                copied.append(s)
                continue
            src = find_skill(s)
            if not src:
                missing.append(s)
                continue
            shutil.copytree(src, dest, symlinks=False, ignore=shutil.ignore_patterns("node_modules", ".git", "__pycache__", ".DS_Store"))
            copied.append(s)
        report.append((pid, a["model"], a["provider"], len(copied), missing))

    for pid, model, provider, n, missing in report:
        print(f"{pid:7} {provider:13} {model:42} skills {n}" + (f"  missing: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
