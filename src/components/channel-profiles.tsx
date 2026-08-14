"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CircleAlert, RadioTower, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { brandChannels, emptyBrandBrain, type ChannelStrategy, type ContentPillar } from "@/types/brand";
import type { FlowItem, Json } from "@/types/database";
import type { SocialChannelStats, SocialStatsResponse } from "@/types/social-stats";
import { toDateKey } from "@/lib/date";

type ChannelProfilesProps = { userId: string; dates: Date[]; items: FlowItem[]; onEditStrategy: () => void };

function jsonObject(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value: Json | undefined) { return typeof value === "string" ? value : ""; }

function channelLabel(name: string) { return name === "X" ? "X / Twitter" : name; }

function normalizeChannel(name: string) { return name === "Newsletter" ? "Substack" : name; }

function itemChannels(item: FlowItem) {
  const channels = jsonObject(item.metadata).channels;
  return Array.isArray(channels) ? channels.filter((channel): channel is string => typeof channel === "string").map(normalizeChannel) : [];
}

function parseStrategies(value: Json) {
  const brain = jsonObject(value);
  const savedChannels = Array.isArray(brain.channels) ? brain.channels.map(jsonObject) : [];
  const defaults = emptyBrandBrain().channels;
  const channels = brandChannels.map((name): ChannelStrategy => {
    const saved = savedChannels.find((channel) => channel.name === name || (name === "Substack" && channel.name === "Newsletter"));
    const fallback = defaults.find((channel) => channel.name === name)!;
    return saved ? { name, enabled: saved.enabled === true, purpose: text(saved.purpose), formats: text(saved.formats), cadence: text(saved.cadence), tone: text(saved.tone), callToAction: text(saved.callToAction) } : fallback;
  });
  const pillars: ContentPillar[] = Array.isArray(brain.pillars) ? brain.pillars.flatMap((value) => {
    const pillar = jsonObject(value);
    if (!text(pillar.name)) return [];
    return [{ id: text(pillar.id) || text(pillar.name), name: text(pillar.name), description: text(pillar.description), percentage: typeof pillar.percentage === "number" ? pillar.percentage : 0, formats: text(pillar.formats), channels: Array.isArray(pillar.channels) ? pillar.channels.filter((channel): channel is string => typeof channel === "string").map(normalizeChannel) : [] }];
  }) : [];
  return { channels, pillars };
}

