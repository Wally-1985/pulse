# Pulse — Planning & Technical Notes

This document tracks design decisions, known issues, architectural choices, and outstanding work.

---

## Architecture Decisions

### Why UTC everywhere
Brisbane is AEST (UTC+10). If the frontend uses `toISOString()` to build date strings, a date entered at any time on Apr 20 AEST becomes Apr 19 UTC — entries appear on the wrong day. The fix is a `localDate()` helper in every frontend file that builds `YYYY-MM-DD` from the local date object directly, never via ISO string conversion. The DB stores dates as `DATE` type and the backend always casts with `entry_date::text` to return plain strings.

### working_day_minutes stored per entry
When a new daily entry is created, the current `default_working_hours` setting (or manager override) is stored directly on the entry as `working_day_minutes`. This means changing the setting later has no effect on historical entries — each entry permanently remembers the work day length it was created under. This is intentional.

### Per-team roles
A user's global roles (member/manager/admin) are stored in `user_roles`. But a user can be a manager of one team and a member of another. This is handled via `manager_teams` — if a user has a row there for a given team, they can see that team's dashboard. The Users admin UI shows a per-team dropdown (Member / Manager) for each assigned team.

### Team dashboard deduplication
If a user is in both a parent team and a child team, they would appear twice in the manager dashboard. The query uses `DISTINCT ON (u.id) ... ORDER BY u.id, t.parent_id NULLS FIRST` so each user appears exactly once under their top-level team.

### Backup uses zip + pg_dump
The backup feature shells out to `pg_dump` and `zip`. These must be installed on the server. On Pi/Debian: `sudo apt install -y zip postgresql-client`. The backup creates a temp directory, dumps the DB, copies source files, writes a redacted env file, then zips and deletes the temp dir.

### Zendesk integration is per-user
Unlike SMTP which is system-wide, Zendesk credentials are stored per user in `user_zendesk_settings`. This is because each user authenticates with their own Zendesk account to find tickets they personally commented on. Credentials are stored encrypted-at-rest by PostgreSQL (application layer; consider adding column-level encryption in production).

### Outbound HTTPS requires current OpenSSL + axios
Node.js uses the system OpenSSL library for outbound HTTPS. On Raspberry Pi OS Lite and older Debian installs, the default OpenSSL and CA certificate bundle may be outdated, causing TLS handshake failures with modern services like Zendesk. The fix is `sudo apt install -y ca-certificates openssl`. The Zendesk controller uses `axios` rather than Node's built-in `https` module because axios handles TLS negotiation more gracefully across different environments. Do NOT use `rejectUnauthorized: false` as this disables certificate verification and exposes API tokens to MITM attacks.

---

## Database: Key Gotchas

### ON CONFLICT in PostgreSQL
When using `INSERT ... ON CONFLICT DO UPDATE`, the `SET` clause must use `EXCLUDED.column_name` to reference the values being inserted — not `$2`, `$3` etc. Using parameter placeholders in the SET clause causes a PostgreSQL syntax error.

### Soft deletes
Users are never hard-deleted. `deleted_at` is set instead. All queries must include `WHERE deleted_at IS NULL`. The `getUsers` endpoint already does this.

### Array aggregations
`array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL)` is used to collect roles/teams per user in a single query. Without the `FILTER`, null values appear in the array when there are no joined rows.

### New tables need permissions granted
After running a migration that creates a new table, `pulse_user` won't have access until you explicitly grant it:
```bash
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON TABLE <table_name> TO pulse_user;"
```
The migration script does not handle this automatically for existing installs.

---

## Frontend: Key Gotchas

### Never use toISOString() for dates
Every date operation in the frontend must use the `localDate()` helper:
```js
const localDate = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
```
Files affected: DashboardPage, EntriesListPage, EntryPage, ManagerDashboard.

### Template literals in PowerShell
Writing JSX files via PowerShell heredocs breaks template literals because PowerShell uses backtick as its own escape character. The workaround is to write files via the Linux bash environment and copy to Windows, or use string concatenation instead of template literals in critical places.

### WorkItemRow structure
The WorkItemRow component uses HTML5 drag API for reordering. Key points:
- `draggable={!readOnly}` on the outer div
- `onDragStart` sets `dragItem.current = index`
- `onDragEnter` sets `dragOverItem.current = index`
- `onDragEnd` calls `handleDragSort` which splices the array and calls `rebalance(assignColours(...))`
- The `isDragOver` state drives a visual highlight on the target card

### TimeBar alignment
Drag handles are positioned at `calc(X% - 6px)` with `width: 12px` so the centre of the handle lines up exactly with the colour boundary. The trailing handle (after the last item) allows shrinking the last item to create unallocated time. Unallocated time is shown using an SVG `<pattern>` with diagonal lines at 45°.

---

## API Routes Summary

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET/POST /api/auth/mfa/setup`
- `POST /api/auth/mfa/verify`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:id`

