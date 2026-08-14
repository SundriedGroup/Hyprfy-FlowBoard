"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, Check, CircleAlert, Clock3, ListTodo, Plus, Sparkles } from "lucide-react";
import { toDateKey } from "@/lib/date";
import type { FlowDay, FlowItem, Json } from "@/types/database";
import type { SocialChannelStats, SocialStatsResponse } from "@/types/social-stats";

type DashboardProps = {
  dates: Date[];
  days: FlowDay[];
  items: FlowItem[];
  loading: boolean;
  onAddTask: (title: string) => Promise<void>;
  onEditItem: (item: FlowItem) => void;
  onOpenFlowboard: () => void;
  onToggleDone: (item: FlowItem) => Promise<void>;
};

const trackedChannels = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube"] as const;

function metadataObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function itemChannels(item: FlowItem) {
  const channels = metadataObject(item.metadata).channels;
  return Array.isArray(channels) ? channels.filter((channel): channel is string => typeof channel === "string") : [];
}

function compactNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function channelStat(stats: SocialChannelStats | undefined, key: "followers" | "reach" | "interactions") {
  return compactNumber(stats?.[key] ?? null);
}

export function Dashboard({ dates, days, items, loading, onAddTask, onEditItem, onOpenFlowboard, onToggleDone }: DashboardProps) {
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [stats, setStats] = useState<SocialStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const dateKeys = useMemo(() => new Set(dates.map(toDateKey)), [dates]);
  const weekItems = useMemo(() => items.filter((item) => item.day && dateKeys.has(item.day)), [dateKeys, items]);
  const tasks = useMemo(() => items.filter((item) => item.item_type === "task" && (!item.day || dateKeys.has(item.day))).sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return (a.day ?? "9999").localeCompare(b.day ?? "9999");
  }), [dateKeys, items]);

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

  const openTasks = tasks.filter((item) => item.status !== "done").length;
  const completedTasks = tasks.length - openTasks;
  const plannedContent = weekItems.filter((item) => item.item_type !== "task").length;
  const publishReady = weekItems.filter((item) => item.item_type === "publish" && item.status !== "archived").length;

  async function submitTask() {
    const title = taskTitle.trim();
    if (!title || addingTask) return;
    setAddingTask(true);
    await onAddTask(title);
    setTaskTitle("");
    setAddingTask(false);
  }

  return (
    <div className="dashboard-scroll">
      <section className="dashboard-intro">
        <div><p className="eyebrow">Week ahead</p><h2>Your social command centre.</h2><p>Tasks, publishing momentum and channel performance in one place.</p></div>
        <button onClick={onOpenFlowboard}>Open Flowboard <ArrowRight size={15} /></button>
      </section>

      <section className="summary-grid" aria-label="Week summary">
        <article><span className="metric-icon"><ListTodo size={17} /></span><div><p>Open tasks</p><strong>{openTasks}</strong><small>{completedTasks} completed this week</small></div></article>
        <article><span className="metric-icon"><CalendarDays size={17} /></span><div><p>Planned content</p><strong>{plannedContent}</strong><small>Across the next 7 days</small></div></article>
        <article><span className="metric-icon"><Sparkles size={17} /></span><div><p>Ready to publish</p><strong>{publishReady}</strong><small>Cards at publish stage</small></div></article>
        <article><span className="metric-icon"><Clock3 size={17} /></span><div><p>Planned workload</p><strong>{weekItems.reduce((total, item) => total + (item.duration_minutes ?? 0), 0)}m</strong><small>Estimated production time</small></div></article>
      </section>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel todo-dashboard">
          <header><div><p className="eyebrow">Action list</p><h3>To-Do this week</h3></div><span>{openTasks} remaining</span></header>
          <form className="dashboard-task-add" onSubmit={(event) => { event.preventDefault(); void submitTask(); }}>
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a task for today…" aria-label="New task title" />
            <button disabled={!taskTitle.trim() || addingTask} aria-label="Add task"><Plus size={16} /></button>
          </form>
          <div className="dashboard-task-list">
            {loading ? <p className="dashboard-empty">Loading your week…</p> : tasks.length ? tasks.map((task) => (
              <article className={task.status === "done" ? "done" : ""} key={task.id}>
                <button className="todo-check" aria-label={task.status === "done" ? `Mark ${task.title} open` : `Mark ${task.title} done`} aria-pressed={task.status === "done"} onClick={() => void onToggleDone(task)}>{task.status === "done" ? <Check size={11} /> : null}</button>
                <button className="dashboard-task-content" onClick={() => onEditItem(task)}><span>{task.title}</span><small>{task.day ? new Date(`${task.day}T12:00:00`).toLocaleDateString("en", { weekday: "short", day: "numeric" }) : "Unscheduled"}{task.duration_minutes ? ` · ${task.duration_minutes} min` : ""}</small></button>
                {task.priority > 0 && <i aria-label={`Priority ${task.priority}`} />}
              </article>
            )) : <p className="dashboard-empty">Your week is clear. Add the next useful action.</p>}
          </div>
        </section>

        <section className="dashboard-panel week-dashboard">
          <header><div><p className="eyebrow">Seven-day view</p><h3>Week ahead</h3></div><span>{plannedContent} content cards</span></header>
          <div className="week-summary-list">
            {dates.map((date) => {
              const key = toDateKey(date);
              const day = days.find((entry) => entry.day === key);
              const dayItems = items.filter((item) => item.day === key);
              const isToday = key === toDateKey(new Date());
              return <article className={isToday ? "today" : ""} key={key}><time><b>{date.toLocaleDateString("en", { weekday: "short" })}</b><span>{date.getDate()}</span></time><div><strong>{day?.theme || day?.main_outcome || "Open day"}</strong><small>{dayItems.filter((item) => item.item_type === "task" && item.status !== "done").length} tasks · {dayItems.filter((item) => item.item_type !== "task").length} content</small></div><span className="week-load" style={{ "--load": `${Math.min(100, dayItems.length * 18)}%` } as React.CSSProperties} /></article>;
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
            return <article key={channel} className={live?.connected ? "connected" : ""}>
              <div className="channel-stat-title"><span>{channel.slice(0, 2).toUpperCase()}</span><div><strong>{channel}</strong><small>{live?.accountName || (channel === "Instagram" || channel === "Facebook" ? "Awaiting Meta" : "Planning data")}</small></div></div>
              <dl><div><dt>Followers</dt><dd>{channelStat(live, "followers")}</dd></div><div><dt>Reach</dt><dd>{channelStat(live, "reach")}</dd></div><div><dt>Interactions</dt><dd>{channelStat(live, "interactions")}</dd></div></dl>
              <footer><span><BarChart3 size={12} /> {planned} planned</span>{live?.connected && <b>Live</b>}</footer>
            </article>;
          })}
        </div>
      </section>
    </div>
  );
}
