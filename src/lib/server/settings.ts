import { readJson, writeJson } from "./store";
import { readTeam } from "./agents";

export type Settings = {
  // Off by default. While off, nothing is sent to a model and no agent is started,
  // so building and testing the dashboard never spends money.
  agentRuns: boolean;
  headAgent: string;
};

const defaults: Settings = { agentRuns: false, headAgent: "jordan" };

export function getSettings(): Settings {
  const saved = { ...defaults, ...readJson<Partial<Settings>>("settings", {}) };
  // A head agent saved before the team changed falls back to the team's head.
  const team = readTeam();
  if (!team.agents.some((a) => a.id === saved.headAgent)) saved.headAgent = team.head || defaults.headAgent;
  return saved;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  writeJson("settings", next);
  return next;
}

export class RunsOffError extends Error {
  constructor() {
    super("Agent runs are off. Turn them on in Settings when your models are connected.");
  }
}

export function requireRuns() {
  if (!getSettings().agentRuns) throw new RunsOffError();
}
