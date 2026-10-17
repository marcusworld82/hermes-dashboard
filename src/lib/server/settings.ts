import { readJson, writeJson } from "./store";

export type Settings = {
  // Off by default. While off, nothing is sent to a model and no agent is started,
  // so building and testing the dashboard never spends money.
  agentRuns: boolean;
  headAgent: string;
};

const defaults: Settings = { agentRuns: false, headAgent: "rhoperations" };

export function getSettings(): Settings {
  return { ...defaults, ...readJson<Partial<Settings>>("settings", {}) };
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
