import { generateText, gateway, Output } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const requestSchema = z.object({
  day: z.string().date(),
  theme: z.string().max(500).default(""),
  whatsHappening: z.string().max(2000).default(""),
  mainFocus: z.string().max(1000).default(""),
  storyOpportunity: z.string().max(2000).default(""),
  notes: z.string().max(3000).default(""),
});

const channelSchema = z.enum(["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "X", "Newsletter", "Blog"]);
const planSchema = z.object({
  decision: z.enum(["post_today", "bank_for_weekly_vlog", "post_and_bank"]).describe("Whether the moment should become a post today, be banked for the weekly vlog, or do both."),
  headline: z.string().min(1).max(120).describe("A concise editorial direction for the day."),
  rationale: z.string().min(1).max(600).describe("Why this decision makes strategic sense based only on the supplied day context."),
  channels: z.array(channelSchema).min(1).max(4),
  channelPlan: z.string().min(1).max(1200).describe("How the core story should be adapted across the selected channels."),
  contentItems: z.array(z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
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
    const result = await generateText({
      model: gateway("openai/gpt-5.4-mini"),
      providerOptions: { gateway: { user: user.id, tags: ["feature:flowboard-plan"] } },
      output: Output.object({ name: "FlowboardSocialPlan", description: "An actionable social media plan for one day.", schema: planSchema }),
      system: "You are the editorial strategist inside Hyprfy Flowboard. Turn real-life context into a focused social plan. Do not invent events or claims. Prefer documenting what is genuinely happening over manufacturing content. Decide whether the story is strong enough to post today, should be captured and banked for a weekly vlog, or supports both. Produce only practical work that can be completed by one creator.",
      prompt: `Create a social media plan from this day context:\n${JSON.stringify(context, null, 2)}`,
    });
    const plan = result.output;
    const generatedAt = new Date().toISOString();
    const rows = [
      ...plan.contentItems.map((entry, index) => ({ user_id: user.id, day: context.day, item_type: entry.stage, title: entry.title, description: entry.description, status: "open", duration_minutes: entry.durationMinutes, sort_order: 100000 + ((index + 1) * 1024), metadata: { ai_generated: true, generated_at: generatedAt, recommendation: plan.decision, channels: entry.channels, channel_plan: plan.channelPlan } })),
      ...plan.todoItems.map((entry, index) => ({ user_id: user.id, day: context.day, item_type: "task", title: entry.title, description: entry.description, status: "open", duration_minutes: entry.durationMinutes, sort_order: 100000 + ((index + 1) * 1024), metadata: { ai_generated: true, generated_at: generatedAt, recommendation: plan.decision } })),
    ];

    const { data: existingDay, error: existingDayError } = await supabase.from("flow_days").select("*").eq("user_id", user.id).eq("day", context.day).maybeSingle();
    if (existingDayError) throw existingDayError;
    const { data: generatedItems, error: insertError } = await supabase.from("flow_items").insert(rows).select();
    if (insertError) throw insertError;

    const dayPatch = { metadata: { ...metadataObject(existingDay?.metadata ?? {}), ai_plan: { decision: plan.decision, headline: plan.headline, rationale: plan.rationale, channels: plan.channels, channel_plan: plan.channelPlan, generated_at: generatedAt } }, updated_at: generatedAt };
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
