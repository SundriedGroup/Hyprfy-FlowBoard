# Hyprfy Flowboard

The date-first planning surface for Hyprfy LifeOS. Flowboard shows a rolling seven-day workspace where daily context and content work can be planned together.

## Local setup

1. Copy `.env.example` to `.env.local` and add the existing `Hyprfy-lifeOS` project URL and publishable key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

The app uses Supabase Auth and the existing `flow_days`, `flow_items`, and `flow_projects` tables. All browser data access runs as the authenticated user and is protected by the project's existing RLS policies.

## V1 behaviour

- Seven rolling date columns starting today, with seven-day navigation
- Editable day theme, context, focus, story opportunity, and notes
- Quick-add sections for Idea, Script, Capture, Edit, and Publish
- Drag-and-drop rescheduling and within-section ordering
- Inbox capture for unscheduled items, with drag-to-schedule
- Optimistic updates with persisted `day`, `item_type`, and `sort_order`
