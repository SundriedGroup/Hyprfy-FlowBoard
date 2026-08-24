import { generateText, gateway, Output } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { activeChannelNames, buildBrandContext } from "@/lib/brand-context";
import type { Json } from "@/types/database";

const requestSchema = z.object({
  day: z.string().date(),
  theme: z.string().max(500).default(""),
  whatsHappening: z.string().max(2000).default(""),
  mainFocus: z.string().max(1000).default(""),
  storyOpportunity: z.string().max(2000).default(""),
  notes: z.string().max(3000).default(""),
});

const channelSchema = z.enum(["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "X", "Substack", "Blog"]);
const brandDirectionSchema = z.object({
  missionAnchor: z.string().min(1).max(300).describe("The specific mission or positioning idea from the saved Brand Profile that anchors this plan."),
  audienceFocus: z.string().min(1).max(300).describe("The named audience segment and need this plan serves."),
  strategicObjective: z.string().min(1).max(300).describe("How this plan advances the creator's saved brand objective."),
  voiceDirection: z.string().min(1).max(300).describe("The saved voice traits and writing constraints that should shape the output."),
});
const planSchema = z.object({
  decision: z.enum(["post_today", "bank_for_weekly_vlog", "post_and_bank"]).describe("Whether the moment should become a post today, be banked for the weekly vlog, or do both."),
  headline: z.string().min(1).max(120).describe("A concise editorial direction for the day."),
  rationale: z.string().min(1).max(600).describe("Why this decision makes strategic sense based only on the supplied day context."),
  channels: z.array(channelSchema).min(1).max(4),
  channelPlan: z.string().min(1).max(1200).describe("How the core story should be adapted across the selected channels."),
  brandDirection: brandDirectionSchema,
  contentItems: z.array(z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
    hook: z.string().min(1).max(220).describe("A specific opening line that earns attention without clickbait."),
    socialCopy: z.string().min(1).max(2200).describe("Publish-ready social copy, not a note about what the creator should write."),
    contentPillar: z.string().min(1).max(100).describe("The exact name of one saved content pillar this item belongs to."),
    brandFit: z.string().min(1).max(400).describe("A concrete explanation of how this idea expresses the creator's mission, positioning, beliefs, or lived credibility."),
    audienceValue: z.string().min(1).max(400).describe("The specific value this item gives the saved target audience."),
    channelRationale: z.string().min(1).max(400).describe("Why these selected active channels and formats fit this idea and the saved channel strategy."),
    stage: z.enum(["idea", "script", "capture", "edit", "publish"]),
    durationMinutes: z.number().int().min(5).max(240),
    channels: z.array(channelSchema).min(1).max(4),
  })).min(2).max(6),
  todoItems: z.array(z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    durationMinutes: z.number().int().min(5).max(240),
  })).min(2).max(6),
});

function metadataObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function weekStartFor(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return date.toISOString().slice(0, 10);
}

