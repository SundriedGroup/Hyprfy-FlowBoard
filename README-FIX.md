# Hyprfy Flowboard — Vercel build repair

This is a **repair patch**, not a full app replacement.

The repository currently mixes two versions:
- the newer 0.9.1 `src/` application and its package-lock
- an older 0.2.0 `package.json` / root-app configuration

That mismatch breaks Vercel.

## Apply this patch

1. Replace the repository root `package.json` with the one in this ZIP.
2. Replace the repository root `tsconfig.json` with the one in this ZIP.
3. **Delete the existing `package-lock.json` from the repository.**
   It identifies itself as 0.9.1 and was generated from a different package manifest.
4. Keep the existing `src/` folder, including:
   - `src/lib/supabase/server.ts`
   - `src/lib/supabase/client.ts`
   - `src/lib/supabase/proxy.ts`
5. Keep `eslint.config.mjs`.
6. Push/commit to `main`.
7. Vercel will regenerate a clean dependency install from this package.json and redeploy.

## Why this fixes the current error

The failed Vercel build resolves `@/lib/supabase/server` from the repo root.
The real file lives at `src/lib/supabase/server.ts`.

The patched tsconfig maps:
`@/*` -> `./src/*`

The failed build also used a 0.2.0 package manifest that omitted dependencies
required by the newer src application. The patched package.json restores the
dependency set represented by the existing 0.9.1 lockfile and advances the
app version to 0.9.2.

## Vercel environment variables

Make sure these exist in the Vercel project:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Do not add a Supabase service-role key to the browser environment.
