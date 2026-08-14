import { generateText, gateway, Output } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FlowDay, Json } from "@/types/database";

const channelSchema = z.enum(["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "X", "Substack", "Blog"]);
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), weekStart: z.string().date() }),
  z.object({ action: z.literal("apply"), weekStart: z.string().date() }),
]);
const contentItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(800),
  hook: z.string().min(1).max(220),
  socialCopy: z.string().min(1).max(2200),
  callToAction: z.string().min(1).max(240),
  format: z.string().min(1).max(80),
  captureNotes: z.string().min(1).max(600),
  stage: z.enum(["idea", "script", "capture", "edit", "publish"]),
  durationMinutes: z.number().int().min(5).max(240),
  primaryChannel: channelSchema,
  channels: z.array(channelSchema).min(1).max(4),
});
const todoItemSchema = z.object({ title: z.string().min(1).max(120), description: z.string().min(1).max(500), durationMinutes: z.number().int().min(5).max(240) });
const daySchema = z.object({
  theme: z.string().min(1).max(120),
  focus: z.string().min(1).max(300),
  storyOpportunity: z.string().min(1).max(500),
  recommendation: z.enum(["post_today", "bank_for_vlog", "post_and_bank", "capture_only", "rest"]),
  contentItems: z.array(contentItemSchema).max(3),
  todoItems: z.array(todoItemSchema).max(4),
});
const generatedPlanSchema = z.object({
  headline: z.string().min(1).max(140),
  narrative: z.string().min(1).max(900),
  strategicGoal: z.string().min(1).max(500),
  audiencePromise: z.string().min(1).max(400),
  contentMix: z.string().min(1).max(700),
  distributionLogic: z.string().min(1).max(700),
  successSignal: z.string().min(1).max(350),
  weeklyCallToAction: z.string().min(1).max(240),
  days: z.object({ monday: daySchema, tuesday: daySchema, wednesday: daySchema, thursday: daySchema, friday: daySchema, saturday: daySchema, sunday: daySchema }),
});
const storedPlanSchema = generatedPlanSchema.extend({ id: z.string().uuid(), generatedAt: z.string().datetime(), appliedAt: z.string().datetime().nullable() });
const weekdayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function metadataObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function addDateDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function enabledChannels(profile: { brand_brain: Json } | null) {
  const channels = metadataObject(profile?.brand_brain ?? {}).channels;
  if (!Array.isArray(channels)) return [];
  return channels.flatMap((value) => {
    const channel = metadataObject(value);
    const parsedName = channelSchema.safeParse(channel.name);
    return channel.enabled === true && parsedName.success ? [parsedName.data] : [];
  });
}

function normalizePlan(plan: z.infer<typeof generatedPlanSchema>, enabled: string[]) {
  const allowed = enabled.length ? new Set(enabled) : new Set(channelSchema.options);
  const fallback = enabled[0] ?? "X";
  return {
    ...plan,
    days: Object.fromEntries(weekdayKeys.map((key) => [key, {
      ...plan.days[key],
      contentItems: plan.days[key].contentItems.map((item) => {
        const channels = item.channels.filter((channel) => allowed.has(channel));
        if (!channels.length) channels.push(fallback as z.infer<typeof channelSchema>);
        return { ...item, channels, primaryChannel: channels.includes(item.primaryChannel) ? item.primaryChannel : channels[0] };
      }),
    }])) as typeof plan.days,
  };
}

