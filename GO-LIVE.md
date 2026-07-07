# Go-Live Runbook: Custom Domain + Real Email

Everything needed to move The Second Round from the default `*.vercel.app` URL and
Supabase's throttled test email onto your own domain with real, branded email that can
reach anyone. Some steps wait on DNS, so the order below lets you start the slow parts
early. Check each box as you go.

Legend: [YOU] = dashboard/registrar work only you can do. [WAIT] = involves DNS
propagation, usually minutes, up to ~1 hour.

---

## Phase A — Buy the domain  [YOU]

1. Choose a registrar. Recommended: **Cloudflare Registrar** (at-cost pricing, free
   WHOIS privacy, and its DNS panel is where you will add every record below) or
   **Namecheap** (friendlier UI). Porkbun is a fine third option.
2. Search for a name. Try `.com` first; `.app` is a good modern fallback and forces
   HTTPS. Have two or three variations ready in case the first is taken.
3. At checkout:
   - Confirm the RENEWAL price, not just the first-year promo.
   - Do NOT pay extra for WHOIS privacy (should be free).
   - Decline every upsell: hosting, email, site builder, SSL. You need none.
   - Leave auto-renew ON.
4. Complete the purchase. You now own the domain; the rest is configuration.

Write your domain here for reference: `__________________`

---

## Phase B — Point the site at the domain (Vercel)  [YOU] [WAIT]

1. Vercel dashboard -> your project -> Settings -> Domains -> Add.
2. Enter your domain (and optionally the `www.` version; Vercel can redirect one to the
   other).
3. Vercel shows one DNS record to add (an A record for the root, or a CNAME for a
   subdomain). Copy it into your registrar's DNS panel.
4. Wait for Vercel to show the domain as "Valid." HTTPS is issued automatically once it
   verifies.
5. Load `https://yourdomain.com` and confirm the site appears.

---

## Phase C — Set up Resend  [YOU] [WAIT]

1. Create a free account at resend.com (3,000 emails/month, 100/day).
2. Domains -> Add Domain -> enter your domain.
3. Resend gives DNS records: one MX, plus SPF and DKIM as TXT records (and a suggested
   DMARC). Add all of them in the same registrar DNS panel from Phase B.
4. Click Verify in Resend. Wait until the domain reads "Verified" (this is the step most
   likely to need a propagation wait).
5. API Keys -> Create. Copy the key (starts with `re_`). Treat it as a secret: it goes
   ONLY into the Supabase dashboard in Phase D, never into git.

---

## Phase D — Wire Supabase  [YOU]

Do these once the Resend domain is Verified.

1. **Custom SMTP.** Authentication -> Emails / SMTP Settings -> enable Custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`  (the literal word)
   - Password: your `re_...` key
   - Sender email: an address on your verified domain, e.g. `noreply@yourdomain.com`
   - Sender name: `The Second Round`
   - Save.

2. **Raise rate limits.** Authentication -> Rate Limits -> raise the email-sending limit
   off its tiny default (e.g. to 100/hour). This is the whole reason for the switch;
   skipping it leaves you throttled even through Resend.

3. **Fix the redirect allowlist (critical, easy to miss).** Authentication -> URL
   Configuration:
   - Site URL: `https://yourdomain.com`
   - Redirect URLs: add `https://yourdomain.com/**` (keep the old `*.vercel.app/**`
     entry too if you still use it). The app builds its confirmation/reset links from
     `window.location.origin`, so if the live origin is not on this allowlist, the email
     links will be rejected or bounce to the wrong place.

4. **Install branded templates.** Authentication -> Email Templates. Paste the contents
   of `supabase/email-templates/` into the matching template:
   - `confirm-signup.html` -> Confirm signup
   - `magic-link.html` -> Magic Link
   - `reset-password.html` -> Reset Password
   All three already use Supabase's `{{ .ConfirmationURL }}` variable, so no edits needed.

5. **Enforce the password policy server-side.** Authentication -> Providers -> Email ->
   Password Requirements: require lowercase, uppercase, digits, and symbols, min length 8.
   This makes the client-side rule in the signup form actually unbypassable. While
   there, if the plan offers "Secure password change," enable it: it makes Supabase
   itself demand a recent sign-in before accepting a password update, backing up the
   app's own current-password check.

6. **Re-enable email confirmation.** Authentication -> Providers -> Email -> turn
   "Confirm email" back ON (you likely turned it OFF for local testing).

7. **Run the schema migrations.** SQL editor -> run the comps line and the whole
   profiles block (table + policies + trigger) from `supabase/schema.sql`. Comps
   enables saved comparisons; profiles enables usernames. Accounts created before
   the profiles migration keep working and display their email prefix instead.

---

## Phase E — Test the real workflows  [YOU]

Do these on the live domain, in an incognito window, hard-refreshing after any change.

1. **Signup + confirmation.** Create an account with a real address and a username
   (3-20 characters, letters/numbers/underscores; the form blocks anything else). The
   BRANDED confirmation email should arrive (check Resend -> Emails for delivery
   status). Click the link; it should land you back on `yourdomain.com/account`,
   signed in, with your username shown in the header dropdown and account page.
2. **Resend confirmation.** Before confirming a second test signup, click "Didn't get the
   confirmation email? Resend it" and confirm a second email arrives.
3. **Password strength + policy.** On signup, confirm the strength meter behaves and the
   button stays disabled until the password has upper, lower, number, symbol, 8+.
4. **Sign in.** With a confirmed account, sign in by password. Then sign out and back in
   to confirm persistence.
5. **Forgot password.** Trigger it, confirm the branded reset email arrives, follow the
   link to the dedicated reset page (`/reset-password`), set a new password (strength
   meter applies here too), and sign in with it. An expired or reused link should show
   the "invalid or expired" message instead of the form.
5b. **Change password (signed in).** Account settings -> Change password. A wrong
   current password must be rejected; the right one plus a strong new password should
   succeed, and the new password should work on the next sign-in. No email involved.
6. **Magic link.** "Email me a link instead," confirm the branded magic-link email
   arrives and signs you in.
7. **Roles + entitlements.** As a Fan account, confirm the war room and scout desk show
   the gold locked boxes. Switch to Scout, confirm the desk opens and the model-vs-you
   line appears after saving notes. Switch to Front office, confirm the war room and edge
   numbers open.
8. **Rate limit gone.** Run several of the above in a row; you should no longer hit the
   "2 per hour" wall.
9. **Mobile.** Repeat signup + a role flow on a phone against the live domain.

---

## Phase F — Invite friends

Once Phase E is clean: share `https://yourdomain.com`. Friends can sign up, confirm, and
pick a role. Keep an eye on the Resend Emails log for the first day in case anything
lands in spam (a new domain builds reputation over the first several sends; the DMARC
record from Phase C helps).

---

## Gotchas, collected

- New domains can land early email in spam until reputation builds. Add DMARC; send a few
  tests first.
- The `re_` key belongs only in Supabase SMTP settings. Never commit it.
- If confirmation links break after go-live, it is almost always the Phase D step 3
  redirect allowlist. Check that first.
- Changing the domain does not touch your Vercel env vars (Supabase URL/anon key) or the
  Render API URL, so those need no changes.
