# Production authentication email

Supabase Auth sends invitations and password recovery email through Resend SMTP. The application
continues to call Supabase Auth; it does not use a Resend SDK or send email directly. The
[production deployment guide](production.md) remains the release checklist.

## Configure the target host

1. Add a sending domain or subdomain in Resend, publish the DNS records Resend provides, and wait
   until its sending status is verified. Use a sender address at that verified domain. Configure
   DMARC for the domain and disable click tracking for authentication email so confirmation links
   are not rewritten.
2. Create a Resend API key for SMTP. Merge the values in the
   [SMTP fragment](../../deploy/production/supabase-smtp.env.example) into the installed official
   Supabase Docker distribution's `.env` on the target host. Replace the example sender and API-key
   placeholders there. Keep that file and the key on the host, outside the repository and web/media
   application environments. The fragment is not a complete `.env` and must not replace upstream
   settings.
3. Keep `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` aligned with the real HTTPS app origin as specified
   in the [production guide](production.md#1-supabase). Recreate/restart the upstream Auth service
   using the distribution's documented procedure so it receives the updated environment.

Resend documents `smtp.resend.com`, user `resend`, and an API key as the password. Port `587` uses
STARTTLS. The upstream Supabase Compose file maps `SMTP_*` and `ENABLE_EMAIL_AUTOCONFIRM` from its
`.env` into Auth. Keep `ENABLE_EMAIL_AUTOCONFIRM=false` so the production confirmation flow remains
active. See [Resend SMTP](https://resend.com/docs/send-with-smtp),
[Resend domain verification](https://resend.com/docs/add-a-domain),
[Supabase self-hosted SMTP](https://supabase.com/docs/guides/self-hosting/docker#configuring-an-email-server),
the [upstream Auth Compose configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml),
and [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates#email-tracking).

## Release smoke checks

Run these checks only against the configured staging or target installation, using a controlled
recipient mailbox. They are pending until a real domain, key, and host exist.

1. From an agency account, invite a new member in Settings. The server calls
   `auth.admin.inviteUserByEmail` and directs the recipient to `/auth/invite?token=...` after Auth
   confirms the email. For an eligible existing account, the same route uses
   `auth.signInWithOtp` with account creation disabled. Confirm delivery, the HTTPS link and the
   invited account's ability to accept; check both paths.
2. From `/auth/recovery`, request a password reset for a controlled existing account. The app calls
   `auth.resetPasswordForEmail` with `/auth/recovery?mode=update` as its redirect. Confirm delivery,
   a usable HTTPS link, and a successful password update with `auth.updateUser`.
3. Confirm public sign-up remains disabled and review Auth errors plus Resend delivery/bounce
   status if a message fails. An Auth API success alone does not prove mailbox delivery.

Do not publish email links, invitation tokens, recovery tokens, or SMTP credentials in logs or
reports. Resend [SMTP messages appear in its Emails table](https://resend.com/docs/send-with-smtp#faq).