function normalizePlan(plan: z.infer<typeof planSchema>, enabled: string[]) {
  const allowed = new Set(enabled.length ? enabled : channelSchema.options);
  const fallback = enabled[0] ?? "X";
  const normalize = (channels: z.infer<typeof channelSchema>[]) => {
    const selected = channels.filter((channel) => allowed.has(channel));
    return selected.length ? selected : [fallback as z.infer<typeof channelSchema>];
  };
  const contentItems = plan.contentItems.map((item) => ({ ...item, channels: normalize(item.channels) }));
  return { ...plan, channels: normalize(plan.channels), contentItems };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Add valid day context before generating a plan." }, { status: 400 });

  const context = parsed.data;
  if (![context.theme, context.whatsHappening, context.mainFocus, context.storyOpportunity, context.notes].some((value) => value.trim())) {
    return Response.json({ error: "Add at least one piece of day context before generating a plan." }, { status: 400 });
  }

  try {
    const [profileResult, weekResult] = await Promise.all([
      supabase.from("profiles").select("display_name,positioning,personal_narrative,content_philosophy,brand_brain").eq("user_id", user.id).maybeSingle(),
      supabase.from("weeks").select("title,theme,metadata").eq("user_id", user.id).eq("start_date", weekStartFor(context.day)).maybeSingle(),
    ]);
    if (profileResult.error || weekResult.error) throw profileResult.error ?? weekResult.error;
    const brandContext = buildBrandContext(profileResult.data ?? null);
    const enabledChannels = activeChannelNames(brandContext);
    const strategicContext = { brandOperatingBrief: brandContext, weeklyBrief: weekResult.data ?? null };
    const result = await generateText({
      model: gateway("openai/gpt-5.4-mini"),
      providerOptions: { gateway: { user: user.id, tags: ["feature:flowboard-plan"] } },
      output: Output.object({ name: "FlowboardSocialPlan", description: "An actionable social media plan for one day.", schema: planSchema }),
      system: "You are the personal brand strategist and copywriter inside Hyprfy Flowboard. The BRAND OPERATING BRIEF is the durable strategy: it controls positioning, mission, audience, voice, objectives, boundaries, content pillars and channel roles. The WEEKLY BRIEF and DAY CONTEXT are raw material and production constraints, not a substitute for the brand. Make the connection explicit. Every content item must use the exact name of one saved content pillar and explain its brand fit, audience value and channel rationale. Do not merely name-drop the mission or pillar: the idea, hook and finished copy must embody them. If day context is weak, recommend capture or banking rather than manufacture a post. Never reveal private boundaries or personal data unless the day context explicitly makes it public. Do not invent events, achievements or claims. Use only active channels and respect each channel's saved purpose, cadence, formats, tone and CTA. Every content item needs a specific hook and publish-ready social copy—not instructions or placeholders. When X is active and appropriate, use it as a concise, conversational idea-testing layer without engagement bait. Fit the work to the creator's capacity and keep it executable by one person.",
      prompt: `Create a social media plan from the strategic and day context below. Empty fields are unknown and must not be guessed.\n\nSTRATEGIC CONTEXT\n${JSON.stringify(strategicContext, null, 2)}\n\nDAY CONTEXT\n${JSON.stringify(context, null, 2)}`,
    });
    const plan = normalizePlan(result.output, enabledChannels);
    const generatedAt = new Date().toISOString();
    const rows = [
      ...plan.contentItems.map((entry, index) => ({ user_id: user.id, day: context.day, item_type: entry.stage, title: entry.title, description: entry.description, status: "open", duration_minutes: entry.durationMinutes, sort_order: 100000 + ((index + 1) * 1024), metadata: { ai_generated: true, generated_at: generatedAt, recommendation: plan.decision, channels: entry.channels, channel_plan: plan.channelPlan, hook: entry.hook, social_copy: entry.socialCopy, content_pillar: entry.contentPillar, brand_fit: entry.brandFit, audience_value: entry.audienceValue, channel_rationale: entry.channelRationale } })),
      ...plan.todoItems.map((entry, index) => ({ user_id: user.id, day: context.day, item_type: "task", title: entry.title, description: entry.description, status: "open", duration_minutes: entry.durationMinutes, sort_order: 100000 + ((index + 1) * 1024), metadata: { ai_generated: true, generated_at: generatedAt, recommendation: plan.decision } })),
    ];

    const { data: existingDay, error: existingDayError } = await supabase.from("flow_days").select("*").eq("user_id", user.id).eq("day", context.day).maybeSingle();
    if (existingDayError) throw existingDayError;
    const { data: generatedItems, error: insertError } = await supabase.from("flow_items").insert(rows).select();
    if (insertError) throw insertError;

    const dayPatch = { metadata: { ...metadataObject(existingDay?.metadata ?? {}), ai_plan: { decision: plan.decision, headline: plan.headline, rationale: plan.rationale, channels: plan.channels, channel_plan: plan.channelPlan, brand_direction: plan.brandDirection, generated_at: generatedAt } }, updated_at: generatedAt };
    const dayResult = existingDay
      ? await supabase.from("flow_days").update(dayPatch).eq("user_id", user.id).eq("day", context.day).select().single()
      : await supabase.from("flow_days").insert({ user_id: user.id, day: context.day, ...dayPatch }).select().single();
    const { data: savedDay, error: dayError } = dayResult;
    if (dayError) {
      await supabase.from("flow_items").delete().eq("user_id", user.id).in("id", generatedItems.map((item) => item.id));
      throw dayError;
    }

    return Response.json({ plan, items: generatedItems, day: savedDay });
  } catch (error) {
    console.error("Flowboard plan generation failed", error);
    return Response.json({ error: "AI planning is unavailable. Check that Vercel AI Gateway is enabled for this project." }, { status: 503 });
  }
}
