-- Date of joining captured on the onboarding form (optional).
-- Column stays nullable so existing vendor rows are unaffected.
alter table public.vendors add column if not exists date_of_joining date;
