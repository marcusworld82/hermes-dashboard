"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, GripVertical } from "lucide-react";

type Task = {
  id: string;
  title: string;
  agent: string;
  priority: "low" | "med" | "high";
};

const columns = [
  { id: "intake", title: "Intake", color: "bg-slate-400" },
  { id: "research", title: "Research", color: "bg-blue-500" },
  { id: "write", title: "Write", color: "bg-emerald-500" },
  { id: "code", title: "Code", color: "bg-violet-500" },
  { id: "review", title: "Review", color: "bg-amber-500" },
  { id: "done", title: "Done", color: "bg-rose-500" },
];

const initial: Record<string, Task[]> = {
  intake: [
    { id: "t1", title: "New feature brief", agent: "—", priority: "med" },
    { id: "t2", title: "Competitor scan", agent: "—", priority: "low" },
  ],
  research: [
    { id: "t3", title: "Market trends Q4", agent: "Research", priority: "high" },
  ],
  write: [
    { id: "t4", title: "Landing page copy", agent: "Writer", priority: "med" },
  ],
  code: [
    { id: "t5", title: "Auth middleware fix", agent: "Coder", priority: "high" },
  ],
  review: [
    { id: "t6", title: "PR #142 review", agent: "Reviewer", priority: "med" },
  ],
  done: [
    { id: "t7", title: "Deploy staging", agent: "Deployer", priority: "low" },
  ],
};

export default function KanbanPage() {
  const [board, setBoard] = useState(initial);

  const advance = (taskId: string, fromCol: string) => {
    const fromIdx = columns.findIndex((c) => c.id === fromCol);
    if (fromIdx < 0 || fromIdx === columns.length - 1) return;
    const toCol = columns[fromIdx + 1].id;
    setBoard((prev) => {
      const task = prev[fromCol].find((t) => t.id === taskId);
      if (!task) return prev;
      return {
        ...prev,
        [fromCol]: prev[fromCol].filter((t) => t.id !== taskId),
        [toCol]: [...prev[toCol], { ...task, agent: columns[fromIdx + 1].title }],
      };
    });
  };

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-56px)] md:h-screen flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kanban</h1>
          <p className="text-sm text-[#6b7280]">Tasks move automatically to the next agent</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[#1a1d24] text-white text-sm px-4 py-2 rounded-2xl hover:opacity-90 active:scale-[0.98] transition">
          <Plus size={16} /> New task
        </button>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-3 h-full min-w-max">
          {columns.map((col) => (
            <div
              key={col.id}
              className="w-[280px] flex-shrink-0 bg-white/60 rounded-3xl p-3 flex flex-col border border-[#e8eaee]/60"
            >
              <div className="flex items-center gap-2 px-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="font-medium text-sm">{col.title}</span>
                <span className="ml-auto text-xs text-[#9ca3af]">{board[col.id]?.length || 0}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {(board[col.id] || []).map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-3 shadow-sm border border-[#e8eaee] group cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => advance(task.id, col.id)}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="text-[#d1d5db] mt-0.5 opacity-0 group-hover:opacity-100" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-[#6b7280]">{task.agent}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              task.priority === "high"
                                ? "bg-rose-50 text-rose-600"
                                : task.priority === "med"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-slate-50 text-slate-500"
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
