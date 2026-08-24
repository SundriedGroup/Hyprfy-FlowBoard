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

export interface FlowProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  goal: string | null;
  target_date: string | null;
  notes: string | null;
  icon: string | null;
  color: string | null;
  archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FlowItem {
  id: string;
  user_id: string;
  day: string | null;
  project_id: string | null;
  item_type: "task" | "idea" | "script" | "capture" | "edit" | "publish" | "event" | "note";
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

export type ContentMeta = {
  content_kind?: "content" | "vlog";
  channel?: string;
  plan?: string;
  copy?: string;
  script?: string;
  post_copy?: string;
  storyboard?: string;
  source_url?: string;
  why_like?: string;
  source_idea_id?: string;
  preview_title?: string;
  preview_description?: string;
  preview_image?: string;
  preview_domain?: string;
  cover_image?: string;
};
