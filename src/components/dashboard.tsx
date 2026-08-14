"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Camera, CircleAlert, FileText, MessageSquareText, Minus } from "lucide-react";
import { toDateKey } from "@/lib/date";
import type { FlowDay, FlowItem, Json } from "@/types/database";
import type { SocialChannelStats, SocialStatsResponse } from "@/types/social-stats";

type DashboardProps = {
  dates: Date[];
  days: FlowDay[];
  items: FlowItem[];
  onOpenFlowboard: () => void;
};

const trackedChannels = ["Instagram", "X", "Facebook", "TikTok", "LinkedIn", "YouTube"] as const;

function channelLabel(channel: string) {
  return channel === "X" ? "X / Twitter" : channel;
}

function metadataObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function itemChannels(item: FlowItem) {
  const channels = metadataObject(item.metadata).channels;
  return Array.isArray(channels) ? channels.filter((channel): channel is string => typeof channel === "string") : [];
}

function hasMetadataText(item: FlowItem, key: string) {
  const value = metadataObject(item.metadata)[key];
  return typeof value === "string" && Boolean(value.trim());
}

function compactNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

type PerformanceMetric = "followers" | "reach" | "views" | "interactions" | "contentPublished";

function trendDetail(current: number | null, previous: number | null) {
  if (current === null || previous === null) return { label: "No comparison", direction: "flat" as const };
  if (previous === 0) return current === 0 ? { label: "No change", direction: "flat" as const } : { label: "New activity", direction: "up" as const };
  const change = ((current - previous) / previous) * 100;
  return { label: `${change > 0 ? "+" : ""}${Math.round(change)}%`, direction: change > 0 ? "up" as const : change < 0 ? "down" as const : "flat" as const };
}

function MetricCell({ stats, metric, label }: { stats?: SocialChannelStats; metric: PerformanceMetric; label: string }) {
  const current = stats?.[metric] ?? null;
  const detail = trendDetail(current, stats?.growth[metric].previous ?? null);
  const Icon = detail.direction === "up" ? ArrowUpRight : detail.direction === "down" ? ArrowDownRight : Minus;
  return <div><dt>{label}</dt><dd>{compactNumber(current)}</dd><small className={`metric-growth ${detail.direction}`}><Icon size={10} />{detail.label}</small></div>;
}

