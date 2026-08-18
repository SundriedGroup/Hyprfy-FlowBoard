"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { addDays, format, startOfDay } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { ContentMeta, FlowDay, FlowItem } from "@/lib/types";

const APP_VERSION = "0.9.6";

type DraftBlock = { title: string; channel: string; plan: string };

function getMeta(item: FlowItem): ContentMeta {
  return (item.metadata ?? {}) as ContentMeta;
}

function channelClass(channel?: string) {
  const value = (channel ?? "").toLowerCase();
  if (value === "instagram") return "channel-instagram";
  if (value === "linkedin") return "channel-linkedin";
  if (value === "youtube") return "channel-youtube";
  if (value === "tiktok") return "channel-tiktok";
  if (value === "substack") return "channel-substack";
  if (value === "stories") return "channel-stories";
  if (value === "multi-channel") return "channel-multi";
  return "channel-default";
}

export function FlowboardApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [days, setDays] = useState<FlowDay[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBlockDay, setNewBlockDay] = useState<string | null | undefined>(undefined);
  const [selectedItem, setSelectedItem] = useState<FlowItem | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);

  const visibleDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(anchorDate, index)),
    [anchorDate]
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
    if (session) void loadData();
  }, [session, anchorDate]);

  async function loadData() {
    if (!session) return;
    setLoading(true);
    setError(null);
    const from = format(visibleDates[0], "yyyy-MM-dd");
    const to = format(visibleDates[visibleDates.length - 1], "yyyy-MM-dd");
    const [dayResult, scheduledResult, inboxResult] = await Promise.all([
      supabase.from("flow_days").select("*").gte("day", from).lte("day", to).order("day"),
      supabase.from("flow_items").select("*").gte("day", from).lte("day", to).neq("status", "archived").order("day").order("sort_order"),
      supabase.from("flow_items").select("*").is("day", null).neq("status", "archived").order("sort_order"),
    ]);
    const firstError = dayResult.error || scheduledResult.error || inboxResult.error;
    if (firstError) setError(firstError.message);
    else {
      setDays((dayResult.data ?? []) as FlowDay[]);
      setItems([...(scheduledResult.data ?? []), ...(inboxResult.data ?? [])] as FlowItem[]);
    }
    setLoading(false);
  }

  async function saveDay(dayKey: string, field: "whats_happening" | "main_outcome" | "story_opportunity", value: string) {
    if (!session) return;
    const existing = days.find((d) => d.day === dayKey);
    if (existing) {
      const patch = { [field]: value || null, updated_at: new Date().toISOString() };
      setDays((current) => current.map((d) => d.id === existing.id ? { ...d, ...patch } : d));
      const { error: e } = await supabase.from("flow_days").update(patch).eq("id", existing.id);
      if (e) setError(e.message);
    } else {
      const { data, error: e } = await supabase.from("flow_days").insert({
        user_id: session.user.id, day: dayKey, theme: null, main_outcome: null,
        whats_happening: null, story_opportunity: null, notes: null,
        capacity_minutes: null, metadata: {}, [field]: value || null
      }).select("*").single();
      if (e) setError(e.message);
      else if (data) setDays((current) => [...current, data as FlowDay]);
    }
  }

  async function addBlock(day: string | null, draft: DraftBlock) {
    if (!session || !draft.title.trim()) return;
    const bucket = items.filter((item) => item.day === day);
    const nextSort = bucket.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 100;
    const { data, error: e } = await supabase.from("flow_items").insert({
      user_id: session.user.id,
      day,
      item_type: "task",
      title: draft.title.trim(),
      description: null,
      sort_order: nextSort,
      metadata: { channel: draft.channel.trim(), plan: draft.plan.trim(), copy: "" }
    }).select("*").single();
    if (e) setError(e.message);
    else if (data) {
      const inserted = data as FlowItem;
      setItems((current) => [...current, inserted]);
      setNewBlockDay(undefined);
      setSelectedItem(inserted);
    }
  }

  async function updateItem(item: FlowItem, patch: Partial<FlowItem>) {
    const next = { ...patch, updated_at: new Date().toISOString() };
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...next } : candidate));
    setSelectedItem((current) => current?.id === item.id ? { ...current, ...next } : current);
    const { error: e } = await supabase.from("flow_items").update(next).eq("id", item.id);
    if (e) { setError(e.message); void loadData(); }
  }

  async function moveItem(itemId: string, day: string | null) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.day === day) return;
    const bucket = items.filter((candidate) => candidate.day === day && candidate.id !== itemId);
    const sort_order = bucket.reduce((max, candidate) => Math.max(max, Number(candidate.sort_order || 0)), 0) + 100;
    await updateItem(item, { day, sort_order });
  }

  async function saveDetail(item: FlowItem, title: string, channel: string, plan: string, copy: string) {
    await updateItem(item, {
      title,
      metadata: { ...(item.metadata ?? {}), channel, plan, copy }
    });
  }

  async function archiveItem(item: FlowItem) {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setSelectedItem(null);
    const { error: e } = await supabase.from("flow_items").update({
      status: "archived", updated_at: new Date().toISOString()
    }).eq("id", item.id);
    if (e) setError(e.message);
  }

  if (!authReady) return <div className="center-screen">Loading Flowboard…</div>;
  if (!session) return <AuthScreen />;

  const inboxItems = items.filter((item) => item.day === null && item.status !== "archived");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <div className="brand-mark">H</div>
            <div><strong>Hyprfy</strong><span>Flowboard</span></div>
          </div>
          <nav>
            <button className={`nav-item ${!inboxOpen ? "active" : ""}`} onClick={() => setInboxOpen(false)}>Flowboard</button>
            <button className={`nav-item ${inboxOpen ? "active" : ""}`} onClick={() => setInboxOpen(true)}>
              Inbox <span className="count">{inboxItems.length}</span>
            </button>
            <button className="nav-item muted" disabled>Calendar <span>Soon</span></button>
            <button className="nav-item muted" disabled>Projects <span>Soon</span></button>
          </nav>
        </div>
        <div className="sidebar-footer">
          <span className="version-badge">v{APP_VERSION}</span>
          <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">HYPRFY LIFEOS</div>
            <h1>{inboxOpen ? "Inbox" : "Flowboard"}</h1>
          </div>
          <div className="topbar-actions">
            <span className="build-stamp">BUILD v{APP_VERSION}</span>
            {!inboxOpen && <>
              <button onClick={() => setAnchorDate((d) => addDays(d, -7))}>←</button>
              <button onClick={() => setAnchorDate(startOfDay(new Date()))}>Today</button>
              <button onClick={() => setAnchorDate((d) => addDays(d, 7))}>→</button>
            </>}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {inboxOpen ? (
          <div className="inbox-page">
            <div className="inbox-header">
              <div><div className="eyebrow">UNSCHEDULED</div><h2>Ideas waiting for a day</h2></div>
              <button className="primary-button" onClick={() => setNewBlockDay(null)}>+ Add block</button>
            </div>
            <div className="inbox-grid">
              {inboxItems.length === 0
                ? <div className="empty-state">Nothing waiting. Capture an idea when it arrives.</div>
                : inboxItems.map((item) => <ContentCard key={item.id} item={item} onOpen={setSelectedItem} />)}
            </div>
          </div>
        ) : (
          <div className="board-wrap">
            <div className="board">
              {visibleDates.map((date) => {
                const dayKey = format(date, "yyyy-MM-dd");
                const dayData = days.find((d) => d.day === dayKey);
                const dayItems = items.filter((item) => item.day === dayKey && item.status !== "archived");
                const isToday = dayKey === format(new Date(), "yyyy-MM-dd");
                return (
                  <DayColumn
                    key={dayKey}
                    dayKey={dayKey}
                    date={date}
                    data={dayData}
                    items={dayItems}
                    isToday={isToday}
                    onSaveDay={saveDay}
                    onAdd={() => setNewBlockDay(dayKey)}
                    onOpen={setSelectedItem}
                    onDropItem={moveItem}
                  />
                );
              })}
            </div>
          </div>
        )}

        {loading && <div className="sync-pill">Syncing…</div>}
      </main>

      {newBlockDay !== undefined && (
        <NewBlockModal day={newBlockDay} onClose={() => setNewBlockDay(undefined)} onSave={addBlock} />
      )}
      {selectedItem && (
        <DetailDrawer item={selectedItem} onClose={() => setSelectedItem(null)} onSave={saveDetail} onArchive={archiveItem} />
      )}
    </div>
  );
}

