insert into storage.buckets (id, name, public)
values ('flowboard-idea-covers', 'flowboard-idea-covers', true)
on conflict (id) do update set public = true;

create policy "Users can upload their own idea covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'flowboard-idea-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Public can view idea covers"
on storage.objects
for select
to public
using (bucket_id = 'flowboard-idea-covers');
