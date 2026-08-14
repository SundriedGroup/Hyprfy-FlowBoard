"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, RefreshCw, Save, Sparkles } from "lucide-react";
import { addDays, toDateKey } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { emptyWeeklyBrief, type WeeklyBriefData } from "@/types/brand";
import type { Json } from "@/types/database";
import type { WeekdayKey, WeeklyPlan, WeeklyRecommendation } from "@/types/weekly-plan";

type WeeklyBriefProps = { userId: string; onOpenFlowboard: () => void; onPlanApplied: () => void; onSaved?: () => void };
type BriefFieldProps = { label: string; value: string; placeholder: string; help?: string; rows?: number; onChange: (value: string) => void };
const weekdayKeys: WeekdayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function mondayFor(date: Date) {
  const monday = new Date(date); monday.setHours(12, 0, 0, 0);
  const day = monday.getDay(); monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  return monday;
}

function isoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7; target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function jsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function briefFromJson(value: Json): WeeklyBriefData {
  const defaults = emptyWeeklyBrief(); const raw = jsonObject(value);
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""])) as unknown as WeeklyBriefData;
}

function planFromJson(value: Json | undefined): WeeklyPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, Json | undefined>;
  if (typeof raw.id !== "string" || typeof raw.headline !== "string" || !raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) return null;
  return value as unknown as WeeklyPlan;
}

function recommendationLabel(value: WeeklyRecommendation) {
  if (value === "post_today") return "Post";
  if (value === "bank_for_vlog") return "Bank for vlog";
  if (value === "post_and_bank") return "Post + bank";
  if (value === "capture_only") return "Capture only";
  return "Rest";
}

function BriefField({ label, value, placeholder, help, rows = 3, onChange }: BriefFieldProps) {
  return <label className="brand-field"><span>{label}</span>{rows > 1 ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}{help && <small>{help}</small>}</label>;
}

function BriefSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="brand-section"><header className="brand-section-heading"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header>{children}</section>;
}

function PlanPreview({ plan }: { plan: WeeklyPlan }) {
  const totalContent = weekdayKeys.reduce((total, key) => total + plan.days[key].contentItems.length, 0);
  const totalTasks = weekdayKeys.reduce((total, key) => total + plan.days[key].todoItems.length, 0);
  return <section className="week-plan-preview">
    <header><div><p className="eyebrow">AI weekly strategy</p><h3>{plan.headline}</h3><p>{plan.narrative}</p></div><span className={plan.appliedAt ? "applied" : "draft"}>{plan.appliedAt ? "Applied" : "Review"}</span></header>
    <div className="week-plan-summary"><article><span>Strategic goal</span><p>{plan.strategicGoal}</p></article><article><span>Audience promise</span><p>{plan.audiencePromise}</p></article><article><span>Content mix</span><p>{plan.contentMix}</p></article><article><span>Distribution</span><p>{plan.distributionLogic}</p></article></div>
    <div className="week-plan-meta"><span>{totalContent} content pieces</span><span>{totalTasks} production tasks</span><span>CTA: {plan.weeklyCallToAction}</span><span>Success: {plan.successSignal}</span></div>
    <div className="week-plan-days">{weekdayKeys.map((key) => {
      const day = plan.days[key];
      return <article key={key}><header><div><span>{key.slice(0, 3)}</span><strong>{day.theme}</strong></div><em>{recommendationLabel(day.recommendation)}</em></header><p>{day.focus}</p>{day.contentItems.length > 0 ? <div className="planned-content-list">{day.contentItems.map((item) => <div key={`${item.title}-${item.primaryChannel}`}><span>{item.primaryChannel === "X" ? "X / Twitter" : item.primaryChannel}</span><strong>{item.title}</strong><small>“{item.hook}”</small></div>)}</div> : <small className="no-post-day">No scheduled post · {day.storyOpportunity}</small>}<footer>{day.todoItems.length} tasks · {day.contentItems.reduce((total, item) => total + item.durationMinutes, 0) + day.todoItems.reduce((total, item) => total + item.durationMinutes, 0)} min</footer></article>;
    })}</div>
  </section>;
}

