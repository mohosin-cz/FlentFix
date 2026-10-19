-- Saving an inspection failed with "new row violates row-level security
-- policy" (Shanafil, Diamond district C14, 19 Oct 6:30 pm).
--
-- Photos taken with no signal are parked on the phone and uploaded when the
-- inspection is saved, each under the name it was given when it was taken —
-- so a retry overwrites instead of duplicating (upload with upsert). But the
-- inspection-media bucket only allowed creating files, not replacing them. On a
-- weak signal the first upload can land while the phone never hears back; every
-- retry then tries to overwrite that file, is refused, and the whole save stops
-- before the property is created.
--
-- Staff may now replace a file in inspection-media. (Anyone could already add
-- and read files there — the bucket is public for landlord reports.)

begin;

drop policy if exists "staff overwrite inspection media" on storage.objects;
create policy "staff overwrite inspection media" on storage.objects
  for update to authenticated
  using (bucket_id = 'inspection-media')
  with check (bucket_id = 'inspection-media');

commit;
