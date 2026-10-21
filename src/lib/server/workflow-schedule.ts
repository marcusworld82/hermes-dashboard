export type WorkflowSchedule = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  time: string;
  timezone: string;
  weekday: number;
};

export function validateSchedule(value: WorkflowSchedule): WorkflowSchedule {
  if (!value || typeof value.enabled !== "boolean" || !["daily", "weekly"].includes(value.frequency)) throw new Error("Choose a daily or weekly schedule.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) throw new Error("Choose a valid schedule time.");
  if (!Number.isInteger(value.weekday) || value.weekday < 0 || value.weekday > 6) throw new Error("Choose a weekday.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(); } catch { throw new Error("Choose a valid time zone."); }
  return { enabled: value.enabled, frequency: value.frequency, time: value.time, timezone: value.timezone, weekday: value.weekday };
}

// One slot per local calendar day. A late worker catches up today's run only.
export function dueSlot(rule: WorkflowSchedule | undefined, now = new Date()): string | null {
  if (!rule?.enabled) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: rule.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  if (`${p.hour}:${p.minute}` < rule.time) return null;
  if (rule.frequency === "weekly" && ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) !== rule.weekday) return null;
  return `${p.year}-${p.month}-${p.day}`;
}
