import {
  LayoutDashboard,
  Globe,
  Radar,
  Workflow as Flow,
  Kanban,
  MessageSquare,
  Bot,
  GitBranch,
  Puzzle,
  Plug,
  CalendarDays,
  Users,
  Film,
  Megaphone,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; desktopOnly?: boolean; hint?: string };

export const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard, hint: "Today at a glance" },
      { href: "/pipeline", label: "Pipeline", icon: Flow, hint: "Inbox to shipped" },
      { href: "/kanban", label: "Kanban", icon: Kanban, hint: "Every Marcus OS card" },
      { href: "/chat", label: "Chat", icon: MessageSquare, hint: "Agents, groups, models" },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/agents", label: "Agents", icon: Bot, hint: "Your eight agents" },
      { href: "/workflows", label: "Workflows", icon: GitBranch, hint: "Saved multi-step jobs" },
      { href: "/skills", label: "Skills", icon: Puzzle, hint: "Upload and assign" },
      { href: "/connections", label: "Connections", icon: Plug, hint: "APIs, MCP, models" },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/social", label: "Social", icon: CalendarDays, hint: "Calendar and captions" },
      { href: "/content-research", label: "Content research", icon: Radar, hint: "Source headlines for briefs" },
      { href: "/lead-research", label: "Lead Research", icon: Radar, hint: "Apify to Notion leads" },
      { href: "/leads", label: "Lead inbox", icon: Users, hint: "Evidence, drafts and approval" },
      { href: "/outbox", label: "Outbox", icon: MessageSquare, hint: "Approved email queue" },
      { href: "/discovery", label: "Discovery", icon: Globe, hint: "Apify runs and costs" },
      { href: "/find-leads", label: "Claude finder", icon: Users, hint: "Research on your Mac" },
      { href: "/muse", label: "Muse", icon: Bot, hint: "Manual research and import" },
      { href: "/clients", label: "Clients", icon: Users, hint: "Deliverables and next actions" },
      { href: "/prospects", label: "Legacy prospects", icon: Users, hint: "Notion leads and Bigin" },
      { href: "/crm", label: "CRM", icon: Users, desktopOnly: true, hint: "Leads, sales, inbox" },
      { href: "/recast", label: "Recast", icon: Film, desktopOnly: true, hint: "Video to captions and scripts" },
      { href: "/openadkit", label: "OpenAdKit", icon: Megaphone, desktopOnly: true, hint: "AI ad copy and creative" },
    ],
  },
];

export const settingsItem: NavItem = { href: "/settings", label: "Settings", icon: Settings, hint: "Agent runs and setup" };

export const allItems = [...sections.flatMap((s) => s.items), settingsItem];

export const tabs = ["/dashboard", "/pipeline", "/chat", "/agents"];

export function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")) || (href !== "/dashboard" && pathname === href);
}
