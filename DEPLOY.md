# Deploy v0.11.0

1. Run Supabase migration:
   `supabase/projects-v0.11.sql`

2. If idea cover uploads are not working yet, also run:
   `supabase/idea-covers-storage.sql`

3. Upload/replace the application files.

4. Confirm the app header says:
   `BUILD v0.11.0`

No old `src/` folder or stale `package-lock.json` should be restored.
