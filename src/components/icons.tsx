import { CalendarDays, FolderKanban, Inbox, LayoutDashboard, LayoutGrid, Settings } from "lucide-react";

export const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" as const },
  { label: "Flowboard", icon: LayoutGrid, view: "flowboard" as const },
  { label: "Calendar", icon: CalendarDays },
  { label: "Projects", icon: FolderKanban },
  { label: "Inbox", icon: Inbox, inbox: true },
  { label: "Settings", icon: Settings },
];