function MiniTrend({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="mini-trend empty"><span>Daily trend builds as Meta data arrives</span></div>;
  const width = 120;
  const height = 28;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - (((value - minimum) / range) * (height - 4)) - 2}`).join(" ");
  return <div className="mini-trend"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg><span>Daily interactions</span></div>;
}

export function Dashboard({ dates, days, items, onOpenFlowboard }: DashboardProps) {
  const [stats, setStats] = useState<SocialStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const dateKeys = useMemo(() => new Set(dates.map(toDateKey)), [dates]);
  const weekItems = useMemo(() => items.filter((item) => item.day && dateKeys.has(item.day)), [dateKeys, items]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/social-stats", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as SocialStatsResponse & { error?: string };
        if (!response.ok && !payload.channels) throw new Error(payload.error || "Could not load social statistics.");
        setStats(payload);
        if (!response.ok) setStatsError(payload.message || "Meta statistics are temporarily unavailable.");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatsError(error instanceof Error ? error.message : "Could not load social statistics.");
      });
    return () => controller.abort();
  }, []);

  const plannedContent = weekItems.length;
  const publishReady = weekItems.filter((item) => item.item_type === "publish" && item.status !== "archived").length;
  const scriptsReady = weekItems.filter((item) => hasMetadataText(item, "script")).length;
  const copyReady = weekItems.filter((item) => hasMetadataText(item, "social_copy")).length;
  const captureReady = weekItems.filter((item) => hasMetadataText(item, "capture_notes")).length;

  return (
    <div className="dashboard-scroll">
      <section className="dashboard-intro">
        <div><p className="eyebrow">Personal brand companion</p><h2>Build the brand through the week.</h2><p>Turn real life into a coherent story, useful content and stronger audience relationships.</p></div>
        <button onClick={onOpenFlowboard}>Open Flowboard <ArrowRight size={15} /></button>
      </section>

      <section className="summary-grid" aria-label="Week summary">
        <article><span className="metric-icon"><CalendarDays size={17} /></span><div><p>Planned content</p><strong>{plannedContent}</strong><small>Across the next 7 days</small></div></article>
        <article><span className="metric-icon"><FileText size={17} /></span><div><p>Scripts ready</p><strong>{scriptsReady}</strong><small>Cards containing scripts</small></div></article>
        <article><span className="metric-icon"><MessageSquareText size={17} /></span><div><p>Post copy ready</p><strong>{copyReady}</strong><small>Cards containing final copy</small></div></article>
        <article><span className="metric-icon"><Camera size={17} /></span><div><p>Capture planned</p><strong>{captureReady}</strong><small>{publishReady} ready to publish</small></div></article>
      </section>

      <div className="dashboard-main-grid single-panel">
        <section className="dashboard-panel week-dashboard">
          <header><div><p className="eyebrow">Seven-day view</p><h3>Week ahead</h3></div><span>{plannedContent} content cards</span></header>
          <div className="week-summary-list">
            {dates.map((date) => {
              const key = toDateKey(date);
              const day = days.find((entry) => entry.day === key);
              const dayItems = items.filter((item) => item.day === key);
              const isToday = key === toDateKey(new Date());
              return <article className={isToday ? "today" : ""} key={key}><time><b>{date.toLocaleDateString("en", { weekday: "short" })}</b><span>{date.getDate()}</span></time><div><strong>{day?.theme || "Open day"}</strong><small>{dayItems.length} platform-specific posts</small></div><span className="week-load" style={{ "--load": `${Math.min(100, dayItems.length * 18)}%` } as React.CSSProperties} /></article>;
            })}
          </div>
        </section>
      </div>

      <section className="dashboard-panel channel-dashboard">
        <header><div><p className="eyebrow">Performance · last 7 days</p><h3>Channel overview</h3></div><span className={stats?.configured ? "live-status" : "setup-status"}>{stats?.configured ? "Meta live" : "Connection needed"}</span></header>
        {(statsError || stats?.message) && <p className="stats-message"><CircleAlert size={14} />{statsError || stats?.message}</p>}
        <div className="channel-stat-grid">
          {trackedChannels.map((channel) => {
            const live = stats?.channels.find((entry) => entry.channel === channel);
            const planned = weekItems.filter((item) => itemChannels(item).includes(channel)).length;
            return <article key={channel} className={`${live?.connected ? "connected" : ""} ${channel === "X" ? "priority-channel" : ""}`}>
              <div className="channel-stat-title"><span>{channel.slice(0, 2).toUpperCase()}</span><div><strong>{channelLabel(channel)}</strong><small>{live?.accountName || (channel === "Instagram" || channel === "Facebook" ? "Awaiting Meta" : channel === "X" ? "Launch channel" : "Planning data")}</small></div></div>
              <dl><MetricCell stats={live} metric="followers" label="Followers" /><MetricCell stats={live} metric="reach" label="Reach" /><MetricCell stats={live} metric="views" label="Views" /><MetricCell stats={live} metric="interactions" label="Interactions" /></dl>
              <MiniTrend values={live?.growth.interactions.series ?? []} />
              <footer><span><BarChart3 size={12} /> {planned} planned</span><span>{live?.contentPublished ?? "—"} published <b className={trendDetail(live?.contentPublished ?? null, live?.growth.contentPublished.previous ?? null).direction}>{trendDetail(live?.contentPublished ?? null, live?.growth.contentPublished.previous ?? null).label}</b></span>{live?.connected ? <em>Live</em> : channel === "X" ? <em>Focus</em> : null}</footer>
            </article>;
          })}
        </div>
      </section>
    </div>
  );
}
