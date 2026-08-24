"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  type DragEndEvent, type DragStartEvent, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, ArrowLeft, ArrowRight, CalendarDays, Captions, Check, Clapperboard, Film, GripVertical, Inbox as InboxIcon, LogOut, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, rollingDates, toDateKey } from "@/lib/date";
import type { FlowDay, FlowItem, Json } from "@/types/database";
import { Dashboard } from "./dashboard";
import { BrandProfile } from "./brand-profile";
import { ChannelProfiles } from "./channel-profiles";
import { navItems } from "./icons";
import { signOut } from "@/app/actions";

const channelOptions = ["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "X", "Substack", "Blog"] as const;
type SaveState = "idle" | "saving" | "saved" | "error";
type ViewDays = 7 | 14;
type AppView = "dashboard" | "brand" | "channels" | "flowboard";
type ItemPatch = Pick<FlowItem, "title" | "description" | "status" | "priority" | "duration_minutes" | "item_type" | "day" | "metadata">;

function dayContainerId(day: string) { return `day:${day}`; }
function dayFromContainer(id: string) { return id === "inbox" ? null : id.startsWith("day:") ? id.slice(4) : undefined; }

function itemMetadata(item: FlowItem): Record<string, Json | undefined> {
  return item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {};
}

function itemChannels(item: FlowItem) {
  const channels = itemMetadata(item).channels;
  return Array.isArray(channels) ? channels.filter((channel): channel is string => typeof channel === "string").map((channel) => channel === "Newsletter" ? "Substack" : channel) : [];
}

function SortableCard({ item, onEdit, draggable = true }: { item: FlowItem; onEdit: (item: FlowItem) => void; draggable?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !draggable });
  const metadata = itemMetadata(item);
  const channels = itemChannels(item);
  const script = typeof metadata.script === "string" ? metadata.script : "";
  const socialCopy = typeof metadata.social_copy === "string" ? metadata.social_copy : "";
  const capture = typeof metadata.capture_notes === "string" ? metadata.capture_notes : "";
  const platform = channels[0] ?? "";
  const platformKey = platform.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  const statusLabel = item.status === "done" ? "Ready" : item.status === "open" ? "" : item.status.replaceAll("_", " ");
  return (
    <article ref={setNodeRef} data-platform={platformKey || undefined} className={`flow-card ${isDragging ? "dragging" : ""} ${item.status === "done" ? "done" : ""} ${!draggable ? "static" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {draggable && <button className="drag-handle" aria-label={`Drag ${item.title}`} {...attributes} {...listeners}><GripVertical size={14} /></button>}
      <button className="card-content" onClick={() => onEdit(item)}>
        <span>{item.title}</span>
        {(statusLabel || item.duration_minutes) && <small className="card-details">{statusLabel}{statusLabel && item.duration_minutes ? " · " : ""}{item.duration_minutes ? `${item.duration_minutes} min` : ""}</small>}
        {(script || socialCopy || capture) && <span className="card-ready-state">{script && <small>Script</small>}{socialCopy && <small>Post copy</small>}{capture && <small>Capture</small>}</span>}
        {item.item_type === "vlog" && <span className="vlog-tag"><Film size={10} /> Vlog moment</span>}
        {platform && <span className="channel-tags"><small>{platform === "X" ? "X / Twitter" : platform}</small></span>}
      </button>
    </article>
  );
}

function VlogList({ items, onAdd, onEdit }: { items: FlowItem[]; onAdd: (title: string) => Promise<void>; onEdit: (item: FlowItem) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  async function submit() {
    const value = title.trim();
    if (!value) return;
    setTitle(""); setAdding(false); await onAdd(value);
  }
  return (
    <section className="vlog-section">
      <div className="vlog-heading"><div><span className="vlog-icon"><Film size={14} /></span><div><h3>Vlog</h3><span>{items.length} {items.length === 1 ? "moment" : "moments"}</span></div></div><small>Bank the story</small></div>
      <div className="card-list">{items.map((item) => <SortableCard item={item} key={item.id} onEdit={onEdit} draggable={false} />)}</div>
      {adding ? (
        <div className="quick-add-input vlog-quick-add">
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") setAdding(false); }} placeholder="Moment, scene or story beat" />
          <button disabled={!title.trim()} onClick={() => void submit()} aria-label="Add vlog moment"><Check size={14} /></button>
          <button onClick={() => setAdding(false)} aria-label="Cancel"><X size={14} /></button>
        </div>
      ) : <button className="add-vlog-button" onClick={() => setAdding(true)}><Plus size={14} /> Add vlog moment</button>}
    </section>
  );
}

function PostList({ day, items, onAdd, onEdit }: { day: string; items: FlowItem[]; onAdd: (title: string, platform: string) => Promise<void>; onEdit: (item: FlowItem) => void }) {
  const id = dayContainerId(day);
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  async function submit() {
    const value = title.trim();
    if (!value || !platform) return;
    const selectedPlatform = platform;
    setTitle(""); setPlatform(""); setAdding(false); await onAdd(value, selectedPlatform);
  }
  return (
    <section ref={setNodeRef} className={`day-posts ${isOver ? "is-over" : ""}`}>
      <div className="day-posts-heading"><div><h3>Content</h3><span>{items.length} {items.length === 1 ? "post" : "posts"}</span></div></div>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="card-list">{items.map((item) => <SortableCard item={item} key={item.id} onEdit={onEdit} />)}</div>
      </SortableContext>
      {adding ? (
        <div className="quick-add-input">
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") setAdding(false); }} placeholder="Post title" />
          <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Platform"><option value="">Platform</option>{channelOptions.map((channel) => <option key={channel} value={channel}>{channel === "X" ? "X / Twitter" : channel}</option>)}</select>
          <button disabled={!title.trim() || !platform} onClick={() => void submit()} aria-label="Create post"><Check size={14} /></button>
          <button onClick={() => setAdding(false)} aria-label="Cancel"><X size={14} /></button>
        </div>
      ) : <button className="add-post-button" onClick={() => setAdding(true)}><Plus size={14} /> Add post</button>}
    </section>
  );
}

function ContextField({ label, value, placeholder, multiline = true, onSave }: { label: string; value: string | null; placeholder: string; multiline?: boolean; onSave: (value: string) => void }) {
  const props = { defaultValue: value ?? "", placeholder, onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.target.value !== (value ?? "")) onSave(event.target.value); } };
  return <label className="context-field"><span>{label}</span>{multiline ? <textarea rows={2} {...props} /> : <input {...props} />}</label>;
}

function DayColumn({ date, day, items, onDayChange, onAddContent, onAddVlog, onEdit }: { date: Date; day?: FlowDay; items: FlowItem[]; onDayChange: (day: string, patch: Partial<FlowDay>) => Promise<void>; onAddContent: (day: string, title: string, platform: string) => Promise<void>; onAddVlog: (day: string, title: string) => Promise<void>; onEdit: (item: FlowItem) => void }) {
  const key = toDateKey(date);
  const today = key === toDateKey(new Date());
  const vlogItems = items.filter((item) => item.item_type === "vlog").toSorted((a, b) => a.sort_order - b.sort_order);
  const contentItems = items.filter((item) => item.item_type !== "vlog").toSorted((a, b) => a.sort_order - b.sort_order);
  return (
    <article className={`day-column ${today ? "today" : ""}`}>
      <section className="day-overview">
        <header className="day-header"><div><p>{date.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase()}</p><h2>{date.toLocaleDateString(undefined, { day: "numeric", month: "long" }).toUpperCase()}</h2></div>{today && <span className="today-pill">Today</span>}</header>
        <div className="day-context"><ContextField label="Topic" value={day?.theme ?? null} placeholder="What is today about?" multiline={false} onSave={(theme) => void onDayChange(key, { theme })} /><ContextField label="What’s happening" value={day?.whats_happening ?? null} placeholder="Events, commitments, real life…" onSave={(whats_happening) => void onDayChange(key, { whats_happening })} /></div>
      </section>
      <VlogList items={vlogItems} onAdd={(title) => onAddVlog(key, title)} onEdit={onEdit} />
      <PostList day={key} items={contentItems} onAdd={(title, platform) => onAddContent(key, title, platform)} onEdit={onEdit} />
    </article>
  );
}

function InboxPanel({ open, items, onAdd, onClose, onEdit }: { open: boolean; items: FlowItem[]; onAdd: (title: string, platform: string) => Promise<void>; onClose: () => void; onEdit: (item: FlowItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "inbox" });
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  async function submit() { const value = title.trim(); if (!value || !platform) return; const selectedPlatform = platform; setTitle(""); setPlatform(""); await onAdd(value, selectedPlatform); }
  if (!open) return null;
  return (
    <aside className="inbox-panel">
      <div className="inbox-title"><div><InboxIcon size={18} /><div><h2>Inbox</h2><p>Unscheduled</p></div></div><button onClick={onClose} aria-label="Close inbox"><X size={17} /></button></div>
      <div className="inbox-add"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Post title" /><select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Platform"><option value="">Platform</option>{channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select><button disabled={!title.trim() || !platform} onClick={() => void submit()}><Plus size={15} /></button></div>
      <div ref={setNodeRef} className={`inbox-drop ${isOver ? "is-over" : ""}`}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.length ? items.map((item) => <SortableCard item={item} key={item.id} onEdit={onEdit} />) : <div className="empty-inbox"><InboxIcon size={22} /><p>Your inbox is clear.</p><span>Capture an idea here or drag a card back to unschedule it.</span></div>}
        </SortableContext>
      </div>
    </aside>
  );
}

function ItemEditor({ item, saving, onClose, onSave, onDelete }: { item: FlowItem; saving: boolean; onClose: () => void; onSave: (patch: ItemPatch) => Promise<void>; onDelete: () => Promise<void> }) {
  const metadata = itemMetadata(item);
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [day, setDay] = useState(item.day ?? "");
  const [platform, setPlatform] = useState(() => itemChannels(item)[0] ?? "");
  const [script, setScript] = useState(typeof metadata.script === "string" ? metadata.script : "");
  const [socialCopy, setSocialCopy] = useState(typeof metadata.social_copy === "string" ? metadata.social_copy : "");
  const [capture, setCapture] = useState(typeof metadata.capture_notes === "string" ? metadata.capture_notes : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isVlog = item.item_type === "vlog";
  const storyboardBeats = capture.split("\n").map((beat) => beat.trim().replace(/^\d+\s*[—.):-]?\s*/, "")).filter(Boolean).slice(0, 3);
  const storyboardFrames = ["Opening frame", "Proof / detail", "Closing beat"].map((fallback, index) => storyboardBeats[index] || fallback);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape" && !saving) onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    await onSave({
      title: cleanTitle,
      description: item.description,
      status,
      priority: item.priority,
      duration_minutes: item.duration_minutes,
      item_type: item.item_type,
      day: day || null,
      metadata: { ...metadata, channels: platform ? [platform] : [], primary_channel: platform || null, script: script.trim() || null, social_copy: socialCopy.trim() || null, capture_notes: capture.trim() || null },
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="item-editor" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
        <header><div><p className="eyebrow">{isVlog ? "Vlog moment" : "Content plan"}</p><h2 id="item-editor-title">{isVlog ? "Shape the story" : title || "Untitled post"}</h2><p className="editor-intro">{isVlog ? "Turn this moment into a story worth keeping." : "The complete creative plan, from what you say to what your audience sees."}</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close editor"><X size={18} /></button></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className={`editor-meta-grid ${isVlog ? "is-vlog" : ""}`}>
            <label className="editor-field title-field"><span>{isVlog ? "Moment title" : "Post title"}</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
            {!isVlog && <label className="editor-field"><span>Platform</span><select value={platform} onChange={(event) => setPlatform(event.target.value)} required><option value="">Choose a platform</option>{channelOptions.map((channel) => <option key={channel} value={channel}>{channel === "X" ? "X / Twitter" : channel}</option>)}</select></label>}
            <label className="editor-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Draft</option><option value="done">Ready</option><option value="archived">Archived</option></select></label>
            <label className="editor-field"><span>Scheduled day</span><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>
          </div>
          <div className={`content-plan-grid ${isVlog ? "is-vlog" : ""}`}>
            <section className="plan-column script-column">
              <header><span className="plan-column-number">01</span><span className="plan-column-icon"><AlignLeft size={15} /></span><div><h3>{isVlog ? "Story notes" : "Script"}</h3><p>{isVlog ? "The meaning and story beat." : "What is spoken or shown on screen."}</p></div></header>
              <label className="editor-field content-copy-field"><span className="sr-only">{isVlog ? "Story notes" : "Script"}</span><textarea rows={16} value={script} onChange={(event) => setScript(event.target.value)} placeholder={isVlog ? "Why this moment matters, the story beat, or a possible voiceover…" : "Hook\n\nWrite the full video, voiceover, carousel, or spoken script…"} /></label>
            </section>
            {!isVlog && <section className="plan-column copy-column">
              <header><span className="plan-column-number">02</span><span className="plan-column-icon"><Captions size={15} /></span><div><h3>Post copy</h3><p>The finished caption your audience will read.</p></div></header>
              <label className="editor-field content-copy-field"><span className="sr-only">Post copy</span><textarea rows={16} value={socialCopy} onChange={(event) => setSocialCopy(event.target.value)} placeholder="Write the caption or post that will be published with it…" /><small>{platform === "X" ? "Keep it concise, or use this as the opening of a thread." : `Finished copy${platform ? ` for ${platform}` : " for this platform"}.`}</small></label>
            </section>}
            <section className="plan-column storyboard-column">
              <header><span className="plan-column-number">{isVlog ? "02" : "03"}</span><span className="plan-column-icon"><Clapperboard size={15} /></span><div><h3>Example storyboard</h3><p>Scenes, framing, footage and visual beats.</p></div></header>
              <div className="storyboard-strip" aria-label="Storyboard preview">{storyboardFrames.map((frame, index) => <span key={`${index}-${frame}`}><b>{String(index + 1).padStart(2, "0")}</b><i>{frame}</i></span>)}</div>
              <label className="editor-field content-copy-field"><span className="sr-only">Example storyboard and capture notes</span><textarea rows={10} value={capture} onChange={(event) => setCapture(event.target.value)} placeholder={'01 — Opening shot / hook\n02 — Detail, action or proof\n03 — Closing frame / CTA'} /><small>Use one numbered shot or frame per line.</small></label>
            </section>
          </div>
          <footer>
            {confirmDelete ? <button className="delete-button confirm" type="button" onClick={() => void onDelete()} disabled={saving}>Confirm delete</button> : <button className="delete-button" type="button" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={15} />Delete</button>}
            <div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button editor-save" type="submit" disabled={saving || !title.trim() || (!isVlog && !platform)}>{saving ? "Saving…" : "Save changes"}</button></div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function Flowboard({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [offset, setOffset] = useState(0);
  const [viewDays, setViewDays] = useState<ViewDays>(7);
  const [days, setDays] = useState<FlowDay[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<FlowItem | null>(null);
  const startDate = useMemo(() => addDays(new Date(), offset), [offset]);
  const dates = useMemo(() => rollingDates(startDate, viewDays), [startDate, viewDays]);
  const firstKey = toDateKey(dates[0]);
  const lastKey = toDateKey(dates[dates.length - 1]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const loadBoard = useCallback(async () => {
    setLoading(true); setError(null);
    const queryBoard = () => Promise.all([
      supabase.from("flow_days").select("*").eq("user_id", userId).gte("day", firstKey).lte("day", lastKey).order("day"),
      supabase.from("flow_items").select("*").eq("user_id", userId).or(`day.is.null,and(day.gte.${firstKey},day.lte.${lastKey})`).order("sort_order"),
    ]);
    let [dayResult, itemResult] = await queryBoard();
    const authFailure = [dayResult.error, itemResult.error].some((queryError) => queryError && /jwt|token|auth|PGRST301/i.test(`${queryError.code} ${queryError.message}`));
    if (authFailure) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) [dayResult, itemResult] = await queryBoard();
    }
    if (dayResult.error || itemResult.error) setError(dayResult.error?.message ?? itemResult.error?.message ?? "Could not load Flowboard.");
    else { setDays(dayResult.data); setItems(itemResult.data); }
    setLoading(false);
  }, [firstKey, lastKey, supabase, userId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadBoard(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadBoard]);

  async function saveDay(dayKey: string, patch: Partial<FlowDay>) {
    setSaveState("saving");
    const existing = days.find((entry) => entry.day === dayKey);
    const merged = {
      theme: existing?.theme ?? null,
      main_outcome: existing?.main_outcome ?? null,
      whats_happening: existing?.whats_happening ?? null,
      story_opportunity: existing?.story_opportunity ?? null,
      notes: existing?.notes ?? null,
      capacity_minutes: existing?.capacity_minutes ?? null,
      metadata: existing?.metadata ?? {},
      ...patch,
    };
    setDays((current) => {
      const currentDay = current.find((entry) => entry.day === dayKey);
      if (currentDay) return current.map((entry) => entry.day === dayKey ? { ...entry, ...patch } : entry);
      return [...current, { id: `optimistic-${dayKey}`, user_id: userId, day: dayKey, theme: null, main_outcome: null, whats_happening: null, story_opportunity: null, notes: null, capacity_minutes: null, metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...patch }];
    });
    const { data, error: saveError } = await supabase.from("flow_days").upsert({ user_id: userId, day: dayKey, ...merged, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" }).select().single();
    if (saveError) { setSaveState("error"); setError(saveError.message); await loadBoard(); }
    else { setDays((current) => [...current.filter((entry) => entry.day !== dayKey), data]); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400); }
  }

  async function addItem(day: string | null, title: string, platform: string, itemType = "idea") {
    setSaveState("saving"); setError(null);
    const peers = items.filter((item) => item.day === day && item.item_type !== "task");
    const sortOrder = peers.length ? Math.max(...peers.map((item) => item.sort_order)) + 1024 : 1024;
    const { data, error: addError } = await supabase.from("flow_items").insert({ user_id: userId, day, item_type: itemType, title, sort_order: sortOrder, metadata: { channels: platform ? [platform] : [], primary_channel: platform || null } }).select().single();
    if (addError) { setError(addError.message); setSaveState("error"); return null; }
    setItems((current) => [...current, data]); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400);
    return data;
  }

  async function addContentCard(day: string | null, title: string, platform: string) {
    const item = await addItem(day, title, platform);
    if (item) setEditingItem(item);
  }

  async function addVlogMoment(day: string, title: string) {
    const item = await addItem(day, title, "", "vlog");
    if (item) setEditingItem(item);
  }

  async function updateItem(item: FlowItem, patch: ItemPatch) {
    setSaveState("saving"); setError(null);
    const { data, error: updateError } = await supabase.from("flow_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", userId).select().single();
    if (updateError) { setSaveState("error"); setError(updateError.message); return; }
    setItems((current) => current.map((entry) => entry.id === item.id ? data : entry));
    setEditingItem(null); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400);
  }

  async function deleteItem(item: FlowItem) {
    setSaveState("saving"); setError(null);
    const { error: deleteError } = await supabase.from("flow_items").delete().eq("id", item.id).eq("user_id", userId);
    if (deleteError) { setSaveState("error"); setError(deleteError.message); return; }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setEditingItem(null); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400);
  }

  function locationFor(item: FlowItem) { return item.day ? dayContainerId(item.day) : "inbox"; }
  function targetFor(overId: string) {
    const overItem = items.find((item) => item.id === overId);
    return overItem ? { container: locationFor(overItem), overItem } : { container: overId, overItem: undefined };
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;
    const active = items.find((item) => item.id === String(event.active.id));
    if (!active) return;
    const sourceContainer = locationFor(active);
    const { container: targetContainer, overItem } = targetFor(String(event.over.id));
    const targetDay = dayFromContainer(targetContainer);
    if (targetDay === undefined) return;
    const sourceItems = items.filter((item) => locationFor(item) === sourceContainer).sort((a, b) => a.sort_order - b.sort_order);
    const targetItems = items.filter((item) => locationFor(item) === targetContainer && item.id !== active.id).sort((a, b) => a.sort_order - b.sort_order);
    let nextOrder: FlowItem[];
    if (sourceContainer === targetContainer) {
      const from = sourceItems.findIndex((item) => item.id === active.id);
      const to = overItem ? sourceItems.findIndex((item) => item.id === overItem.id) : sourceItems.length - 1;
      if (from === to || to < 0) return;
      nextOrder = arrayMove(sourceItems, from, to);
    } else {
      const insertAt = overItem ? Math.max(0, targetItems.findIndex((item) => item.id === overItem.id)) : targetItems.length;
      nextOrder = [...targetItems]; nextOrder.splice(insertAt, 0, active);
    }
    const updates = nextOrder.map((item, index) => ({ id: item.id, sort_order: (index + 1) * 1024, ...(item.id === active.id ? { day: targetDay } : {}) }));
    setItems((current) => current.map((item) => {
      const update = updates.find((entry) => entry.id === item.id);
      return update ? { ...item, ...update } : item;
    }));
    setSaveState("saving");
    const results = await Promise.all(updates.map(({ id, ...patch }) => supabase.from("flow_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId)));
    const moveError = results.find((result) => result.error)?.error;
    if (moveError) { setError(moveError.message); setSaveState("error"); await loadBoard(); }
    else { setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400); }
  }

  const activeItem = items.find((item) => item.id === activeId);
  const visibleItems = items.filter((item) => item.status !== "archived" && item.item_type !== "task");
  const inboxItems = visibleItems.filter((item) => !item.day).sort((a, b) => a.sort_order - b.sort_order);
  function openView(view: AppView) {
    setActiveView(view);
    if (view === "dashboard" || view === "channels") { setOffset(0); setViewDays(7); }
  }
  function showSaved() {
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1600);
  }
  const viewTitle = activeView === "dashboard" ? "Dashboard" : activeView === "brand" ? "Brand Profile" : activeView === "channels" ? "Channel Profiles" : "Flowboard";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>H</span><div><b>HYPRFY</b><small>Flowboard · v0.9.2</small></div></div>
        <nav>{navItems.map(({ label, icon: Icon, view, inbox }) => {
          const active = view === activeView;
          return <button className={active ? "active" : ""} key={label} onClick={() => view ? openView(view) : inbox ? setInboxOpen(true) : undefined} disabled={!view && !inbox}><Icon size={17} /><span>{label}</span>{inbox && inboxItems.length > 0 && <b className="nav-count">{inboxItems.length}</b>}</button>;
        })}</nav>
        <div className="sidebar-footer"><div className="avatar">{userEmail.slice(0, 1).toUpperCase() || "H"}</div><div><span>{userEmail || "Hyprfy user"}</span><small>Flowboard workspace</small></div><form action={signOut}><button aria-label="Sign out"><LogOut size={16} /></button></form></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Manual social planner · v0.9.2</p><h1>{viewTitle}</h1></div>
          <div className="topbar-actions">
            {activeView === "flowboard" && <><div className="date-controls"><button onClick={() => setOffset((value) => value - viewDays)} aria-label="Previous dates"><ArrowLeft size={16} /></button><button onClick={() => setOffset(0)}>Today</button><button onClick={() => setOffset((value) => value + viewDays)} aria-label="Next dates"><ArrowRight size={16} /></button></div>
            <div className="view-controls"><button className={viewDays === 7 ? "active" : ""} aria-pressed={viewDays === 7} onClick={() => setViewDays(7)}><CalendarDays size={15} />7 Days</button><button className={viewDays === 14 ? "active" : ""} aria-pressed={viewDays === 14} onClick={() => setViewDays(14)}>14 Days</button><button disabled>Month</button></div></>}
            <button className="inbox-trigger" onClick={() => setInboxOpen(true)}><InboxIcon size={16} />Inbox{inboxItems.length > 0 && <span>{inboxItems.length}</span>}</button>
          </div>
          <div className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</div>
        </header>
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={15} /></button></div>}
        {activeView === "dashboard" ? <Dashboard dates={dates.slice(0, 7)} days={days} items={visibleItems} onOpenFlowboard={() => openView("flowboard")} /> : activeView === "brand" ? <BrandProfile userId={userId} onSaved={showSaved} /> : activeView === "channels" ? <ChannelProfiles userId={userId} dates={dates.slice(0, 7)} items={visibleItems} onEditStrategy={() => openView("brand")} /> : loading ? <div className="board-loading">Preparing your days…</div> : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))} onDragEnd={(event) => void handleDragEnd(event)} onDragCancel={() => setActiveId(null)}>
            <div className="board-scroll">{dates.map((date) => { const key = toDateKey(date); return <DayColumn key={key} date={date} day={days.find((entry) => entry.day === key)} items={visibleItems.filter((item) => item.day === key)} onDayChange={saveDay} onAddContent={addContentCard} onAddVlog={addVlogMoment} onEdit={setEditingItem} />; })}</div>
            <InboxPanel open={inboxOpen} items={inboxItems} onAdd={(title, platform) => addContentCard(null, title, platform)} onClose={() => setInboxOpen(false)} onEdit={setEditingItem} />
            <DragOverlay>{activeItem ? <article className="flow-card overlay"><GripVertical size={14} /><span>{activeItem.title}</span></article> : null}</DragOverlay>
          </DndContext>
        )}
        {editingItem && <ItemEditor key={editingItem.id} item={editingItem} saving={saveState === "saving"} onClose={() => setEditingItem(null)} onSave={(patch) => updateItem(editingItem, patch)} onDelete={() => deleteItem(editingItem)} />}
      </main>
    </div>
  );
}
