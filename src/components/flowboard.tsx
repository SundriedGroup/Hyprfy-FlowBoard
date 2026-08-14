"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  type DragEndEvent, type DragStartEvent, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, CalendarDays, Check, GripVertical, Inbox as InboxIcon, LogOut, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDays, rollingDates, toDateKey } from "@/lib/date";
import type { FlowDay, FlowItem } from "@/types/database";
import { navItems } from "./icons";
import { signOut } from "@/app/actions";

const sections = ["idea", "script", "capture", "edit", "publish"] as const;
type Section = (typeof sections)[number];
type SaveState = "idle" | "saving" | "saved" | "error";

function containerId(day: string, type: Section) { return `${day}::${type}`; }
function parseContainer(id: string) {
  if (id === "inbox") return { day: null, type: null };
  const [day, type] = id.split("::") as [string, Section];
  return { day, type };
}

function SortableCard({ item }: { item: FlowItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <article ref={setNodeRef} className={`flow-card ${isDragging ? "dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button className="drag-handle" aria-label={`Drag ${item.title}`} {...attributes} {...listeners}><GripVertical size={14} /></button>
      <span>{item.title}</span>
    </article>
  );
}

function DropSection({ id, items, label, onAdd }: { id: string; items: FlowItem[]; label: string; onAdd: (title: string) => Promise<void> }) {
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
        <div className="card-list">{items.map((item) => <SortableCard item={item} key={item.id} />)}</div>
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

function DayColumn({ date, day, items, onDayChange, onAdd }: { date: Date; day?: FlowDay; items: FlowItem[]; onDayChange: (day: string, patch: Partial<FlowDay>) => Promise<void>; onAdd: (day: string, type: Section, title: string) => Promise<void> }) {
  const key = toDateKey(date);
  const today = key === toDateKey(new Date());
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
      </div>
      <div className="planning-blocks">
        {sections.map((type) => {
          const sectionItems = items.filter((item) => item.item_type === type).sort((a, b) => a.sort_order - b.sort_order);
          return <DropSection key={type} id={containerId(key, type)} items={sectionItems} label={type} onAdd={(title) => onAdd(key, type, title)} />;
        })}
      </div>
    </article>
  );
}

function InboxPanel({ open, items, onAdd, onClose }: { open: boolean; items: FlowItem[]; onAdd: (title: string) => Promise<void>; onClose: () => void }) {
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
          {items.length ? items.map((item) => <SortableCard item={item} key={item.id} />) : <div className="empty-inbox"><InboxIcon size={22} /><p>Your inbox is clear.</p><span>Capture an idea here or drag a card back to unschedule it.</span></div>}
        </SortableContext>
      </div>
    </aside>
  );
}

export function Flowboard({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [offset, setOffset] = useState(0);
  const [days, setDays] = useState<FlowDay[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const startDate = useMemo(() => addDays(new Date(), offset), [offset]);
  const dates = useMemo(() => rollingDates(startDate), [startDate]);
  const firstKey = toDateKey(dates[0]);
  const lastKey = toDateKey(dates[dates.length - 1]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const loadBoard = useCallback(async () => {
    setLoading(true); setError(null);
    const [dayResult, itemResult] = await Promise.all([
      supabase.from("flow_days").select("*").gte("day", firstKey).lte("day", lastKey).order("day"),
      supabase.from("flow_items").select("*").or(`day.is.null,and(day.gte.${firstKey},day.lte.${lastKey})`).order("sort_order"),
    ]);
    if (dayResult.error || itemResult.error) setError(dayResult.error?.message ?? itemResult.error?.message ?? "Could not load Flowboard.");
    else { setDays(dayResult.data); setItems(itemResult.data); }
    setLoading(false);
  }, [firstKey, lastKey, supabase]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadBoard(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadBoard]);

  async function saveDay(dayKey: string, patch: Partial<FlowDay>) {
    setSaveState("saving");
    setDays((current) => {
      const existing = current.find((entry) => entry.day === dayKey);
      if (existing) return current.map((entry) => entry.day === dayKey ? { ...entry, ...patch } : entry);
      return [...current, { id: `optimistic-${dayKey}`, user_id: userId, day: dayKey, theme: null, main_outcome: null, whats_happening: null, story_opportunity: null, notes: null, capacity_minutes: null, metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...patch }];
    });
    const { data, error: saveError } = await supabase.from("flow_days").upsert({ user_id: userId, day: dayKey, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" }).select().single();
    if (saveError) { setSaveState("error"); setError(saveError.message); await loadBoard(); }
    else { setDays((current) => [...current.filter((entry) => entry.day !== dayKey), data]); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400); }
  }

  async function addItem(day: string | null, type: string, title: string) {
    const peers = items.filter((item) => item.day === day && item.item_type === type);
    const sortOrder = peers.length ? Math.max(...peers.map((item) => item.sort_order)) + 1024 : 1024;
    const { data, error: addError } = await supabase.from("flow_items").insert({ user_id: userId, day, item_type: type, title, sort_order: sortOrder }).select().single();
    if (addError) setError(addError.message); else setItems((current) => [...current, data]);
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
    const results = await Promise.all(updates.map(({ id, ...patch }) => supabase.from("flow_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)));
    const moveError = results.find((result) => result.error)?.error;
    if (moveError) { setError(moveError.message); setSaveState("error"); await loadBoard(); }
    else { setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1400); }
  }

  const activeItem = items.find((item) => item.id === activeId);
  const inboxItems = items.filter((item) => !item.day).sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>H</span><div><b>Hyprfy</b><small>LifeOS</small></div></div>
        <nav>{navItems.map(({ label, icon: Icon, active, inbox }) => <button className={active ? "active" : ""} key={label} onClick={() => inbox && setInboxOpen(true)} disabled={!active && !inbox}><Icon size={17} /><span>{label}</span>{inbox && inboxItems.length > 0 && <b className="nav-count">{inboxItems.length}</b>}</button>)}</nav>
        <div className="sidebar-footer"><div className="avatar">{userEmail.slice(0, 1).toUpperCase() || "H"}</div><div><span>{userEmail || "Hyprfy user"}</span><small>Personal workspace</small></div><form action={signOut}><button aria-label="Sign out"><LogOut size={16} /></button></form></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Planning surface</p><h1>Flowboard</h1></div>
          <div className="topbar-actions">
            <div className="date-controls"><button onClick={() => setOffset((value) => value - 7)} aria-label="Previous dates"><ArrowLeft size={16} /></button><button onClick={() => setOffset(0)}>Today</button><button onClick={() => setOffset((value) => value + 7)} aria-label="Next dates"><ArrowRight size={16} /></button></div>
            <div className="view-controls"><button className="active"><CalendarDays size={15} />7 Days</button><button disabled>14 Days</button><button disabled>Month</button></div>
            <button className="inbox-trigger" onClick={() => setInboxOpen(true)}><InboxIcon size={16} />Inbox{inboxItems.length > 0 && <span>{inboxItems.length}</span>}</button>
          </div>
          <div className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</div>
        </header>
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={15} /></button></div>}
        {loading ? <div className="board-loading">Preparing your days…</div> : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))} onDragEnd={(event) => void handleDragEnd(event)} onDragCancel={() => setActiveId(null)}>
            <div className="board-scroll">{dates.map((date) => { const key = toDateKey(date); return <DayColumn key={key} date={date} day={days.find((entry) => entry.day === key)} items={items.filter((item) => item.day === key)} onDayChange={saveDay} onAdd={(day, type, title) => addItem(day, type, title)} />; })}</div>
            <InboxPanel open={inboxOpen} items={inboxItems} onAdd={(title) => addItem(null, "idea", title)} onClose={() => setInboxOpen(false)} />
            <DragOverlay>{activeItem ? <article className="flow-card overlay"><GripVertical size={14} /><span>{activeItem.title}</span></article> : null}</DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
