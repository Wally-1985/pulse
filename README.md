# Pulse — Team Performance Tracker

A web application for capturing daily team activity, giving managers visibility across their teams, and building a foundation for performance management.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS |
| Backend | Node.js 22 + Express 5 |
| Database | PostgreSQL 14+ |
| Auth | JWT + bcrypt + TOTP (MFA) |
| Integrations | Zendesk API |

---

## System Requirements

### Server / Development Machine

- **Node.js** 18+ (22 recommended)
- **npm** 9+
- **PostgreSQL** 14+
- **OpenSSL** — must be current (required for outbound HTTPS to Zendesk and other integrations)
- **ca-certificates** — must be current (required for SSL trust chain)
- **zip** — required for the backup feature
- **pg_dump** — included with PostgreSQL client tools, required for backup feature

On Raspberry Pi / Debian / Ubuntu, run this before setup:

```bash
sudo apt update
sudo apt install -y ca-certificates openssl zip postgresql-client
```

### Why OpenSSL must be up to date

Node.js uses the system OpenSSL for outbound HTTPS connections. If OpenSSL or the CA certificate bundle is outdated, connections to external services (Zendesk, SMTP providers, etc.) will fail with SSL handshake errors. Always run the apt command above on a fresh Pi or server before starting.

### Browser Support

- Chrome 100+, Edge 100+, Firefox 100+, Safari 15+
- Mobile: iOS Safari 15+, Chrome for Android

---

## Quick Start

### 1. Install System Dependencies

```bash
sudo apt update
sudo apt install -y ca-certificates openssl zip postgresql postgresql-client nodejs npm
```

### 2. Database Setup

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE pulse_db;
CREATE USER pulse_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;
ALTER DATABASE pulse_db OWNER TO pulse_user;
GRANT ALL ON SCHEMA public TO pulse_user;
ALTER DATABASE pulse_db SET timezone TO 'UTC';
\q
```

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
nano .env          # Fill in your DB credentials and JWT secret
npm install
npm run db:migrate
npm run db:seed
npm run dev        # Starts on port 3001
```

Default admin credentials after seeding:

- **Email**: `admin@pulse.local`
- **Password**: `Admin123!`
- ⚠️ Change this password immediately after first login

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev        # Starts on port 5173
```

Open **http://localhost:5173** (or your server IP, e.g. http://192.168.1.x:5173)

---

## Environment Variables

All variables go in `backend/.env`. Copy from `backend/.env.example` to start.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `pulse_db` |
| `DB_USER` | Database user | `pulse_user` |
| `DB_PASSWORD` | Database password | — |
| `JWT_SECRET` | JWT signing secret — **must be changed in production** | — |
| `JWT_EXPIRES_IN` | Token expiry | `24h` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `APP_URL` | App URL for email links | `http://localhost:5173` |
| `BACKUP_DIR` | Directory for backup ZIP files | `./backups` |

SMTP settings are configured via Admin Settings in the UI, not in `.env`.

---

## Accessing Over a Network

To access Pulse from other devices on your network:

1. `frontend/vite.config.js` already has `host: '0.0.0.0'` set.
2. In `backend/.env`, set:

```
FRONTEND_URL=http://192.168.x.x:5173
APP_URL=http://192.168.x.x:5173
```

---

## Project Structure

