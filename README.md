# Hyprfy Flowboard

Hyprfy Flowboard is a standalone, date-first planning workspace. It brings daily context and content work together across a rolling 7- or 14-day view.

## Local setup

1. Copy `.env.example` to `.env.local` and add your Flowboard Supabase project URL and publishable key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

The app uses Supabase Auth and the existing `flow_days`, `flow_items`, and `flow_projects` tables. All browser data access runs as the authenticated user and is protected by the project's existing RLS policies.

## v0.3 behaviour

- Switchable 7- and 14-day rolling views with matching date navigation
- Editable day theme, context, focus, story opportunity, and notes
- Quick-add sections for Idea, Script, Capture, Edit, and Publish
- Drag-and-drop rescheduling and within-section ordering
- Inbox capture for unscheduled items, with drag-to-schedule
- Card editing for title, description, stage, status, priority, duration, and scheduled day
- Per-card channel planning for Instagram, TikTok, LinkedIn, YouTube, Facebook, X, newsletters, and blogs
- AI-generated daily social plans based on theme, context, focus, story opportunity, and notes
- Clear recommendations to post today, bank the story for the weekly vlog, or do both
- Generated content workflow cards and a dedicated To-Do section
- Card deletion with an explicit confirmation step
- Optimistic updates with persisted `day`, `item_type`, and `sort_order`

AI planning uses Vercel AI Gateway. Enable AI Gateway for the Vercel project; deployed functions use Vercel OIDC automatically. For non-Vercel environments, set `AI_GATEWAY_API_KEY`.
