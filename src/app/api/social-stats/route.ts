import { createClient } from "@/lib/supabase/server";
import type { SocialChannelStats, SocialGrowthStats, SocialMetricTrend, SocialStatsResponse } from "@/types/social-stats";

type MetaError = { error?: { message?: string } };
type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  followers_count?: number;
  instagram_business_account?: { id: string; username?: string; followers_count?: number; media_count?: number };
};
type MetaConnection = { data?: MetaPage[] } & MetaError;
type MetaPosts = {
  data?: Array<{ created_time?: string; shares?: { count?: number }; comments?: { summary?: { total_count?: number } }; reactions?: { summary?: { total_count?: number } } }>;
} & MetaError;
type InstagramMedia = { data?: Array<{ timestamp?: string; like_count?: number; comments_count?: number }> } & MetaError;
type InstagramInsights = { data?: Array<{ name?: string; values?: Array<{ value?: number; end_time?: string }>; total_value?: { value?: number } }> } & MetaError;

function emptyTrend(): SocialMetricTrend { return { previous: null, series: [] }; }
function emptyGrowth(): SocialGrowthStats {
  return { followers: emptyTrend(), reach: emptyTrend(), views: emptyTrend(), interactions: emptyTrend(), contentPublished: emptyTrend() };
}

function emptyChannel(channel: "Instagram" | "Facebook", message?: string): SocialChannelStats {
  return { channel, connected: false, accountName: null, followers: null, reach: null, views: null, interactions: null, contentPublished: null, growth: emptyGrowth(), message };
}

