export type SocialChannelName = "Instagram" | "Facebook";

export interface SocialChannelStats {
  channel: SocialChannelName;
  connected: boolean;
  accountName: string | null;
  followers: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  contentPublished: number | null;
  message?: string;
}

export interface SocialStatsResponse {
  configured: boolean;
  periodStart: string;
  periodEnd: string;
  channels: SocialChannelStats[];
  message?: string;
}
