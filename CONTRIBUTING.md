# Contributing & Local Setup (Hasu)

Thank you for trying Hasu! This guide covers local setup, configuration, and how Hasu integrates with Supakey and your own Supabase project.

## Prerequisites
- Node.js 18+
- A Supabase project for your data (user’s database)
- A Supakey instance (your own or trusted hosted) for authentication and one‑time setup

## Configure Environment
1) Copy env example and fill values:
```
cp hasu/.env.example hasu/.env
```
Set:
- `REACT_APP_SUPAKEY_URL` — Supakey Supabase URL, e.g. `https://<ref>.supabase.co`
- `REACT_APP_SUPAKEY_ANON_KEY` — Supakey anon key
- `REACT_APP_SUPAKEY_CLIENT_ID` — OAuth client id for Hasu (default `hasu-web`)
- `REACT_APP_SUPAKEY_FRONTEND_URL` — Supakey frontend authorize URL (e.g. `https://supakey.yourdomain.com`)
- `REACT_APP_HASU_APP_IDENTIFIER` — identifier to derive your per‑app schema (default `github.com/aksanoble/hasu`)

See `hasu/.env.example` for all options.

## Run Locally
```
cd hasu
npm install
npm start
```
Login with Supakey, approve Hasu, and you’ll land in your workspace with sample data.

## How It Works (summary)
- Supakey deploys Hasu’s schema to your Supabase (per‑app schema derived from `REACT_APP_HASU_APP_IDENTIFIER`).
- Supakey issues app‑specific user tokens; Hasu connects directly to your Supabase using those tokens.
- RLS is enforced; no service keys are used in the browser.

## Reset / Fresh Install (optional)
- Script: `hasu/scripts/clean-fresh-install.sh` drops Hasu schemas from your user database and clears Supakey app records (edit to match your env).

## Contributing
- Open issues/PRs for bugs or improvements.
- Keep security in mind: never add service keys to the client.
- Follow the existing code style; small, focused PRs are best.

## Security Notes
- No service keys in the browser; tokens are short‑lived and rotate.
- CORS is locked down on Supakey functions; origins must be configured by you.
- You own your data and project; revoke access any time in Supabase.

## Security
- Please report vulnerabilities privately to `hello@supakey.app`. Do not open public issues for security reports.
