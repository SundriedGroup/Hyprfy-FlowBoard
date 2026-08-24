export type SocialChannelName = "Instagram" | "Facebook";

export interface SocialMetricTrend {
  previous: number | null;
  series: number[];
}

export interface SocialGrowthStats {
  followers: SocialMetricTrend;
  reach: SocialMetricTrend;
  views: SocialMetricTrend;
  interactions: SocialMetricTrend;
  contentPublished: SocialMetricTrend;
}

export interface SocialChannelStats {
  channel: SocialChannelName;
  connected: boolean;
  accountName: string | null;
  followers: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  contentPublished: number | null;
  growth: SocialGrowthStats;
  message?: string;
}

export interface SocialStatsResponse {
  configured: boolean;
  comparisonStart: string;
  periodStart: string;
  periodEnd: string;
  channels: SocialChannelStats[];
  message?: string;
}
