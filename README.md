# Pulse — Team Performance Tracker

A web application for capturing daily team activity, giving managers visibility across their teams, and building a foundation for performance management.

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

### 1. Database Setup

```bash
createdb pulse_db
createuser pulse_user
psql -c "ALTER USER pulse_user WITH PASSWORD 'your_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;"
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your DB credentials and settings
npm install
npm run db:migrate     # Creates all tables
npm run db:seed        # Creates default admin user
npm run dev            # Starts on port 3001
```

Default admin login after seeding:
- **Email**: `admin@pulse.local`
- **Password**: `Admin123!`
- ⚠️ Change this immediately after first login

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev            # Starts on port 5173
```

Open http://localhost:5173

---

## Environment Variables (backend/.env)

| Variable | Description |
|----------|-------------|
| `PORT` | API server port (default: 3001) |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default: 5432) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | Secret for JWT signing — **change this!** |
| `JWT_EXPIRES_IN` | Token expiry (default: 24h) |
| `FRONTEND_URL` | Frontend URL for CORS (default: http://localhost:5173) |
| `APP_URL` | App URL for email links |
| `SMTP_*` | SMTP settings (configure in Admin Settings after login) |

---

## Project Structure

```
pulse/
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection, migrations, seed
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth, role guards
│   │   ├── routes/         # Express routes
│   │   ├── services/       # Audit, email, reminders
│   │   └── index.js        # App entry point
│   └── .env.example
│
└── frontend/
    └── src/
        ├── api/            # Axios API client
        ├── components/     # UI components, layout
        ├── context/        # Auth context
        └── pages/          # Route pages
            ├── auth/
            ├── dashboard/
            ├── entries/    # Daily entry form
            ├── manager/    # Manager dashboard
            └── admin/      # Admin settings
```

---

## Roles

| Role | Access |
|------|--------|
| **Member** | Own daily entries only |
| **Manager** | Assigned team dashboards, member entries |
| **Admin** | System settings, users, teams, backups, audit logs |

A user can hold multiple roles.

---

## Phase 1 Features (this build)

- ✅ Authentication (email/password, MFA/TOTP, sessions)
- ✅ User & team management
- ✅ Daily entry form with time allocation bar
- ✅ Draft → Submitted → Read-only workflow
- ✅ Manager dashboard (day status, weekly summary, charts)
- ✅ Manager settings (leave periods, working hours)
- ✅ In-app notifications + email reminders
- ✅ Full audit trail
- ✅ Admin settings (SMTP, holidays, backups, API keys, system health)

## Coming in Phase 2

- Advanced reporting & saved views
- Performance management module integration
- Expanded API capabilities

---

## Deployment to VPS

The backend is designed to run behind nginx or a reverse proxy. Set `NODE_ENV=production` and configure your process manager (pm2 recommended):

```bash
npm install -g pm2
cd backend
pm2 start src/index.js --name pulse-api
```

For the frontend, build and serve statically:

```bash
cd frontend
npm run build
# Serve the dist/ folder with nginx
```
