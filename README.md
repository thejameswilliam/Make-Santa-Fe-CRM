# Make Santa Fe CRM

A person-first CRM for Make Santa Fe built as a standalone `Next.js` app with `PostgreSQL`, plus a companion WordPress bridge plugin that exposes normalized sync endpoints for source systems.

## What is included

- Next.js internal CRM app with:
  - dashboard metrics
  - people search
  - individual contact records
  - node-based timeline view
  - review queue for unmatched events
  - mapping-management screen for fallback/manual rules
  - WordPress-backed login flow
- Prisma schema for normalized CRM data
- Sync engine for backfill and incremental pull-based ingestion
- WordPress bridge plugin with authenticated REST endpoints for:
  - WooCommerce orders, donations, memberships, and class activity
  - Gravity Forms
  - Newsletter Plugin send history
  - Make Member sign-in data
  - Make Tool Reservation data
- Vitest coverage for core classification and profile-precedence logic

## Local setup

1. Copy `.env.example` to `.env` and update values.
2. Start PostgreSQL.

Option A: Docker

```bash
docker compose up -d db
```

Option B: Homebrew on macOS

```bash
brew install postgresql@16
brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/createdb make_santa_fe_crm
```

If you use the Homebrew path, update `DATABASE_URL` in `.env` to use your local macOS username instead of the Docker default. Example:

```bash
DATABASE_URL="postgresql://your-macos-username@localhost:5432/make_santa_fe_crm?schema=public"
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and push the schema:

```bash
npm run db:generate
npm run db:push
```

5. Start the app:

```bash
npm run dev
```

## WordPress bridge setup

1. Copy `wordpress-plugin/make-santa-fe-crm-bridge.php` into your WordPress plugins directory.
2. Activate the plugin.
3. Set the shared bridge token in WordPress:
   - define `MSF_CRM_BRIDGE_TOKEN` in `wp-config.php`, or
   - use the plugin settings page in WordPress admin.
4. If you use Gravity Forms, choose an interaction type for each form on the bridge settings page. Forms set to `Do not sync` stay out of the CRM, and donation forms emit true donor events with extracted amounts.
5. In the CRM app `.env`, set:
   - `WORDPRESS_BASE_URL`
   - `WORDPRESS_CRM_BRIDGE_TOKEN`
6. For staff login, create WordPress Application Passwords for each CRM user. The CRM login page exchanges those credentials for a local CRM session cookie.

## Data flow

- WordPress remains the system of record.
- The CRM stores a normalized reporting copy in PostgreSQL.
- The bridge now performs the primary source-to-CRM mapping so most live integrations do not need CRM-side admin rules.
- WooCommerce order-based purchases, donations, and class purchases come only from completed orders.
- Membership interactions come directly from WooCommerce Memberships records.
- Gravity Forms can be mapped per form in the bridge, so WordPress decides whether a form is ignored, a general submission, a donation, a membership interaction, a volunteer interaction, and so on.
- Class purchase and attendance interactions come from Mindshare Simple Events check-in and attendee data.
- Newsletter activity comes from The Newsletter Plugin tables, with send events plus one click milestone per subscriber and campaign when a clicked URL is recorded.
- Volunteer history comes from `make-member-plugin` session and orientation records and is imported as volunteer shifts plus orientation completion milestones.
- Imported events are matched by exact normalized email only.
- Events without a match are stored in the review queue until staff assign them.
- Manual notes and manual interactions live in the CRM only.

## Notes

- If `DATABASE_URL` is not set, the UI falls back to demo data so the app shell can still render during setup.
- The bridge still exposes filter fallbacks for custom sign-in, reservation, and newsletter sources when the expected tables are not present.