```
pulse/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js       # PostgreSQL pool — forces UTC timezone on every connection
│   │   │   ├── migrate.js        # Full schema creation + ALTER TABLE for existing installs
│   │   │   └── seed.js           # Default admin user + General team + manager assignment
│   │   ├── controllers/
│   │   │   ├── admin.controller.js      # Settings, backups, audit logs, API keys, health
│   │   │   ├── auth.controller.js       # Login, MFA, sessions, password reset
│   │   │   ├── entries.controller.js    # Daily entries CRUD + week view
│   │   │   ├── manager.controller.js    # Team dashboard, weekly summary, charts
│   │   │   ├── notifications.controller.js
│   │   │   ├── teams.controller.js
│   │   │   ├── users.controller.js      # User management + per-team role assignment
│   │   │   └── zendesk.controller.js    # Zendesk API integration (per-user)
│   │   ├── middleware/
│   │   │   └── auth.js           # JWT verification + role guards (admin/manager)
│   │   ├── routes/
│   │   │   └── index.js          # All API routes (~55 endpoints)
│   │   ├── services/
│   │   │   ├── audit.js          # Writes to audit_logs table
│   │   │   ├── email.js          # Nodemailer + welcome/reminder email templates
│   │   │   └── reminders.js      # Runs daily at 10am, sends missing-entry emails
│   │   └── index.js              # Express app entry point
│   ├── backups/                  # Backup ZIP storage (gitignored)
│   ├── .env                      # Local config (gitignored)
│   └── .env.example
│
└── frontend/
    └── src/
        ├── api/                  # Axios client + all endpoint wrappers (including zendeskApi)
        ├── components/
        │   ├── layout/           # AppLayout, sidebar with Log Today button
        │   ├── ui/               # Button, Input, Card, Badge, Modal, Avatar, Spinner, etc.
        │   ├── TimeBar.jsx       # Draggable time allocation bar with unallocated hatching
        │   └── ZendeskActivity.jsx  # Today's Zendesk ticket panel
        ├── context/
        │   └── AuthContext.jsx
        └── pages/
            ├── auth/             # Login, forgot/reset password
            ├── dashboard/        # Home dashboard
            ├── entries/          # My Entries list + Daily Entry form
            ├── manager/          # Team Dashboard (daily, weekly, charts)
            ├── admin/            # Settings, Users, Teams pages
            └── profile/          # Profile, Security, Sessions, Zendesk settings
```

---

## Roles & Permissions

| Role | Access |
|------|--------|
| **Member** | Own daily entries only |
| **Manager** | Team dashboards, view/navigate member entries |
| **Admin** | All settings, all users, teams, backups, audit logs, API keys |

Users can hold multiple roles. A user can be a **Manager** of one team and a **Member** of another — configured per-team in the Users admin page.

---

## Features

### Daily Entry
- One entry per user per working day
- Work items with type (Project, BAU/Support, Maintenance, Lunch, Other), description, and time
- Draggable time allocation bar with 15-minute snapping
- Drag-to-reorder work items — time bar updates to match
- Trailing handle to shrink last item and create unallocated time
- Unallocated time shown as semi-transparent diagonal-hatched grey segment
- Colour bar on each work item matches its segment in the time bar
- Forward-date planning (future entries saved as draft, cannot submit until that date)
- Draft → Submitted → Read-only workflow
- Click "Edit Entry" to unlock a submitted entry, "Re-submit Entry" to resubmit
- Auto-save on every change with visual indicator
- Today's Zendesk activity panel on the right (if configured)

### My Entries
- Weekly calendar view (Mon–Fri)
- Top 3 work items by time shown per day card
- Mini time bar per day including unallocated segment
- Week navigation (prev/next week)
- Quick "Log Today" button in sidebar and top of page

### Manager Dashboard
- **Daily Status** tab — all team members with submission status for each day of the week
- Each user appears once under their highest-level team (no duplicates)
- Click a member card to expand and see their work items
- **This Week** tab — submitted days count + work type breakdown per member
- **Charts** tab — team-wide work type distribution (pie) + daily submission counts (bar)

### Admin Settings
- **General** — app name, default working hours, authentication method, SSO configuration
- **SMTP** — email server configuration for reminders and welcome emails
- **Holidays** — public holidays excluded from missing-entry reminders
- **Audit Log** — full action history with CSV export
- **Backups** — full ZIP backup (DB + source + settings), download from UI
- **API Keys** — create/revoke scoped API keys
- **System Health** — DB status, backup count, Node version, uptime

### Zendesk Integration (per-user)
- Each user configures their own Zendesk credentials in Profile → Zendesk
- Today's ticket activity appears on the Daily Entry page right panel
- Shows: ticket number (clickable link), title, status badge, reply type (Public Reply / Internal Note)
- "+ Add" button creates a work item from a ticket instantly
- Requires outbound HTTPS from the server to `*.zendesk.com`

