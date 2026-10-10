"use client";

import { motion } from "framer-motion";

const agents = [
  { id: "research", name: "Research", desc: "Gathers sources and synthesizes findings", status: "Ready" },
  { id: "writer", name: "Writer", desc: "Turns research into clear drafts", status: "Active" },
  { id: "coder", name: "Coder", desc: "Implements and refactors code", status: "Active" },
  { id: "reviewer", name: "Reviewer", desc: "Checks quality and correctness", status: "Ready" },
  { id: "deployer", name: "Deployer", desc: "Ships approved work", status: "Queued" },
];

export default function AgentsPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Agents</h1>
      <p className="text-sm text-[#6b7280] mb-6">Placeholder profiles. Wire to Hermes bots later.</p>
      <div className="space-y-3">
        {agents.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-white rounded-2xl p-4 border border-[#e8eaee]/60 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-[#6b7280]">{a.desc}</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-[#f4f5f7] text-[#6b7280]">{a.status}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