async function loadContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, weekStart: string) {
  const [profileResult, weekResult] = await Promise.all([
    supabase.from("profiles").select("display_name,positioning,personal_narrative,content_philosophy,brand_brain").eq("user_id", userId).maybeSingle(),
    supabase.from("weeks").select("*").eq("user_id", userId).eq("start_date", weekStart).maybeSingle(),
  ]);
  if (profileResult.error || weekResult.error) throw profileResult.error ?? weekResult.error;
  return { profile: profileResult.data, week: weekResult.data };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a valid week before building the plan." }, { status: 400 });

  try {
    const { profile, week } = await loadContext(supabase, user.id, parsed.data.weekStart);
    if (!week) return Response.json({ error: "Save the Weekly Brief before generating its plan." }, { status: 400 });
    const weekMetadata = metadataObject(week.metadata);

    if (parsed.data.action === "generate") {
      const hasBrief = Object.entries(weekMetadata).some(([key, value]) => key !== "ai_week_plan" && typeof value === "string" && value.trim());
      if (!hasBrief) return Response.json({ error: "Add some real context to the Weekly Brief before generating a plan." }, { status: 400 });
      const selectedChannels = enabledChannels(profile);
      const result = await generateText({
        model: gateway("openai/gpt-5.4-mini"),
        providerOptions: { gateway: { user: user.id, tags: ["feature:flowboard-week-plan"] } },
        output: Output.object({ name: "FlowboardWeeklyPlan", description: "A complete, realistic seven-day personal brand content strategy.", schema: generatedPlanSchema }),
        system: "You are the senior personal brand strategist inside Hyprfy Flowboard. Build one coherent seven-day story from the creator's durable Brand Profile and current Weekly Brief. The plan must compound their positioning, serve the named audience, respect privacy boundaries, use only enabled channels, fit stated time and energy capacity, and balance growth, trust, community and conversion. Do not manufacture events, achievements or vulnerability. Use real happenings as source material. Do not force a post every day: use capture-only, banking and rest days where strategically useful. Produce 5–9 strong content items across the whole week, each with a specific hook, finished publish-ready social copy, CTA, format and capture instructions. Use X as the fast idea-testing layer when enabled. Make every platform choice intentional and explain the distribution logic. Tasks must be concrete production actions, not vague reminders.",
        prompt: `Build the weekly plan for ${week.start_date} through ${week.end_date}. Empty fields are unknown and must not be guessed.\n\nENABLED CHANNELS\n${JSON.stringify(selectedChannels)}\n\nBRAND PROFILE\n${JSON.stringify(profile, null, 2)}\n\nWEEKLY BRIEF\n${JSON.stringify(weekMetadata, null, 2)}`,
      });
      const plan = { ...normalizePlan(result.output, selectedChannels), id: crypto.randomUUID(), generatedAt: new Date().toISOString(), appliedAt: null };
      const { error: saveError } = await supabase.from("weeks").update({ metadata: { ...weekMetadata, ai_week_plan: plan } as unknown as Json, status: "ready", updated_at: new Date().toISOString() }).eq("id", week.id).eq("user_id", user.id);
      if (saveError) throw saveError;
      return Response.json({ plan });
    }

    const planResult = storedPlanSchema.safeParse(weekMetadata.ai_week_plan);
    if (!planResult.success) return Response.json({ error: "Generate the weekly plan before applying it to Flowboard." }, { status: 400 });
    const plan = planResult.data;
    if (plan.appliedAt) return Response.json({ plan, alreadyApplied: true });

    const existingItemsResult = await supabase.from("flow_items").select("id,metadata").eq("user_id", user.id).gte("day", week.start_date).lte("day", week.end_date);
    if (existingItemsResult.error) throw existingItemsResult.error;
    const previousGeneratedIds = existingItemsResult.data.filter((item) => typeof metadataObject(item.metadata).weekly_plan_id === "string").map((item) => item.id);
    const generatedAt = new Date().toISOString();
    const rows = weekdayKeys.flatMap((key, dayIndex) => {
      const day = addDateDays(week.start_date, dayIndex);
      const dayPlan = plan.days[key];
      return [
        ...dayPlan.contentItems.map((item, index) => ({
          user_id: user.id, day, item_type: item.stage, title: item.title, description: item.description, status: "open", duration_minutes: item.durationMinutes,
          sort_order: 200000 + ((index + 1) * 1024), metadata: { ai_generated: true, weekly_plan_id: plan.id, generated_at: plan.generatedAt, recommendation: dayPlan.recommendation, hook: item.hook, social_copy: item.socialCopy, call_to_action: item.callToAction, format: item.format, capture_notes: item.captureNotes, primary_channel: item.primaryChannel, channels: item.channels },
        })),
        ...dayPlan.todoItems.map((item, index) => ({
          user_id: user.id, day, item_type: "task", title: item.title, description: item.description, status: "open", duration_minutes: item.durationMinutes,
          sort_order: 300000 + ((index + 1) * 1024), metadata: { ai_generated: true, weekly_plan_id: plan.id, generated_at: plan.generatedAt },
        })),
      ];
    });
    const { data: insertedItems, error: insertError } = rows.length ? await supabase.from("flow_items").insert(rows).select() : { data: [], error: null };
    if (insertError) throw insertError;

    const existingDaysResult = await supabase.from("flow_days").select("*").eq("user_id", user.id).gte("day", week.start_date).lte("day", week.end_date);
    if (existingDaysResult.error) {
      if (insertedItems.length) await supabase.from("flow_items").delete().eq("user_id", user.id).in("id", insertedItems.map((item) => item.id));
      throw existingDaysResult.error;
    }
    const existingDays = new Map(existingDaysResult.data.map((day) => [day.day, day]));
    const dayRows = weekdayKeys.map((key, dayIndex) => {
      const day = addDateDays(week.start_date, dayIndex);
      const existing = existingDays.get(day) as FlowDay | undefined;
      const dayPlan = plan.days[key];
      return {
        user_id: user.id, day, theme: existing?.theme || dayPlan.theme, main_outcome: existing?.main_outcome || dayPlan.focus,
        whats_happening: existing?.whats_happening ?? null, story_opportunity: existing?.story_opportunity || dayPlan.storyOpportunity,
        notes: existing?.notes ?? null, capacity_minutes: existing?.capacity_minutes ?? null,
        metadata: { ...metadataObject(existing?.metadata ?? {}), weekly_ai_plan: { plan_id: plan.id, recommendation: dayPlan.recommendation, generated_at: plan.generatedAt } }, updated_at: generatedAt,
      };
    });
    const { data: savedDays, error: dayError } = await supabase.from("flow_days").upsert(dayRows, { onConflict: "user_id,day" }).select();
    if (dayError) {
      if (insertedItems.length) await supabase.from("flow_items").delete().eq("user_id", user.id).in("id", insertedItems.map((item) => item.id));
      throw dayError;
    }
    if (previousGeneratedIds.length) {
      const { error: archiveError } = await supabase.from("flow_items").update({ status: "archived", updated_at: generatedAt }).eq("user_id", user.id).in("id", previousGeneratedIds);
      if (archiveError) throw archiveError;
    }
    const appliedPlan = { ...plan, appliedAt: generatedAt };
    const { error: weekError } = await supabase.from("weeks").update({ metadata: { ...weekMetadata, ai_week_plan: appliedPlan } as unknown as Json, status: "published", updated_at: generatedAt }).eq("id", week.id).eq("user_id", user.id);
    if (weekError) throw weekError;
    return Response.json({ plan: appliedPlan, items: insertedItems, days: savedDays });
  } catch (error) {
    console.error("Flowboard weekly plan failed", error);
    return Response.json({ error: "The weekly plan could not be completed. Check the AI connection and try again." }, { status: 503 });
  }
}
