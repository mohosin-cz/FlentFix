-- Don't auto-deduct absence at generation time. Attendance isn't reliably
-- logged yet, so auto-zeroing full salary (present_days=0 ⇒ deduct everything)
-- is a footgun. Present/absent days are still computed for display; staff apply
-- an absence deduction manually in the draft review when needed.
create or replace function public.payroll_generate(p_start date, p_end date, p_label text)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  s public.payroll_settings; v_run uuid;
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
  rec record;
  v_rate numeric; v_present int; v_ot numeric; v_absent int;
  v_otrate numeric; v_otamt numeric; v_adv numeric;
begin
  select * into s from public.payroll_settings where id = 1;
  insert into public.payroll_run(period_start, period_end, label, created_by)
  values (p_start, p_end, p_label, actor) returning id into v_run;

  for rec in select * from public.vendors where status = 'approved' loop
    v_rate := coalesce(rec.monthly_rate,
                       (select monthly_rate from public.payroll_trade_rate where trade = rec.trade), 0);

    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date) into v_present
      from public.vendor_attendance
     where vendor_id = rec.id
       and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    select coalesce(sum(extract(epoch from (nxt - punched_at)) / 3600.0), 0) into v_ot
      from (
        select punched_at, punch_type,
               lead(punched_at) over w as nxt, lead(punch_type) over w as ntype
          from public.vendor_attendance
         where vendor_id = rec.id and kind = 'overtime'
           and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end
         window w as (order by punched_at)
      ) t where punch_type = 'in' and ntype = 'out';

    v_absent := greatest(0, s.standard_days - v_present);
    v_otrate := case when s.standard_days > 0 and s.hours_per_day > 0
                     then v_rate / (s.standard_days * s.hours_per_day) else 0 end;
    v_otamt  := round(v_ot * v_otrate * s.ot_multiplier, 2);

    select coalesce(sum(amount), 0) into v_adv
      from public.payroll_advance
     where vendor_id = rec.id and run_id is null and given_at <= p_end;

    insert into public.payroll_item(
      run_id, vendor_id, monthly_rate, standard_days, present_days, absent_days,
      absence_deduction, ot_hours, ot_amount, advance_recovered, pf, esi, tds
    ) values (
      v_run, rec.id, v_rate, s.standard_days, v_present, v_absent,
      0, round(v_ot, 2), v_otamt, v_adv,
      round(v_rate * s.pf_percent / 100, 2),
      round(v_rate * s.esi_percent / 100, 2),
      round(v_rate * s.tds_percent / 100, 2)
    );

    if v_adv > 0 then
      update public.payroll_advance set run_id = v_run
       where vendor_id = rec.id and run_id is null and given_at <= p_end;
    end if;
  end loop;
  return v_run;
end $$;
grant execute on function public.payroll_generate(date, date, text) to authenticated;