### Security
- JWT with configurable expiry + server-side session tracking
- MFA via TOTP (Google Authenticator, Authy, 1Password, etc.)
- Account lockout after 5 failed login attempts
- Password complexity enforcement
- Session revocation (logout all devices)
- Full audit trail on all create/update/delete actions

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts with soft delete |
| `roles` | member, manager, admin |
| `user_roles` | User ↔ global role assignments |
| `teams` | Teams with optional parent_id for hierarchy |
| `user_teams` | User ↔ team memberships |
| `manager_teams` | Which teams a manager can see |
| `manager_user_settings` | Per-user overrides: working hours, leave dates |
| `daily_entries` | One per user per date; stores `working_day_minutes` at creation |
| `work_items` | Work items within a daily entry |
| `sessions` | JWT session tracking (for revocation) |
| `audit_logs` | Immutable action log |
| `notifications` | In-app notification inbox |
| `system_settings` | Key/value app config (working hours, SMTP, SSO, etc.) |
| `public_holidays` | Dates excluded from entry reminders |
| `non_working_dates` | Additional non-working dates |
| `api_keys` | External API access (hashed, scoped) |
| `user_zendesk_settings` | Per-user Zendesk subdomain, email, API token |

---

## Timezone Handling

This is critical and easy to get wrong:

- The DB connection forces `SET timezone = UTC` on every connection
- The backend uses UTC dates for all queries
- The **frontend never uses `toISOString()`** — all date strings are built with `localDate()` helpers to avoid UTC offset shifts (e.g. Brisbane AEST+10 would shift Apr 20 → Apr 19 with toISOString)
- `working_day_minutes` is stored on each entry **at creation time** — changing the "Default Working Hours" setting only affects new entries, never historical ones

---

## Backup Contents

Each backup ZIP (Admin → Backups → Run Backup Now) contains:

- `database.sql` — full `pg_dump` of the database
- `app/backend/src/` — all backend source files
- `app/frontend/src/` — all frontend source files
- `app/backend/package.json` + `app/frontend/package.json`
- `env.redacted.txt` — `.env` config with passwords/secrets replaced with `***REDACTED***`
- `settings.json` — current system_settings table export (non-sensitive keys only)

Requires `pg_dump` and `zip` on the server.

---

## Troubleshooting

### SSL / HTTPS errors connecting to external services

```bash
sudo apt update && sudo apt install -y ca-certificates openssl
```

This is required on Raspberry Pi and older Debian/Ubuntu installs. Node.js uses the system certificate store for outbound HTTPS connections.

### PostgreSQL permission denied

```bash
sudo -u postgres psql -d pulse_db -c "GRANT ALL ON SCHEMA public TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pulse_user;"
```

### New table added (permission denied on specific table)

```bash
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON TABLE <table_name> TO pulse_user;"
```

### Entries showing wrong date / timezone issues

```bash
sudo -u postgres psql -d pulse_db -c "ALTER DATABASE pulse_db SET timezone TO 'UTC';"
```

Then restart the backend. All entry dates should use `entry_date::text` casts in SQL to return `YYYY-MM-DD` strings, not timestamps.

### Reminders not sending

Ensure SMTP is configured in Admin → SMTP. The reminder service runs daily at 10am server time. Check backend logs for `[Reminders]` output.

### Backend won't start — SyntaxError or missing module

Check for duplicate `require` statements or missing closing braces. Run:

```bash
node --check src/index.js
```

---

## Zendesk Setup Guide

1. Go to **Profile → Zendesk** tab
2. Enter your Zendesk **subdomain** — e.g. `acme` from `acme.zendesk.com`
3. Enter your **Zendesk email address**
4. Generate an API token: Zendesk Admin → **Apps & Integrations → Zendesk API → API Tokens → Add API Token**
5. Paste the token and click **Save Settings**
6. Click **Test Connection** to verify — you should see your Zendesk name confirmed
7. Open any Daily Entry — **Today's Zendesk Activity** panel appears on the right

The panel auto-loads on page open and shows all tickets you commented on today with reply type. Click **+ Add** to instantly create a matching work item.

---

## Deployment (Production)

### Backend with PM2

```bash
npm install -g pm2
cd backend
NODE_ENV=production pm2 start src/index.js --name pulse-api
pm2 save
pm2 startup
```

### Frontend (static build)

```bash
cd frontend
npm run build
# Serve the dist/ folder with nginx or similar
```

### Recommended Nginx Config

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /path/to/pulse/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Roadmap

### Phase 2 (Planned)
- Advanced reporting with saved views and date range filters
- Performance management module (review cycles, structured goal tracking)
- Expanded public API for third-party integrations
- SSO login implementation (Azure AD, Google Workspace)
- Mobile-optimised views

### Future Considerations
- Slack / Teams integration for entry reminders
- Additional integrations: Jira, Freshdesk, ServiceNow
- Manager annotation on submitted entries
- AI-assisted work item summarisation
