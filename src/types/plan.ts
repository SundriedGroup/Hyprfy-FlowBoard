import type { BrandDirection, ContentBrandAlignment } from "./brand-alignment";

export type PlanDecision = "post_today" | "bank_for_weekly_vlog" | "post_and_bank";

export interface GeneratedContentItem extends ContentBrandAlignment {
  title: string;
  description: string;
  hook: string;
  socialCopy: string;
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
  brandDirection: BrandDirection;
  contentItems: GeneratedContentItem[];
  todoItems: GeneratedTodoItem[];
}
