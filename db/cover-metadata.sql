-- Cover art + basic game metadata for saved chats, plus a Storage bucket for
-- user-uploaded covers. Run once in the Supabase SQL editor.
-- Until this is applied, saving still works but covers/year are dropped.

-- 1. Metadata columns on the existing chats table.
alter table public.chats
  add column if not exists cover_url text not null default '',
  add column if not exists release_year text not null default '';

-- 2. Public bucket for device-uploaded covers (images are non-sensitive box art).
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- 3. RLS on storage.objects: a user may write/replace/delete only under their own
--    uid() prefix (path = "<uid>/<file>"); anyone may read (bucket is public).
create policy "covers read"
  on storage.objects for select
  using ( bucket_id = 'covers' );

create policy "covers insert own"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "covers update own"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "covers delete own"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text );
