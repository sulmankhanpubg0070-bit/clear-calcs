create extension if not exists pgcrypto with schema extensions;

create table public.site_data (
  id int primary key default 1 check (id = 1),
  title text not null default 'Family Tree',
  members jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.site_data to anon, authenticated;
grant all on public.site_data to service_role;
alter table public.site_data enable row level security;
create policy "Public read site data" on public.site_data for select to anon, authenticated using (true);
insert into public.site_data (id, members) values (1, '[
 {"id":"1","name":"Dada","gender":"male","birthYear":"1945","spouseId":"2"},
 {"id":"2","name":"Dadi","gender":"female","birthYear":"1948","spouseId":"1"},
 {"id":"3","name":"Papa","gender":"male","birthYear":"1972","parentId":"1","spouseId":"4"},
 {"id":"4","name":"Mummy","gender":"female","birthYear":"1975","spouseId":"3"},
 {"id":"5","name":"Aap","gender":"other","birthYear":"2000","parentId":"3"}]'::jsonb);

create table public.admin_secret (
  id int primary key default 1 check (id = 1),
  password_hash text not null
);
grant all on public.admin_secret to service_role;
alter table public.admin_secret enable row level security;

create or replace function public.admin_has_password() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_secret) $$;

create or replace function public.admin_setup(_password text) returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if exists(select 1 from public.admin_secret) then return false; end if;
  if length(_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  insert into public.admin_secret(id, password_hash) values (1, extensions.crypt(_password, extensions.gen_salt('bf')));
  return true;
end $$;

create or replace function public.admin_check(_password text) returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select exists(select 1 from public.admin_secret where password_hash = extensions.crypt(_password, password_hash)) $$;

create or replace function public.admin_save(_password text, _title text, _members jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.admin_check(_password) then raise exception 'Wrong password'; end if;
  if jsonb_typeof(_members) <> 'array' then raise exception 'Invalid members'; end if;
  update public.site_data set title = left(coalesce(nullif(trim(_title),''),'Family Tree'),80), members = _members, updated_at = now() where id = 1;
  return true;
end $$;

create or replace function public.admin_change_password(_old text, _new text) returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.admin_check(_old) then raise exception 'Wrong password'; end if;
  if length(_new) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  update public.admin_secret set password_hash = extensions.crypt(_new, extensions.gen_salt('bf')) where id = 1;
  return true;
end $$;

grant execute on function public.admin_has_password(), public.admin_setup(text), public.admin_check(text), public.admin_save(text,text,jsonb), public.admin_change_password(text,text) to anon, authenticated;