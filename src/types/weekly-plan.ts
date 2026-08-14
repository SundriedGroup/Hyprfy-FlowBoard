export type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type WeeklyRecommendation = "post_today" | "bank_for_vlog" | "post_and_bank" | "capture_only" | "rest";

export interface WeeklyPlanContentItem {
  title: string;
  description: string;
  hook: string;
  socialCopy: string;
  callToAction: string;
  format: string;
  captureNotes: string;
  stage: "idea" | "script" | "capture" | "edit" | "publish";
  durationMinutes: number;
  primaryChannel: string;
  channels: string[];
}

export interface WeeklyPlanTodoItem {
  title: string;
  description: string;
  durationMinutes: number;
}

export interface WeeklyPlanDay {
  theme: string;
  focus: string;
  storyOpportunity: string;
  recommendation: WeeklyRecommendation;
  contentItems: WeeklyPlanContentItem[];
  todoItems: WeeklyPlanTodoItem[];
}

export interface WeeklyPlan {
  id: string;
  generatedAt: string;
  appliedAt: string | null;
  headline: string;
  narrative: string;
  strategicGoal: string;
  audiencePromise: string;
  contentMix: string;
  distributionLogic: string;
  successSignal: string;
  weeklyCallToAction: string;
  days: Record<WeekdayKey, WeeklyPlanDay>;
}