### Entries
- `GET /api/entries/:date` — get entry for a date (optional ?userId= for manager view)
- `POST /api/entries/:date` — upsert entry (creates if new, updates if exists)
- `POST /api/entries/:date/submit` — submit entry
- `GET /api/entries/week` — get week entries (?weekStart=YYYY-MM-DD)

### Manager
- `GET /api/manager/team-status` — daily status (?date=YYYY-MM-DD)
- `GET /api/manager/weekly-summary` — weekly summary (?weekStart=YYYY-MM-DD)
- `GET /api/manager/charts` — chart data (?from=&to=)
- `GET /api/manager/teams`

### Users
- `GET /api/users` — all non-deleted users
- `GET /api/users/:id`
- `POST /api/users` — create user
- `PUT /api/users/:id` — update user (supports teamRoles object)
- `DELETE /api/users/:id` — soft delete
- `POST /api/users/:id/unlock`
- `GET/PUT /api/profile`

### Admin
- `GET/PUT /api/admin/settings`
- `GET/POST /api/admin/holidays`, `DELETE /api/admin/holidays/:id`
- `GET/POST /api/admin/non-working-dates`, `DELETE /api/admin/non-working-dates/:id`
- `GET /api/admin/audit-logs`, `GET /api/admin/audit-logs/export`
- `POST /api/admin/backup/run`, `GET /api/admin/backup/list`, `GET /api/admin/backup/:filename`
- `GET /api/admin/health`
- `GET/POST /api/admin/api-keys`, `DELETE /api/admin/api-keys/:id`

### Zendesk
- `GET /api/zendesk/settings`
- `PUT /api/zendesk/settings`
- `GET /api/zendesk/test`
- `GET /api/zendesk/today`

### Notifications
- `GET /api/notifications`
- `POST /api/notifications/:id/read`

---

## Deployment: Pi-Specific Notes

Pi IP on local network: `192.168.10.22`
- Frontend: port `5173` (Vite dev server)
- Backend: port `3001` (nodemon)
- DB: `pulse_db`, user `pulse_user`
- Admin login: `admin@pulse.local` / `Admin123!`

### After every git pull on Pi
```bash
cd ~/claude/pulse_workspace/pulse
git pull
# Backend restarts automatically via nodemon
```

### DB permissions after adding new tables
```bash
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON TABLE <new_table> TO pulse_user;"
```

### Run migration on existing install
```bash
cd ~/claude/pulse_workspace/pulse/backend
npm run db:migrate
```

Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

### Full re-seed (resets admin user + General team)
```bash
cd ~/claude/pulse_workspace/pulse/backend
npm run db:seed
```

---

## Known Issues / Technical Debt

| Issue | Status | Notes |
|-------|--------|-------|
| SSL errors on Pi for outbound HTTPS | Fixed | Run `sudo apt install -y ca-certificates openssl`; controller uses axios |
| `toISOString()` date shifting | Fixed | All frontend files use `localDate()` helper |
| `admin.controller.js` missing query import | Fixed | Added `const { query } = require(...)` |
| `manager.controller.js` filtering to role=member only | Fixed | Removed role filter — shows all team members |
| `users.controller.js` duplicate `u.last_name` column | Fixed | Removed duplicate in SELECT |
| TimeBar handle misalignment | Fixed | Handles at `calc(X% - 6px)` |
| Zendesk ON CONFLICT SQL using `$2` instead of `EXCLUDED` | Fixed | Uses `EXCLUDED.column` syntax |
| EntryPage JSX broken by PowerShell heredoc | Fixed | Rewrote via bash environment |
| working_day_minutes not persisted per entry | Fixed | Stored at creation, read from entry not setting |
| SSO settings not showing in Admin | Fixed | Conditional render when auth_method === 'sso' |
| Backup only dumped DB | Fixed | Now ZIP with DB + source + settings |
| Per-team roles not supported | Fixed | teamRoles object in users controller |
| Zendesk built-in https module TLS failure | Fixed | Switched to axios; ecdhCurve fix for Node 22/OpenSSL 3.5 post-quantum KEM |
| Zendesk subdomain stored with .zendesk.com suffix | Fixed | Strip .zendesk.com on save in saveSettings |
| Zendesk 429 rate limiting on audit fetch | Fixed | 200ms delay between requests, cap 20 tickets |
| Missing user jameswilliams@agnvet.com.au | Fixed | Was soft-deleted; restored via DB |
| Backup zip failing silently | Fixed | Use relative path in zip command with cwd: BACKUP_DIR |
| Delete button on users | Fixed | Renamed to Archive; Archived Users modal with Restore added |
| Users list missing getArchivedUsers/restoreUser API methods | Fixed | Added to api/index.js |


---

## V2 Feature Progress

### Task 1 — Daily Entry UX (COMPLETE)
- [x] Rename 'Add Work Item' to 'Add Item'
- [x] Move 'Add Item' button above the items list
- [x] Move 'Add 1h Lunch' button above the items list
- [x] Move submit button above the list
- [x] Rename to 'Submit Entry' / 'Resubmit Entry'
- [x] Cancel button left of Resubmit (removed from header)

