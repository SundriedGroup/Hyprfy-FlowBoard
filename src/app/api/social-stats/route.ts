import { createClient } from "@/lib/supabase/server";
import type { SocialChannelStats, SocialStatsResponse } from "@/types/social-stats";

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
type InstagramInsights = { data?: Array<{ name?: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }> } & MetaError;

function emptyChannel(channel: "Instagram" | "Facebook", message?: string): SocialChannelStats {
  return { channel, connected: false, accountName: null, followers: null, reach: null, views: null, interactions: null, contentPublished: null, message };
}

async function metaFetch<T extends MetaError>(base: string, path: string, token: string, params: Record<string, string>) {
  const url = new URL(`${base}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = await response.json() as T;
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "Meta returned an unsuccessful response.");
  return payload;
}

function insightTotal(payload: InstagramInsights, name: string) {
  const metric = payload.data?.find((entry) => entry.name === name);
  if (!metric) return null;
  if (typeof metric.total_value?.value === "number") return metric.total_value.value;
  const values = metric.values?.map((entry) => entry.value).filter((value): value is number => typeof value === "number") ?? [];
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });

  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 7);
  const periodStart = since.toISOString();
  const periodEnd = now.toISOString();
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION || "v23.0";
  const base = `${process.env.META_GRAPH_API_BASE_URL || "https://graph.facebook.com"}/${version}`;

  if (!token) {
    const response: SocialStatsResponse = {
      configured: false,
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
      reach: null, views: null, interactions: null, contentPublished: null,
    };
    try {
      const posts = await metaFetch<MetaPosts>(base, `${page.id}/published_posts`, pageToken, {
        fields: "created_time,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)", since: periodStart, until: periodEnd, limit: "100",
      });
      facebook.contentPublished = posts.data?.length ?? 0;
      facebook.interactions = posts.data?.reduce((total, post) => total + (post.shares?.count ?? 0) + (post.comments?.summary?.total_count ?? 0) + (post.reactions?.summary?.total_count ?? 0), 0) ?? 0;
    } catch {
      facebook.message = "Page connected; recent post engagement is unavailable for the current permissions.";
    }

    let instagramStats = emptyChannel("Instagram", "No Instagram professional account is linked to this Page.");
    if (instagram) {
      instagramStats = {
        channel: "Instagram", connected: true, accountName: instagram.username ? `@${instagram.username}` : "Instagram", followers: instagram.followers_count ?? null,
        reach: null, views: null, interactions: null, contentPublished: null,
      };
      const [insightsResult, mediaResult] = await Promise.allSettled([
        metaFetch<InstagramInsights>(base, `${instagram.id}/insights`, pageToken, { metric: "reach,views,total_interactions", period: "day", since: periodStart, until: periodEnd }),
        metaFetch<InstagramMedia>(base, `${instagram.id}/media`, pageToken, { fields: "timestamp,like_count,comments_count", since: periodStart, until: periodEnd, limit: "100" }),
      ]);
      if (insightsResult.status === "fulfilled") {
        instagramStats.reach = insightTotal(insightsResult.value, "reach");
        instagramStats.views = insightTotal(insightsResult.value, "views");
        instagramStats.interactions = insightTotal(insightsResult.value, "total_interactions");
      }
      if (mediaResult.status === "fulfilled") {
        instagramStats.contentPublished = mediaResult.value.data?.length ?? 0;
        if (instagramStats.interactions === null) instagramStats.interactions = mediaResult.value.data?.reduce((total, media) => total + (media.like_count ?? 0) + (media.comments_count ?? 0), 0) ?? 0;
      }
      if (insightsResult.status === "rejected" && mediaResult.status === "rejected") instagramStats.message = "Account connected; insights require Instagram insights permission.";
    }

    const response: SocialStatsResponse = { configured: true, periodStart, periodEnd, channels: [instagramStats, facebook] };
    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Meta dashboard connection failed", error);
    const response: SocialStatsResponse = {
      configured: true, periodStart, periodEnd,
      channels: [emptyChannel("Instagram"), emptyChannel("Facebook")],
      message: "The Meta connection could not be read. Check the token, Page access and account IDs.",
    };
    return Response.json(response, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
