# Deploy v0.10.0

The app header must show:

BUILD v0.10.0

No flow_items schema migration is required.

For optional image uploads, create the public Supabase Storage bucket and policies using:

supabase/idea-covers-storage.sql

Without the bucket, clickable references and cover image URLs still work.
