"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  Clock,
  Zap,
  ArrowUpRight,
  Circle,
} from "lucide-react";

const agents = [
  { id: "research", name: "Research", status: "idle", color: "bg-blue-500", tasks: 3 },
  { id: "writer", name: "Writer", status: "active", color: "bg-emerald-500", tasks: 1 },
  { id: "coder", name: "Coder", status: "active", color: "bg-violet-500", tasks: 2 },
  { id: "reviewer", name: "Reviewer", status: "idle", color: "bg-amber-500", tasks: 0 },
  { id: "deployer", name: "Deployer", status: "queued", color: "bg-rose-500", tasks: 1 },
];

const stats = [
  { label: "Active Agents", value: "2", change: "+1", icon: Bot },
  { label: "Tasks Today", value: "14", change: "+3", icon: Activity },
  { label: "Avg. Runtime", value: "4.2m", change: "-12%", icon: Clock },
  { label: "Credits Used", value: "128", change: "+24", icon: Zap },
];

export default function DashboardPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <p className="text-sm text-[#6b7280]">Saturday, October 10</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Good morning
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#e8eaee]/60 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#6b7280]">{s.label}</span>
              <s.icon size={16} className="text-[#9ca3af]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{s.value}</span>
              <span className="text-xs text-emerald-600">{s.change}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Agents */}
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-[#e8eaee]/60">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">Agents</h2>
          <button className="text-sm text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">
            View all <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {agents.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              whileHover={{ y: -2 }}
              className="rounded-2xl border border-[#e8eaee] p-4 bg-[#fafbfc] hover:bg-white hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-xl ${a.color} flex items-center justify-center text-white text-xs font-medium`}>
                  {a.name[0]}
                </div>
                <Circle
                  size={8}
                  className={
                    a.status === "active"
                      ? "fill-emerald-500 text-emerald-500"
                      : a.status === "queued"
                      ? "fill-amber-500 text-amber-500"
                      : "fill-[#d1d5db] text-[#d1d5db]"
                  }
                />
              </div>
              <p className="font-medium text-sm">{a.name}</p>
              <p className="text-xs text-[#6b7280] mt-0.5 capitalize">{a.status}</p>
              <p className="text-xs text-[#9ca3af] mt-2">{a.tasks} tasks</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent activity placeholder */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e8eaee]/60">
          <h3 className="font-semibold mb-4">Recent Runs</h3>
          <div className="space-y-3">
            {[
              { title: "Research market trends", agent: "Research", time: "12m ago" },
              { title: "Draft landing copy", agent: "Writer", time: "28m ago" },
              { title: "Fix auth middleware", agent: "Coder", time: "1h ago" },
            ].map((r) => (
              <div key={r.title} className="flex items-center justify-between py-2 border-b border-[#f0f1f3] last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-[#6b7280]">{r.agent}</p>
                </div>
                <span className="text-xs text-[#9ca3af]">{r.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e8eaee]/60">
          <h3 className="font-semibold mb-4">Pipeline Health</h3>
          <div className="space-y-4">
            {[
              { label: "Research → Writer", pct: 72 },
              { label: "Writer → Coder", pct: 48 },
              { label: "Coder → Reviewer", pct: 31 },
            ].map((p) => (
              <div key={p.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[#6b7280]">{p.label}</span>
                  <span>{p.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#f0f1f3] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1a1d24] rounded-full"
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
