"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  type DragEndEvent, type DragStartEvent, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, CalendarDays, Check, GripVertical, Inbox as InboxIcon, LogOut, Plus, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, rollingDates, toDateKey } from "@/lib/date";
import type { FlowDay, FlowItem, Json } from "@/types/database";
import type { GeneratedPlan, PlanDecision } from "@/types/plan";
import { Dashboard } from "./dashboard";
import { BrandProfile } from "./brand-profile";
import { navItems } from "./icons";
import { WeeklyBrief } from "./weekly-brief";
import { signOut } from "@/app/actions";

const sections = ["task", "idea", "script", "capture", "edit", "publish"] as const;
const sectionLabels: Record<Section, string> = { task: "To do", idea: "Idea", script: "Script", capture: "Capture", edit: "Edit", publish: "Publish" };
const channelOptions = ["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "X", "Newsletter", "Blog"] as const;
type Section = (typeof sections)[number];
type SaveState = "idle" | "saving" | "saved" | "error";
type ViewDays = 7 | 14;
type AppView = "dashboard" | "brand" | "brief" | "flowboard";
type ItemPatch = Pick<FlowItem, "title" | "description" | "status" | "priority" | "duration_minutes" | "item_type" | "day" | "metadata">;

function containerId(day: string, type: Section) { return `${day}::${type}`; }
function parseContainer(id: string) {
  if (id === "inbox") return { day: null, type: null };
  const [day, type] = id.split("::") as [string, Section];
  return { day, type };
}

function itemMetadata(item: FlowItem): Record<string, Json | undefined> {
  return item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {};
}

function itemChannels(item: FlowItem) {
  const channels = itemMetadata(item).channels;
  return Array.isArray(channels) ? channels.filter((channel): channel is string => typeof channel === "string") : [];
}

function metadataObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function savedPlan(day?: FlowDay): { decision: PlanDecision; headline: string; rationale: string } | null {
  if (!day) return null;
  const plan = metadataObject(day.metadata).ai_plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const decision = plan.decision;
  const headline = plan.headline;
  const rationale = plan.rationale;
  if ((decision === "post_today" || decision === "bank_for_weekly_vlog" || decision === "post_and_bank") && typeof headline === "string" && typeof rationale === "string") return { decision, headline, rationale };
  return null;
}

function decisionLabel(decision: PlanDecision) {
  if (decision === "post_today") return "Post today";
  if (decision === "bank_for_weekly_vlog") return "Bank for weekly vlog";
  return "Post today + bank it";
}

function SortableCard({ item, onEdit, onToggleDone }: { item: FlowItem; onEdit: (item: FlowItem) => void; onToggleDone: (item: FlowItem) => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const metadata = itemMetadata(item);
  const channels = itemChannels(item);
  const hook = typeof metadata.hook === "string" ? metadata.hook : "";
  const socialCopy = typeof metadata.social_copy === "string" ? metadata.social_copy : "";
  return (
    <article ref={setNodeRef} className={`flow-card ${isDragging ? "dragging" : ""} ${item.status === "done" ? "done" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button className="drag-handle" aria-label={`Drag ${item.title}`} {...attributes} {...listeners}><GripVertical size={14} /></button>
      {item.item_type === "task" && <button className="todo-check" aria-label={item.status === "done" ? `Mark ${item.title} open` : `Mark ${item.title} done`} aria-pressed={item.status === "done"} onClick={() => void onToggleDone(item)}>{item.status === "done" ? <Check size={11} /> : null}</button>}
      <button className="card-content" onClick={() => onEdit(item)}>
        <span>{item.title}</span>
        {(item.status !== "open" || item.duration_minutes) && <small className="card-details">{item.status !== "open" ? item.status.replaceAll("_", " ") : ""}{item.status !== "open" && item.duration_minutes ? " · " : ""}{item.duration_minutes ? `${item.duration_minutes} min` : ""}</small>}
        {hook && <small className="card-hook">“{hook}”</small>}
        {socialCopy && <small className="copy-ready">Copy ready</small>}
        {channels.length > 0 && <span className="channel-tags">{channels.slice(0, 3).map((channel) => <small key={channel}>{channel}</small>)}{channels.length > 3 && <small>+{channels.length - 3}</small>}</span>}
      </button>
    </article>
  );
}

function DropSection({ id, items, label, onAdd, onEdit, onToggleDone }: { id: string; items: FlowItem[]; label: string; onAdd: (title: string) => Promise<void>; onEdit: (item: FlowItem) => void; onToggleDone: (item: FlowItem) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  async function submit() {
    const value = title.trim();
    if (!value) return;
    setTitle(""); setAdding(false); await onAdd(value);
  }
  return (
    <section ref={setNodeRef} className={`planning-section ${isOver ? "is-over" : ""}`}>
      <div className="section-heading"><h3>{label}</h3><span>{items.length || ""}</span></div>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="card-list">{items.map((item) => <SortableCard item={item} key={item.id} onEdit={onEdit} onToggleDone={onToggleDone} />)}</div>
      </SortableContext>
      {adding ? (
        <div className="quick-add-input">
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") setAdding(false); }} placeholder={`Add to ${label.toLowerCase()}`} />
          <button onClick={() => void submit()} aria-label="Save"><Check size={14} /></button>
          <button onClick={() => setAdding(false)} aria-label="Cancel"><X size={14} /></button>
        </div>
      ) : <button className="add-button" onClick={() => setAdding(true)}><Plus size={14} /> Add</button>}
    </section>
  );
}

function ContextField({ label, value, placeholder, multiline = true, onSave }: { label: string; value: string | null; placeholder: string; multiline?: boolean; onSave: (value: string) => void }) {
  const props = { defaultValue: value ?? "", placeholder, onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.target.value !== (value ?? "")) onSave(event.target.value); } };
  return <label className="context-field"><span>{label}</span>{multiline ? <textarea rows={2} {...props} /> : <input {...props} />}</label>;
}

function DayColumn({ date, day, items, generating, onDayChange, onAdd, onEdit, onGenerate, onToggleDone }: { date: Date; day?: FlowDay; items: FlowItem[]; generating: boolean; onDayChange: (day: string, patch: Partial<FlowDay>) => Promise<void>; onAdd: (day: string, type: Section, title: string) => Promise<void>; onEdit: (item: FlowItem) => void; onGenerate: (day: string, context: FlowDay | undefined) => Promise<void>; onToggleDone: (item: FlowItem) => Promise<void> }) {
  const key = toDateKey(date);
  const today = key === toDateKey(new Date());
  const plan = savedPlan(day);
  const hasContext = Boolean(day?.theme || day?.whats_happening || day?.main_outcome || day?.story_opportunity || day?.notes);
  return (
    <article className={`day-column ${today ? "today" : ""}`}>
      <header className="day-header">
        <div><p>{date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</p><h2>{date.toLocaleDateString(undefined, { day: "numeric", month: "short" }).toUpperCase()}</h2></div>
        {today && <span className="today-pill">Today</span>}
      </header>
      <div className="day-context">
        <ContextField label="Theme" value={day?.theme ?? null} placeholder="Set the tone for today" multiline={false} onSave={(theme) => void onDayChange(key, { theme })} />
        <ContextField label="What’s happening" value={day?.whats_happening ?? null} placeholder="Events, commitments, real life…" onSave={(whats_happening) => void onDayChange(key, { whats_happening })} />
        <ContextField label="Main focus" value={day?.main_outcome ?? null} placeholder="What matters most?" onSave={(main_outcome) => void onDayChange(key, { main_outcome })} />
        <ContextField label="Story opportunity" value={day?.story_opportunity ?? null} placeholder="What could today be about?" onSave={(story_opportunity) => void onDayChange(key, { story_opportunity })} />
        <ContextField label="Notes" value={day?.notes ?? null} placeholder="Anything else to remember" onSave={(notes) => void onDayChange(key, { notes })} />
        {plan ? <div className={`ai-recommendation ${plan.decision}`}><span>{decisionLabel(plan.decision)}</span><b>{plan.headline}</b><p>{plan.rationale}</p></div> : <button className="ai-plan-button" disabled={!hasContext || generating} onClick={() => void onGenerate(key, day)}><Sparkles size={14} />{generating ? "Building your plan…" : "Generate social plan"}</button>}
      </div>
      <div className="planning-blocks">
        {sections.map((type) => {
          const sectionItems = items.filter((item) => item.item_type === type).sort((a, b) => a.sort_order - b.sort_order);
          return <DropSection key={type} id={containerId(key, type)} items={sectionItems} label={sectionLabels[type]} onAdd={(title) => onAdd(key, type, title)} onEdit={onEdit} onToggleDone={onToggleDone} />;
        })}
      </div>
    </article>
  );
}

function InboxPanel({ open, items, onAdd, onClose, onEdit, onToggleDone }: { open: boolean; items: FlowItem[]; onAdd: (title: string) => Promise<void>; onClose: () => void; onEdit: (item: FlowItem) => void; onToggleDone: (item: FlowItem) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: "inbox" });
  const [title, setTitle] = useState("");
  async function submit() { const value = title.trim(); if (!value) return; setTitle(""); await onAdd(value); }
  if (!open) return null;
  return (
    <aside className="inbox-panel">
      <div className="inbox-title"><div><InboxIcon size={18} /><div><h2>Inbox</h2><p>Unscheduled</p></div></div><button onClick={onClose} aria-label="Close inbox"><X size={17} /></button></div>
      <div className="inbox-add"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Capture something…" /><button onClick={() => void submit()}><Plus size={15} /></button></div>
      <div ref={setNodeRef} className={`inbox-drop ${isOver ? "is-over" : ""}`}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.length ? items.map((item) => <SortableCard item={item} key={item.id} onEdit={onEdit} onToggleDone={onToggleDone} />) : <div className="empty-inbox"><InboxIcon size={22} /><p>Your inbox is clear.</p><span>Capture an idea here or drag a card back to unschedule it.</span></div>}
        </SortableContext>
      </div>
    </aside>
  );
}

function ItemEditor({ item, saving, onClose, onSave, onDelete }: { item: FlowItem; saving: boolean; onClose: () => void; onSave: (patch: ItemPatch) => Promise<void>; onDelete: () => Promise<void> }) {
  const metadata = itemMetadata(item);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority);
  const [duration, setDuration] = useState(item.duration_minutes?.toString() ?? "");
  const [itemType, setItemType] = useState(item.item_type);
  const [day, setDay] = useState(item.day ?? "");
  const [channels, setChannels] = useState<string[]>(() => itemChannels(item));
  const [channelPlan, setChannelPlan] = useState(typeof metadata.channel_plan === "string" ? metadata.channel_plan : "");
  const [hook, setHook] = useState(typeof metadata.hook === "string" ? metadata.hook : "");
  const [socialCopy, setSocialCopy] = useState(typeof metadata.social_copy === "string" ? metadata.social_copy : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      description: description.trim() || null,
      status,
      priority,
      duration_minutes: duration ? Math.max(1, Number.parseInt(duration, 10) || 1) : null,
      item_type: itemType,
      day: day || null,
      metadata: { ...metadata, channels, channel_plan: channelPlan.trim() || null, hook: hook.trim() || null, social_copy: socialCopy.trim() || null },
    });
  }

  function toggleChannel(channel: string) {
    setChannels((current) => current.includes(channel) ? current.filter((entry) => entry !== channel) : [...current, channel]);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="item-editor" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
        <header><div><p className="eyebrow">Flow item</p><h2 id="item-editor-title">Edit card</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close editor"><X size={18} /></button></header>
        <form onSubmit={(event) => void submit(event)}>
          <label className="editor-field"><span>Title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label className="editor-field"><span>Description</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add useful detail…" /></label>
          <label className="editor-field content-copy-field"><span>Hook</span><textarea rows={2} value={hook} onChange={(event) => setHook(event.target.value)} placeholder="The opening line that earns attention…" /></label>
          <label className="editor-field content-copy-field"><span>Social copy</span><textarea rows={6} value={socialCopy} onChange={(event) => setSocialCopy(event.target.value)} placeholder="Write or generate the finished caption or post here…" /><small>{channels.includes("X") ? "For X / Twitter, keep the main post concise or use this as the opening of a thread." : "Publish-ready copy for the selected channels."}</small></label>
          <div className="editor-grid">
            <label className="editor-field"><span>Stage</span><select value={itemType} onChange={(event) => setItemType(event.target.value)}>{sections.map((section) => <option key={section} value={section}>{sectionLabels[section]}</option>)}</select></label>
            <label className="editor-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open</option><option value="done">Done</option><option value="archived">Archived</option></select></label>
            <label className="editor-field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(Number(event.target.value))}><option value={0}>None</option><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option></select></label>
            <label className="editor-field"><span>Duration (minutes)</span><input type="number" min="1" step="1" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Optional" /></label>
          </div>
          <fieldset className="channel-field">
            <legend>Channel plan</legend>
            <p>Choose where this content will be published.</p>
            <div className="channel-options">{channelOptions.map((channel) => <button type="button" key={channel} className={channels.includes(channel) ? "selected" : ""} aria-pressed={channels.includes(channel)} onClick={() => toggleChannel(channel)}>{channel === "X" ? "X / Twitter" : channel}</button>)}</div>
            <label className="editor-field"><span>Adaptation notes</span><textarea rows={3} value={channelPlan} onChange={(event) => setChannelPlan(event.target.value)} placeholder="e.g. Reel for Instagram, thread opener for X, professional angle for LinkedIn…" /></label>
          </fieldset>
          <label className="editor-field"><span>Scheduled day</span><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /><small>Leave blank to return this card to the inbox.</small></label>
          <footer>
            {confirmDelete ? <button className="delete-button confirm" type="button" onClick={() => void onDelete()} disabled={saving}>Confirm delete</button> : <button className="delete-button" type="button" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={15} />Delete</button>}
            <div><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button editor-save" type="submit" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save changes"}</button></div>
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
  const [generatingDay, setGeneratingDay] = useState<string | null>(null);
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

  async function addItem(day: string | null, type: string, title: string) {
    setSaveState("saving"); setError(null);
    const peers = items.filter((item) => item.day === day && item.item_type === type);
    const sortOrder = peers.length ? Math.max(...peers.map((item) => item.sort_order)) + 1024 : 1024;
    const { data, error: addError } = await supabase.from("flow_items").insert({ user_id: userId, day, item_type: type, title, sort_order: sortOrder }).select().single();
    if (addError) { setError(addError.message); setSaveState("error"); }
    else { setItems((current) => [...current, data]); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400); }
  }

  async function toggleItemDone(item: FlowItem) {
    setSaveState("saving"); setError(null);
    const status = item.status === "done" ? "open" : "done";
    const { data, error: updateError } = await supabase.from("flow_items").update({ status, updated_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", userId).select().single();
    if (updateError) { setError(updateError.message); setSaveState("error"); return; }
    setItems((current) => current.map((entry) => entry.id === item.id ? data : entry));
    setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400);
  }

  async function generatePlan(dayKey: string, context: FlowDay | undefined) {
    setGeneratingDay(dayKey); setSaveState("saving"); setError(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: dayKey, theme: context?.theme ?? "", whatsHappening: context?.whats_happening ?? "", mainFocus: context?.main_outcome ?? "", storyOpportunity: context?.story_opportunity ?? "", notes: context?.notes ?? "" }),
      });
      const rawPayload: unknown = await response.json();
      if (!response.ok) {
        const message = rawPayload && typeof rawPayload === "object" && "error" in rawPayload && typeof rawPayload.error === "string" ? rawPayload.error : "Could not generate a plan.";
        throw new Error(message);
      }
      const payload = rawPayload as { plan: GeneratedPlan; items: FlowItem[]; day: FlowDay };
      setItems((current) => [...current, ...payload.items]);
      setDays((current) => [...current.filter((entry) => entry.day !== dayKey), payload.day]);
      setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "Could not generate the social plan."); setSaveState("error");
    } finally {
      setGeneratingDay(null);
    }
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

  function locationFor(item: FlowItem) { return item.day ? containerId(item.day, sections.includes(item.item_type as Section) ? item.item_type as Section : "idea") : "inbox"; }
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
    if (targetContainer !== "inbox" && !targetContainer.includes("::")) return;
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
    const target = parseContainer(targetContainer);
    const updates = nextOrder.map((item, index) => ({ id: item.id, sort_order: (index + 1) * 1024, ...(item.id === active.id ? { day: target.day, item_type: target.type ?? item.item_type } : {}) }));
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
  const inboxItems = items.filter((item) => !item.day).sort((a, b) => a.sort_order - b.sort_order);
  function openView(view: AppView) {
    setActiveView(view);
    if (view === "dashboard") { setOffset(0); setViewDays(7); }
  }
  function showSaved() {
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1600);
  }
  const viewTitle = activeView === "dashboard" ? "Dashboard" : activeView === "brand" ? "Brand Profile" : activeView === "brief" ? "Weekly Brief" : "Flowboard";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>H</span><div><b>HYPRFY</b><small>Flowboard · v0.6</small></div></div>
        <nav>{navItems.map(({ label, icon: Icon, view, inbox }) => {
          const active = view === activeView;
          return <button className={active ? "active" : ""} key={label} onClick={() => view ? openView(view) : inbox ? setInboxOpen(true) : undefined} disabled={!view && !inbox}><Icon size={17} /><span>{label}</span>{inbox && inboxItems.length > 0 && <b className="nav-count">{inboxItems.length}</b>}</button>;
        })}</nav>
        <div className="sidebar-footer"><div className="avatar">{userEmail.slice(0, 1).toUpperCase() || "H"}</div><div><span>{userEmail || "Hyprfy user"}</span><small>Flowboard workspace</small></div><form action={signOut}><button aria-label="Sign out"><LogOut size={16} /></button></form></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Personal brand companion · v0.6</p><h1>{viewTitle}</h1></div>
          <div className="topbar-actions">
            {activeView === "flowboard" && <><div className="date-controls"><button onClick={() => setOffset((value) => value - viewDays)} aria-label="Previous dates"><ArrowLeft size={16} /></button><button onClick={() => setOffset(0)}>Today</button><button onClick={() => setOffset((value) => value + viewDays)} aria-label="Next dates"><ArrowRight size={16} /></button></div>
            <div className="view-controls"><button className={viewDays === 7 ? "active" : ""} aria-pressed={viewDays === 7} onClick={() => setViewDays(7)}><CalendarDays size={15} />7 Days</button><button className={viewDays === 14 ? "active" : ""} aria-pressed={viewDays === 14} onClick={() => setViewDays(14)}>14 Days</button><button disabled>Month</button></div></>}
            <button className="inbox-trigger" onClick={() => setInboxOpen(true)}><InboxIcon size={16} />Inbox{inboxItems.length > 0 && <span>{inboxItems.length}</span>}</button>
          </div>
          <div className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</div>
        </header>
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={15} /></button></div>}
        {activeView === "dashboard" ? <Dashboard dates={dates.slice(0, 7)} days={days} items={items} loading={loading} onAddTask={(title) => addItem(toDateKey(new Date()), "task", title)} onEditItem={setEditingItem} onOpenFlowboard={() => openView("flowboard")} onToggleDone={toggleItemDone} /> : activeView === "brand" ? <BrandProfile userId={userId} onSaved={showSaved} /> : activeView === "brief" ? <WeeklyBrief userId={userId} onOpenFlowboard={() => openView("flowboard")} onSaved={showSaved} /> : loading ? <div className="board-loading">Preparing your days…</div> : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))} onDragEnd={(event) => void handleDragEnd(event)} onDragCancel={() => setActiveId(null)}>
            <div className="board-scroll">{dates.map((date) => { const key = toDateKey(date); return <DayColumn key={key} date={date} day={days.find((entry) => entry.day === key)} items={items.filter((item) => item.day === key)} generating={generatingDay === key} onDayChange={saveDay} onAdd={(day, type, title) => addItem(day, type, title)} onEdit={setEditingItem} onGenerate={generatePlan} onToggleDone={toggleItemDone} />; })}</div>
            <InboxPanel open={inboxOpen} items={inboxItems} onAdd={(title) => addItem(null, "idea", title)} onClose={() => setInboxOpen(false)} onEdit={setEditingItem} onToggleDone={toggleItemDone} />
            <DragOverlay>{activeItem ? <article className="flow-card overlay"><GripVertical size={14} /><span>{activeItem.title}</span></article> : null}</DragOverlay>
          </DndContext>
        )}
        {editingItem && <ItemEditor key={editingItem.id} item={editingItem} saving={saveState === "saving"} onClose={() => setEditingItem(null)} onSave={(patch) => updateItem(editingItem, patch)} onDelete={() => deleteItem(editingItem)} />}
      </main>
    </div>
  );
}
