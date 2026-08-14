import { CalendarDays, FolderKanban, Inbox, LayoutGrid, Settings } from "lucide-react";

export const navItems = [
  { label: "Flowboard", icon: LayoutGrid, active: true },
  { label: "Calendar", icon: CalendarDays },
  { label: "Projects", icon: FolderKanban },
  { label: "Inbox", icon: Inbox, inbox: true },
  { label: "Settings", icon: Settings },
];
