# J&M Serenity Spa — Project Reference

## Overview

Full-stack website and booking management system for **J&M Serenity Spa**, a massage therapy business in Southwest Denver, Colorado. Built by Nick (skrodlada21@icloud.com).

**Domain:** https://jmserenityspa.com
**GitHub:** https://github.com/skrodlada21/jm-serenity-spa

## Tech Stack

- **Runtime:** Node.js with Express.js
- **Templating:** EJS (server-rendered views)
- **Database:** SQLite via `better-sqlite3` (stored in `db/spa.db`)
- **CSS:** Custom vanilla CSS (`public/style.css`, `public/admin.css`)
- **Email:** Nodemailer (SMTP — not yet configured, pending Google Workspace setup)
- **SMS:** Custom module in `lib/sms.js` (Twilio-ready, not yet active)
- **Payments:** Square SDK integration in `lib/square.js`
- **File uploads:** Multer v1 (therapist photos, gallery images)

## Deployment

- **Server:** Raspberry Pi at `192.168.7.5` on local network
- **Process manager:** pm2 (process name: `spa`)
- **Reverse proxy:** Nginx Proxy Manager (runs on Home Assistant, NOT on the Pi)
- **SSL:** Let's Encrypt via Nginx Proxy Manager
- **Port:** 3000 (default, configurable via `PORT` env var)

### Deploy workflow

```bash
# On Mac (development):
cd ~/path-to/jm-serenity-spa
git add -A && git commit -m "description" && git push

# On Pi (production):
cd ~/jm-serenity-spa
git pull
pm2 restart spa
```

### Accessing the Pi from Cowork/Claude

**Method 1 — Direct SSH from sandbox (try first):**
Some Cowork sessions have network access. If so, set up an SSH key and copy it to the Pi:
```bash
mkdir -p ~/.ssh && ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "cowork-spa-deploy"
# Then copy the public key to the Pi (requires user to enter password once):
ssh-copy-id -i ~/.ssh/id_ed25519 nick@192.168.7.5
# After that, connect with:
ssh -i ~/.ssh/id_ed25519 nick@192.168.7.5 "cd ~/jm-serenity-spa && git pull && pm2 restart spa"
```
Test with: `ssh -o ConnectTimeout=5 nick@192.168.7.5 "echo connected"` — if "Network is unreachable", use Method 2.

**Method 2 — Via HA SSH Web Terminal (fallback):**
If the sandbox has no network access (only loopback), use Chrome to access Home Assistant's SSH terminal:

1. Open the **HA SSH Web Terminal** via Chrome MCP: navigate to `https://lieterhas.duckdns.org:8123/hassio/ingress/a0d7b954_ssh`
2. From the HA terminal, SSH to the Pi with the pre-configured key:
   ```bash
   ssh -i ~/.ssh/id_ed25519_pi nick@192.168.7.5
   ```
3. No password required — SSH key auth is set up from HA to Pi.

For one-liner commands (no interactive session needed):
```bash
ssh -i ~/.ssh/id_ed25519_pi nick@192.168.7.5 "cd ~/jm-serenity-spa && git pull && pm2 restart spa"
```

### Pi setup notes

