import { DatabaseSync } from "node:sqlite";

export function readBoardCounts(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=250");
    const rows = db.prepare("SELECT status, assignee, COUNT(*) AS count FROM tasks WHERE status != 'archived' GROUP BY status, assignee").all() as { status: string; assignee: string | null; count: number }[];
    const by_status: Record<string, number> = {};
    const by_assignee: Record<string, number> = {};
    for (const row of rows) {
      by_status[row.status] = (by_status[row.status] ?? 0) + Number(row.count);
      if (row.assignee) by_assignee[row.assignee] = (by_assignee[row.assignee] ?? 0) + Number(row.count);
    }
    return { by_status, by_assignee };
  } finally { db.close(); }
}

export function readBoardTasks(file: string, opts: { archived?: boolean; status?: string; assignee?: string } = {}) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=250");
    const filters = opts.archived ? [] : ["status != 'archived'"];
    const values: string[] = [];
    if (opts.status) { filters.push("status = ?"); values.push(opts.status); }
    if (opts.assignee) { filters.push("assignee = ?"); values.push(opts.assignee); }
    const sql = `SELECT id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,result,skills,last_failure_error FROM tasks ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY created_at DESC`;
    const rows = db.prepare(sql).all(...values) as Record<string, unknown>[];
    return rows.map((row) => {
      let skills: string[] = [];
      try { const parsed = JSON.parse(String(row.skills ?? "[]")); if (Array.isArray(parsed)) skills = parsed.filter((value) => typeof value === "string"); } catch {}
      return { ...row, skills };
    });
  } finally { db.close(); }
}
