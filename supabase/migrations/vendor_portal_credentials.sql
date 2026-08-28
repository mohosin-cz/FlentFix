-- Staff-visible portal passwords, and making the password compulsory.
--
-- Two deliberate changes to what the previous migration set up.
--
-- 1. The password can now be looked up, not only replaced. A hash cannot be
--    read back, which is the whole point of one — but these credentials guard
--    attendance and a vendor's own payslip, not money movement, and a workforce
--    will forget them. Reset-only meant the office re-issuing constantly and
--    every vendor's password churning. So the plaintext is kept too, and the
--    honest cost is stated rather than hidden: anyone with staff access can
--    read them.
--
--    It lives in its own table, not a column on vendors, so it can never ride
--    along in a `select *` — the vendor's own profile RPC reads that row, and a
--    password has no business travelling with it.
--
-- Nothing here changes how sign-in works. It is safe to run at any time: it
-- adds the store and the functions, and email-only login keeps working exactly
-- as before. Making the password compulsory is a separate migration, to be run
-- once every vendor actually has one — see vendor_portal_enforce.sql.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.vendor_portal_credentials (
  vendor_id      uuid primary key references public.vendors(id) on delete cascade,
  password_plain text not null,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

alter table public.vendor_portal_credentials enable row level security;
revoke all on public.vendor_portal_credentials from public, anon;
grant select, insert, update, delete on public.vendor_portal_credentials to authenticated;

drop policy if exists "staff manage portal credentials" on public.vendor_portal_credentials;
create policy "staff manage portal credentials" on public.vendor_portal_credentials
  for all to authenticated using (true) with check (true);

-- ── set or generate ─────────────────────────────────────────────────────────
-- Pass a password to set that one, or nothing to have one generated. The
-- alphabet leaves out O/0/I/l/1 because this gets read down a phone line.
create or replace function public.vendor_set_portal_password(
  p_vendor_id uuid, p_password text default null)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  pw text := ''; i int;
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
begin
  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Vendor not found';
  end if;

  if p_password is not null and btrim(p_password) <> '' then
    pw := btrim(p_password);
    if length(pw) < 6 then raise exception 'Use at least 6 characters'; end if;
  else
    for i in 1..8 loop
      pw := pw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if i = 4 then pw := pw || '-'; end if;
    end loop;
  end if;

  update public.vendors
     set portal_password_hash = extensions.crypt(pw, extensions.gen_salt('bf', 10)),
         portal_password_set_at = now()
   where id = p_vendor_id;

  insert into public.vendor_portal_credentials(vendor_id, password_plain, updated_at, updated_by)
  values (p_vendor_id, pw, now(), actor)
  on conflict (vendor_id) do update
    set password_plain = excluded.password_plain,
        updated_at = now(), updated_by = excluded.updated_by;

  return pw;
end $$;

revoke execute on function public.vendor_set_portal_password(uuid, text) from anon, public;
grant  execute on function public.vendor_set_portal_password(uuid, text) to authenticated;

-- Everyone who hasn't got one yet, in a single call — so switching the portal
-- to password-only is one action rather than seventeen.
create or replace function public.vendor_generate_all_portal_passwords()
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare r record; n int := 0;
begin
  for r in select id from public.vendors
            where status = 'approved' and portal_password_hash is null loop
    perform public.vendor_set_portal_password(r.id, null);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.vendor_generate_all_portal_passwords() from anon, public;
grant  execute on function public.vendor_generate_all_portal_passwords() to authenticated;

-- Keep the older name working, so nothing that already calls it breaks.
create or replace function public.vendor_generate_portal_password(p_vendor_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
begin return public.vendor_set_portal_password(p_vendor_id, null); end $$;

revoke execute on function public.vendor_generate_portal_password(uuid) from anon, public;
grant  execute on function public.vendor_generate_portal_password(uuid) to authenticated;