- pm2 is configured with `pm2 startup` + `pm2 save` for auto-restart on reboot
- pm2 process name is `spa` — always use `pm2 restart spa`
- The `db/` directory must exist on the Pi (it's gitignored) — `mkdir db` if cloning fresh
- SSH key auth is used for GitHub (key on Pi registered to skrodlada21@gmail.com)
- SSH key auth from HA to Pi: key at `/root/.ssh/id_ed25519_pi` on HA, comment "hassio-to-pi"
- npm install may show deprecation warnings for `prebuild-install` — these are not vulnerabilities
- Home Assistant base URL: `https://lieterhas.duckdns.org:8123`

## Project Structure

```
project/
├── server.js              # All routes (public + admin + desk + API)
├── package.json
├── .gitignore
├── lib/
│   ├── db.js              # Database schema, migrations, all query helpers
│   ├── email.js           # Nodemailer: booking confirmations, cancellations, generic sendEmail
│   ├── sms.js             # Twilio SMS (not yet active)
│   └── square.js          # Square payment integration
├── db/
│   └── spa.db             # SQLite database (gitignored, auto-created)
├── public/
│   ├── style.css          # Main site styles
│   ├── admin.css          # Admin panel styles
│   ├── script.js          # Client-side JS
│   ├── favicon.ico
│   ├── checkin-manifest.json   # PWA manifest for check-in kiosk
│   └── images/
│       ├── logo.png            # 1024x1024 spa logo
│       ├── og-image.png        # 1200x630 Open Graph preview image
│       ├── favicon-32.png
│       ├── apple-touch-icon.png
│       ├── therapists/         # Uploaded therapist photos
│       └── gallery/            # Uploaded gallery images
└── views/
    ├── partials/
    │   ├── header.ejs          # Public site header (nav, favicon, OG tags)
    │   ├── footer.ejs          # Public site footer
    │   ├── admin-header.ejs    # Admin panel header/nav
    │   └── fd-header.ejs       # Front desk header
    ├── index.ejs               # Homepage
    ├── booking.ejs             # Online booking form
    ├── booking-confirm.ejs     # Booking confirmation page
    ├── booking-manage.ejs      # Cancel/reschedule via token
    ├── services.ejs            # Treatments page (alias: /treatments)
    ├── about.ejs
    ├── contact.ejs
    ├── gallery.ejs
    ├── reviews.ejs
    ├── memberships.ejs         # Public membership info
    ├── gift-certificates.ejs
    ├── policies.ejs
    ├── menu.ejs                # Service menu display
    ├── coming-soon.ejs         # Coming Soon landing page (standalone, no partials)
    ├── checkin.ejs             # Tablet check-in kiosk (PWA, lockdown mode)
    ├── tv-therapists.ejs       # TV display of therapists
    └── admin/
        ├── login.ejs
        ├── dashboard.ejs
        ├── front-desk.ejs      # Simplified front desk view
        ├── fd-login.ejs        # Front desk login
        ├── phone-booking.ejs   # Phone/walk-in booking (phone-first with auto-fill)
        ├── therapists.ejs
        ├── services.ejs
        ├── clients.ejs
        ├── expenses.ejs        # Enhanced: recurring, startup, payment status, reimbursement
        ├── reports.ejs
        ├── memberships.ejs
        ├── gift-certificates.ejs
        ├── gift-certificate-print.ejs
        ├── member-card-print.ejs
        ├── discounts.ejs
        ├── blocked-times.ejs
        ├── waitlist.ejs
        ├── gallery.ejs
        ├── reviews.ejs
        ├── settings.ejs        # Includes Coming Soon toggle
        ├── signups.ejs         # Email signups from Coming Soon page
        ├── send-update.ejs     # Email composer for sending updates to signups
        ├── reset.ejs           # Database reset tool (clears test data, keeps expenses)
        └── desk-members.ejs
```

## Authentication & Authorization

Three-tier middleware system defined in `server.js`:

- **`requireAdmin`** — Full admin access. Checks `req.session.admin`. Login at `/admin/login` with password from `admin_password` setting (default: `admin123`).
- **`requireStaff`** — Admin OR front desk. Checks `req.session.admin || req.session.desk`. Used for booking operations, completing appointments, etc.
- **`requireDesk`** — Front desk only. Checks `req.session.desk`. Login at `/desk/login` with password from `desk_password` setting.

Therapist PINs are used for accountability (completing bookings, etc.) — verified via `/api/admin/pin-check`.

## Database Schema (SQLite)

All tables defined in `lib/db.js`. Key tables:

| Table | Purpose |
|-------|---------|
| `settings` | Key-value store for all app settings |
| `therapists` | Staff with photos, bios, work schedules, PINs, employment status |
| `services` | Massage services with duration, price, category |
| `addons` | Add-on services |
| `bookings` | All appointments with status tracking, payment, tips |
| `clients` | Customer records keyed by phone number (intake forms, health info) |
| `expenses` | Business expenses with recurring frequency, startup flag, payment status, reimbursement tracking |
| `waitlist` | Waitlist entries |
| `blocked_times` | Therapist unavailability |
| `gift_certificates` | Gift certs with balance tracking and redemption history |
| `gift_certificate_redemptions` | Redemption log |
| `membership_plans` | Membership tiers |
| `members` | Active members with visit tracking |
| `member_visits` | Visit log |
| `discount_codes` | Promo codes |
| `reviews` | Customer reviews (approval + featured system) |
| `gallery_images` | Photo gallery |
| `email_signups` | Coming Soon page email signups |
| `sent_updates` | Log of emails sent to signups |

### Schema migrations

The `safeAddColumn()` pattern is used to add columns to existing tables without breaking upgrades. New columns should always be added this way rather than modifying the CREATE TABLE statement (so existing databases don't lose data).

### Key db.js patterns

- `addExpense(opts)` takes an options object (not positional params)
- `getExpenses(month, filter)` supports filters: monthly, yearly, recurring, startup, due, reimburse, unpaid
- `getRecurringExpenseSummary()` returns totals broken down by type and per-person owed amounts
- `resetTestData()` clears bookings, clients, gift certs, members, reviews, discount codes, waitlist, blocked times, gallery — but KEEPS expenses, settings, therapists, services, membership plans
- `upsertClient(phone, data)` — phone number is the primary customer identifier
- All exports are at the bottom of db.js (~line 1625)

## Key Features & Patterns

### Coming Soon Mode

- Toggle in Admin > Settings (`coming_soon` setting)
- Middleware intercepts all public routes and renders `coming-soon.ejs`
- Bypass list: `/admin`, `/desk`, `/api/`, `/checkin`, `/coming-soon`, `/preview`, static assets
- Admin, desk staff, and preview sessions bypass automatically
- `/preview` sets session flag to see full site (share this link for testing)
- `/preview/off` returns to Coming Soon view
- No-cache headers prevent stale page caching
- Email signup form on Coming Soon page → `/api/signup` → `email_signups` table

### Checkbox hidden-input pattern

Settings form uses hidden input (value="0") + checkbox (value="1") for boolean fields. When both submit, it creates an array. The server handles this:

```javascript
const val = Array.isArray(req.body[f]) ? req.body[f][req.body[f].length - 1] : req.body[f];
```

### Phone-first customer system

- Phone number is the primary identifier for all customers
- `/admin/phone-booking` has phone input first with autofocus
- `/api/client-lookup?phone=...` returns existing client data for auto-fill
- `/checkin` tablet page does phone lookup → full intake form
- `upsertClient()` creates or updates based on phone

### Check-in Tablet Kiosk

- `checkin.ejs` is a PWA with `checkin-manifest.json`
- Kiosk lockdown: disables right-click, back navigation, keyboard shortcuts, pinch-to-zoom, long-press, text selection
- Auto-resets after 5 minutes idle
- Two-step flow: phone lookup → intake form (name, email, birthday, address, emergency contact, health conditions, allergies, medications, pregnancy, pressure preference, areas to focus/avoid, consent/waiver)

### Expense Tracking

Enhanced system with:
- Recurring frequency: one-time, monthly, yearly
- Startup cost flag
- Vendor and notes fields
- Payment status: paid, due, reimburse (owe someone back)
- Reimbursement tracking: paid_by, due_to fields
- "Who's Owed Money" per-person breakdown
- Categories: Rent, Supplies, Insurance, Marketing, Utilities, Equipment, Laundry, Software, Licensing, Furniture, Build-Out, Signage, General

### Email System

- `lib/email.js` exports: `sendBookingConfirmation`, `sendCancellationEmail`, `sendEmail`
- `sendEmail(to, subject, textMessage)` — generic sender with branded HTML template (teal header with gold accent)
- Email composer at `/admin/send-update` for sending updates to Coming Soon signups
- SMTP not yet configured — pending Google Workspace integration
- Past sent updates are logged in `sent_updates` table

### Open Graph / Link Previews

- `og-image.png` (1200x630) with logo, spa name, tagline, location
- OG meta tags on Coming Soon page use absolute URLs via `baseUrl` variable passed from server
- Main site header has OG tags using relative URLs (will need `baseUrl` when domain is finalized)
- Favicon (32px PNG + ICO + Apple Touch Icon) on all pages

## Settings (Admin > Settings)

Key settings stored in the `settings` table:

- `spa_name`, `spa_phone`, `spa_email`, `spa_address`
- `admin_password`, `desk_password`
- `coming_soon` (0 or 1)
- `booking_advance_days`, `time_slot_interval`
- `cancellation_hours`
- `square_app_id`, `square_access_token`, `square_location_id`, `square_environment`
- `twilio_sid`, `twilio_token`, `twilio_phone`
- `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/availability` | GET | Public | Get available time slots |
| `/api/client-lookup` | GET | Public | Look up client by phone |
| `/api/therapists` | GET | Public | Get active therapists |
| `/api/signup` | POST | Public | Email signup from Coming Soon |
| `/api/member-check` | GET | Public | Check membership status |
| `/api/admin/gift-cert-check` | GET | Staff | Validate gift certificate |
| `/api/admin/discount-check` | GET | Staff | Validate discount code |
| `/api/admin/pin-check` | GET | Staff | Verify therapist PIN |
| `/api/admin/checkout-status/:id` | GET | Admin | Check Square checkout status |

## Common Pitfalls

1. **Checkbox arrays**: Hidden input + checkbox sends array — always take last element
2. **No-cache headers**: Important for Coming Soon toggle to take effect immediately
3. **db/ directory**: Must exist before app starts — not created by git clone (gitignored)
4. **Multer v1**: Using 1.x (not 2.x) — v2 has breaking API changes. Deprecation warnings are expected and harmless
5. **safeAddColumn**: Always use this for schema changes, never modify CREATE TABLE for existing columns
6. **pm2 process name**: Always use `pm2 restart spa` (not the full path)
7. **Git auth**: Pi uses SSH key for GitHub, not HTTPS password auth
8. **OG image caching**: iMessage and social platforms cache previews aggressively — changes may not appear immediately for previously shared links

## Pending / Future Work

- **Google Workspace integration**: Configure SMTP settings for sending emails to signups
- **Square payment processing**: SDK is integrated but needs credentials configured
- **Twilio SMS**: Module ready, needs credentials in settings
- **Google Calendar sync**: `gcal_event_id` column exists on bookings but sync not yet implemented
- **Gallery photos**: No gallery photos uploaded yet
- **Full site content**: Some pages may need content updates before going live
