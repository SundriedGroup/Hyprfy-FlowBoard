# Deploy v0.9.5

The top-right of the app MUST show `BUILD v0.9.5`.

Replace the old app instead of overlaying stale files.
Delete any old `src/` folder, stale `package-lock.json`, and duplicate root page/layout/component files.

Required Vercel env vars:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
