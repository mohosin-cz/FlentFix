-- Change who owns a property. Admin only (the ⋯ menu on the property page).
--
-- Pulse reads a property's owner in two places: home_team() takes
-- assigned_to, else owner_email; the journey engine's "mine" scope matches
-- owner_email or assigned_to. Setting both moves the property cleanly — off
-- the old owner's desk and Team load bar, onto the new one's. Passing null
-- clears both, and the property shows as Unowned.

create or replace function public.property_set_owner(p_pid text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_old   text;
begin
  if not pulse_is_admin() then raise exception 'Only an admin can change a property''s owner'; end if;
  if v_email is not null and v_email !~ '^[a-z0-9._%+-]+@flent\.in$' then
    raise exception 'Owner must be a @flent.in address';
  end if;

  select lower(coalesce(nullif(btrim(assigned_to), ''), owner_email)) into v_old
    from properties where pid = p_pid and deleted_at is null;
  if not found then raise exception 'No property %', p_pid; end if;

  update properties set assigned_to = v_email, owner_email = v_email where pid = p_pid and deleted_at is null;
  return jsonb_build_object('pid', p_pid, 'from', v_old, 'to', v_email);
end $$;

revoke all on function public.property_set_owner(text, text) from public, anon;
grant execute on function public.property_set_owner(text, text) to authenticated;
