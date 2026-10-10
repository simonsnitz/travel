-- =============================================================================
-- Travel blog: database setup for Supabase
--
-- How to use it
--   Open the SQL Editor in the Supabase dashboard, paste this whole file, and
--   run it. It is safe to run again at any time: nothing that already exists is
--   duplicated, and no trips, days or photos are removed.
--
--   Supabase asks for confirmation first, because the file contains "drop"
--   statements. They only remove the access rules and the trigger that this
--   same file creates again a line later. Choose "Run query".
--
--   When it has finished, the results panel shows one row that says which
--   login is allowed to edit the site. Check that it is yours.
--
-- What it sets up
--   1. admins    the list of logins that may edit (normally one: the owner)
--   2. trips     one row per trip
--   3. days      one row per day of a trip, holding its text, photos and videos
--   4. access    everyone may read, only an admin may write
--   5. media     the storage bucket for photos and video clips
--   6. the first trip
--   7. the admin (your login, as long as it is the only one in the project)
--
-- A note for anyone editing this file: keep semicolons and quote marks out of
-- the comments. The dashboard scans the text before running it and can be
-- confused by them.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who may edit
-- -----------------------------------------------------------------------------

-- Each row names one login (from Authentication > Users) that may edit.
-- If that login is deleted, its row here is removed along with it.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Row level security is switched on and no rule lets anybody in, so the website
-- can neither read nor change this list, whoever is signed in. It can only be
-- edited from this dashboard. The table privileges are taken away as well, as a
-- second lock on the same door.
-- The dashboard may point out that this table has security enabled but no
-- policies. That is intended.
alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;

-- Answers one question: is the person making this request an admin?
--
-- "security definer" lets the function look at the admins list on behalf of a
-- visitor who is not allowed to read that list. That is safe here because the
-- function takes no input and only ever answers about the caller, so it cannot
-- be used to find out who the admins are.
--
-- The empty search_path, together with spelling out every name in full, stops
-- the function from being pointed at a look-alike table or function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid())
  );
$$;

-- "anon" is a visitor who is not signed in and "authenticated" is one who is.
-- Both need to be able to ask the question, because the access rules below ask
-- it on their behalf.
grant execute on function public.is_admin() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Trips
-- -----------------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  -- The part of the web address that names the trip, such as india-nepal.
  -- Lowercase letters and digits, in groups joined by single hyphens.
  slug text not null unique
    constraint trips_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  start_date date not null,
  end_date date not null,
  -- The cover photo, stored as a small description of the file (where it is
  -- and how large it is), or empty when the trip has no cover yet.
  cover jsonb,
  created_at timestamptz not null default now(),
  constraint trips_dates_in_order check (end_date >= start_date)
);


-- -----------------------------------------------------------------------------
-- 3. Days
-- -----------------------------------------------------------------------------

create table if not exists public.days (
  -- Deleting a trip deletes its days with it.
  trip_id uuid not null references public.trips (id) on delete cascade,
  date date not null,
  location text not null default '',
  -- The content of the day in order: paragraphs, groups of photos, videos.
  blocks jsonb not null default '[]'::jsonb,
  -- A day stays hidden from visitors until this is true.
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  -- A trip has at most one entry per date.
  primary key (trip_id, date)
);

-- Stamps every saved day with the time of the save. The database sets the time
-- itself rather than trusting the clock of whichever device did the saving.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists days_set_updated_at on public.days;
create trigger days_set_updated_at
  before insert or update on public.days
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. Who may read and write trips and days
-- -----------------------------------------------------------------------------

-- A request has to pass two checks. First the table privileges, which say what
-- kind of request a visitor may make at all. Then row level security, which
-- says which rows that request may touch.

-- Privileges are set out in full here instead of relying on what Supabase
-- grants by default, because that default differs between projects. Visitors
-- may only read. Signed-in users may also ask to write, and the rules further
-- down then turn away everyone who is not an admin.
grant usage on schema public to anon, authenticated;
revoke all on table public.trips, public.days from public, anon, authenticated;
grant select on table public.trips, public.days to anon, authenticated;
grant insert, update, delete on table public.trips, public.days to authenticated;

alter table public.trips enable row level security;
alter table public.days enable row level security;

-- The rules are removed and created again so that running this file a second
-- time brings them back to exactly what is written here.
--
-- In each rule, is_admin() is wrapped in "(select ...)" so that the database
-- works out the answer once per request instead of once per row.

drop policy if exists "Anyone can read trips" on public.trips;
create policy "Anyone can read trips" on public.trips
  for select to anon, authenticated
  using (true);

drop policy if exists "Admins can add trips" on public.trips;
create policy "Admins can add trips" on public.trips
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can change trips" on public.trips;
create policy "Admins can change trips" on public.trips
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can remove trips" on public.trips;
create policy "Admins can remove trips" on public.trips
  for delete to authenticated
  using ((select public.is_admin()));

-- Visitors see a day only once it is published. An admin sees drafts too.
drop policy if exists "Anyone can read published days" on public.days;
create policy "Anyone can read published days" on public.days
  for select to anon, authenticated
  using (published or (select public.is_admin()));

