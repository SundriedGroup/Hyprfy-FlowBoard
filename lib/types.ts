export type FlowItemType =
  | "task"
  | "idea"
  | "script"
  | "capture"
  | "edit"
  | "publish"
  | "event"
  | "note";

export type FlowItemStatus = "open" | "done" | "archived";

export interface FlowDay {
  id: string;
  user_id: string;
  day: string;
  theme: string | null;
  main_outcome: string | null;
  whats_happening: string | null;
  story_opportunity: string | null;
  notes: string | null;
  capacity_minutes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FlowItem {
  id: string;
  user_id: string;
  day: string | null;
  project_id: string | null;
  item_type: FlowItemType;
  title: string;
  description: string | null;
  status: FlowItemStatus;
  priority: number;
  start_time: string | null;
  duration_minutes: number | null;
  sort_order: number;
  linked_moment_id: string | null;
  linked_content_id: string | null;
  linked_episode_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FlowProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DayDraft = Pick<
  FlowDay,
  | "theme"
  | "main_outcome"
  | "whats_happening"
  | "story_opportunity"
  | "notes"
  | "capacity_minutes"
>;
