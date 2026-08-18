# Hyprfy Flowboard v0.10.0

Visible verification: `BUILD v0.10.0`.

## 0.10.0
- Reference links are now directly clickable from the Ideas grid.
- Idea drawer has an obvious `Open original reference ↗` button.
- Instagram links get a branded fallback preview when Instagram blocks metadata.
- Manual cover image URL supported.
- Optional cover upload supported via Supabase Storage bucket `flowboard-idea-covers`.
- Uploaded/manual cover takes priority over scraped preview image.

## Storage setup
Run `supabase/idea-covers-storage.sql` once if you want file uploads.
If you do not run it, the app still works and you can paste a cover image URL.
