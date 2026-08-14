# Hyprfy Flowboard

Hyprfy Flowboard is a standalone, date-first planning workspace. It brings daily context and content work together across a rolling 7- or 14-day view.

## Local setup

1. Copy `.env.example` to `.env.local` and add your Flowboard Supabase project URL and publishable key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

The app uses Supabase Auth and the existing `flow_days`, `flow_items`, and `flow_projects` tables. All browser data access runs as the authenticated user and is protected by the project's existing RLS policies.

## v0.9.1 behaviour

- Manual-first daily planning: create your own cards without daily AI generation
- Simplified day context with only Topic and What’s happening
- One platform per content card, with clear platform colour coding on the board
- Every post requires one platform and contains Post Title, Script, Post Copy, and Capture fields
- Add as many posts as required to any day or workflow stage
- Dashboard readiness summaries replace the previous To-Do list
- Adding a card opens its editor immediately so it can be completed in one flow

- Dashboard opens by default with content readiness, planned posts, the seven-day overview, and channel performance
- Persistent Brand Profile covering mission, audience, voice, objectives, content pillars, selected channels, and platform strategy
- Database-driven Channel Profiles directory showing every supported platform, its saved role, cadence, formats, tone, CTA, linked pillars, planned content, and connected performance
- Social channel overview combines planned Flowboard content with live Instagram and Facebook performance from Meta
- Seven-day growth comparisons, daily interaction trends, and publishing-volume changes against the previous seven days
- Switchable 7- and 14-day rolling views with matching date navigation
- Editable day theme, context, focus, story opportunity, and notes
- Quick-add sections for Idea, Script, Capture, Edit, and Publish
- Drag-and-drop rescheduling and within-section ordering
- Inbox capture for unscheduled items, with drag-to-schedule
- Card editing for title, description, stage, status, priority, duration, and scheduled day
- Per-card channel planning for Instagram, TikTok, LinkedIn, YouTube, Facebook, X, Substack, and blogs
- First-class Hook and Social Copy fields on every content card, saved with the card metadata
- Card deletion with an explicit confirmation step
- Optimistic updates with persisted `day`, `item_type`, and `sort_order`

## Meta statistics

Set `META_ACCESS_TOKEN` as a server-only Vercel environment variable. The app can discover the accessible Facebook Page and its linked Instagram professional account automatically. For Meta accounts with multiple Pages, also set `META_FACEBOOK_PAGE_ID`; `META_INSTAGRAM_ACCOUNT_ID` is available as an explicit fallback. Keep the Graph API version in `META_GRAPH_API_VERSION` so it can be upgraded independently of application code.

The token needs access to the Page plus Instagram basic and insights permissions. Meta credentials are only read by the authenticated `/api/social-stats` route and are never exposed through `NEXT_PUBLIC_` variables.
