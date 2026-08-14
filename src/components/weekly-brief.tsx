"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Save, Sparkles } from "lucide-react";
import { addDays, toDateKey } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { emptyWeeklyBrief, type WeeklyBriefData } from "@/types/brand";
import type { Json } from "@/types/database";

type WeeklyBriefProps = {
  userId: string;
  onOpenFlowboard: () => void;
  onSaved?: () => void;
};

type BriefFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  help?: string;
  rows?: number;
  onChange: (value: string) => void;
};

function mondayFor(date: Date) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  return monday;
}

function isoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function jsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function briefFromJson(value: Json): WeeklyBriefData {
  const defaults = emptyWeeklyBrief();
  const raw = jsonObject(value);
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""])) as unknown as WeeklyBriefData;
}

function BriefField({ label, value, placeholder, help, rows = 3, onChange }: BriefFieldProps) {
  return <label className="brand-field"><span>{label}</span>{rows > 1 ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}{help && <small>{help}</small>}</label>;
}

function BriefSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="brand-section"><header className="brand-section-heading"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header>{children}</section>;
}

export function WeeklyBrief({ userId, onOpenFlowboard, onSaved }: WeeklyBriefProps) {
  const supabase = useMemo(() => createClient(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [brief, setBrief] = useState<WeeklyBriefData>(emptyWeeklyBrief);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const weekStart = useMemo(() => addDays(mondayFor(new Date()), weekOffset * 7), [weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const startKey = toDateKey(weekStart);
  const endKey = toDateKey(weekEnd);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const { data, error } = await supabase.from("weeks").select("*").eq("user_id", userId).eq("start_date", startKey).maybeSingle();
    if (error) setMessage(error.message);
    setBrief(data ? briefFromJson(data.metadata) : emptyWeeklyBrief());
    setLoading(false);
  }, [startKey, supabase, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function update(key: keyof WeeklyBriefData, value: string) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const label = weekStart.toLocaleDateString("en", { day: "numeric", month: "short" });
    const { error } = await supabase.from("weeks").upsert({
      user_id: userId, week_number: isoWeekNumber(weekStart), title: `Week of ${label}`,
      theme: brief.keyStory.trim() || brief.mainObjective.trim() || null, start_date: startKey, end_date: endKey,
      status: "ready", metadata: brief as unknown as Json, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,start_date" });
    setSaving(false);
    if (error) setMessage(error.message);
    else { setMessage("Weekly brief saved. It is now part of every AI plan for this week."); onSaved?.(); }
  }

  const coreFields = [brief.mainObjective, brief.whatsHappening, brief.keyStory, brief.businessFocus, brief.coreMessage, brief.availableMinutes, brief.energyCapacity];
  const readiness = Math.round((coreFields.filter((value) => value.trim()).length / coreFields.length) * 100);
  const dateLabel = `${weekStart.toLocaleDateString("en", { day: "numeric", month: "short" })} — ${weekEnd.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;

  return <div className="brand-scroll">
    <section className="brief-hero"><div><p className="eyebrow">Weekly input</p><h2>Give the week a story.</h2><p>Flowboard combines what is genuinely happening with your brand strategy before it recommends content.</p></div><div className="brief-week-nav"><button onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week"><ArrowLeft size={15} /></button><div><CalendarDays size={15} /><span>{dateLabel}</span></div><button onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week"><ArrowRight size={15} /></button></div></section>
    {loading ? <div className="brief-loading">Loading this week’s brief…</div> : <form className="brand-form" onSubmit={(event) => void save(event)}>
      <div className="brief-readiness"><div><span>Planning readiness</span><strong>{readiness}%</strong></div><i><span style={{ width: `${readiness}%` }} /></i><p>{readiness < 70 ? "Complete the core prompts to give AI enough strategic context." : "This week has enough context for focused recommendations."}</p></div>

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

      <div className="brand-save-bar"><div>{message && <p className={message.includes("saved") ? "success" : ""}>{message}</p>}</div><div className="brief-actions"><button type="button" className="secondary-button" onClick={onOpenFlowboard}><Sparkles size={14} />Open Flowboard</button><button className="brand-save-button" disabled={saving} type="submit"><Save size={15} />{saving ? "Saving…" : "Save weekly brief"}</button></div></div>
    </form>}
  </div>;
}