function DayColumn({ dayKey, date, data, items, isToday, onSaveDay, onAdd, onOpen, onDropItem }: {
  dayKey: string;
  date: Date;
  data?: FlowDay;
  items: FlowItem[];
  isToday: boolean;
  onSaveDay: (dayKey: string, field: "whats_happening" | "main_outcome" | "story_opportunity", value: string) => Promise<void>;
  onAdd: () => void;
  onOpen: (item: FlowItem) => void;
  onDropItem: (itemId: string, day: string | null) => Promise<void>;
}) {
  return (
    <section
      className={`day-column ${isToday ? "today-column" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const itemId = e.dataTransfer.getData("text/flow-item");
        if (itemId) void onDropItem(itemId, dayKey);
      }}
    >
      <div className="day-header">
        <div><div className="day-name">{format(date, "EEE")}</div><div className="day-date">{format(date, "d MMM")}</div></div>
        {isToday && <span className="today-pill">Today</span>}
      </div>
      <DayField label="What's happening" placeholder="Meetings, events, training, life…" value={data?.whats_happening ?? ""} onSave={(v) => onSaveDay(dayKey, "whats_happening", v)} />
      <DayField label="Main focus" placeholder="What matters most today?" value={data?.main_outcome ?? ""} onSave={(v) => onSaveDay(dayKey, "main_outcome", v)} />
      <DayField label="Story opportunity" placeholder="What could this day become a story about?" value={data?.story_opportunity ?? ""} onSave={(v) => onSaveDay(dayKey, "story_opportunity", v)} />

      <div className="content-section">
        <div className="section-title-row"><span>Content</span><span className="section-count">{items.length}</span></div>
        <div className="cards">{items.map((item) => <ContentCard key={item.id} item={item} onOpen={onOpen} />)}</div>
        <button className="add-block" onClick={onAdd}>+ Add block</button>
      </div>
    </section>
  );
}

function DayField({ label, placeholder, value, onSave }: {
  label: string; placeholder: string; value: string; onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="day-field">
      <span>{label}</span>
      <textarea value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) void onSave(draft); }} rows={label === "What's happening" ? 3 : 2} />
    </label>
  );
}

function ContentCard({ item, onOpen }: { item: FlowItem; onOpen: (item: FlowItem) => void }) {
  const m = getMeta(item);
  return (
    <button className={`content-card ${channelClass(m.channel)}`} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/flow-item", item.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onOpen(item)}>
      <strong>{item.title}</strong>
      {m.channel && <span className={`channel-pill ${channelClass(m.channel)}`}>{m.channel}</span>}
      {m.plan && <p>{m.plan}</p>}
      <span className="open-hint">{m.copy ? "Open copy →" : "Add script / copy →"}</span>
    </button>
  );
}

function NewBlockModal({ day, onClose, onSave }: {
  day: string | null; onClose: () => void; onSave: (day: string | null, draft: DraftBlock) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftBlock>({ title: "", channel: "Instagram", plan: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    await onSave(day, draft);
    setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading"><div><div className="eyebrow">{day ?? "INBOX"}</div><h2>New content block</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label><span>Title</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Red Bull Half Court" /></label>
        <label><span>Channel</span><select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
          <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
        </select></label>
        <label><span>Plan</span><textarea rows={4} value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })} placeholder="Event recap reel: arrival → energy → game → closing thought." /></label>
        <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !draft.title.trim()}>{saving ? "Adding…" : "Add block"}</button></div>
      </form>
    </div>
  );
}

function DetailDrawer({ item, onClose, onSave, onArchive }: {
  item: FlowItem; onClose: () => void;
  onSave: (item: FlowItem, title: string, channel: string, plan: string, copy: string) => Promise<void>;
  onArchive: (item: FlowItem) => Promise<void>;
}) {
  const m = getMeta(item);
  const [title, setTitle] = useState(item.title);
  const [channel, setChannel] = useState(m.channel ?? "");
  const [plan, setPlan] = useState(m.plan ?? "");
  const [copy, setCopy] = useState(m.copy ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header"><div><div className="eyebrow">{item.day ?? "INBOX"} · {channel || "No channel"}</div><h2>Content detail</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
        <label><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label><span>Channel</span><select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
        </select></label>
        <label><span>Plan</span><textarea rows={5} value={plan} onChange={(e) => setPlan(e.target.value)} /></label>
        <label className="copy-field"><span>Script / post copy</span><textarea rows={16} value={copy} onChange={(e) => setCopy(e.target.value)} placeholder="Write the reel script, caption, post copy or shot-by-shot notes here…" /></label>
        <div className="drawer-actions">
          <button className="danger-button" onClick={() => void onArchive(item)}>Archive</button>
          <button className="primary-button" disabled={saving || !title.trim()} onClick={async () => {
            setSaving(true); await onSave(item, title.trim(), channel, plan, copy); setSaving(false);
          }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </aside>
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setBusy(false);
  }
  return (
    <div className="auth-screen"><form className="auth-card" onSubmit={login}>
      <div className="brand-mark large">H</div>
      <div className="eyebrow">HYPRFY LIFEOS · v{APP_VERSION}</div>
      <h1>Flowboard</h1><p>Plan the day. Create the story.</p>
      <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {message && <div className="auth-message">{message}</div>}
      <button className="primary-button wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form></div>
  );
}
