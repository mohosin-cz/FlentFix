-- Let authenticated users write to vendor-avatars, the way they already can
-- with vendor-docs.
--
-- The bucket had exactly one INSERT policy, for anon. That is right for the
-- vendor on their own phone — the portal signs nobody into Supabase, so their
-- uploads arrive as anon — but it is the only case it covers.
--
-- Anyone opening the portal in a browser that is also signed into Pulse sends
-- the staff JWT with the request, so it arrives as `authenticated`, matches no
-- INSERT policy, and fails with "new row violates row-level security policy".
-- That is one error for two different things: the profile photo, and the punch
-- selfie, which goes to this same bucket under selfies/. Checking in from a
-- staff browser fails for the same reason.
--
-- vendor-docs already has this pair — "anon can upload vendor docs" alongside
-- "staff upload vendor docs". vendor-avatars was given only the first half.
-- This is the other half, and nothing else changes: the anon policy stays as
-- it is, so nothing a vendor does today is affected.

-- storage.objects is owned by supabase_storage_admin, not postgres, so a plain
-- CREATE POLICY in the SQL editor fails with "must be owner of table objects".
-- Become the owner for the statement. If this role change is refused, use the
-- dashboard instead: Storage → Policies → vendor-avatars → New policy, INSERT,
-- target role authenticated, check bucket_id = 'vendor-avatars'.
set role supabase_storage_admin;

drop policy if exists "staff upload vendor avatars" on storage.objects;
create policy "staff upload vendor avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vendor-avatars');

reset role;

-- check: vendor-avatars should now read like vendor-docs — one anon policy and
-- one authenticated policy
select policyname, roles::text, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'
   and with_check like '%vendor-avatars%'
 order by policyname;