### Draft / Auto-save (COMPLETE)
- [x] Local draft save, restore on load
- [x] Server-side draft in entry_drafts table, restore banner on load, cleared on submit

### Zendesk Activity Panel (COMPLETE)
- [x] Per-user Zendesk credentials in Profile
- [x] Today's ticket activity panel on Daily Entry page
- [x] Shows: Ticket Created, Public Reply, Internal Note, Status changes, Reopened
- [x] Checkbox per ticket — adds single "Zendesk Tickets" work item
- [x] Uncheck all = work item removed
- [x] TLS fix for Node 22 + OpenSSL 3.5 (ecdhCurve / createSecureContext)
- [x] Rate limiting: 200ms delay, 20 ticket cap

### Ongoing Tasks (COMPLETE)
- [x] ongoing_tasks DB table
- [x] "Done" checkbox on each work item
- [x] Uncompleted items carry forward to next day
- [x] OngoingTasks panel below Zendesk Activity
- [x] + Add button pulls task into today's entry
- [x] Red X to dismiss task permanently
- [x] Sync on entry submit

### Task 2 — Activity Sources (NOT STARTED)
- [ ] Architecture + first working integration (Outlook calendar recommended)

### Task 3 — Staff Roster (COMPLETE)
- [x] Roster start/finish times per user
- [x] Working days Mon-Sun flags per user, Roster Settings tab in Teams

### Task 4 — State-Based Holidays (COMPLETE)
- [x] Australian state field on user profiles and user edit modal
- [x] State selector on holiday records, reminders skip state-specific holidays

### Task 5 — Backup (COMPLETE)
- [x] pg_dump + zip working on Pi
- [x] Delete button per backup
- [x] List refreshes after backup runs
- [x] 120s frontend timeout

### Task 6 — Missing User (COMPLETE)
- [x] jameswilliams@agnvet.com.au restored

### Task 7 — Documentation (IN PROGRESS)
- [x] PLANNING.md updated
- [x] README.md updated
- [ ] Pulse_Planning_Documentation_V2.docx V2 feature status to be updated

### Task 8 — Azure OpenAI Groundwork (NOT STARTED)
- [ ] Admin settings for endpoint, key, deployment, version, toggle
- [ ] Provider abstraction service layer
- [ ] Audit logging + feature flags

### Task 9 — AI Use Case Structures (NOT STARTED)
- [ ] Prompt template store with version field
- [ ] Summary history table
- [ ] AI job/automation table

### Task 11 — Zendesk Team Manager View (COMPLETE)
- [x] Zendesk Activity tab in Team Dashboard with filters, member breakdown, awaiting response

### Tasks 12-14 — Project Management (NOT STARTED)
- [ ] Projects table + status model + priority
- [ ] Task list per project
- [ ] Notes per project
- [ ] User assignments
- [ ] Last activity date auto-update
- [ ] Project health indicator (green/amber/red)
- [ ] Daily entry integration (link work items to projects)
- [ ] Manager dashboard project visibility

### Submission Status Dashboard (COMPLETE)
- [x] Submission Status tab in Team Dashboard with date picker

### Missing Entry Alerts (COMPLETE)
- [x] Configurable alert time in Admin settings, scheduler reads from system_settings
---

## Planned Features (Phase 2)

### Performance Management Module
- Review cycle definition (quarterly, annual, custom)
- Manager creates review for a team member
- Structured goal setting with status tracking (On Track / At Risk / Completed)
- Self-assessment form
- Manager assessment form
- Side-by-side comparison view
- Historical review archive

### Advanced Reporting
- Date range picker for all charts
- Saved report views
- Work type trends over time
- Individual vs team comparison
- Export to CSV/PDF

### SSO Login
- Full OIDC login flow (Azure AD, Google Workspace, Okta)
- Auto-provision users on first SSO login
- Map SSO groups to Pulse teams/roles
- Mixed mode: some users on SSO, others on password

### Additional Integrations
- Jira: show open issues assigned to user
- Freshdesk: same as Zendesk panel
- Slack: reminder messages via bot
- Microsoft Teams: reminder messages via connector

### API Expansion
- Webhook support (entry submitted, user created)
- Bulk entry import (CSV)
- Read-only reporting endpoints for BI tools

---

## Git Workflow

Windows repo: `C:\Users\james\Downloads\pulse_v1\pulse\`
Remote: `git@github.com:Wally-1985/pulse.git`
Pi deployment: `/home/janeadmin/claude/pulse_workspace/pulse/`

Changes are made on Windows via Desktop Commander, committed and pushed from Git Bash, then pulled on the Pi. The Pi runs nodemon which auto-restarts the backend on file changes after `git pull`.

```bash
# On Windows (Git Bash)
cd ~/Downloads/pulse_v1/pulse
git add .
git commit -m "Description of change"
git push

# On Pi
cd ~/claude/pulse_workspace/pulse
git pull
```
