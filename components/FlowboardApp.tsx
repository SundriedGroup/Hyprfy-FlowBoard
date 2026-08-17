"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  addDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { supabase } from "@/lib/supabase";
import type {
  DayDraft,
  FlowDay,
  FlowItem,
  FlowItemType,
  FlowProject,
} from "@/lib/types";

const SECTION_TYPES: Array<{ key: FlowItemType; label: string }> = [
  { key: "idea", label: "Ideas" },
  { key: "script", label: "Script" },
  { key: "capture", label: "Capture" },
  { key: "edit", label: "Edit" },
  { key: "publish", label: "Publish" },
];

const EMPTY_DAY: DayDraft = {
  theme: null,
  main_outcome: null,
  whats_happening: null,
  story_opportunity: null,
  notes: null,
  capacity_minutes: null,
};

type View = "flowboard" | "inbox";

export function FlowboardApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [days, setDays] = useState<FlowDay[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("flowboard");
  const [error, setError] = useState<string | null>(null);

  const visibleDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(anchorDate, index)),
    [anchorDate],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, anchorDate]);

  async function loadData() {
    if (!session) return;
    setLoading(true);
    setError(null);

    const from = format(visibleDates[0], "yyyy-MM-dd");
    const to = format(visibleDates[visibleDates.length - 1], "yyyy-MM-dd");

    const [daysResult, itemsResult, inboxResult, projectsResult] = await Promise.all([
      supabase
        .from("flow_days")
        .select("*")
        .gte("day", from)
        .lte("day", to)
        .order("day"),
      supabase
        .from("flow_items")
        .select("*")
        .gte("day", from)
        .lte("day", to)
        .neq("status", "archived")
        .order("day")
        .order("sort_order"),
      supabase
        .from("flow_items")
        .select("*")
        .is("day", null)
        .neq("status", "archived")
        .order("sort_order"),
      supabase
        .from("flow_projects")
        .select("*")
        .eq("archived", false)
        .order("sort_order"),
    ]);

    const firstError =
      daysResult.error || itemsResult.error || inboxResult.error || projectsResult.error;

    if (firstError) {
      setError(firstError.message);
    } else {
      setDays((daysResult.data ?? []) as FlowDay[]);
      setItems([
        ...((itemsResult.data ?? []) as FlowItem[]),
        ...((inboxResult.data ?? []) as FlowItem[]),
      ]);
      setProjects((projectsResult.data ?? []) as FlowProject[]);
    }

    setLoading(false);
  }

  async function saveDay(date: Date, patch: Partial<DayDraft>) {
    if (!session) return;
    const dayKey = format(date, "yyyy-MM-dd");
    const existing = days.find((day) => day.day === dayKey);

    if (existing) {
      setDays((current) =>
        current.map((day) => (day.id === existing.id ? { ...day, ...patch } : day)),
      );
      const { error: updateError } = await supabase
        .from("flow_days")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) setError(updateError.message);
      return;
    }

    const payload = {
      ...EMPTY_DAY,
      ...patch,
      day: dayKey,
      user_id: session.user.id,
    };

    const { data, error: insertError } = await supabase
      .from("flow_days")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setDays((current) => [...current, data as FlowDay]);
    }
  }

  async function addItem(day: string | null, itemType: FlowItemType, title: string) {
    if (!session || !title.trim()) return;
    const sameBucket = items.filter(
      (item) => item.day === day && item.item_type === itemType && item.status !== "archived",
    );
    const maxOrder = sameBucket.reduce((max, item) => Math.max(max, Number(item.sort_order)), 0);

    const { data, error: insertError } = await supabase
      .from("flow_items")
      .insert({
        user_id: session.user.id,
        day,
        item_type: itemType,
        title: title.trim(),
        sort_order: maxOrder + 100,
      })
      .select("*")
      .single();

    if (insertError) setError(insertError.message);
    else if (data) setItems((current) => [...current, data as FlowItem]);
  }

  async function moveItem(
    itemId: string,
    day: string | null,
    itemType?: FlowItemType,
    sortOrder?: number,
  ) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    const next = {
      day,
      item_type: itemType ?? item.item_type,
      sort_order: sortOrder ?? item.sort_order,
    };

    setItems((current) =>
      current.map((candidate) => (candidate.id === itemId ? { ...candidate, ...next } : candidate)),
    );

    const { error: updateError } = await supabase
      .from("flow_items")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", itemId);

    if (updateError) {
      setError(updateError.message);
      void loadData();
    }
  }

  async function toggleDone(item: FlowItem) {
    const status = item.status === "done" ? "open" : "done";
    setItems((current) =>
      current.map((candidate) => (candidate.id === item.id ? { ...candidate, status } : candidate)),
    );
    const { error: updateError } = await supabase
      .from("flow_items")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (updateError) setError(updateError.message);
  }

  async function archiveItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    const { error: updateError } = await supabase
      .from("flow_items")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", itemId);
    if (updateError) setError(updateError.message);
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  const today = startOfDay(new Date());

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={setView}
        inboxCount={items.filter((item) => item.day === null).length}
        onSignOut={() => void supabase.auth.signOut()}
      />

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">HYPRFY LIFEOS</p>
            <h1>{view === "flowboard" ? "Flowboard" : "Inbox"}</h1>
          </div>
          {view === "flowboard" && (
            <div className="date-controls">
              <button className="icon-button" onClick={() => setAnchorDate(addDays(anchorDate, -7))}>
                ←
              </button>
              <button className="control-button" onClick={() => setAnchorDate(today)}>
                Today
              </button>
              <span className="segmented active">7 days</span>
              <span className="segmented muted">14 days</span>
              <span className="segmented muted">Month</span>
              <button className="icon-button" onClick={() => setAnchorDate(addDays(anchorDate, 7))}>
                →
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {view === "flowboard" ? (
          <div className="board-wrap">
            <div className="board">
              {visibleDates.map((date) => {
                const dayKey = format(date, "yyyy-MM-dd");
                return (
                  <DayColumn
                    key={dayKey}
                    date={date}
                    day={days.find((candidate) => candidate.day === dayKey)}
                    items={items.filter((item) => item.day === dayKey)}
                    projects={projects}
                    loading={loading}
                    onSaveDay={saveDay}
                    onAddItem={addItem}
                    onMoveItem={moveItem}
                    onToggleDone={toggleDone}
                    onArchive={archiveItem}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <InboxView
            items={items.filter((item) => item.day === null)}
            onAddItem={addItem}
            onMoveItem={moveItem}
            onToggleDone={toggleDone}
            onArchive={archiveItem}
          />
        )}
      </main>
    </div>
  );
}

function Sidebar({
  view,
  onView,
  inboxCount,
  onSignOut,
}: {
  view: View;
  onView: (view: View) => void;
  inboxCount: number;
  onSignOut: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">H</div>
      <nav className="nav-list">
        <button className={view === "flowboard" ? "nav-item active" : "nav-item"} onClick={() => onView("flowboard")}>
          <span className="nav-glyph">▦</span> Flowboard
        </button>
        <button className="nav-item disabled" disabled>
          <span className="nav-glyph">□</span> Calendar <small>Soon</small>
        </button>
        <button className="nav-item disabled" disabled>
          <span className="nav-glyph">◇</span> Projects <small>Soon</small>
        </button>
        <button className={view === "inbox" ? "nav-item active" : "nav-item"} onClick={() => onView("inbox")}>
          <span className="nav-glyph">↓</span> Inbox
          {inboxCount > 0 && <strong className="count-badge">{inboxCount}</strong>}
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item disabled" disabled>
          <span className="nav-glyph">⚙</span> Settings
        </button>
        <button className="nav-item" onClick={onSignOut}>
          <span className="nav-glyph">↪</span> Sign out
        </button>
      </div>
    </aside>
  );
}

function DayColumn({
  date,
  day,
  items,
  projects,
  loading,
  onSaveDay,
  onAddItem,
  onMoveItem,
  onToggleDone,
  onArchive,
}: {
  date: Date;
  day?: FlowDay;
  items: FlowItem[];
  projects: FlowProject[];
  loading: boolean;
  onSaveDay: (date: Date, patch: Partial<DayDraft>) => Promise<void>;
  onAddItem: (day: string | null, type: FlowItemType, title: string) => Promise<void>;
  onMoveItem: (id: string, day: string | null, type?: FlowItemType, sortOrder?: number) => Promise<void>;
  onToggleDone: (item: FlowItem) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const dayKey = format(date, "yyyy-MM-dd");
  const isToday = isSameDay(date, new Date());

  return (
    <section className={isToday ? "day-column today" : "day-column"}>
      <div className="day-heading">
        <div>
          <p>{format(date, "EEE").toUpperCase()}</p>
          <h2>{format(date, "d MMM").toUpperCase()}</h2>
        </div>
        {isToday && <span className="today-pill">TODAY</span>}
      </div>

      <div className="day-context">
        <ContextField
          label="What's happening"
          value={day?.whats_happening ?? ""}
          placeholder="Meetings, events, runs, family plans…"
          multiline
          onCommit={(value) => onSaveDay(date, { whats_happening: value || null })}
        />
        <ContextField
          label="Main focus"
          value={day?.main_outcome ?? ""}
          placeholder="What matters most today?"
          onCommit={(value) => onSaveDay(date, { main_outcome: value || null })}
        />
        <ContextField
          label="Story opportunity"
          value={day?.story_opportunity ?? ""}
          placeholder="What could this day become a story about?"
          multiline
          onCommit={(value) => onSaveDay(date, { story_opportunity: value || null })}
        />
      </div>

      <div className="sections">
        {SECTION_TYPES.map((section) => {
          const sectionItems = items
            .filter((item) => item.item_type === section.key)
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));

          return (
            <ItemSection
              key={section.key}
              day={dayKey}
              type={section.key}
              label={section.label}
              items={sectionItems}
              projects={projects}
              onAddItem={onAddItem}
              onMoveItem={onMoveItem}
              onToggleDone={onToggleDone}
              onArchive={onArchive}
            />
          );
        })}
      </div>

      {loading && <div className="loading-line" />}
    </section>
  );
}

function ContextField({
  label,
  value,
  placeholder,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) void onCommit(draft.trim());
  };

  return (
    <label className="context-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={2}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      )}
    </label>
  );
}

function ItemSection({
  day,
  type,
  label,
  items,
  projects,
  onAddItem,
  onMoveItem,
  onToggleDone,
  onArchive,
}: {
  day: string;
  type: FlowItemType;
  label: string;
  items: FlowItem[];
  projects: FlowProject[];
  onAddItem: (day: string | null, type: FlowItemType, title: string) => Promise<void>;
  onMoveItem: (id: string, day: string | null, type?: FlowItemType, sortOrder?: number) => Promise<void>;
  onToggleDone: (item: FlowItem) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [isOver, setIsOver] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await onAddItem(day, type, title);
    setTitle("");
    setAdding(false);
  }

  const lastOrder = items.length ? Number(items[items.length - 1].sort_order) : 0;

  return (
    <div
      className={isOver ? "item-section drag-over" : "item-section"}
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        const id = event.dataTransfer.getData("text/flow-item");
        if (id) void onMoveItem(id, day, type, lastOrder + 100);
      }}
    >
      <div className="section-title">
        <span>{label}</span>
        <small>{items.length || ""}</small>
      </div>

      <div className="card-list">
        {items.map((item, index) => {
          const nextOrder = Number(item.sort_order) - 1;
          return (
            <FlowCard
              key={item.id}
              item={item}
              project={projects.find((project) => project.id === item.project_id)}
              onMoveBefore={(draggedId) => onMoveItem(draggedId, day, type, nextOrder)}
              onToggleDone={onToggleDone}
              onArchive={onArchive}
              index={index}
            />
          );
        })}
      </div>

      {adding ? (
        <form className="quick-add-form" onSubmit={submit}>
          <input autoFocus value={title} placeholder={`Add ${label.toLowerCase()}…`} onChange={(event) => setTitle(event.target.value)} />
          <div>
            <button type="submit">Add</button>
            <button type="button" className="ghost" onClick={() => { setAdding(false); setTitle(""); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="add-button" onClick={() => setAdding(true)}>+ Add</button>
      )}
    </div>
  );
}

function FlowCard({
  item,
  project,
  onMoveBefore,
  onToggleDone,
  onArchive,
}: {
  item: FlowItem;
  project?: FlowProject;
  onMoveBefore: (id: string) => Promise<void>;
  onToggleDone: (item: FlowItem) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  index: number;
}) {
  const [over, setOver] = useState(false);

  return (
    <article
      className={`${item.status === "done" ? "flow-card done" : "flow-card"}${over ? " card-over" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/flow-item", item.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const id = event.dataTransfer.getData("text/flow-item");
        if (id && id !== item.id) void onMoveBefore(id);
      }}
    >
      <button className="check-button" aria-label={item.status === "done" ? "Mark open" : "Mark done"} onClick={() => void onToggleDone(item)}>
        {item.status === "done" ? "✓" : ""}
      </button>
      <div className="card-content">
        <p>{item.title}</p>
        <div className="card-meta">
          {project && <span className="project-tag">{project.name}</span>}
          {item.start_time && <span>{item.start_time.slice(0, 5)}</span>}
          {item.duration_minutes && <span>{item.duration_minutes}m</span>}
        </div>
      </div>
      <button className="card-menu" title="Archive" onClick={() => void onArchive(item.id)}>×</button>
    </article>
  );
}

function InboxView({
  items,
  onAddItem,
  onMoveItem,
  onToggleDone,
  onArchive,
}: {
  items: FlowItem[];
  onAddItem: (day: string | null, type: FlowItemType, title: string) => Promise<void>;
  onMoveItem: (id: string, day: string | null, type?: FlowItemType, sortOrder?: number) => Promise<void>;
  onToggleDone: (item: FlowItem) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await onAddItem(null, "idea", title);
    setTitle("");
  }

  return (
    <div className="inbox-page">
      <div className="inbox-intro">
        <p className="eyebrow">QUICK CAPTURE</p>
        <h2>Catch it before you schedule it.</h2>
        <p>Ideas land here first. Give them a date and a section when they have somewhere to go.</p>
      </div>
      <form className="inbox-add" onSubmit={submit}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Capture an idea, task or thought…" autoFocus />
        <button type="submit">Add to inbox</button>
      </form>
      <div className="inbox-list">
        {items.length === 0 ? (
          <div className="empty-state">Inbox clear. Nice.</div>
        ) : (
          items
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
            .map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                onMoveItem={onMoveItem}
                onToggleDone={onToggleDone}
                onArchive={onArchive}
              />
            ))
        )}
      </div>
      <p className="inbox-tip">Schedule an item here, then switch back to Flowboard to see it in the chosen day.</p>
    </div>
  );
}

function InboxCard({
  item,
  onMoveItem,
  onToggleDone,
  onArchive,
}: {
  item: FlowItem;
  onMoveItem: (id: string, day: string | null, type?: FlowItemType, sortOrder?: number) => Promise<void>;
  onToggleDone: (item: FlowItem) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<FlowItemType>(item.item_type === "task" || item.item_type === "note" ? "idea" : item.item_type);

  return (
    <article className={item.status === "done" ? "inbox-card done" : "inbox-card"}>
      <div className="inbox-card-main">
        <button className="check-button" aria-label={item.status === "done" ? "Mark open" : "Mark done"} onClick={() => void onToggleDone(item)}>
          {item.status === "done" ? "✓" : ""}
        </button>
        <p>{item.title}</p>
        <button className="card-menu visible" title="Archive" onClick={() => void onArchive(item.id)}>×</button>
      </div>
      <div className="schedule-row">
        <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        <select value={type} onChange={(event) => setType(event.target.value as FlowItemType)}>
          {SECTION_TYPES.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}
        </select>
        <button onClick={() => void onMoveItem(item.id, day, type, 100)}>Schedule</button>
      </div>
    </article>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : null);
    setBusy(false);
  }

  async function magicLink() {
    if (!email) {
      setMessage("Enter your email first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "Magic link sent. Check your email.");
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark large">H</div>
        <p className="eyebrow">HYPRFY LIFEOS</p>
        <h1>Flowboard</h1>
        <p className="auth-copy">Plan around the day — not around a status column.</p>
        <form onSubmit={signIn}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary-button" disabled={busy}>{busy ? "Working…" : "Sign in"}</button>
        </form>
        <button className="magic-button" onClick={() => void magicLink()} disabled={busy}>Send me a magic link instead</button>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-page">
      <div className="brand-mark large pulse">H</div>
    </main>
  );
}
