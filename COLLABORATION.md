# Prime Trucking USA collaboration guide

## Ownership

- **App / Supabase (this repository):** invite-only employee identity, role rules, employee data boundaries, mobile workflows, and mobile design.
- **Website / Claude:** public WordPress site responsiveness, public marketing pages, and public-facing copy. Claude must not copy Supabase keys, Edge Function secrets, employee records, or invite URLs into the website repository.

## Shared rules

1. Do not edit the same file concurrently. Use separate commits with clear messages.
2. Pull `master` before starting work and before opening a pull request.
3. The app accepts Driver and Dispatcher accounts only through a one-time, eight-hour invite. Admin accounts are created manually by a trusted owner.
4. The browser/UI is never the security boundary: Supabase migrations and Edge Functions enforce roles and access.
5. Never commit `.env`, service-role keys, Resend keys, employee passwords, or live invite links.

## Before release

Apply migration `009_invite_only_identity_and_data_boundaries.sql`, deploy both invite Edge Functions, disable public sign-ups in Supabase Auth, and add the Resend Edge Function secrets.
