# Hyprfy Flowboard

Hyprfy Flowboard is a standalone, date-first planning workspace. It brings daily context and content work together across a rolling 7- or 14-day view.

## Local setup

1. Copy `.env.example` to `.env.local` and add your Flowboard Supabase project URL and publishable key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

The app uses Supabase Auth and the existing `flow_days`, `flow_items`, and `flow_projects` tables. All browser data access runs as the authenticated user and is protected by the project's existing RLS policies.

## v0.6 behaviour

- Dashboard opens by default with the week's To-Do list, completion summary, workload, planned content, and seven-day overview
- Persistent Brand Profile covering mission, audience, voice, objectives, content pillars, selected channels, and platform strategy
- Recurring Weekly Brief covering the real-life story, business focus, production capacity, audience questions, and reflection prompts
- Brand Profile and Weekly Brief context automatically informs AI-generated daily plans
- Social channel overview combines planned Flowboard content with live Instagram and Facebook performance from Meta
- Seven-day growth comparisons, daily interaction trends, and publishing-volume changes against the previous seven days
- Switchable 7- and 14-day rolling views with matching date navigation
- Editable day theme, context, focus, story opportunity, and notes
- Quick-add sections for Idea, Script, Capture, Edit, and Publish
- Drag-and-drop rescheduling and within-section ordering
- Inbox capture for unscheduled items, with drag-to-schedule
- Card editing for title, description, stage, status, priority, duration, and scheduled day
- Per-card channel planning for Instagram, TikTok, LinkedIn, YouTube, Facebook, X, newsletters, and blogs
- First-class Hook and Social Copy fields on every content card, saved with the card metadata
- AI-generated daily social plans based on theme, context, focus, story opportunity, and notes
- Publish-ready AI copy with X / Twitter treated as a priority launch and distribution channel
- Clear recommendations to post today, bank the story for the weekly vlog, or do both
- Generated content workflow cards and a dedicated To-Do section
- Card deletion with an explicit confirmation step
- Optimistic updates with persisted `day`, `item_type`, and `sort_order`

AI planning uses Vercel AI Gateway. Enable AI Gateway for the Vercel project; deployed functions use Vercel OIDC automatically. For non-Vercel environments, set `AI_GATEWAY_API_KEY`.

## Meta statistics

Set `META_ACCESS_TOKEN` as a server-only Vercel environment variable. The app can discover the accessible Facebook Page and its linked Instagram professional account automatically. For Meta accounts with multiple Pages, also set `META_FACEBOOK_PAGE_ID`; `META_INSTAGRAM_ACCOUNT_ID` is available as an explicit fallback. Keep the Graph API version in `META_GRAPH_API_VERSION` so it can be upgraded independently of application code.

The token needs access to the Page plus Instagram basic and insights permissions. Meta credentials are only read by the authenticated `/api/social-stats` route and are never exposed through `NEXT_PUBLIC_` variables.
