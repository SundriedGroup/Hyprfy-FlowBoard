# Hyprfy Flowboard v0.9.9

Visible verification: `BUILD v0.9.9`.

## 0.9.9 — Rich link previews in Ideas
When you save a reference URL, Flowboard now attempts to fetch:
- preview image
- page/post title
- description
- source domain

The preview is shown directly on the Ideas card and inside the Idea drawer.

If a site blocks metadata access, Flowboard gracefully falls back to the domain/reference link.
No Supabase migration required; preview metadata is stored in `flow_items.metadata`.
