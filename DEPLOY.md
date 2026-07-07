# Deploying The Second Round (~30–45 minutes, all free tiers)

Current production: **https://thesecondround.dev** (Vercel) + Render API + Supabase.
Domain, DNS, and email (Resend SMTP) setup live in [GO-LIVE.md](GO-LIVE.md). This file
records how the stack was stood up.

Four accounts, all free: GitHub, Render (API), Vercel (web), Supabase (accounts —
optional). Do them in this order.

## 0. Before you start

- [x] Byline links filled (LinkedIn) in the app footer, memo, and README.
- [x] Anthropic API key rotated and updated in `.env`.
- [x] Pre-publication security review passed (BYO-key isolation, proxy-aware rate
      limits, no secrets in git history, runtime state untracked, pinned dependencies).

## 1. GitHub

```bash
gh auth login                 # or create the repo in the browser
gh repo create the-second-round --public --source . --push
```
(Manual alternative: create `the-second-round` on github.com, then
`git remote add origin https://github.com/YOU/the-second-round.git && git push -u origin master`.)

Confirm `.env` did NOT get pushed (it's gitignored; check the repo page).

## 2. Render — the API

1. render.com → New → Blueprint → connect the GitHub repo. Render reads `render.yaml`.
2. When prompted for `ANTHROPIC_API_KEY`, paste your key (this funds the capped live
   note extraction; skip it to run keyword-fallback only).
3. Deploy. First build ~5 min. Note your URL: `https://second-round-api-XXXX.onrender.com`.
4. Test: open `https://…onrender.com/board` — you should see JSON.

Free-tier caveat: the API sleeps after 15 idle minutes; the first request after a nap
takes ~30s. Acceptable for now (see DECISIONS.md D16 for the $7/mo upgrade trigger).

## 3. Vercel — the web app

1. vercel.com → Add New Project → import the GitHub repo.
2. Root directory: `web`. Framework preset: Next.js (auto-detected).
3. Environment variables:
   - `NEXT_PUBLIC_API_URL` = your Render URL (no trailing slash)
   - (after step 4, add the two Supabase vars here too)
4. Deploy. Your app is live at `https://the-second-round-XXXX.vercel.app`.

## 4. Supabase — scout accounts (optional but recommended)

1. supabase.com → New project (free tier, any region near you).
2. SQL Editor → paste the contents of `supabase/schema.sql` → Run. (Covers scout
   notes with RLS, saved comps, and username profiles with the signup trigger.)
3. Authentication → Providers → Email: ON. Password sign-in with a confirmation
   email is the primary flow (magic link is the fallback). Set Password
   Requirements to lowercase + uppercase + digits + symbols, min length 8, to
   match the client-side rules.
4. Authentication → URL Configuration → Site URL: `https://thesecondround.dev`;
   Redirect URLs: `https://thesecondround.dev/**` plus the Vercel URL with `/**`
   (the wildcard covers `/account` and `/reset-password` links in auth emails).
5. Project Settings → API: copy the Project URL and the `anon` public key into
   Vercel env as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   then redeploy the Vercel project.
6. Email limits: the built-in sender caps at ~2 emails/hour project-wide. Custom
   SMTP via Resend removes it — steps in [GO-LIVE.md](GO-LIVE.md), Phases C-D.

## 5. Smoke test the live site

- [ ] Board loads with headshots and tier bars
- [ ] A player page renders; the seeded scouting-file notes show prior→posterior bars
- [ ] War room slider works at a few picks
- [ ] Methodology page renders the memo
- [ ] Live note on any player returns traits (first hit may take ~30s if the API napped)
- [ ] Sign up with username + password; confirm email; save a note; refresh;
      "Your view" and your comps persist
- [ ] Change password (account settings) and the forgot-password loop
      (`/reset-password`) both work
- [ ] Privacy page linked in the footer

## Costs after this

$0/month baseline. The Anthropic key spends fractions of a cent per public note,
hard-capped at 2,000 notes/month by the API. Upgrade path when traction arrives:
Render Starter ($7/mo, no cold starts) — see DECISIONS.md D16.
