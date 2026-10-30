-- Vendors see a month's pay only once it has been sent to them for signing.
--
-- attend_payroll used to return every payout line, so a month still being
-- worked out (a draft) showed up in the vendor portal while it was being
-- edited. A line is now released when its invoice goes out (status sent);
-- until then the portal doesn't know it exists. Sending also needs the month
-- marked final first, so the order is: calculate → mark final → send → visible.
--
-- Backfill: lines whose invoice already went out stay visible; final months
-- from before invoicing (no invoice at all) stay visible as history. Drafts,
-- and final months whose invoice hasn't been sent, are hidden until it is.

alter table public.vendor_payouts add column if not exists released_at timestamptz;

update vendor_payouts p set released_at = coalesce(i.sent_at, i.created_at, now())
  from vendor_invoices i
 where i.payout_id = p.id and i.status in ('sent','viewed','signed') and p.released_at is null;

update vendor_payouts p set released_at = coalesce(pp.locked_at, now())
  from vendor_payroll_periods pp
 where pp.id = p.period_id and pp.status in ('locked','paid') and p.released_at is null
   and not exists (select 1 from vendor_invoices i where i.payout_id = p.id);

create or replace function public.vendor_invoice_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('sent','viewed','signed') and old.status is distinct from new.status then
    update vendor_payouts set released_at = coalesce(released_at, now()) where id = new.payout_id;
  end if;
  return new;
end $$;
revoke all on function public.vendor_invoice_release() from public, anon, authenticated;

drop trigger if exists trg_vendor_invoice_release on public.vendor_invoices;
create trigger trg_vendor_invoice_release
  after update of status on public.vendor_invoices
  for each row execute function public.vendor_invoice_release();

CREATE OR REPLACE FUNCTION public.attend_payroll(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v uuid; out jsonb;
begin
  select s.vendor_id into v from public.attend_session s
   where s.token = p_token and s.expires_at > now();
  if v is null then raise exception 'Session expired — sign in again'; end if;

  select coalesce(jsonb_agg(row order by period_month desc), '[]'::jsonb) into out
  from (
    select
      pp.period_month,
      jsonb_build_object(
        'period_month',   pp.period_month,
        'period_status',  pp.status,
        'paid',           (pp.status in ('paid','locked') or pp.locked_at is not null),
        'days_worked',    p.days_worked,
        'ot_days',        p.ot_days,
        'fixed_pay',      p.fixed_pay,
        'allowance',      p.allowance,
        'ot_amount',      p.ot_amount,
        'advance_recovered', p.advance_recovered,
        'total_payout',   p.total_payout,
        'utr',            p.utr,
        'invoice', case when i.id is null then null else jsonb_build_object(
          'id',          i.id,
          'invoice_no',  i.invoice_no,
          'status',      i.status,
          'net_payable', i.net_payable,
          'signed_at',   i.signed_at,
          'signed_name', i.signed_name,
          'signable',    (i.status in ('sent','viewed')),
          'snapshot',    case when i.status in ('sent','viewed','signed') then i.snapshot else null end,
          'signature_png', case when i.status = 'signed' then i.signature_png else null end
        ) end
      ) as row
    from public.vendor_payouts p
    join public.vendor_payroll_periods pp on pp.id = p.period_id
    left join public.vendor_invoices i on i.payout_id = p.id
   where p.vendor_id = v
     and p.released_at is not null   -- only once it has gone out for signing
  ) t;

  return out;
end $function$;

CREATE OR REPLACE FUNCTION public.invoice_prepare_send(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare inv public.vendor_invoices; v public.vendors; ent public.payroll_billing_entity;
        per public.vendor_payroll_periods; snap jsonb; v_lines jsonb; v_sum numeric;
begin
  select * into inv from public.vendor_invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status = 'void' then raise exception 'This invoice has been voided'; end if;
  if inv.status = 'signed' then raise exception 'This invoice is already signed'; end if;

  select * into v   from public.vendors where id = inv.vendor_id;
  select * into ent from public.payroll_billing_entity where id = 1;
  select * into per from public.vendor_payroll_periods where id = inv.period_id;
  if per.status = 'draft' then
    raise exception 'Mark % final before sending invoices for signing', to_char(per.period_month, 'Mon YYYY');
  end if;

  if v.email is null or btrim(v.email) = '' then
    raise exception 'No email address on this vendor';
  end if;

  select coalesce(sum(amount), 0) into v_sum from public.vendor_invoice_lines where invoice_id = inv.id;
  if round(v_sum, 2) <> round(inv.subtotal, 2) then
    raise exception 'The PID split adds up to % but the invoice total is % — fix the split first', v_sum, inv.subtotal;
  end if;
  if exists (select 1 from public.vendor_invoice_lines where invoice_id = inv.id and coalesce(btrim(pid), '') = '') then
    raise exception 'Every line needs a PID before this can be sent';
  end if;

  select jsonb_agg(jsonb_build_object('pid', pid, 'description', description, 'amount', amount) order by sort)
    into v_lines from public.vendor_invoice_lines where invoice_id = inv.id;

  snap := jsonb_build_object(
    'invoice_no', inv.invoice_no,
    'invoice_date', inv.invoice_date,
    'period_month', per.period_month,
    'from', jsonb_build_object(
      'name', v.full_name, 'code', public.vendor_invoice_prefix(v.id), 'trade', v.trade,
      'address', v.address_line, 'city', v.city, 'pincode', v.pincode,
      'phone', v.phone, 'email', v.email,
      'bank_last4', right(coalesce(v.bank_account_no, ''), 4),
      'upi', v.upi_id),
    'bill_to', to_jsonb(ent) - 'id' - 'updated_at' - 'updated_by',
    'lines', coalesce(v_lines, '[]'::jsonb),
    'subtotal', inv.subtotal,
    'advance_recovered', inv.advance_recovered,
    'net_payable', inv.net_payable
  );

  update public.vendor_invoices
     set snapshot = snap, status = 'sent', sent_to = lower(btrim(v.email)),
         sent_at = now(), send_error = null
   where id = inv.id;

  return jsonb_build_object('token', inv.token, 'email', lower(btrim(v.email)),
                            'name', v.full_name, 'invoice_no', inv.invoice_no,
                            'net_payable', inv.net_payable, 'snapshot', snap);
end $function$;
