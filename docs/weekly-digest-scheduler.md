# Weekly Digest Scheduler

This project supports a weekly digest batch job that sends one email per registered user with recent screenshot activity.

## What runs weekly

The backend route:

`POST /api/jobs/weekly-digest/run`

This route:
- authenticates using `WEEKLY_DIGEST_CRON_SECRET`
- loads all registered users from Supabase Auth
- fetches each user's screenshots from the last 7 days
- skips users without an email or without recent activity
- builds a personalized weekly digest
- sends it with Resend

## Required environment variables

```env
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="ScreenSort <digest@yourdomain.com>"
RESEND_REPLY_TO="team@yourdomain.com"
WEEKLY_DIGEST_CRON_SECRET="your-long-random-secret"
```

## Scheduler options

### Option 1: GitHub Actions

Included workflow:

`.github/workflows/weekly-digest.yml`

Set these repository secrets:

- `WEEKLY_DIGEST_CRON_SECRET`
- `WEEKLY_DIGEST_JOB_URL`

Example `WEEKLY_DIGEST_JOB_URL`:

`https://your-backend-domain.com/api/jobs/weekly-digest/run`

The workflow runs every Monday at 08:00 UTC and can also be triggered manually.

### Option 2: External cron

You can also call the same route from:
- Render cron jobs
- EasyCron
- Supabase Edge scheduled functions
- any server-side scheduler

## Important behavior

- The batch job uses an idempotency key per user per ISO week to reduce duplicate sends.
- Users with no screenshots in the last 7 days are skipped.
- Users without an email address are skipped.
- For first-name personalization, the system uses `user_metadata.first_name` and falls back to the email prefix.
