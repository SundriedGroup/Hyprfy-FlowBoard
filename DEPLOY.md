# Deploy v0.9.6

After upload, the page header must show:

BUILD v0.9.6

If it does not, Vercel is serving an older build.

Do not restore any old `src/` folder or stale `package-lock.json`.
Required Vercel env vars:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
