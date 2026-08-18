# Deploy Hyprfy Flowboard 0.9.4

This ZIP is a **full clean application**, not a patch.

## Important
Do NOT upload these files on top of the current mixed repository.

The current repository contains both a root `app/` application and a `src/app/`
application from different builds. That caused the Vercel module-resolution errors.

## Replace the repository with this application
Keep the repository itself, but remove the existing application files/folders first,
then upload the contents of this ZIP.

The final repo root should contain:

- app/
- components/
- lib/
- .env.example
- .gitignore
- .nvmrc
- next-env.d.ts
- next.config.ts
- package.json
- README.md
- tsconfig.json
- DEPLOY.md

It should NOT contain:
- src/
- package-lock.json from the previous build
- duplicate root page/layout files outside app/
- the previous `FlowboardApp.tsx` at repository root

## Vercel
The Vercel project should use:
- Framework: Next.js
- Root Directory: repository root
- Build Command: npm run build
- Install Command: npm install
- Node.js: 22.x

Add these Vercel environment variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Then deploy from `main`.

## What is included
- rolling seven-day Flowboard
- Today navigation / previous / next week
- editable day context
- What's Happening
- Main Focus
- Story Opportunity
- Ideas / Script / Capture / Edit / Publish
- quick add
- drag cards between dates
- move cards between sections
- reorder cards
- Inbox for unscheduled items
- Supabase persistence
- existing Supabase authentication session support
