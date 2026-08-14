export type PlanDecision = "post_today" | "bank_for_weekly_vlog" | "post_and_bank";

export interface GeneratedContentItem {
  title: string;
  description: string;
  stage: "idea" | "script" | "capture" | "edit" | "publish";
  durationMinutes: number;
  channels: string[];
}

export interface GeneratedTodoItem {
  title: string;
  description: string;
  durationMinutes: number;
}

export interface GeneratedPlan {
  decision: PlanDecision;
  headline: string;
  rationale: string;
  channels: string[];
  channelPlan: string;
  contentItems: GeneratedContentItem[];
  todoItems: GeneratedTodoItem[];
}
