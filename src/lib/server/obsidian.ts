import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";

// Writes one note per shipped project so any agent can pick the project up later
// without Marcus explaining it again.

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";
}

export function vaultReady() {
  return fs.existsSync(paths.vault);
}

export function logProject(input: {
  title: string;
  idea: string;
  plan: string;
  steps: { title: string; agent: string; result: string | null }[];
  taskId: string;
  board: string;
}) {
  if (!vaultReady()) throw new Error(`Obsidian vault not found at ${paths.vault}`);
  const dir = path.join(paths.vault, paths.vaultPipelineFolder);
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${date}-${slug(input.title)}.md`);
  const lines = [
    "---",
    `title: "${input.title.replace(/"/g, "'")}"`,
    `date: ${date}`,
    `hermes_board: ${input.board}`,
    `hermes_task: ${input.taskId}`,
    "tags: [hermes, pipeline, shipped]",
    "---",
    "",
    `# ${input.title}`,
    "",
    "## The idea",
    input.idea || "(none)",
    "",
    "## The approved plan",
    input.plan || "(none)",
    "",
    "## Who built what",
    ...input.steps.map((s) => `- **${s.title}** (${s.agent}): ${s.result ?? "no result recorded"}`),
    "",
    "## Where it lives",
    `Hermes task \`${input.taskId}\` on board \`${input.board}\`. Run \`hermes kanban --board ${input.board} show ${input.taskId}\` for the full history.`,
    "",
  ];
  fs.writeFileSync(file, lines.join("\n"));
  return path.relative(paths.vault, file);
}
