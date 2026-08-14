import { CalendarDays, Inbox, LayoutDashboard, LayoutGrid, NotebookPen, RadioTower, UserRound } from "lucide-react";

export const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" as const },
  { label: "Brand Profile", icon: UserRound, view: "brand" as const },
  { label: "Channels", icon: RadioTower, view: "channels" as const },
  { label: "Weekly Brief", icon: NotebookPen, view: "brief" as const },
  { label: "Flowboard", icon: LayoutGrid, view: "flowboard" as const },
  { label: "Calendar", icon: CalendarDays },
  { label: "Inbox", icon: Inbox, inbox: true },
];
