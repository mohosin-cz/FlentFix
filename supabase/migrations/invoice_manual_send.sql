-- Let staff issue an invoice without a server sending the email.
--
-- invoice_prepare_send was service-role only, on the reasoning that freezing
-- the document should happen as part of actually sending it. That assumed a
-- deployed Edge Function doing the sending. Without access to deploy one, or
-- to set secrets, or to verify a sending domain, nothing could call it — so
-- the invoice could never leave draft and the vendor's link never worked.
--
-- The step is the same either way: snapshot the document, mark it sent, hand
-- back the token. The only change is who triggers it. Staff clicking "Send for
-- signing" and then delivering the link themselves — WhatsApp, or their own
-- mail client — is a truthful account of what is happening.
--
-- anon stays revoked. Freezing an invoice is a staff act, and the token it
-- returns is the whole security boundary.

grant execute on function public.invoice_prepare_send(uuid) to authenticated;
revoke execute on function public.invoice_prepare_send(uuid) from anon, public;