function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function growthLabel(stats: SocialChannelStats | undefined, metric: "reach" | "interactions") {
  const current = stats?.[metric] ?? null; const previous = stats?.growth[metric].previous ?? null;
  if (current === null || previous === null) return "No comparison";
  if (previous === 0) return current > 0 ? "New activity" : "No change";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? "+" : ""}${change}% vs prior week`;
}

function completeness(strategy: ChannelStrategy) {
  const values = [strategy.purpose, strategy.formats, strategy.cadence, strategy.tone, strategy.callToAction];
  return Math.round((values.filter((value) => value.trim()).length / values.length) * 100);
}

export function ChannelProfiles({ userId, dates, items, onEditStrategy }: ChannelProfilesProps) {
  const supabase = useMemo(() => createClient(), []);
  const [strategies, setStrategies] = useState<ChannelStrategy[]>(() => emptyBrandBrain().channels.map((channel) => ({ ...channel, enabled: false })));
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [positioning, setPositioning] = useState("");
  const [stats, setStats] = useState<SocialStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const profilePromise = supabase.from("profiles").select("positioning,brand_brain").eq("user_id", userId).maybeSingle();
    const statsPromise = fetch("/api/social-stats").then(async (response) => ({ response, payload: await response.json() as SocialStatsResponse & { error?: string } }));
    const [profileResult, statsResult] = await Promise.allSettled([profilePromise, statsPromise]);
    if (profileResult.status === "fulfilled") {
      if (profileResult.value.error) setError(profileResult.value.error.message);
      else if (profileResult.value.data) {
        const parsed = parseStrategies(profileResult.value.data.brand_brain);
        setStrategies(parsed.channels); setPillars(parsed.pillars); setPositioning(profileResult.value.data.positioning ?? "");
      }
    } else setError("Could not load the saved channel strategy.");
    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value.payload);
      if (!statsResult.value.response.ok) setError((current) => current || statsResult.value.payload.message || statsResult.value.payload.error || null);
    }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const dateKeys = useMemo(() => new Set(dates.map(toDateKey)), [dates]);
  const weekItems = useMemo(() => items.filter((item) => item.day && dateKeys.has(item.day) && item.item_type !== "task" && item.status !== "archived"), [dateKeys, items]);
  const ordered = useMemo(() => [...strategies].sort((a, b) => Number(b.enabled) - Number(a.enabled)), [strategies]);
  const activeCount = strategies.filter((channel) => channel.enabled).length;
  const configuredCount = strategies.filter((channel) => channel.enabled && completeness(channel) === 100).length;

  if (loading) return <div className="board-loading">Building your channel profiles…</div>;
  return <div className="channels-scroll">
    <section className="channels-hero"><div><p className="eyebrow">Channel system</p><h2>Every platform has a job.</h2><p>{positioning || "Define your positioning and channel roles so every platform compounds the same personal brand."}</p></div><div className="channels-hero-metrics"><article><strong>{activeCount}</strong><span>active channels</span></article><article><strong>{configuredCount}/{activeCount || 0}</strong><span>fully defined</span></article><article><strong>{weekItems.length}</strong><span>planned next 7 days</span></article></div></section>
    {error && <p className="channel-profile-error"><CircleAlert size={14} />{error}</p>}
    <section className="channel-profile-toolbar"><div><RadioTower size={16} /><div><h3>Channel profiles</h3><p>Strategy from your Brand Profile, activity from Flowboard, performance where connected.</p></div></div><button onClick={onEditStrategy}>Edit channel strategy <ArrowRight size={14} /></button></section>
    <div className="channel-profile-grid">{ordered.map((strategy) => {
      const live = stats?.channels.find((entry) => entry.channel === strategy.name);
      const linkedPillars = pillars.filter((pillar) => pillar.channels.includes(strategy.name));
      const planned = weekItems.filter((item) => itemChannels(item).includes(strategy.name)).length;
      const ready = completeness(strategy);
      return <article className={`channel-profile-card ${strategy.enabled ? "active" : "paused"} ${strategy.name === "X" ? "x-focus" : ""}`} key={strategy.name}>
        <header><div className="channel-profile-identity"><span>{strategy.name.slice(0, 2).toUpperCase()}</span><div><h3>{channelLabel(strategy.name)}</h3><small>{live?.accountName || (strategy.enabled ? "Brand channel" : "Not selected")}</small></div></div><em>{live?.connected ? "Live" : strategy.enabled ? "Active" : "Paused"}</em></header>
        {strategy.enabled ? <>
          <div className="channel-purpose"><span>Purpose</span><p>{strategy.purpose || "Add the role this platform plays in your brand strategy."}</p></div>
          <div className="channel-profile-progress"><span><b>Profile strength</b><em>{ready}%</em></span><i><span style={{ width: `${ready}%` }} /></i></div>
          <dl className="channel-strategy-details"><div><dt>Cadence</dt><dd>{strategy.cadence || "Not set"}</dd></div><div><dt>Formats</dt><dd>{strategy.formats || "Not set"}</dd></div><div><dt>Tone</dt><dd>{strategy.tone || "Not set"}</dd></div><div><dt>Primary CTA</dt><dd>{strategy.callToAction || "Not set"}</dd></div></dl>
          <div className="channel-pillar-list"><span>Content pillars</span><div>{linkedPillars.length ? linkedPillars.map((pillar) => <small key={pillar.id}>{pillar.name}{pillar.percentage ? ` · ${pillar.percentage}%` : ""}</small>) : <small>Connect pillars in Brand Profile</small>}</div></div>
          <div className="channel-activity"><article><BarChart3 size={13} /><div><strong>{planned}</strong><span>planned</span></div></article><article><Target size={13} /><div><strong>{compactNumber(live?.followers)}</strong><span>followers</span></div></article><article><div><strong>{compactNumber(live?.reach)}</strong><span>reach · {growthLabel(live, "reach")}</span></div></article><article><div><strong>{compactNumber(live?.interactions)}</strong><span>interactions · {growthLabel(live, "interactions")}</span></div></article></div>
        </> : <div className="paused-channel-message"><p>This channel is visible but not part of the active content strategy.</p><button onClick={onEditStrategy}>Configure and activate</button></div>}
        <footer><button onClick={onEditStrategy}>Edit profile <ArrowRight size={12} /></button></footer>
      </article>;
    })}</div>
  </div>;
}
