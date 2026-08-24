"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { supabase } from "@/lib/supabase";
import type { ContentMeta, FlowDay, FlowItem, FlowProject } from "@/lib/types";

const APP_VERSION = "0.11.7";

type DraftBlock = { title: string; channel: string; plan: string; project_id: string };
type BlockKind = "content" | "vlog";
type DraftIdea = { title: string; channel: string; source_url: string; why_like: string; project_id: string };
type DraftProject = { name: string; goal: string; target_date: string; color: string; notes: string };
type View = "flowboard" | "ideas" | "inbox" | "calendar" | "projects";

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
};

const PROJECT_COLORS = [
  "#111111", "#0A66C2", "#0F766E", "#7C3AED", "#C13584",
  "#D97706", "#DC2626", "#475569"
];

function getMeta(item: FlowItem): ContentMeta {
  return (item.metadata ?? {}) as ContentMeta;
}

function isVlogItem(item: FlowItem) {
  return getMeta(item).content_kind === "vlog";
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

function isInstagramUrl(url?: string) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

function safeHost(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function fetchPreview(url: string): Promise<LinkPreview | null> {
  if (!url.trim()) return null;
  try {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url.trim())}`);
    if (!response.ok) return null;
    return await response.json() as LinkPreview;
  } catch {
    return null;
  }
}

async function uploadIdeaCover(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("flowboard-idea-covers")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("flowboard-idea-covers").getPublicUrl(path);
  return data.publicUrl;
}

export function FlowboardApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("flowboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  const [days, setDays] = useState<FlowDay[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBlockDay, setNewBlockDay] = useState<string | null | undefined>(undefined);
  const [newBlockKind, setNewBlockKind] = useState<BlockKind>("content");
  const [selectedItem, setSelectedItem] = useState<FlowItem | null>(null);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<FlowItem | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<FlowProject | null>(null);

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
  }, [session, anchorDate, calendarMonth]);

  async function loadData() {
    if (!session) return;
    setLoading(true);
    setError(null);

    const flowFrom = format(visibleDates[0], "yyyy-MM-dd");
    const flowTo = format(visibleDates[visibleDates.length - 1], "yyyy-MM-dd");

    const monthStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    const rangeFrom = format(monthStart < visibleDates[0] ? monthStart : visibleDates[0], "yyyy-MM-dd");
    const rangeTo = format(monthEnd > visibleDates[visibleDates.length - 1] ? monthEnd : visibleDates[visibleDates.length - 1], "yyyy-MM-dd");

    const [dayResult, scheduledResult, unscheduledResult, projectResult] = await Promise.all([
      supabase.from("flow_days").select("*").gte("day", rangeFrom).lte("day", rangeTo).order("day"),
      supabase.from("flow_items").select("*").gte("day", rangeFrom).lte("day", rangeTo).neq("status", "archived").order("day").order("sort_order"),
      supabase.from("flow_items").select("*").is("day", null).neq("status", "archived").order("sort_order"),
      supabase.from("flow_projects").select("*").eq("archived", false).order("sort_order"),
    ]);

    const firstError = dayResult.error || scheduledResult.error || unscheduledResult.error || projectResult.error;
    if (firstError) setError(firstError.message);
    else {
      setDays((dayResult.data ?? []) as FlowDay[]);
      setItems([...(scheduledResult.data ?? []), ...(unscheduledResult.data ?? [])] as FlowItem[]);
      setProjects((projectResult.data ?? []) as FlowProject[]);
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
        user_id: session.user.id, day: dayKey, theme: null,
        main_outcome: null, whats_happening: null, story_opportunity: null,
        notes: null, capacity_minutes: null, metadata: {}, [field]: value || null
      }).select("*").single();
      if (e) setError(e.message);
      else if (data) setDays((current) => [...current, data as FlowDay]);
    }
  }

  async function addBlock(day: string | null, draft: DraftBlock, sourceIdeaId?: string, kind: BlockKind = "content") {
    if (!session || !draft.title.trim()) return;
    const bucket = items.filter((item) => item.day === day && item.item_type !== "idea");
    const nextSort = bucket.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 100;

    const { data, error: e } = await supabase.from("flow_items").insert({
      user_id: session.user.id,
      day,
      project_id: draft.project_id || null,
      item_type: "task",
      title: draft.title.trim(),
      description: null,
      sort_order: nextSort,
      metadata: {
        channel: draft.channel.trim(),
        content_kind: kind,
        plan: draft.plan.trim(),
        copy: "",
        script: "",
        post_copy: "",
        storyboard: "",
        source_idea_id: sourceIdeaId,
      },
    }).select("*").single();

    if (e) setError(e.message);
    else if (data) {
      const inserted = data as FlowItem;
      setItems((current) => [...current, inserted]);
      setNewBlockDay(undefined);
      setNewBlockKind("content");
      setSelectedItem(inserted);
    }
  }

  async function addIdea(draft: DraftIdea) {
    if (!session || !draft.title.trim()) return;
    const ideaItems = items.filter((item) => item.day === null && item.item_type === "idea");
    const nextSort = ideaItems.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 100;
    const preview = draft.source_url.trim() ? await fetchPreview(draft.source_url) : null;

    const { data, error: e } = await supabase.from("flow_items").insert({
      user_id: session.user.id,
      day: null,
      project_id: draft.project_id || null,
      item_type: "idea",
      title: draft.title.trim(),
      description: null,
      sort_order: nextSort,
      metadata: {
        channel: draft.channel.trim(),
        source_url: draft.source_url.trim(),
        why_like: draft.why_like.trim(),
        preview_title: preview?.title ?? "",
        preview_description: preview?.description ?? "",
        preview_image: preview?.image ?? "",
        preview_domain: preview?.domain ?? "",
        cover_image: "",
      },
    }).select("*").single();

    if (e) setError(e.message);
    else if (data) {
      setItems((current) => [...current, data as FlowItem]);
      setIdeaModalOpen(false);
    }
  }

  async function createProject(draft: DraftProject) {
    if (!session || !draft.name.trim()) return;
    const nextSort = projects.reduce((max, p) => Math.max(max, Number(p.sort_order || 0)), 0) + 100;
    const { data, error: e } = await supabase.from("flow_projects").insert({
      user_id: session.user.id,
      name: draft.name.trim(),
      description: draft.goal.trim() || null,
      goal: draft.goal.trim() || null,
      target_date: draft.target_date || null,
      notes: draft.notes.trim() || null,
      color: draft.color,
      archived: false,
      sort_order: nextSort,
    }).select("*").single();

    if (e) setError(e.message);
    else if (data) {
      const project = data as FlowProject;
      setProjects((current) => [...current, project]);
      setProjectModalOpen(false);
      setSelectedProject(project);
    }
  }

  async function updateProject(project: FlowProject, patch: Partial<FlowProject>) {
    const next = { ...patch, updated_at: new Date().toISOString() };
    setProjects((current) => current.map((p) => p.id === project.id ? { ...p, ...next } : p));
    setSelectedProject((current) => current?.id === project.id ? { ...current, ...next } : current);
    const { error: e } = await supabase.from("flow_projects").update(next).eq("id", project.id);
    if (e) { setError(e.message); void loadData(); }
  }

  async function updateItem(item: FlowItem, patch: Partial<FlowItem>) {
    const next = { ...patch, updated_at: new Date().toISOString() };
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...next } : candidate));
    setSelectedItem((current) => current?.id === item.id ? { ...current, ...next } : current);
    setSelectedIdea((current) => current?.id === item.id ? { ...current, ...next } : current);
    const { error: e } = await supabase.from("flow_items").update(next).eq("id", item.id);
    if (e) { setError(e.message); void loadData(); }
  }

  async function moveItem(itemId: string, day: string | null) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.item_type === "idea" || item.day === day) return;
    const bucket = items.filter((candidate) => candidate.day === day && candidate.item_type !== "idea" && candidate.id !== itemId);
    const sort_order = bucket.reduce((max, candidate) => Math.max(max, Number(candidate.sort_order || 0)), 0) + 100;
    await updateItem(item, { day, sort_order });
  }

  async function saveDetail(item: FlowItem, title: string, channel: string, plan: string, script: string, postCopy: string, storyboard: string, project_id: string) {
    const legacyCopy = isVlogItem(item) ? storyboard : postCopy || script;
    await updateItem(item, {
      title,
      project_id: project_id || null,
      metadata: { ...(item.metadata ?? {}), channel, plan, copy: legacyCopy, script, post_copy: postCopy, storyboard },
    });
  }

  async function saveIdeaDetail(item: FlowItem, title: string, channel: string, source_url: string, why_like: string, project_id: string, cover_image?: string) {
    const currentMeta = getMeta(item);
    const sourceChanged = (currentMeta.source_url ?? "") !== source_url.trim();
    const preview = sourceChanged && source_url.trim() ? await fetchPreview(source_url) : null;

    await updateItem(item, {
      title,
      project_id: project_id || null,
      metadata: {
        ...(item.metadata ?? {}),
        channel,
        source_url: source_url.trim(),
        why_like,
        preview_title: sourceChanged ? (preview?.title ?? "") : (currentMeta.preview_title ?? ""),
        preview_description: sourceChanged ? (preview?.description ?? "") : (currentMeta.preview_description ?? ""),
        preview_image: sourceChanged ? (preview?.image ?? "") : (currentMeta.preview_image ?? ""),
        preview_domain: sourceChanged ? (preview?.domain ?? "") : (currentMeta.preview_domain ?? ""),
        cover_image: cover_image ?? currentMeta.cover_image ?? "",
      },
    });
  }

  async function archiveItem(item: FlowItem) {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setSelectedItem(null);
    setSelectedIdea(null);
    const { error: e } = await supabase.from("flow_items").update({
      status: "archived", updated_at: new Date().toISOString()
    }).eq("id", item.id);
    if (e) setError(e.message);
  }

  async function archiveProject(project: FlowProject) {
    setProjects((current) => current.filter((p) => p.id !== project.id));
    setSelectedProject(null);
    const { error: e } = await supabase.from("flow_projects").update({
      archived: true, updated_at: new Date().toISOString()
    }).eq("id", project.id);
    if (e) setError(e.message);
  }

  function openCalendarDate(dayKey: string) {
    setAnchorDate(startOfDay(parseISO(dayKey)));
    setView("flowboard");
  }

  function openNewBlock(day: string | null, kind: BlockKind = "content") {
    setNewBlockKind(kind);
    setNewBlockDay(day);
  }

  if (!authReady) return <div className="center-screen">Loading Flowboard…</div>;
  if (!session) return <AuthScreen />;

  const inboxItems = items.filter((item) => item.day === null && item.item_type !== "idea" && item.status !== "archived");
  const ideaItems = items.filter((item) => item.day === null && item.item_type === "idea" && item.status !== "archived");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <div className="brand-mark">H</div>
            <div><strong>Hyprfy</strong><span>Flowboard</span></div>
          </div>

          <nav>
            <button className={`nav-item ${view === "flowboard" ? "active" : ""}`} onClick={() => setView("flowboard")}>Flowboard</button>
            <button className={`nav-item ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>Calendar</button>
            <button className={`nav-item ${view === "projects" ? "active" : ""}`} onClick={() => setView("projects")}>
              Projects <span className="count">{projects.length}</span>
            </button>
            <button className={`nav-item ${view === "ideas" ? "active" : ""}`} onClick={() => setView("ideas")}>
              Ideas <span className="count">{ideaItems.length}</span>
            </button>
            <button className={`nav-item ${view === "inbox" ? "active" : ""}`} onClick={() => setView("inbox")}>
              Inbox <span className="count">{inboxItems.length}</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <span className="version-badge">v{APP_VERSION}</span>
          <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>
          <div className="topbar-title">
            <div className="eyebrow">HYPRFY</div>
            <h1>
              {view === "flowboard" ? "Flowboard" :
               view === "calendar" ? "Calendar" :
               view === "projects" ? "Projects" :
               view === "ideas" ? "Ideas" : "Inbox"}
            </h1>
          </div>

          <div className="topbar-actions">
{view === "flowboard" && <>
              <button onClick={() => setAnchorDate((d) => addDays(d, -7))}>←</button>
              <button onClick={() => setAnchorDate(startOfDay(new Date()))}>Today</button>
              <button onClick={() => setAnchorDate((d) => addDays(d, 7))}>→</button>
            </>}

            {view === "calendar" && <>
              <button onClick={() => setCalendarMonth((d) => subMonths(d, 1))}>←</button>
              <button onClick={() => setCalendarMonth(startOfMonth(new Date()))}>This month</button>
              <button onClick={() => setCalendarMonth((d) => addMonths(d, 1))}>→</button>
            </>}

            {view === "projects" && (
              <button className="primary-button" onClick={() => setProjectModalOpen(true)}>+ New project</button>
            )}

            {view === "ideas" && (
              <button className="primary-button" onClick={() => setIdeaModalOpen(true)}>+ Capture idea</button>
            )}

            {view === "inbox" && (
              <button className="primary-button" onClick={() => openNewBlock(null)}>+ Add block</button>
            )}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {view === "flowboard" && (
          <div className="board-wrap">
            <div className="board">
              {visibleDates.map((date) => {
                const dayKey = format(date, "yyyy-MM-dd");
                const dayData = days.find((d) => d.day === dayKey);
                const dayItems = items.filter((item) => item.day === dayKey && item.item_type !== "idea" && item.status !== "archived");
                const isToday = dayKey === format(new Date(), "yyyy-MM-dd");
                return (
                  <DayColumn
                    key={dayKey}
                    dayKey={dayKey}
                    date={date}
                    data={dayData}
                    items={dayItems}
                    projects={projects}
                    isToday={isToday}
                    onSaveDay={saveDay}
                    onAddContent={() => openNewBlock(dayKey)}
                    onAddVlog={() => openNewBlock(dayKey, "vlog")}
                    onOpen={setSelectedItem}
                    onDropItem={moveItem}
                  />
                );
              })}
            </div>
          </div>
        )}

        {view === "calendar" && (
          <CalendarPage
            month={calendarMonth}
            days={days}
            items={items}
            projects={projects}
            onOpenDate={openCalendarDate}
            onOpenItem={setSelectedItem}
          />
        )}

        {view === "projects" && (
          <ProjectsPage
            projects={projects}
            items={items}
            onOpen={setSelectedProject}
            onAdd={() => setProjectModalOpen(true)}
          />
        )}

        {view === "ideas" && (
          <IdeasPage items={ideaItems} projects={projects} onOpen={setSelectedIdea} onAdd={() => setIdeaModalOpen(true)} />
        )}

        {view === "inbox" && (
          <InboxPage items={inboxItems} projects={projects} onOpen={setSelectedItem} onAdd={() => openNewBlock(null)} />
        )}

        {loading && <div className="sync-pill">Syncing…</div>}
      </main>

      {newBlockDay !== undefined && (
        <NewBlockModal
          day={newBlockDay}
          kind={newBlockKind}
          projects={projects}
          onClose={() => { setNewBlockDay(undefined); setNewBlockKind("content"); }}
          onSave={(day, draft) => addBlock(day, draft, undefined, newBlockKind)}
        />
      )}

      {ideaModalOpen && (
        <NewIdeaModal projects={projects} onClose={() => setIdeaModalOpen(false)} onSave={addIdea} />
      )}

      {projectModalOpen && (
        <NewProjectModal onClose={() => setProjectModalOpen(false)} onSave={createProject} />
      )}

      {selectedItem && (
        <DetailDrawer
          item={selectedItem}
          projects={projects}
          onClose={() => setSelectedItem(null)}
          onSave={saveDetail}
          onArchive={archiveItem}
        />
      )}

      {selectedIdea && (
        <IdeaDrawer
          item={selectedIdea}
          projects={projects}
          onClose={() => setSelectedIdea(null)}
          onSave={saveIdeaDetail}
          onArchive={archiveItem}
          onTurnIntoContent={async (idea) => {
            const m = getMeta(idea);
            await addBlock(null, {
              title: idea.title,
              channel: m.channel ?? "Instagram",
              plan: m.why_like ?? "",
              project_id: idea.project_id ?? "",
            }, idea.id);
            setSelectedIdea(null);
            setView("inbox");
          }}
        />
      )}

      {selectedProject && (
        <ProjectDrawer
          project={selectedProject}
          items={items.filter((item) => item.project_id === selectedProject.id && item.status !== "archived")}
          onClose={() => setSelectedProject(null)}
          onSave={updateProject}
          onArchive={archiveProject}
          onOpenItem={(item) => item.item_type === "idea" ? setSelectedIdea(item) : setSelectedItem(item)}
          onJumpToDate={openCalendarDate}
        />
      )}

      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div>
                <div className="eyebrow">HYPRFY</div>
                <strong>Flowboard</strong>
              </div>
              <button className="icon-button" onClick={() => setMobileMenuOpen(false)}>×</button>
            </div>

            <nav className="mobile-menu-nav">
              {[
                ["flowboard", "Flowboard"],
                ["calendar", "Calendar"],
                ["projects", "Projects"],
                ["ideas", "Ideas"],
                ["inbox", "Inbox"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={view === key ? "active" : ""}
                  onClick={() => {
                    setView(key as View);
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>{label}</span>
                  <span>→</span>
                </button>
              ))}
            </nav>

            <div className="mobile-menu-footer">
              <span>v{APP_VERSION}</span>
              <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ProjectDot({ project }: { project?: FlowProject }) {
  if (!project) return null;
  return <span className="project-dot" style={{ background: project.color || "#111" }} title={project.name} />;
}

function DayColumn({ dayKey, date, data, items, projects, isToday, onSaveDay, onAddContent, onAddVlog, onOpen, onDropItem }: {
  dayKey: string;
  date: Date;
  data?: FlowDay;
  items: FlowItem[];
  projects: FlowProject[];
  isToday: boolean;
  onSaveDay: (dayKey: string, field: "whats_happening" | "main_outcome" | "story_opportunity", value: string) => Promise<void>;
  onAddContent: () => void;
  onAddVlog: () => void;
  onOpen: (item: FlowItem) => void;
  onDropItem: (itemId: string, day: string | null) => Promise<void>;
}) {
  const vlogItems = items.filter(isVlogItem);
  const contentItems = items.filter((item) => !isVlogItem(item));
  return (
    <section className="day-stack" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      e.preventDefault();
      const itemId = e.dataTransfer.getData("text/flow-item");
      if (itemId) void onDropItem(itemId, dayKey);
    }}>
      <div className={`day-context ${isToday ? "today-column" : ""}`}>
        <div className="day-header">
          <div><div className="day-name">{format(date, "EEE")}</div><div className="day-date">{format(date, "d MMM")}</div></div>
          {isToday && <span className="today-pill">Today</span>}
        </div>
        <div className="context-fields">
          <DayField label="What's happening" placeholder="Meetings, events, training, life…" value={data?.whats_happening ?? ""} onSave={(v) => onSaveDay(dayKey, "whats_happening", v)} />
          <DayField label="Main focus" placeholder="What matters most today?" value={data?.main_outcome ?? ""} onSave={(v) => onSaveDay(dayKey, "main_outcome", v)} />
          <DayField label="Story opportunity" placeholder="What could this day become a story about?" value={data?.story_opportunity ?? ""} onSave={(v) => onSaveDay(dayKey, "story_opportunity", v)} />
        </div>
      </div>

      <div className="vlog-bucket">
        <div className="section-title-row"><span>Vlog</span><span className="section-count">{vlogItems.length}</span></div>
        <div className="cards">
          {vlogItems.map((item) => <VlogCard key={item.id} item={item} project={projects.find((p) => p.id === item.project_id)} onOpen={onOpen} />)}
        </div>
        <button className="add-block add-vlog" onClick={onAddVlog}>+ Add vlog moment</button>
      </div>

      <div className="content-bucket">
        <div className="section-title-row"><span>Content</span><span className="section-count">{contentItems.length}</span></div>
        <div className="cards">
          {contentItems.map((item) => <ContentCard key={item.id} item={item} project={projects.find((p) => p.id === item.project_id)} onOpen={onOpen} />)}
        </div>
        <button className="add-block" onClick={onAddContent}>+ Add block</button>
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

function ContentCard({ item, project, onOpen }: { item: FlowItem; project?: FlowProject; onOpen: (item: FlowItem) => void }) {
  const m = getMeta(item);
  return (
    <button className={`content-card ${channelClass(m.channel)}`} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/flow-item", item.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onOpen(item)}>
      <div className="card-title-row"><strong>{item.title}</strong><ProjectDot project={project} /></div>
      <div className="card-meta-row">
        {m.channel && <span className={`channel-pill ${channelClass(m.channel)}`}>{m.channel}</span>}
        {project && <span className="project-chip" style={{ borderColor: project.color || "#999" }}>{project.name}</span>}
      </div>
      {m.plan && <p>{m.plan}</p>}
      <span className="open-hint">{m.script || m.post_copy || m.storyboard || m.copy ? "Open content plan →" : "Add content plan →"}</span>
    </button>
  );
}

function VlogCard({ item, project, onOpen }: { item: FlowItem; project?: FlowProject; onOpen: (item: FlowItem) => void }) {
  const m = getMeta(item);
  return (
    <button className="content-card vlog-card" draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/flow-item", item.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onOpen(item)}>
      <div className="card-title-row"><strong>{item.title}</strong><ProjectDot project={project} /></div>
      <div className="card-meta-row">
        <span className="vlog-pill">Vlog moment</span>
        {project && <span className="project-chip" style={{ borderColor: project.color || "#999" }}>{project.name}</span>}
      </div>
      {m.plan && <p>{m.plan}</p>}
      <span className="open-hint">{m.copy ? "Open capture notes →" : "Add story / capture notes →"}</span>
    </button>
  );
}

function CalendarPage({ month, days, items, projects, onOpenDate, onOpenItem }: {
  month: Date; days: FlowDay[]; items: FlowItem[]; projects: FlowProject[];
  onOpenDate: (dayKey: string) => void; onOpenItem: (item: FlowItem) => void;
}) {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const cells: Date[] = [];
  let cursor = first;
  while (cursor <= last) {
    cells.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return (
    <div className="calendar-page">
      <div className="calendar-heading">
        <div><div className="eyebrow">MONTH VIEW</div><h2>{format(month, "MMMM yyyy")}</h2></div>
        <p>Click any day to open it in Flowboard.</p>
      </div>

      <div className="calendar-weekdays">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map((date) => {
          const dayKey = format(date, "yyyy-MM-dd");
          const day = days.find((d) => d.day === dayKey);
          const dayItems = items.filter((i) => i.day === dayKey && i.item_type !== "idea" && i.status !== "archived");
          const today = dayKey === format(new Date(), "yyyy-MM-dd");

          return (
            <div key={dayKey} className={`calendar-cell ${!isSameMonth(date, month) ? "outside-month" : ""} ${today ? "calendar-today" : ""}`}>
              <button className="calendar-date-button" onClick={() => onOpenDate(dayKey)}>
                <span>{format(date, "d")}</span>
                {today && <em>Today</em>}
              </button>

              {day?.whats_happening && <button className="calendar-context" onClick={() => onOpenDate(dayKey)}>{day.whats_happening}</button>}

              <div className="calendar-items">
                {dayItems.slice(0, 4).map((item) => {
                  const m = getMeta(item);
                  const project = projects.find((p) => p.id === item.project_id);
                  return (
                    <button key={item.id} className={`calendar-item ${channelClass(m.channel)}`} onClick={() => onOpenItem(item)}>
                      <span className="calendar-item-title"><ProjectDot project={project} />{item.title}</span>
                      {m.channel && <small>{m.channel}</small>}
                    </button>
                  );
                })}
                {dayItems.length > 4 && <button className="more-items" onClick={() => onOpenDate(dayKey)}>+{dayItems.length - 4} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectsPage({ projects, items, onOpen, onAdd }: {
  projects: FlowProject[]; items: FlowItem[]; onOpen: (project: FlowProject) => void; onAdd: () => void;
}) {
  return (
    <div className="projects-page">
      <div className="projects-intro">
        <div>
          <div className="eyebrow">WHAT AM I BUILDING?</div>
          <h2>Projects connect the week to the bigger story.</h2>
          <p>Open a project to see its goal, target date, content, ideas and timeline.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>+ New project</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">No projects yet. Create the first thing you’re building over time.</div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => {
            const linked = items.filter((i) => i.project_id === project.id && i.status !== "archived");
            const contentCount = linked.filter((i) => i.item_type !== "idea").length;
            const ideaCount = linked.filter((i) => i.item_type === "idea").length;
            const nextDate = linked.filter((i) => i.day).sort((a,b) => String(a.day).localeCompare(String(b.day)))[0]?.day;

            return (
              <button key={project.id} className="project-card" onClick={() => onOpen(project)}>
                <div className="project-card-accent" style={{ background: project.color || "#111" }} />
                <div className="project-card-body">
                  <div className="project-card-top">
                    <strong>{project.name}</strong>
                    {project.target_date && <span className="target-chip">{format(parseISO(project.target_date), "d MMM")}</span>}
                  </div>
                  {project.goal && <p>{project.goal}</p>}
                  <div className="project-stats">
                    <span><b>{contentCount}</b> content</span>
                    <span><b>{ideaCount}</b> ideas</span>
                    <span>{nextDate ? `Next ${format(parseISO(nextDate), "d MMM")}` : "No scheduled items"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IdeasPage({ items, projects, onOpen, onAdd }: {
  items: FlowItem[]; projects: FlowProject[]; onOpen: (item: FlowItem) => void; onAdd: () => void;
}) {
  return (
    <div className="ideas-page">
      <div className="ideas-intro">
        <div>
          <div className="eyebrow">INSPIRATION LIBRARY</div>
          <h2>Save what catches your attention.</h2>
          <p>Hooks, formats, references and half-formed thoughts. Capture now. Decide what to make later.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>+ Capture idea</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">No ideas yet. Save the next post, hook or format that makes you stop scrolling.</div>
      ) : (
        <div className="ideas-grid">
          {items.map((item) => <IdeaCard key={item.id} item={item} project={projects.find((p) => p.id === item.project_id)} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ item, project, onOpen }: { item: FlowItem; project?: FlowProject; onOpen: (item: FlowItem) => void }) {
  const m = getMeta(item);
  const sourceUrl = m.source_url ?? "";
  const image = m.cover_image || m.preview_image;
  const instagram = isInstagramUrl(sourceUrl);
  const hasPreview = Boolean(image || m.preview_title || m.preview_description);

  return (
    <div className={`idea-card ${channelClass(m.channel)}`}>
      {image ? (
        <button className="idea-cover-button" onClick={() => onOpen(item)}>
          <div className="preview-image-wrap"><img src={image} alt="" className="preview-image" /></div>
        </button>
      ) : instagram ? (
        <button className="instagram-fallback" onClick={() => onOpen(item)}>
          <div className="instagram-glyph">◎</div><span>Instagram reference</span>
        </button>
      ) : null}

      <div className="idea-card-body">
        <button className="idea-main-button" onClick={() => onOpen(item)}>
          <div className="idea-card-top"><strong>{item.title}</strong><ProjectDot project={project} /></div>
          <div className="card-meta-row">
            {m.channel && <span className={`channel-pill ${channelClass(m.channel)}`}>{m.channel}</span>}
            {project && <span className="project-chip" style={{ borderColor: project.color || "#999" }}>{project.name}</span>}
          </div>
          {hasPreview && (
            <div className="link-preview">
              {(m.preview_domain || safeHost(sourceUrl)) && <span className="preview-domain">{m.preview_domain || safeHost(sourceUrl)}</span>}
              {m.preview_title && <div className="preview-title">{m.preview_title}</div>}
              {m.preview_description && <p className="preview-description">{m.preview_description}</p>}
            </div>
          )}
          {m.why_like && <p className="why-like">{m.why_like}</p>}
        </button>

        <div className="idea-card-footer">
          {sourceUrl ? <a className="reference-link" href={sourceUrl} target="_blank" rel="noreferrer">Open reference ↗</a> : <span>No reference</span>}
          <button className="open-idea-button" onClick={() => onOpen(item)}>Open →</button>
        </div>
      </div>
    </div>
  );
}

function InboxPage({ items, projects, onOpen, onAdd }: {
  items: FlowItem[]; projects: FlowProject[]; onOpen: (item: FlowItem) => void; onAdd: () => void;
}) {
  return (
    <div className="inbox-page">
      <div className="inbox-header">
        <div><div className="eyebrow">UNSCHEDULED CONTENT</div><h2>Ready to plan.</h2><p>Content you intend to make, but haven’t given a day yet.</p></div>
        <button className="primary-button" onClick={onAdd}>+ Add block</button>
      </div>
      <div className="inbox-grid">
        {items.length === 0
          ? <div className="empty-state">Nothing waiting. Turn an idea into content or add a block directly.</div>
          : items.map((item) => <ContentCard key={item.id} item={item} project={projects.find((p) => p.id === item.project_id)} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function ProjectSelect({ value, onChange, projects }: { value: string; onChange: (value: string) => void; projects: FlowProject[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No project</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function NewBlockModal({ day, kind, projects, onClose, onSave }: {
  day: string | null; kind: BlockKind; projects: FlowProject[]; onClose: () => void; onSave: (day: string | null, draft: DraftBlock) => Promise<void>;
}) {
  const isVlog = kind === "vlog";
  const [draft, setDraft] = useState<DraftBlock>({ title: "", channel: isVlog ? "" : "Instagram", plan: "", project_id: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!draft.title.trim()) return; setSaving(true); await onSave(day, draft); setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading"><div><div className="eyebrow">{day ?? "INBOX"}</div><h2>{isVlog ? "New vlog moment" : "New content block"}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label><span>{isVlog ? "Moment title" : "Title"}</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={isVlog ? "The moment the week changed" : "Red Bull Half Court"} /></label>
        {!isVlog && <label><span>Channel</span><select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
          <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
        </select></label>}
        <label><span>Project</span><ProjectSelect value={draft.project_id} onChange={(v) => setDraft({ ...draft, project_id: v })} projects={projects} /></label>
        <label><span>{isVlog ? "Story note" : "Plan"}</span><textarea rows={4} value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })} placeholder={isVlog ? "Why this belongs in the weekly story, and what to capture…" : "Event recap reel: arrival → energy → game → closing thought."} /></label>
        <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !draft.title.trim()}>{saving ? "Adding…" : isVlog ? "Add vlog moment" : "Add block"}</button></div>
      </form>
    </div>
  );
}

function NewIdeaModal({ projects, onClose, onSave }: {
  projects: FlowProject[]; onClose: () => void; onSave: (draft: DraftIdea) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftIdea>({ title: "", channel: "Instagram", source_url: "", why_like: "", project_id: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!draft.title.trim()) return; setSaving(true); await onSave(draft); setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading"><div><div className="eyebrow">IDEAS</div><h2>Capture inspiration</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label><span>Title</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Simple running carousel format" /></label>
        <label><span>Channel</span><select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
          <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
        </select></label>
        <label><span>Project</span><ProjectSelect value={draft.project_id} onChange={(v) => setDraft({ ...draft, project_id: v })} projects={projects} /></label>
        <label><span>Source / link</span><input value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} placeholder="https://…" /></label>
        <label><span>Why I like it</span><textarea rows={5} value={draft.why_like} onChange={(e) => setDraft({ ...draft, why_like: e.target.value })} placeholder="Strong first slide. Very little copy. Feels human…" /></label>
        <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save idea"}</button></div>
      </form>
    </div>
  );
}

function NewProjectModal({ onClose, onSave }: { onClose: () => void; onSave: (draft: DraftProject) => Promise<void> }) {
  const [draft, setDraft] = useState<DraftProject>({ name: "", goal: "", target_date: "", color: PROJECT_COLORS[0], notes: "" });
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!draft.name.trim()) return; setSaving(true); await onSave(draft); setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading"><div><div className="eyebrow">PROJECTS</div><h2>New project</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label><span>Name</span><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="21km Race" /></label>
        <label><span>Goal / outcome</span><textarea rows={4} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="Build toward race day while documenting the comeback…" /></label>
        <label><span>Target date</span><input type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} /></label>
        <label><span>Colour</span><div className="color-picker">{PROJECT_COLORS.map((color) => <button type="button" key={color} className={`color-swatch ${draft.color === color ? "selected" : ""}`} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}</div></label>
        <label><span>Notes</span><textarea rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !draft.name.trim()}>{saving ? "Creating…" : "Create project"}</button></div>
      </form>
    </div>
  );
}

function DetailDrawer({ item, projects, onClose, onSave, onArchive }: {
  item: FlowItem; projects: FlowProject[]; onClose: () => void;
  onSave: (item: FlowItem, title: string, channel: string, plan: string, script: string, postCopy: string, storyboard: string, project_id: string) => Promise<void>;
  onArchive: (item: FlowItem) => Promise<void>;
}) {
  const m = getMeta(item);
  const isVlog = isVlogItem(item);
  const [title, setTitle] = useState(item.title);
  const [channel, setChannel] = useState(m.channel ?? "");
  const [projectId, setProjectId] = useState(item.project_id ?? "");
  const [plan, setPlan] = useState(m.plan ?? "");
  const [script, setScript] = useState(m.script ?? (!isVlog ? m.copy ?? "" : ""));
  const [postCopy, setPostCopy] = useState(m.post_copy ?? "");
  const [storyboard, setStoryboard] = useState(m.storyboard ?? (isVlog ? m.copy ?? "" : ""));
  const [saving, setSaving] = useState(false);
  const storyboardBeats = storyboard.split("\n").map((beat) => beat.trim().replace(/^\d+\s*[—.):-]?\s*/, "")).filter(Boolean).slice(0, 3);
  const storyboardFrames = ["Opening frame", "Proof / detail", "Closing beat"].map((fallback, index) => storyboardBeats[index] || fallback);

  return (
    <div className="drawer-backdrop plan-drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer plan-drawer" role="dialog" aria-modal="true" aria-labelledby="content-plan-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header plan-drawer-header"><div><div className="eyebrow">{item.day ?? "INBOX"}{isVlog ? " · VLOG" : ` · ${channel || "No channel"}`}</div><h2 id="content-plan-title">{title || (isVlog ? "Vlog moment" : "Content plan")}</h2><p>{isVlog ? "Shape the story and plan the capture." : "The complete creative plan, from what you say to what your audience sees."}</p></div><button className="icon-button" onClick={onClose} aria-label="Close content plan">×</button></div>
        <div className={`detail-meta-grid ${isVlog ? "is-vlog" : ""}`}>
          <label className="detail-title-field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          {!isVlog && <label><span>Channel</span><select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
          </select></label>}
          <label><span>Project</span><ProjectSelect value={projectId} onChange={setProjectId} projects={projects} /></label>
          <label className="detail-plan-field"><span>{isVlog ? "Story direction" : "Plan summary"}</span><textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="The idea, angle and intended outcome…" /></label>
        </div>
        <div className={`creative-plan-grid ${isVlog ? "is-vlog" : ""}`}>
          <section className="creative-plan-column script-plan-column">
            <header><span className="creative-column-number">01</span><span className="creative-column-icon">¶</span><div><h3>{isVlog ? "Story / voiceover" : "Script"}</h3><p>{isVlog ? "The narrative and spoken beats." : "What is spoken or shown on screen."}</p></div></header>
            <label><span className="visually-hidden">{isVlog ? "Story or voiceover" : "Script"}</span><textarea rows={15} value={script} onChange={(e) => setScript(e.target.value)} placeholder={isVlog ? "Opening thought, story beat, voiceover…" : "Hook\n\nWrite the full video, voiceover, carousel, or spoken script…"} /></label>
          </section>
          {!isVlog && <section className="creative-plan-column post-copy-column">
            <header><span className="creative-column-number">02</span><span className="creative-column-icon">Aa</span><div><h3>Post copy</h3><p>The finished caption your audience will read.</p></div></header>
            <label><span className="visually-hidden">Post copy</span><textarea rows={15} value={postCopy} onChange={(e) => setPostCopy(e.target.value)} placeholder="Write the caption or post that will be published with it…" /></label>
          </section>}
          <section className="creative-plan-column storyboard-plan-column">
            <header><span className="creative-column-number">{isVlog ? "02" : "03"}</span><span className="creative-column-icon">▦</span><div><h3>Example storyboard</h3><p>Scenes, framing, footage and visual beats.</p></div></header>
            <div className="storyboard-preview" aria-label="Storyboard preview">{storyboardFrames.map((frame, index) => <span key={`${index}-${frame}`}><b>{String(index + 1).padStart(2, "0")}</b><i>{frame}</i></span>)}</div>
            <label><span className="visually-hidden">Example storyboard</span><textarea rows={9} value={storyboard} onChange={(e) => setStoryboard(e.target.value)} placeholder={'01 — Opening shot / hook\n02 — Detail, action or proof\n03 — Closing frame / CTA'} /><small>Use one numbered shot or frame per line.</small></label>
          </section>
        </div>
        <div className="drawer-actions">
          <button className="danger-button" onClick={() => void onArchive(item)}>Archive</button>
          <button className="primary-button" disabled={saving || !title.trim()} onClick={async () => {
            setSaving(true); await onSave(item, title.trim(), channel, plan, script, postCopy, storyboard, projectId); setSaving(false);
          }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </aside>
    </div>
  );
}

function IdeaDrawer({ item, projects, onClose, onSave, onArchive, onTurnIntoContent }: {
  item: FlowItem; projects: FlowProject[]; onClose: () => void;
  onSave: (item: FlowItem, title: string, channel: string, source_url: string, why_like: string, project_id: string, cover_image?: string) => Promise<void>;
  onArchive: (item: FlowItem) => Promise<void>;
  onTurnIntoContent: (item: FlowItem) => Promise<void>;
}) {
  const m = getMeta(item);
  const [title, setTitle] = useState(item.title);
  const [channel, setChannel] = useState(m.channel ?? "");
  const [projectId, setProjectId] = useState(item.project_id ?? "");
  const [sourceUrl, setSourceUrl] = useState(m.source_url ?? "");
  const [whyLike, setWhyLike] = useState(m.why_like ?? "");
  const [coverImage, setCoverImage] = useState(m.cover_image ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const displayImage = coverImage || m.preview_image || "";
  const instagram = isInstagramUrl(sourceUrl);

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true); setUploadError("");
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error("Please sign in again.");
      const url = await uploadIdeaCover(userId, file);
      setCoverImage(url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Cover upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header"><div><div className="eyebrow">IDEA · {channel || "No channel"}</div><h2>Inspiration</h2></div><button className="icon-button" onClick={onClose}>×</button></div>

        {displayImage ? <div className="drawer-preview manual-cover"><img src={displayImage} alt="" /></div> :
         instagram ? <div className="drawer-instagram-fallback"><div className="instagram-glyph">◎</div><div><strong>Instagram reference</strong><span>Instagram isn’t exposing a thumbnail for this post.</span></div></div> : null}

        <label><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label><span>Channel</span><select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option>Instagram</option><option>LinkedIn</option><option>YouTube</option><option>TikTok</option><option>Substack</option><option>Stories</option><option>Multi-channel</option>
        </select></label>
        <label><span>Project</span><ProjectSelect value={projectId} onChange={setProjectId} projects={projects} /></label>
        <label><span>Source / link</span><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></label>
        {sourceUrl && <a className="source-link source-link-button" href={sourceUrl} target="_blank" rel="noreferrer">Open original reference ↗</a>}

        <div className="cover-tools">
          <div className="cover-tool-heading"><span>Cover image</span><small>Useful when Instagram blocks the preview.</small></div>
          <label className="upload-button">{uploading ? "Uploading…" : "Upload cover"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => void handleFile(e.target.files?.[0])} /></label>
          <label><span>Or paste image URL</span><input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://…" /></label>
          {uploadError && <div className="upload-error">{uploadError}</div>}
        </div>

        <label><span>Why I like it</span><textarea rows={10} value={whyLike} onChange={(e) => setWhyLike(e.target.value)} /></label>
        <div className="idea-actions"><button className="secondary-button" onClick={() => void onTurnIntoContent(item)}>Turn into content →</button></div>
        <div className="drawer-actions">
          <button className="danger-button" onClick={() => void onArchive(item)}>Archive</button>
          <button className="primary-button" disabled={saving || !title.trim()} onClick={async () => {
            setSaving(true); await onSave(item, title.trim(), channel, sourceUrl, whyLike, projectId, coverImage); setSaving(false);
          }}>{saving ? "Saving…" : "Save idea"}</button>
        </div>
      </aside>
    </div>
  );
}

function ProjectDrawer({ project, items, onClose, onSave, onArchive, onOpenItem, onJumpToDate }: {
  project: FlowProject; items: FlowItem[]; onClose: () => void;
  onSave: (project: FlowProject, patch: Partial<FlowProject>) => Promise<void>;
  onArchive: (project: FlowProject) => Promise<void>;
  onOpenItem: (item: FlowItem) => void;
  onJumpToDate: (day: string) => void;
}) {
  const [name, setName] = useState(project.name);
  const [goal, setGoal] = useState(project.goal ?? project.description ?? "");
  const [targetDate, setTargetDate] = useState(project.target_date ?? "");
  const [color, setColor] = useState(project.color ?? PROJECT_COLORS[0]);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  const ideas = items.filter((i) => i.item_type === "idea");
  const content = items.filter((i) => i.item_type !== "idea").sort((a,b) => String(a.day ?? "9999").localeCompare(String(b.day ?? "9999")));

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer project-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div><div className="eyebrow">PROJECT</div><h2>{project.name}</h2></div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>

        <div className="project-summary-strip" style={{ borderLeftColor: color }}>
          <span>{content.length} content</span><span>{ideas.length} ideas</span>
          <span>{targetDate ? `Target ${format(parseISO(targetDate), "d MMM yyyy")}` : "No target date"}</span>
        </div>

        <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>Goal / outcome</span><textarea rows={5} value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
        <label><span>Target date</span><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label>
        <label><span>Colour</span><div className="color-picker">{PROJECT_COLORS.map((c) => <button type="button" key={c} className={`color-swatch ${color === c ? "selected" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />)}</div></label>
        <label><span>Notes</span><textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

        <div className="project-section">
          <div className="section-title-row"><span>Timeline / Content</span><span>{content.length}</span></div>
          <div className="project-item-list">
            {content.length === 0 ? <div className="mini-empty">No content linked yet.</div> : content.map((item) => (
              <button key={item.id} className="project-linked-item" onClick={() => onOpenItem(item)}>
                <span>{item.day ? format(parseISO(item.day), "d MMM") : "Inbox"}</span>
                <strong>{item.title}</strong>
                {item.day && <em onClick={(e) => { e.stopPropagation(); onJumpToDate(item.day!); }}>Open day →</em>}
              </button>
            ))}
          </div>
        </div>

        <div className="project-section">
          <div className="section-title-row"><span>Ideas</span><span>{ideas.length}</span></div>
          <div className="project-item-list">
            {ideas.length === 0 ? <div className="mini-empty">No ideas linked yet.</div> : ideas.map((item) => (
              <button key={item.id} className="project-linked-item" onClick={() => onOpenItem(item)}>
                <span>Idea</span><strong>{item.title}</strong><em>Open →</em>
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-actions">
          <button className="danger-button" onClick={() => void onArchive(project)}>Archive project</button>
          <button className="primary-button" disabled={saving || !name.trim()} onClick={async () => {
            setSaving(true);
            await onSave(project, {
              name: name.trim(),
              goal: goal.trim() || null,
              description: goal.trim() || null,
              target_date: targetDate || null,
              notes: notes.trim() || null,
              color,
            });
            setSaving(false);
          }}>{saving ? "Saving…" : "Save project"}</button>
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
    if (error) setMessage(error.message); setBusy(false);
  }
  return (
    <div className="auth-screen"><form className="auth-card" onSubmit={login}>
      <div className="brand-mark large">H</div><div className="eyebrow">HYPRFY · v{APP_VERSION}</div>
      <h1>Flowboard</h1><p>Plan the day. Create the story.</p>
      <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {message && <div className="auth-message">{message}</div>}
      <button className="primary-button wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form></div>
  );
}
