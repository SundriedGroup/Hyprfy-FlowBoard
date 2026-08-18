# Hyprfy Flowboard v0.11.0

Visible verification: `BUILD v0.11.0`.

## New: Calendar
- Month view of day context and scheduled content.
- Channel colours carry through.
- Project colour dot on calendar content.
- Click a date to jump directly into that day in Flowboard.
- Click a content item to open its script/copy drawer.

## New: Projects
Projects answer: **What am I building over time?**
- Name
- Goal / outcome
- Target date
- Colour
- Notes
- Linked scheduled content
- Linked unscheduled content
- Linked ideas
- Timeline view inside project
- Project assignment available when creating/editing content and ideas

## Supabase
Run `supabase/projects-v0.11.sql` once.
This adds `goal`, `target_date`, and `notes` to the existing `flow_projects` table.

For idea cover uploads, also run `supabase/idea-covers-storage.sql` if you have not already.