export function WeeklyBrief({ userId, onOpenFlowboard, onPlanApplied, onSaved }: WeeklyBriefProps) {
  const supabase = useMemo(() => createClient(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [brief, setBrief] = useState<WeeklyBriefData>(emptyWeeklyBrief);
  const [savedMetadata, setSavedMetadata] = useState<Record<string, Json | undefined>>({});
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const weekStart = useMemo(() => addDays(mondayFor(new Date()), weekOffset * 7), [weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const startKey = toDateKey(weekStart); const endKey = toDateKey(weekEnd);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const { data, error } = await supabase.from("weeks").select("*").eq("user_id", userId).eq("start_date", startKey).maybeSingle();
    if (error) setMessage(error.message);
    const metadata = data ? jsonObject(data.metadata) : {};
    setSavedMetadata(metadata); setBrief(data ? briefFromJson(data.metadata) : emptyWeeklyBrief()); setPlan(planFromJson(metadata.ai_week_plan)); setLoading(false);
  }, [startKey, supabase, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  function update(key: keyof WeeklyBriefData, value: string) { setBrief((current) => ({ ...current, [key]: value })); }

  async function persistBrief(showSuccess = true) {
    setSaving(true); setMessage(null);
    const label = weekStart.toLocaleDateString("en", { day: "numeric", month: "short" });
    const metadata = { ...savedMetadata, ...brief };
    const { data, error } = await supabase.from("weeks").upsert({
      user_id: userId, week_number: isoWeekNumber(weekStart), title: `Week of ${label}`,
      theme: brief.keyStory.trim() || brief.mainObjective.trim() || null, start_date: startKey, end_date: endKey,
      status: plan?.appliedAt ? "published" : "ready", metadata: metadata as unknown as Json, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,start_date" }).select().single();
    setSaving(false);
    if (error) { setMessage(error.message); return false; }
    setSavedMetadata(jsonObject(data.metadata));
    if (showSuccess) { setMessage("Weekly brief saved. AI planning will use this version."); onSaved?.(); }
    return true;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await persistBrief(); }

  async function generatePlan() {
    if (!(await persistBrief(false))) return;
    setGenerating(true); setMessage("Building a coherent seven-day strategy…");
    try {
      const response = await fetch("/api/week-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", weekStart: startKey }) });
      const payload = await response.json() as { plan?: WeeklyPlan; error?: string };
      if (!response.ok || !payload.plan) throw new Error(payload.error || "Could not generate the weekly plan.");
      setPlan(payload.plan); setSavedMetadata((current) => ({ ...current, ai_week_plan: payload.plan as unknown as Json }));
      setMessage("Weekly strategy ready for review. Apply it when the plan feels right."); onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate the weekly plan."); }
    finally { setGenerating(false); }
  }

  async function applyPlan() {
    if (!plan || plan.appliedAt) { onOpenFlowboard(); return; }
    setApplying(true); setMessage("Applying the plan while preserving your manual cards…");
    try {
      const response = await fetch("/api/week-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", weekStart: startKey }) });
      const payload = await response.json() as { plan?: WeeklyPlan; error?: string };
      if (!response.ok || !payload.plan) throw new Error(payload.error || "Could not apply the weekly plan.");
      setPlan(payload.plan); setSavedMetadata((current) => ({ ...current, ai_week_plan: payload.plan as unknown as Json }));
      setMessage("Weekly plan applied to Flowboard."); onSaved?.(); onPlanApplied();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not apply the weekly plan."); }
    finally { setApplying(false); }
  }

  const coreFields = [brief.mainObjective, brief.whatsHappening, brief.keyStory, brief.businessFocus, brief.coreMessage, brief.availableMinutes, brief.energyCapacity];
  const readiness = Math.round((coreFields.filter((value) => value.trim()).length / coreFields.length) * 100);
  const dateLabel = `${weekStart.toLocaleDateString("en", { day: "numeric", month: "short" })} — ${weekEnd.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;
  const busy = saving || generating || applying;

  return <div className="brand-scroll">
    <section className="brief-hero"><div><p className="eyebrow">Weekly input</p><h2>Give the week a story.</h2><p>Flowboard combines what is genuinely happening with your brand strategy before it recommends content.</p></div><div className="brief-week-nav"><button onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week"><ArrowLeft size={15} /></button><div><CalendarDays size={15} /><span>{dateLabel}</span></div><button onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week"><ArrowRight size={15} /></button></div></section>
    {loading ? <div className="brief-loading">Loading this week’s brief…</div> : <form className="brand-form" onSubmit={(event) => void save(event)}>
      <div className="brief-readiness"><div><span>Planning readiness</span><strong>{readiness}%</strong></div><i><span style={{ width: `${readiness}%` }} /></i><p>{readiness < 70 ? "Complete the core prompts to give AI enough strategic context." : "This week has enough context for focused recommendations."}</p></div>
      {plan && <PlanPreview plan={plan} />}
      <BriefSection number="01" title="Direction" description="The outcome and narrative that should anchor the week."><div className="brand-field-grid">
        <BriefField label="Main objective" value={brief.mainObjective} placeholder="What must move forward this week?" onChange={(value) => update("mainObjective", value)} />
        <BriefField label="Key story" value={brief.keyStory} placeholder="What is the central narrative or tension?" onChange={(value) => update("keyStory", value)} />
        <BriefField label="Business focus" value={brief.businessFocus} placeholder="Launch, product, client work, growth or delivery focus" onChange={(value) => update("businessFocus", value)} />
        <BriefField label="One message to remember" value={brief.coreMessage} placeholder="If the audience remembers one thing, what should it be?" onChange={(value) => update("coreMessage", value)} />
      </div></BriefSection>
      <BriefSection number="02" title="What is really happening" description="The raw material for documentary content."><div className="brand-field-grid">
        <BriefField label="What’s happening" value={brief.whatsHappening} placeholder="Meetings, work, family, travel, decisions, challenges…" rows={4} onChange={(value) => update("whatsHappening", value)} />
        <BriefField label="Important dates" value={brief.importantDates} placeholder="Events, deadlines, launches and commitments" rows={4} onChange={(value) => update("importantDates", value)} />
        <BriefField label="Content opportunities" value={brief.contentOpportunities} placeholder="Moments worth filming, explaining or documenting" onChange={(value) => update("contentOpportunities", value)} />
        <BriefField label="Questions from the audience" value={brief.audienceQuestions} placeholder="DMs, comments and repeated questions worth answering" onChange={(value) => update("audienceQuestions", value)} />
      </div></BriefSection>
      <BriefSection number="03" title="Production reality" description="A strong plan must fit the time and energy available."><div className="brand-field-grid">
        <BriefField label="Available creation time" value={brief.availableMinutes} placeholder="e.g. 4 hours total; 30 minutes on weekdays" rows={2} onChange={(value) => update("availableMinutes", value)} />
        <BriefField label="Filming days" value={brief.filmingDays} placeholder="When can you realistically capture video?" rows={2} onChange={(value) => update("filmingDays", value)} />
        <BriefField label="Existing assets" value={brief.existingAssets} placeholder="Footage, photos, drafts, recordings or links already available" onChange={(value) => update("existingAssets", value)} />
        <BriefField label="Energy and capacity" value={brief.energyCapacity} placeholder="High-energy sprint, normal week, low-capacity week…" onChange={(value) => update("energyCapacity", value)} />
        <BriefField label="Do not publish" value={brief.doNotPublish} placeholder="Sensitive subjects, embargoes or moments that must remain private" onChange={(value) => update("doNotPublish", value)} />
      </div></BriefSection>
      <BriefSection number="04" title="Reflection prompts" description="Find the point of view hiding inside the week."><div className="brand-field-grid">
        <BriefField label="What changed?" value={brief.changed} placeholder="A decision, result, belief or circumstance" onChange={(value) => update("changed", value)} />
        <BriefField label="What did you learn?" value={brief.learned} placeholder="A useful lesson from real experience" onChange={(value) => update("learned", value)} />
        <BriefField label="What are you struggling with?" value={brief.strugglingWith} placeholder="A truthful tension you are comfortable sharing" onChange={(value) => update("strugglingWith", value)} />
        <BriefField label="What are you excited about?" value={brief.excitedAbout} placeholder="Momentum, possibility or anticipation" onChange={(value) => update("excitedAbout", value)} />
        <BriefField label="What opinion is developing?" value={brief.developingOpinion} placeholder="An observation that could become an X post or longer argument" onChange={(value) => update("developingOpinion", value)} />
        <BriefField label="What can you show?" value={brief.showNotTell} placeholder="Scenes, proof, process or artefacts instead of explanation" onChange={(value) => update("showNotTell", value)} />
        <BriefField label="Bank for the weekly vlog" value={brief.vlogBank} placeholder="Moments that belong in the longer weekly story" onChange={(value) => update("vlogBank", value)} />
      </div></BriefSection>
      <div className="brand-save-bar"><div>{message && <p className={/saved|ready|applied/i.test(message) ? "success" : ""}>{message}</p>}</div><div className="brief-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onOpenFlowboard}>Open Flowboard</button><button type="submit" className="secondary-button" disabled={busy}><Save size={14} />{saving ? "Saving…" : "Save brief"}</button><button type="button" className="generate-week-button" disabled={busy || readiness === 0} onClick={() => void generatePlan()}>{generating ? <RefreshCw className="spin" size={15} /> : <Sparkles size={15} />}{generating ? "Building week…" : plan ? "Regenerate plan" : "Build week plan"}</button>{plan && <button type="button" className="brand-save-button" disabled={busy} onClick={() => void applyPlan()}>{plan.appliedAt ? <Check size={15} /> : <CalendarDays size={15} />}{applying ? "Applying…" : plan.appliedAt ? "View in Flowboard" : "Apply to Flowboard"}</button>}</div></div>
    </form>}
  </div>;
}
