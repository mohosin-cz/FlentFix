-- Delete a vendor permanently — the admin's "wipe this person out".
--
-- "Delete forever" on a rejected profile did nothing: vendors has no DELETE
-- policy, so the client's delete matched zero rows and reported success. This
-- does it server-side instead, with the rules spelled out:
--   · admin only (pulse_is_admin)
--   · only someone already out of the roster — rejected, withdrawn, exited or
--     archived — so an active vendor is never one tap from gone
--   · never someone with company records: payroll lines, work orders or
--     payments stay, and the person must be removed (exited) instead
-- Everything else of theirs goes with the row (attendance, leave, advances,
-- sessions, activity — all ON DELETE CASCADE). Their files can't be deleted
-- from SQL (storage protects its table), so the paths come back and the app
-- removes them through the storage API, which the policies below allow for
-- the admin only.

create or replace function public.vendor_purge(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vendors; n_pay int; n_wo int; n_pp int; docs text[]; avatars text[];
begin
  if not pulse_is_admin() then raise exception 'Only the admin can delete a vendor permanently'; end if;
  select * into v from vendors where id = p_id;
  if v.id is null then raise exception 'Vendor not found'; end if;
  if v.status::text not in ('rejected', 'withdrawn', 'exited', 'archived') then
    raise exception '% is still %. Reject or remove them first, then delete.', coalesce(v.full_name, 'This vendor'), v.status;
  end if;
  select count(*) into n_pay from vendor_payouts where vendor_id = p_id;
  select count(*) into n_wo  from work_orders where vendor_id = p_id;
  select count(*) into n_pp  from payment_payees where vendor_id = p_id;
  if n_pay + n_wo + n_pp > 0 then
    raise exception '% has company records (% payroll line%, % work order%, % payment%) — those are kept, so they can''t be deleted. Leave them removed instead.',
      coalesce(v.full_name, 'This vendor'), n_pay, case when n_pay = 1 then '' else 's' end,
      n_wo, case when n_wo = 1 then '' else 's' end, n_pp, case when n_pp = 1 then '' else 's' end;
  end if;

  docs := array_remove(array[v.live_photo_path, v.aadhaar_doc_path, v.pan_doc_path, v.dl_doc_path], null)
       || coalesce((select array_agg(doc_path) from vendor_leaves where vendor_id = p_id and doc_path is not null), '{}');
  avatars := array_remove(array[v.avatar_path], null);

  delete from vendors where id = p_id;
  return jsonb_build_object('name', v.full_name, 'docs', to_jsonb(docs), 'avatars', to_jsonb(avatars));
end $$;
revoke all on function public.vendor_purge(uuid) from public, anon;
grant execute on function public.vendor_purge(uuid) to authenticated;

drop policy if exists "admin can delete vendor docs" on storage.objects;
create policy "admin can delete vendor docs" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-docs' and public.pulse_is_admin());
drop policy if exists "admin can delete vendor avatars" on storage.objects;
create policy "admin can delete vendor avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-avatars' and public.pulse_is_admin());
