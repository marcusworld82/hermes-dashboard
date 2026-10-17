import { readJson, updateJson, newId, now } from "./store";
import { getSettings, requireRuns } from "./settings";
import { askProfile } from "./hermes";
import { getAgents } from "./agents";
import { sendToBridge } from "./models";

// Three ways to talk: one agent, a group of agents, or a model directly.
// The head agent (the Operator) is the default target.

export type Target =
  | { kind: "agent"; id: string }
  | { kind: "group"; id: string }
  | { kind: "model"; id: string; model?: string };

export type Message = {
  id: string;
  role: "user" | "agent" | "system";
  author: string; // agent id, model id, or "marcus"
  text: string;
  at: number;
  error?: boolean;
};

export type Thread = { id: string; title: string; target: Target; messages: Message[]; createdAt: number; updatedAt: number };

export type Group = { id: string; name: string; members: string[]; lead: string; createdAt: number };

type Threads = Record<string, Thread>;

export function listThreads() {
  return Object.values(readJson<Threads>("threads", {}))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ messages, ...t }) => ({ ...t, count: messages.length, last: messages[messages.length - 1]?.text.slice(0, 140) ?? "" }));
}

export function getThread(id: string) {
  const t = readJson<Threads>("threads", {})[id];
  if (!t) throw new Error("Conversation not found.");
  return t;
}

export function createThread(target: Target, title?: string) {
  const t: Thread = { id: newId("th"), title: title || "New conversation", target, messages: [], createdAt: now(), updatedAt: now() };
  updateJson<Threads>("threads", {}, (d) => {
    d[t.id] = t;
  });
  return t;
}

export function deleteThread(id: string) {
  updateJson<Threads>("threads", {}, (d) => {
    delete d[id];
  });
}

function push(id: string, msgs: Message[], title?: string) {
  let out: Thread | undefined;
  updateJson<Threads>("threads", {}, (d) => {
    const t = d[id];
    if (!t) throw new Error("Conversation not found.");
    t.messages.push(...msgs);
    t.updatedAt = now();
    if (title && t.title === "New conversation") t.title = title;
    out = t;
  });
  return out!;
}

function history(t: Thread, max = 12) {
  return t.messages
    .slice(-max)
    .map((m) => `${m.role === "user" ? "Marcus" : m.author}: ${m.text}`)
    .join("\n\n");
}

function withHistory(t: Thread, text: string, extra = "") {
  const past = history(t);
  return [extra, past ? `Conversation so far:\n${past}\n` : "", `Marcus: ${text}`].filter(Boolean).join("\n\n");
}

export async function send(threadId: string, text: string) {
  const body = text.trim();
  if (!body) throw new Error("Type a message first.");
  const thread = getThread(threadId);
  const user: Message = { id: newId("m"), role: "user", author: "marcus", text: body, at: now() };
  const title = body.length > 48 ? `${body.slice(0, 45)}...` : body;
  push(threadId, [user], title);
  try {
    requireRuns();
  } catch (e) {
    return push(threadId, [{ id: newId("m"), role: "system", author: "dashboard", text: (e as Error).message, at: now(), error: true }]);
  }

  const target = thread.target;
  const replies: Message[] = [];
  const reply = (author: string, text: string, error = false): Message => ({ id: newId("m"), role: error ? "system" : "agent", author, text, at: now(), error });

  if (target.kind === "agent") {
    try {
      replies.push(reply(target.id, await askProfile(target.id, withHistory(thread, body))));
    } catch (e) {
      replies.push(reply(target.id, `${target.id} could not answer: ${(e as Error).message}`, true));
    }
  } else if (target.kind === "model") {
    try {
      replies.push(reply(target.id, await sendToBridge(target.id, withHistory(thread, body), target.model)));
    } catch (e) {
      replies.push(reply(target.id, `${target.id} could not answer: ${(e as Error).message}`, true));
    }
  } else {
    // Group: every member answers from their own role, then the lead sums it up.
    const group = getGroup(target.id);
    const agents = await getAgents();
    const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    const roster = group.members.map((m) => names[m] ?? m).join(", ");
    const answers = await Promise.all(
      group.members.map(async (m) => {
        try {
          const prompt = withHistory(thread, body, `You are in a group chat called "${group.name}" with ${roster}. Answer from your own role only, briefly. Say what you would do and what you need from the others.`);
          return reply(m, await askProfile(m, prompt));
        } catch (e) {
          return reply(m, `${names[m] ?? m} could not answer: ${(e as Error).message}`, true);
        }
      }),
    );
    replies.push(...answers);
    const ok = answers.filter((a) => !a.error);
    if (ok.length > 1) {
      try {
        const summary = await askProfile(
          group.lead,
          `Marcus asked the group "${group.name}": ${body}\n\nTheir answers:\n${ok.map((a) => `${names[a.author] ?? a.author}: ${a.text}`).join("\n\n")}\n\nAs the lead, give Marcus one short combined answer: the decision, who does what, and anything he must decide.`,
        );
        replies.push(reply(group.lead, `Summary: ${summary}`));
      } catch {}
    }
  }
  return push(threadId, replies);
}

// ---------- groups ----------

type Groups = Record<string, Group>;

export function listGroups() {
  return Object.values(readJson<Groups>("groups", {})).sort((a, b) => a.name.localeCompare(b.name));
}

export function getGroup(id: string) {
  const g = readJson<Groups>("groups", {})[id];
  if (!g) throw new Error("Group not found.");
  return g;
}

export async function saveGroup(input: { id?: string; name: string; members: string[]; lead?: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Name the group.");
  const valid = new Set((await getAgents()).map((a) => a.id));
  const members = [...new Set(input.members)].filter((m) => valid.has(m));
  if (members.length < 2) throw new Error("Pick at least two agents.");
  const lead = input.lead && members.includes(input.lead) ? input.lead : members.includes(getSettings().headAgent) ? getSettings().headAgent : members[0];
  const g: Group = { id: input.id || newId("g"), name, members, lead, createdAt: now() };
  updateJson<Groups>("groups", {}, (d) => {
    d[g.id] = { ...d[g.id], ...g };
  });
  return g;
}

export function deleteGroup(id: string) {
  updateJson<Groups>("groups", {}, (d) => {
    delete d[id];
  });
}

// Message counts per agent, used for "who you talk to most".
export function talkCounts() {
  const counts: Record<string, number> = {};
  const groups = readJson<Groups>("groups", {});
  for (const t of Object.values(readJson<Threads>("threads", {}))) {
    const sent = t.messages.filter((m) => m.role === "user").length;
    if (!sent) continue;
    const ids = t.target.kind === "agent" ? [t.target.id] : t.target.kind === "group" ? groups[t.target.id]?.members ?? [] : [`model:${t.target.id}`];
    for (const id of ids) counts[id] = (counts[id] ?? 0) + sent;
  }
  return counts;
}
