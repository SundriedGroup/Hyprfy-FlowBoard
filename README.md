# Hyprfy Flowboard v0.9.4

A date-first planning surface for **Hyprfy LifeOS**.

Traditional Kanban boards organize work by status. Flowboard organizes work by **calendar day**. Each column is a day, each day carries real-world context, and work/content cards live underneath that context.

## What is in this revision

- Rolling 7-day horizontal board starting from the selected anchor date
- Today highlighting and previous / today / next navigation
- Existing Supabase authentication with password or magic link
- Editable daily context:
  - What's happening
  - Main focus (`main_outcome` in the database)
  - Story opportunity
- Sections inside each day:
  - Ideas
  - Script
  - Capture
  - Edit
  - Publish
- Quick-add cards inside each section
- Drag a card between dates to reschedule it
- Drag a card between sections to change its `item_type`
- Drag before another card to reorder using `sort_order`
- Mark cards done / open
- Archive cards
- Inbox for unscheduled (`day = null`) items
- Reads existing `flow_projects` and displays project tags on linked items
- Responsive, calm LifeOS-style interface

## Existing backend

This app is designed for the existing Supabase project:

**Hyprfy-lifeOS**

Project URL is already included in `.env.example`.

It expects the existing tables:

- `flow_days`
- `flow_items`
- `flow_projects`

The app also respects the existing optional links from `flow_items` to:

- `moments`
- `content_items`
- `episodes`

Row Level Security remains the source of truth for user ownership. Never expose a Supabase service-role key in this app.

## Setup

1. Copy the environment file:

   ```bash
   cp .env.example .env.local
   ```

2. In Supabase, copy the project's **publishable key** and add it to `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run locally:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000` and sign in with the existing Hyprfy account.

## Core data mapping

### `flow_days`

The interface uses:

- `day`
- `whats_happening`
- `main_outcome`
- `story_opportunity`
- `theme` (supported by schema, not shown in the compact V1 UI yet)
- `notes` (supported by schema, not shown in the compact V1 UI yet)
- `capacity_minutes` (supported by schema, reserved for future capacity view)

### `flow_items`

The interface uses:

- `day`
- `item_type`
- `title`
- `status`
- `sort_order`
- `project_id`
- `start_time`
- `duration_minutes`

Supported item types in the database are:

`task`, `idea`, `script`, `capture`, `edit`, `publish`, `event`, `note`.

The main Flowboard exposes the five content-creation sections. Inbox defaults new captures to `idea`.

## V1 success test

1. Sign in.
2. Open Flowboard.
3. Edit Monday's "What's happening" field and click elsewhere.
4. Refresh — the context should persist.
5. Add `Record Monday Mission` under Capture.
6. Drag it to Tuesday Capture.
7. Refresh — it should remain on Tuesday.
8. Add an item from Inbox.
9. Return to Flowboard and drag it into a day's section.
10. Refresh — it should now be scheduled on that date.

## Intentionally not built yet

- Month calendar
- 14/30-day density modes
- Project management screen
- Rich card drawer/editor
- Google/Apple Calendar import
- AI planning or story recommendations
- Publishing integrations
- Team collaboration

Those should come after the date-first interaction is proven.


## Clean build note

Version 0.9.4 is packaged as a single root Next.js app to avoid the duplicate `app/` + `src/app/` deployment conflict.


## v0.9.4 interaction update

The fixed Ideas / Script / Capture / Edit / Publish sections have been removed. Each day now contains a single Content area with flexible content blocks. A block is created with Title, Channel and Plan. Clicking the block opens a detail drawer containing Title, Channel, Plan and Script / Post Copy. Block detail is persisted in `flow_items.metadata`, so no database migration is required.
