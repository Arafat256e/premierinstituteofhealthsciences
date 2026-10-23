-- Premier Institute of Health Sciences Ltd CMS schema. Run the complete file in Supabase SQL Editor.
-- Use only the Supabase anon/publishable key in browser code. Never expose service_role keys.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- One JSON document per page. Admin can update every editable heading/paragraph on each public page.
create table if not exists public.page_content (
  page_key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.programs (
 id uuid primary key default gen_random_uuid(), title text not null, award text, duration text,
 description text, requirements text, sort_order integer not null default 0,
 is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.publications (
 id uuid primary key default gen_random_uuid(), title text not null,
 category text not null default 'Circular', summary text, file_url text,
 published_at date, is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.career_opportunities (
 id uuid primary key default gen_random_uuid(), title text not null, department text,
 location text, employment_type text, description text, deadline date, apply_url text,
 is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(), title text not null, body text,
 published_at date default current_date, is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.gallery_items (
 id uuid primary key default gen_random_uuid(), title text, image_url text not null, alt_text text,
 caption text, sort_order integer not null default 0, is_published boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Public forms store enquiries only. Avoid collecting clinical/medical data or copies of identity documents.
create table if not exists public.admissions (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null,
 phone text, programme text not null, education_level text, message text,
 status text not null default 'new', created_at timestamptz not null default now()
);
create table if not exists public.contact_inquiries (
 id uuid primary key default gen_random_uuid(), name text not null, email text not null,
 phone text, subject text, message text not null, status text not null default 'new', created_at timestamptz not null default now()
);
create table if not exists public.career_applications (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null,
 phone text, role text not null, experience text, cv_url text, message text,
 status text not null default 'new', created_at timestamptz not null default now()
);
create table if not exists public.student_requests (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null,
 student_number text, request_type text not null, message text not null,
 status text not null default 'new', created_at timestamptz not null default now()
);

-- Enable RLS everywhere.
alter table public.admin_users enable row level security;
alter table public.page_content enable row level security;
alter table public.programs enable row level security;
alter table public.publications enable row level security;
alter table public.career_opportunities enable row level security;
alter table public.announcements enable row level security;
alter table public.gallery_items enable row level security;
alter table public.admissions enable row level security;
alter table public.contact_inquiries enable row level security;
alter table public.career_applications enable row level security;
alter table public.student_requests enable row level security;

-- Admin list cannot be changed from the browser; owner grants access via SQL Editor.
drop policy if exists "Admins read admin list" on public.admin_users;
create policy "Admins read admin list" on public.admin_users for select to authenticated using (public.is_admin());

-- Page content is readable publicly, writable only by an allow-listed admin.
drop policy if exists "Public read page content" on public.page_content;
create policy "Public read page content" on public.page_content for select to anon, authenticated using (true);
drop policy if exists "Admins manage page content" on public.page_content;
create policy "Admins manage page content" on public.page_content for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public can read published records only; admins have full CRUD access.
do $$ declare t text; begin
 foreach t in array array['programs','publications','career_opportunities','announcements','gallery_items'] loop
  execute format('drop policy if exists "Public read published" on public.%I',t);
  execute format('create policy "Public read published" on public.%I for select to anon, authenticated using (is_published = true or public.is_admin())',t);
  execute format('drop policy if exists "Admins manage content" on public.%I',t);
  execute format('create policy "Admins manage content" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',t);
 end loop;
end $$;

-- Visitors can insert form submissions. Only admins can read/update/delete submissions.
do $$ declare t text; begin
 foreach t in array array['admissions','contact_inquiries','career_applications','student_requests'] loop
  execute format('drop policy if exists "Public submit" on public.%I',t);
  execute format('create policy "Public submit" on public.%I for insert to anon, authenticated with check (true)',t);
  execute format('drop policy if exists "Admins manage submissions" on public.%I',t);
  execute format('create policy "Admins manage submissions" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',t);
 end loop;
end $$;

grant select on public.page_content, public.programs, public.publications, public.career_opportunities, public.announcements, public.gallery_items to anon, authenticated;
grant insert on public.admissions, public.contact_inquiries, public.career_applications, public.student_requests to anon, authenticated;
grant all on public.page_content, public.programs, public.publications, public.career_opportunities, public.announcements, public.gallery_items to authenticated;
grant select, update, delete on public.admissions, public.contact_inquiries, public.career_applications, public.student_requests to authenticated;
grant select on public.admin_users to authenticated;

-- Optional public asset bucket. File upload is restricted to approved admins; published assets are publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-resources', 'school-resources', true, 10485760, array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf'])
on conflict (id) do update set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf'], file_size_limit = 10485760;
drop policy if exists "Public read school resources" on storage.objects;
create policy "Public read school resources" on storage.objects for select to anon, authenticated using (bucket_id = 'school-resources');
drop policy if exists "Admins upload school resources" on storage.objects;
create policy "Admins upload school resources" on storage.objects for insert to authenticated with check (bucket_id = 'school-resources' and public.is_admin());
drop policy if exists "Admins update school resources" on storage.objects;
create policy "Admins update school resources" on storage.objects for update to authenticated using (bucket_id = 'school-resources' and public.is_admin()) with check (bucket_id = 'school-resources' and public.is_admin());
drop policy if exists "Admins delete school resources" on storage.objects;
create policy "Admins delete school resources" on storage.objects for delete to authenticated using (bucket_id = 'school-resources' and public.is_admin());
