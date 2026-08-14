"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { brandChannels, emptyBrandBrain, type BrandBrain, type BrandProfileForm, type ChannelStrategy, type ContentPillar } from "@/types/brand";

type BrandProfileProps = {
  userId: string;
  onSaved?: () => void;
};

type FieldProps = {
  label: string;
  value: string;
  placeholder: string;
  help?: string;
  rows?: number;
  onChange: (value: string) => void;
};

const emptyProfile = (): BrandProfileForm => ({ displayName: "", positioning: "", personalNarrative: "", contentPhilosophy: "Document what is real. Create from lived experience.", brain: emptyBrandBrain() });

function jsonObject(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textValue(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

function mergeBrain(value: Json): BrandBrain {
  const defaults = emptyBrandBrain();
  const raw = jsonObject(value);
  const audience = jsonObject(raw.audience);
  const voice = jsonObject(raw.voice);
  const objectives = jsonObject(raw.objectives);
  const pillars = Array.isArray(raw.pillars) ? raw.pillars.flatMap((entry) => {
    const pillar = jsonObject(entry);
    if (!textValue(pillar.id) && !textValue(pillar.name)) return [];
    return [{
      id: textValue(pillar.id) || crypto.randomUUID(),
      name: textValue(pillar.name), description: textValue(pillar.description),
      percentage: typeof pillar.percentage === "number" ? pillar.percentage : 25,
      formats: textValue(pillar.formats),
      channels: Array.isArray(pillar.channels) ? pillar.channels.filter((channel): channel is string => typeof channel === "string") : [],
    }];
  }) : [];
  const savedChannels = Array.isArray(raw.channels) ? raw.channels.map(jsonObject) : [];
  const channels = brandChannels.map((name) => {
    const saved = savedChannels.find((channel) => channel.name === name);
    const fallback = defaults.channels.find((channel) => channel.name === name)!;
    return saved ? {
      name, enabled: typeof saved.enabled === "boolean" ? saved.enabled : fallback.enabled,
      purpose: textValue(saved.purpose), formats: textValue(saved.formats), cadence: textValue(saved.cadence),
      tone: textValue(saved.tone), callToAction: textValue(saved.callToAction),
    } : fallback;
  });
  return {
    ageLifeStage: textValue(raw.ageLifeStage), locationTimezone: textValue(raw.locationTimezone), roleChapter: textValue(raw.roleChapter),
    missionStatement: textValue(raw.missionStatement), longTermAmbition: textValue(raw.longTermAmbition), knownFor: textValue(raw.knownFor),
    beliefs: textValue(raw.beliefs), interests: textValue(raw.interests), publicBoundaries: textValue(raw.publicBoundaries),
    audience: {
      primary: textValue(audience.primary), cohort: textValue(audience.cohort), goals: textValue(audience.goals), problems: textValue(audience.problems),
      language: textValue(audience.language), followReason: textValue(audience.followReason), desiredAction: textValue(audience.desiredAction),
    },
    voice: {
      tone: textValue(voice.tone), naturalPhrases: textValue(voice.naturalPhrases), avoid: textValue(voice.avoid), opinions: textValue(voice.opinions),
      soundsLikeMe: textValue(voice.soundsLikeMe), notMe: textValue(voice.notMe), formatting: textValue(voice.formatting), vulnerability: textValue(voice.vulnerability),
    },
    objectives: {
      primaryGoal: textValue(objectives.primaryGoal), currentOffer: textValue(objectives.currentOffer), callsToAction: textValue(objectives.callsToAction),
      links: textValue(objectives.links), growthTarget: textValue(objectives.growthTarget), opportunities: textValue(objectives.opportunities), conversion: textValue(objectives.conversion),
    },
    pillars,
    channels,
  };
}

function Field({ label, value, placeholder, help, rows = 1, onChange }: FieldProps) {
  return <label className="brand-field"><span>{label}</span>{rows > 1 ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}{help && <small>{help}</small>}</label>;
}

function SectionHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <header className="brand-section-heading"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header>;
}

export function BrandProfile({ userId, onSaved }: BrandProfileProps) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<BrandProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error) setMessage(error.message);
    if (data) setProfile({ displayName: data.display_name ?? "", positioning: data.positioning ?? "", personalNarrative: data.personal_narrative ?? "", contentPhilosophy: data.content_philosophy ?? "", brain: mergeBrain(data.brand_brain) });
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function updateBrain(patch: Partial<BrandBrain>) {
    setProfile((current) => ({ ...current, brain: { ...current.brain, ...patch } }));
  }

  function updateAudience(key: keyof BrandBrain["audience"], value: string) {
    setProfile((current) => ({ ...current, brain: { ...current.brain, audience: { ...current.brain.audience, [key]: value } } }));
  }

  function updateVoice(key: keyof BrandBrain["voice"], value: string) {
    setProfile((current) => ({ ...current, brain: { ...current.brain, voice: { ...current.brain.voice, [key]: value } } }));
  }

  function updateObjective(key: keyof BrandBrain["objectives"], value: string) {
    setProfile((current) => ({ ...current, brain: { ...current.brain, objectives: { ...current.brain.objectives, [key]: value } } }));
  }

  function addPillar() {
    const pillar: ContentPillar = { id: crypto.randomUUID(), name: "", description: "", percentage: 25, formats: "", channels: [] };
    updateBrain({ pillars: [...profile.brain.pillars, pillar] });
  }

  function updatePillar(id: string, patch: Partial<ContentPillar>) {
    updateBrain({ pillars: profile.brain.pillars.map((pillar) => pillar.id === id ? { ...pillar, ...patch } : pillar) });
  }

  function updateChannel(name: ChannelStrategy["name"], patch: Partial<ChannelStrategy>) {
    updateBrain({ channels: profile.brain.channels.map((channel) => channel.name === name ? { ...channel, ...patch } : channel) });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    if (!profile.brain.channels.some((channel) => channel.enabled)) {
      setMessage("Select at least one active channel before saving your strategy.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId, display_name: profile.displayName.trim() || null, positioning: profile.positioning.trim() || null,
      personal_narrative: profile.personalNarrative.trim() || null, content_philosophy: profile.contentPhilosophy.trim() || null,
      brand_brain: profile.brain as unknown as Json, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) setMessage(error.message);
    else { setMessage("Brand profile saved. Future AI plans will use this context."); onSaved?.(); }
  }

  const foundationValues = [profile.displayName, profile.positioning, profile.brain.missionStatement, profile.brain.knownFor, profile.brain.audience.primary, profile.brain.voice.tone, profile.brain.objectives.primaryGoal, profile.brain.pillars.some((pillar) => pillar.name.trim()) ? "pillars" : "", profile.brain.channels.some((channel) => channel.enabled) ? "channels" : ""];
  const readiness = Math.round((foundationValues.filter((value) => value.trim()).length / foundationValues.length) * 100);

  if (loading) return <div className="board-loading">Loading your brand foundation…</div>;
  return <div className="brand-scroll">
    <section className="brand-hero"><div><p className="eyebrow">Brand foundation</p><h2>Teach Flowboard who you are.</h2><p>This is the strategic memory behind every plan, hook, caption and recommendation.</p></div><div className="readiness-ring" style={{ "--readiness": `${readiness * 3.6}deg` } as React.CSSProperties}><strong>{readiness}%</strong><span>ready</span></div></section>
    <form className="brand-form" onSubmit={(event) => void save(event)}>
      <section className="brand-section"><SectionHeader number="01" title="About you" description="The human context behind the brand." /><div className="brand-field-grid">
        <Field label="Public name" value={profile.displayName} placeholder="How people know you" onChange={(displayName) => setProfile((current) => ({ ...current, displayName }))} />
        <Field label="Role / current chapter" value={profile.brain.roleChapter} placeholder="Founder, creator, parent, athlete…" onChange={(roleChapter) => updateBrain({ roleChapter })} />
        <Field label="Age or life stage" value={profile.brain.ageLifeStage} placeholder="Optional context, not a public label" onChange={(ageLifeStage) => updateBrain({ ageLifeStage })} />
        <Field label="Location + timezone" value={profile.brain.locationTimezone} placeholder="Cape Town · SAST" onChange={(locationTimezone) => updateBrain({ locationTimezone })} />
        <Field label="Positioning" value={profile.positioning} placeholder="The clearest one-line description of your brand" rows={2} onChange={(positioning) => setProfile((current) => ({ ...current, positioning }))} />
        <Field label="Personal story" value={profile.personalNarrative} placeholder="The experiences that make your perspective credible" rows={3} onChange={(personalNarrative) => setProfile((current) => ({ ...current, personalNarrative }))} />
        <Field label="Interests" value={profile.brain.interests} placeholder="Business, design, travel, fitness…" rows={2} onChange={(interests) => updateBrain({ interests })} />
        <Field label="Private boundaries" value={profile.brain.publicBoundaries} placeholder="People, subjects or details AI must never suggest sharing" rows={2} onChange={(publicBoundaries) => updateBrain({ publicBoundaries })} />
      </div></section>

      <section className="brand-section"><SectionHeader number="02" title="Mission and perspective" description="Why the brand deserves to exist." /><div className="brand-field-grid">
        <Field label="Mission statement" value={profile.brain.missionStatement} placeholder="What change are you trying to create?" rows={3} onChange={(missionStatement) => updateBrain({ missionStatement })} />
        <Field label="Long-term ambition" value={profile.brain.longTermAmbition} placeholder="Where should this brand lead in three to five years?" rows={3} onChange={(longTermAmbition) => updateBrain({ longTermAmbition })} />
        <Field label="Known for" value={profile.brain.knownFor} placeholder="What should someone immediately associate with you?" rows={2} onChange={(knownFor) => updateBrain({ knownFor })} />
        <Field label="Core beliefs and opinions" value={profile.brain.beliefs} placeholder="The convictions that shape your point of view" rows={3} onChange={(beliefs) => updateBrain({ beliefs })} />
        <Field label="Content philosophy" value={profile.contentPhilosophy} placeholder="The rules your content should follow" rows={2} onChange={(contentPhilosophy) => setProfile((current) => ({ ...current, contentPhilosophy }))} />
      </div></section>

      <section className="brand-section"><SectionHeader number="03" title="Audience" description="Who you are speaking to—not everyone who could see it." /><div className="brand-field-grid">
        <Field label="Primary audience" value={profile.brain.audience.primary} placeholder="The specific person this brand serves" rows={2} onChange={(value) => updateAudience("primary", value)} />
        <Field label="Audience cohort" value={profile.brain.audience.cohort} placeholder="Life stage, context, location or professional cohort" rows={2} onChange={(value) => updateAudience("cohort", value)} />
        <Field label="Goals and aspirations" value={profile.brain.audience.goals} placeholder="What are they trying to become or achieve?" rows={3} onChange={(value) => updateAudience("goals", value)} />
        <Field label="Problems and frustrations" value={profile.brain.audience.problems} placeholder="What is getting in their way?" rows={3} onChange={(value) => updateAudience("problems", value)} />
        <Field label="Their language" value={profile.brain.audience.language} placeholder="Words, questions and phrases they naturally use" rows={2} onChange={(value) => updateAudience("language", value)} />
        <Field label="Reason to follow" value={profile.brain.audience.followReason} placeholder="The repeatable value they receive" rows={2} onChange={(value) => updateAudience("followReason", value)} />
        <Field label="Desired audience action" value={profile.brain.audience.desiredAction} placeholder="Think differently, reply, subscribe, enquire…" rows={2} onChange={(value) => updateAudience("desiredAction", value)} />
      </div></section>

      <section className="brand-section"><SectionHeader number="04" title="Content themes" description="A balanced set of repeatable pillars." /><div className="pillar-list">
        {profile.brain.pillars.map((pillar, index) => <article className="pillar-card" key={pillar.id}><header><span>Pillar {index + 1}</span><button type="button" onClick={() => updateBrain({ pillars: profile.brain.pillars.filter((entry) => entry.id !== pillar.id) })} aria-label={`Remove pillar ${index + 1}`}><Trash2 size={14} /></button></header><div className="brand-field-grid">
          <Field label="Theme name" value={pillar.name} placeholder="e.g. Building Hyprfy" onChange={(name) => updatePillar(pillar.id, { name })} />
          <label className="brand-field"><span>Target mix</span><input type="number" min="0" max="100" value={pillar.percentage} onChange={(event) => updatePillar(pillar.id, { percentage: Number(event.target.value) })} /><small>Percentage of weekly output</small></label>
          <Field label="What belongs here" value={pillar.description} placeholder="Topics, angles and boundaries" rows={3} onChange={(description) => updatePillar(pillar.id, { description })} />
          <Field label="Best formats" value={pillar.formats} placeholder="Reels, observations, vlog chapters…" rows={2} onChange={(formats) => updatePillar(pillar.id, { formats })} />
        </div><div className="mini-channel-options">{brandChannels.map((channel) => <button type="button" key={channel} className={pillar.channels.includes(channel) ? "selected" : ""} onClick={() => updatePillar(pillar.id, { channels: pillar.channels.includes(channel) ? pillar.channels.filter((entry) => entry !== channel) : [...pillar.channels, channel] })}>{channel === "X" ? "X / Twitter" : channel}</button>)}</div></article>)}
        <button type="button" className="add-pillar" onClick={addPillar}><Plus size={15} />Add content pillar</button>
      </div></section>

      <section className="brand-section"><SectionHeader number="05" title="Voice" description="The difference between useful AI and generic AI." /><div className="brand-field-grid">
        <Field label="Tone" value={profile.brain.voice.tone} placeholder="Direct, curious, thoughtful, energetic…" rows={2} onChange={(value) => updateVoice("tone", value)} />
        <Field label="Natural words and phrases" value={profile.brain.voice.naturalPhrases} placeholder="Language that sounds recognisably like you" rows={3} onChange={(value) => updateVoice("naturalPhrases", value)} />
        <Field label="Avoid" value={profile.brain.voice.avoid} placeholder="Clichés, jargon, words or tones to avoid" rows={3} onChange={(value) => updateVoice("avoid", value)} />
        <Field label="Opinions you will express" value={profile.brain.voice.opinions} placeholder="Strong positions you are comfortable owning" rows={3} onChange={(value) => updateVoice("opinions", value)} />
        <Field label="Sounds like me" value={profile.brain.voice.soundsLikeMe} placeholder="Paste two or three examples of your real writing" rows={5} onChange={(value) => updateVoice("soundsLikeMe", value)} />
        <Field label="Does not sound like me" value={profile.brain.voice.notMe} placeholder="Paste an example or describe the style to reject" rows={5} onChange={(value) => updateVoice("notMe", value)} />
        <Field label="Formatting preferences" value={profile.brain.voice.formatting} placeholder="Short paragraphs, no hashtags, limited emoji…" rows={2} onChange={(value) => updateVoice("formatting", value)} />
        <Field label="Vulnerability level" value={profile.brain.voice.vulnerability} placeholder="What can be shared, and how personally?" rows={2} onChange={(value) => updateVoice("vulnerability", value)} />
      </div></section>

      <section className="brand-section"><SectionHeader number="06" title="Objectives" description="The commercial and reputational outcome." /><div className="brand-field-grid">
        <Field label="Primary goal" value={profile.brain.objectives.primaryGoal} placeholder="Growth, authority, community, leads or sales" onChange={(value) => updateObjective("primaryGoal", value)} />
        <Field label="Current offer" value={profile.brain.objectives.currentOffer} placeholder="What can someone buy, join or enquire about?" rows={2} onChange={(value) => updateObjective("currentOffer", value)} />
        <Field label="Calls to action" value={profile.brain.objectives.callsToAction} placeholder="The actions content can reasonably request" rows={2} onChange={(value) => updateObjective("callsToAction", value)} />
        <Field label="Links and destinations" value={profile.brain.objectives.links} placeholder="Website, newsletter, product, booking page…" rows={2} onChange={(value) => updateObjective("links", value)} />
        <Field label="Growth target" value={profile.brain.objectives.growthTarget} placeholder="A useful monthly or quarterly target" onChange={(value) => updateObjective("growthTarget", value)} />
        <Field label="Desired opportunities" value={profile.brain.objectives.opportunities} placeholder="Clients, speaking, partnerships, press…" rows={2} onChange={(value) => updateObjective("opportunities", value)} />
        <Field label="What conversion means" value={profile.brain.objectives.conversion} placeholder="The signal that the brand is working" rows={2} onChange={(value) => updateObjective("conversion", value)} />
      </div></section>

      <section className="brand-section"><SectionHeader number="07" title="Channel strategy" description="Give every selected platform a clear job." /><div className="channel-strategy-list">{profile.brain.channels.map((channel) => <article className={channel.enabled ? "enabled" : ""} key={channel.name}><header><button type="button" className="channel-toggle" aria-pressed={channel.enabled} onClick={() => updateChannel(channel.name, { enabled: !channel.enabled })}>{channel.enabled && <Check size={12} />}</button><div><strong>{channel.name === "X" ? "X / Twitter" : channel.name}</strong><small>{channel.enabled ? "Included in your strategy" : "Not currently active"}</small></div></header>{channel.enabled && <div className="brand-field-grid">
          <Field label="Purpose" value={channel.purpose} placeholder="What job does this channel perform?" rows={2} onChange={(purpose) => updateChannel(channel.name, { purpose })} />
          <Field label="Cadence" value={channel.cadence} placeholder="e.g. 4 posts per week" onChange={(cadence) => updateChannel(channel.name, { cadence })} />
          <Field label="Primary formats" value={channel.formats} placeholder="Threads, reels, carousels…" rows={2} onChange={(formats) => updateChannel(channel.name, { formats })} />
          <Field label="Channel tone" value={channel.tone} placeholder="How your voice adapts here" rows={2} onChange={(tone) => updateChannel(channel.name, { tone })} />
          <Field label="Primary CTA" value={channel.callToAction} placeholder="The usual next step" rows={2} onChange={(callToAction) => updateChannel(channel.name, { callToAction })} />
        </div>}</article>)}</div></section>

      <div className="brand-save-bar"><div>{message && <p className={message.includes("saved") ? "success" : ""}>{message}</p>}</div><button className="brand-save-button" disabled={saving} type="submit"><Save size={15} />{saving ? "Saving…" : "Save brand profile"}</button></div>
    </form>
  </div>;
}
