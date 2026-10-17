import os from "node:os";
import path from "node:path";

const home = os.homedir();

// Every path has a default for Marcus's Mac and can be overridden in .env.local.
export const paths = {
  hermesBin: process.env.HERMES_BIN || path.join(home, ".local/bin/hermes"),
  hermesHome: path.join(home, ".hermes"),
  board: process.env.HERMES_BOARD || "command-center",
  agentsDir: process.env.LAZY_MONEY_AGENTS_DIR || path.join(home, "Desktop/LAZY MONEY AGENTS"),
  crmDir: process.env.CRM_DIR || path.join(home, "Desktop/Content and Outreach App/app"),
  crmUrl: process.env.CRM_URL || "http://127.0.0.1:3100",
  vault: process.env.OBSIDIAN_VAULT || path.join(home, "Documents/second-brain"),
  vaultPipelineFolder: process.env.OBSIDIAN_PIPELINE_FOLDER || "Hermes/Pipeline",
  claudeBin: process.env.CLAUDE_BIN || path.join(home, ".local/bin/claude"),
  codexBin: process.env.CODEX_BIN || path.join(home, ".local/bin/codex"),
  data: path.join(process.cwd(), "data"),
};