async function metaFetch<T extends MetaError>(base: string, path: string, token: string, params: Record<string, string>) {
  const url = new URL(`${base}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = await response.json() as T;
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "Meta returned an unsuccessful response.");
  return payload;
}

function insightWindow(payload: InstagramInsights, name: string, periodStart: Date, mode: "sum" | "latest" = "sum") {
  const metric = payload.data?.find((entry) => entry.name === name);
  if (!metric) return { current: null, previous: null, series: [] };
  const timedValues = metric.values?.filter((entry): entry is { value: number; end_time?: string } => typeof entry.value === "number") ?? [];
  const currentValues = timedValues.filter((entry) => !entry.end_time || new Date(entry.end_time) >= periodStart).map((entry) => entry.value);
  const previousValues = timedValues.filter((entry) => entry.end_time && new Date(entry.end_time) < periodStart).map((entry) => entry.value);
  const reduce = (values: number[]) => values.length ? (mode === "latest" ? values[values.length - 1] : values.reduce((total, value) => total + value, 0)) : null;
  const current = reduce(currentValues) ?? (typeof metric.total_value?.value === "number" ? metric.total_value.value : null);
  return { current, previous: reduce(previousValues), series: currentValues };
}

function postInteractions(post: NonNullable<MetaPosts["data"]>[number]) {
  return (post.shares?.count ?? 0) + (post.comments?.summary?.total_count ?? 0) + (post.reactions?.summary?.total_count ?? 0);
}

function splitDatedValues<T>(entries: T[], dateFor: (entry: T) => string | undefined, valueFor: (entry: T) => number, periodStart: Date) {
  const current = entries.filter((entry) => { const date = dateFor(entry); return date ? new Date(date) >= periodStart : false; });
  const previous = entries.filter((entry) => { const date = dateFor(entry); return date ? new Date(date) < periodStart : false; });
  return {
    current: current.reduce((total, entry) => total + valueFor(entry), 0),
    previous: previous.reduce((total, entry) => total + valueFor(entry), 0),
    series: current.map(valueFor),
    currentCount: current.length,
    previousCount: previous.length,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });

  const now = new Date();
  const periodBoundary = new Date(now);
  periodBoundary.setUTCDate(periodBoundary.getUTCDate() - 7);
  const comparisonBoundary = new Date(now);
  comparisonBoundary.setUTCDate(comparisonBoundary.getUTCDate() - 14);
  const comparisonStart = comparisonBoundary.toISOString();
  const periodStart = periodBoundary.toISOString();
  const periodEnd = now.toISOString();
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION || "v23.0";
  const base = `${process.env.META_GRAPH_API_BASE_URL || "https://graph.facebook.com"}/${version}`;

  if (!token) {
    const response: SocialStatsResponse = {
      configured: false,
      comparisonStart,
      periodStart,
      periodEnd,
      channels: [emptyChannel("Instagram"), emptyChannel("Facebook")],
      message: "Add the Meta connection variables in Vercel to activate live Instagram and Facebook statistics.",
    };
    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const configuredPageId = process.env.META_FACEBOOK_PAGE_ID;
    let page: MetaPage | undefined;
    if (configuredPageId) {
      page = await metaFetch<MetaPage & MetaError>(base, configuredPageId, token, {
        fields: "id,name,followers_count,access_token,instagram_business_account{id,username,followers_count,media_count}",
      });
    } else {
      const connection = await metaFetch<MetaConnection>(base, "me/accounts", token, {
        fields: "id,name,followers_count,access_token,instagram_business_account{id,username,followers_count,media_count}",
      });
      page = connection.data?.find((entry) => entry.instagram_business_account) ?? connection.data?.[0];
    }
    if (!page) throw new Error("No Facebook Page is available for this Meta connection.");

    const pageToken = page.access_token || token;
    const configuredInstagramId = process.env.META_INSTAGRAM_ACCOUNT_ID;
    const instagram = page.instagram_business_account ?? (configuredInstagramId ? { id: configuredInstagramId } : undefined);

    const facebook: SocialChannelStats = {
      channel: "Facebook", connected: true, accountName: page.name ?? "Facebook Page", followers: page.followers_count ?? null,
      reach: null, views: null, interactions: null, contentPublished: null, growth: emptyGrowth(),
    };
    try {
      const posts = await metaFetch<MetaPosts>(base, `${page.id}/published_posts`, pageToken, {
        fields: "created_time,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)", since: comparisonStart, until: periodEnd, limit: "100",
      });
      const split = splitDatedValues(posts.data ?? [], (post) => post.created_time, postInteractions, periodBoundary);
      facebook.contentPublished = split.currentCount;
      facebook.interactions = split.current;
      facebook.growth.contentPublished = { previous: split.previousCount, series: [] };
      facebook.growth.interactions = { previous: split.previous, series: split.series };
    } catch {
      facebook.message = "Page connected; recent post engagement is unavailable for the current permissions.";
    }

    let instagramStats = emptyChannel("Instagram", "No Instagram professional account is linked to this Page.");
    if (instagram) {
      instagramStats = {
        channel: "Instagram", connected: true, accountName: instagram.username ? `@${instagram.username}` : "Instagram", followers: instagram.followers_count ?? null,
        reach: null, views: null, interactions: null, contentPublished: null, growth: emptyGrowth(),
      };
      const [insightsResult, followersResult, mediaResult] = await Promise.allSettled([
        metaFetch<InstagramInsights>(base, `${instagram.id}/insights`, pageToken, { metric: "reach,views,total_interactions", period: "day", since: comparisonStart, until: periodEnd }),
        metaFetch<InstagramInsights>(base, `${instagram.id}/insights`, pageToken, { metric: "follower_count", period: "day", since: comparisonStart, until: periodEnd }),
        metaFetch<InstagramMedia>(base, `${instagram.id}/media`, pageToken, { fields: "timestamp,like_count,comments_count", since: comparisonStart, until: periodEnd, limit: "100" }),
      ]);
      if (insightsResult.status === "fulfilled") {
        for (const key of ["reach", "views", "interactions"] as const) {
          const metricName = key === "interactions" ? "total_interactions" : key;
          const window = insightWindow(insightsResult.value, metricName, periodBoundary);
          instagramStats[key] = window.current;
          instagramStats.growth[key] = { previous: window.previous, series: window.series };
        }
      }
      if (followersResult.status === "fulfilled") {
        const followerWindow = insightWindow(followersResult.value, "follower_count", periodBoundary, "latest");
        instagramStats.growth.followers = { previous: followerWindow.previous, series: followerWindow.series };
      }
      if (mediaResult.status === "fulfilled") {
        const split = splitDatedValues(mediaResult.value.data ?? [], (media) => media.timestamp, (media) => (media.like_count ?? 0) + (media.comments_count ?? 0), periodBoundary);
        instagramStats.contentPublished = split.currentCount;
        instagramStats.growth.contentPublished = { previous: split.previousCount, series: [] };
        if (instagramStats.interactions === null) {
          instagramStats.interactions = split.current;
          instagramStats.growth.interactions = { previous: split.previous, series: split.series };
        }
      }
      if (insightsResult.status === "rejected" && mediaResult.status === "rejected") instagramStats.message = "Account connected; insights require Instagram insights permission.";
    }

    const response: SocialStatsResponse = { configured: true, comparisonStart, periodStart, periodEnd, channels: [instagramStats, facebook] };
    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Meta dashboard connection failed", error);
    const response: SocialStatsResponse = {
      configured: true, comparisonStart, periodStart, periodEnd,
      channels: [emptyChannel("Instagram"), emptyChannel("Facebook")],
      message: "The Meta connection could not be read. Check the token, Page access and account IDs.",
    };
    return Response.json(response, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