drop policy if exists "Admins can add days" on public.days;
create policy "Admins can add days" on public.days
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can change days" on public.days;
create policy "Admins can change days" on public.days
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can remove days" on public.days;
create policy "Admins can remove days" on public.days
  for delete to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 5. Photos and videos
-- -----------------------------------------------------------------------------

-- One bucket (a top-level folder in Supabase Storage) holds every photo and
-- clip. It is public, which means a file can be viewed by anyone who has its
-- address. That is what lets the site show pictures to visitors. It does not
-- let visitors upload, replace, delete or even list files: the rules below
-- reserve all of that for an admin.
--
-- The bucket also refuses anything larger than 50 MB (the most the free plan
-- accepts) and anything that is not one of the listed kinds of image or video.
-- Running this file again puts those three settings back if they were changed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Viewing a file through its public address needs no rule. The "see" rule is
-- there because the site has to list the files of a day in order to delete them.
drop policy if exists "Travel blog: admins can see media files" on storage.objects;
create policy "Travel blog: admins can see media files" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

drop policy if exists "Travel blog: admins can upload media files" on storage.objects;
create policy "Travel blog: admins can upload media files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));

drop policy if exists "Travel blog: admins can replace media files" on storage.objects;
create policy "Travel blog: admins can replace media files" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));

drop policy if exists "Travel blog: admins can remove media files" on storage.objects;
create policy "Travel blog: admins can remove media files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 6. The first trip
-- -----------------------------------------------------------------------------

-- Added only while there are no trips at all, so that running this file again
-- after renaming or deleting the trip does not bring it back.
insert into public.trips (slug, title, start_date, end_date)
select 'india-nepal', 'India & Nepal', date '2026-10-07', date '2026-11-12'
where not exists (select 1 from public.trips)
on conflict (slug) do nothing;


-- -----------------------------------------------------------------------------
-- 7. The admin
-- -----------------------------------------------------------------------------

-- While the admins list is empty, the one login in the project is put on it.
-- Create your own login before running this file and that login is yours.
-- If there is no login yet, nothing happens here: add one under
-- Authentication > Users and run the file again.
--
-- If the project holds more than one login, nobody is put on the list. The
-- script will not guess which login is the owner, because a wrong guess would
-- hand the whole site to a stranger. Delete the logins that are not yours and
-- run the file again.
--
-- This happens only when somebody runs this file in the SQL Editor, which only
-- the owner of the Supabase project can do. Nothing in the database promotes
-- anyone when a new account is created, and once the list has a row this step
-- does nothing at all.
do $$
declare
  confirmed_logins integer;
begin
  if exists (select 1 from public.admins) then
    return;
  end if;

  -- Only a login that can actually be signed in to counts: one with an email
  -- address that has been confirmed. A login made in the dashboard with
  -- "Auto confirm user" ticked is confirmed from the start. An account that a
  -- stranger registered under an address they do not own is not.
  select count(*) into confirmed_logins
  from auth.users
  where email is not null
    and email_confirmed_at is not null;

  if confirmed_logins = 0 then
    raise notice 'No confirmed login exists yet. Add yours under Authentication > Users, then run this script again.';
  elsif confirmed_logins > 1 then
    raise notice 'This project has more than one login, so nobody was made the admin. Delete the logins that are not yours under Authentication > Users, then run this script again.';
  else
    insert into public.admins (user_id)
    select id
    from auth.users
    where email is not null
      and email_confirmed_at is not null;
    raise notice 'Your login is now the admin. Check the email address shown in the results.';
  end if;
end
$$;

-- Asks the part of Supabase that serves the database to the website to take
-- note of the new tables now. It normally notices by itself within moments.
-- This only makes sure of it.
notify pgrst, 'reload schema';

-- The row shown in the results panel. It always has exactly one line.
with summary as (
  select
    (
      select string_agg(coalesce(u.email, u.id::text), ', ' order by u.created_at)
      from public.admins a
      join auth.users u on u.id = a.user_id
    ) as admin_email,
    (
      select count(*)
      from auth.users u
      where not exists (select 1 from public.admins a where a.user_id = u.id)
    ) as other_logins,
    (
      select count(*)
      from auth.users u
      where u.email is not null
        and u.email_confirmed_at is not null
    ) as confirmed_logins
)
select
  coalesce(admin_email, '(nobody yet)') as admin_email,
  other_logins,
  case
    when admin_email is null and confirmed_logins > 1 then
      'Nobody can edit yet, because this project has more than one login and the script will not guess which one is yours. Under Authentication > Users, delete every login that is not yours, then run this script again.'
    when admin_email is null then
      'Nobody can edit yet. Add your login under Authentication > Users (Add user > Create new user, with Auto confirm user ticked), then run this script again.'
    when other_logins > 0 then
      'Done, but this project has other logins as well. Check that admin_email is yours. Under Authentication > Users, delete any login you do not recognise, and turn off new sign-ups.'
    else
      'Done. Check that admin_email is your own login. If it is not, delete that login under Authentication > Users and run this script again.'
  end as what_next
from summary;
