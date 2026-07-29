# Sabong Matching System

Web app for managing sabong derby events: encoding gamecock entries, drag-and-drop matching, fight scheduling, live/TV displays, and real-time board updates.

## Features

- **Events** — Configure derby events with per-type weight limits (cock, stag, bullstag) and give/take tolerance
- **Owners** — Owner registry with "no fight" pair rules
- **Entries** — Encode entries and individual gamecocks (weight, wingband, legband)
- **Matching board** — Drag-and-drop pairing, opponent recommendations, and auto-match
- **Fights** — Reorder fights, set active fight, record results and scores
- **Live / TV** — Public TV views for meron and wala sides
- **Reset / backup** — Clear event data and restore from SQL backups

## Tech Stack

- Node.js + Express 5
- EJS templates
- MySQL (`mysql2`)
- Socket.IO for real-time updates
- Session-based PIN authentication

## Requirements

- **Docker (recommended):** Docker Engine + Docker Compose v2
- **Manual setup:** Node.js 18+ and MySQL 8+

## Quick start (Docker)

### 1. Configure environment

```bash
cp .env.example .env
```

The example file includes distinct override passcodes required for `NODE_ENV=production` (used by Docker). Change all secrets before deploying.

### 2. Start the stack

```bash
docker compose up --build -d
```

This starts:
- **app** — Express app on [http://localhost:3000](http://localhost:3000)
- **db** — MySQL 8 with schema from `sql/schema.sql` on first run

### 3. Log in

Open [http://localhost:3000](http://localhost:3000) and use the 6-digit `LOGIN_PIN` from `.env` (default `112233`).

### Useful commands

```bash
docker compose logs -f app    # App logs
docker compose down         # Stop containers
docker compose down -v      # Stop and remove database volume (fresh DB)
docker compose up --build   # Rebuild and run in foreground
```

Backups created in the app are stored in `./backups` on the host.

To expose MySQL on the host for debugging, add under the `db` service in `docker-compose.yml`:

```yaml
ports:
  - "3307:3306"
```

## Manual setup (without Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database

```bash
mysql -u root -p < sql/schema.sql
```

For an existing database, apply numbered migrations in `sql/` in order (`001` through `006`).

### 3. Configure environment

Copy the template and edit as needed:

```bash
cp .env.example .env
```

For local development, either keep `NODE_ENV=development` (allows default fallbacks) or set production values explicitly. See [Environment variables](#environment-variables) below.

### 4. Run the app

```bash
npm start          # production mode (validates required env vars)
npm run dev        # development mode with nodemon
npm test           # run matching unit tests
```

Open [http://localhost:3000](http://localhost:3000) and log in with the 6-digit PIN.

## Environment variables

Copy from [`.env.example`](.env.example). All configuration is loaded via [`config/index.js`](config/index.js).

| Variable | Default (dev) | Description |
|----------|---------------|-------------|
| `NODE_ENV` | — | Set to `production` to enforce required secrets |
| `PORT` | `3000` | HTTP server port |
| `SESSION_SECRET` | dev fallback | Express session signing secret |
| `LOGIN_PIN` | `112233` | 6-digit login PIN |
| `MANUAL_MIXED_TYPE_PASSCODE` | `LOGIN_PIN` | Passcode for manual cross-type matches |
| `MANUAL_WEIGHT_OVERRIDE_PASSCODE` | `LOGIN_PIN` | Passcode for manual matches exceeding weight tolerance |
| `COOKIE_SECURE` | `false` | Set `true` when serving over HTTPS |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy (for correct client IP + secure cookies) |
| `DB_HOST` | `localhost` | MySQL host (`db` inside Docker Compose) |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `''` | MySQL password |
| `DB_NAME` | `matching_db` | MySQL database name |

### Production requirements

When `NODE_ENV=production`, the app **refuses to start** unless:

- `SESSION_SECRET` is set
- `LOGIN_PIN` is a 6-digit code
- `MANUAL_MIXED_TYPE_PASSCODE` is set and **differs** from `LOGIN_PIN`
- `MANUAL_WEIGHT_OVERRIDE_PASSCODE` is set and **differs** from `LOGIN_PIN`

Set `COOKIE_SECURE=true` when running behind HTTPS.
Set `TRUST_PROXY=true` when running behind nginx, Caddy, or similar so client IPs and secure cookies work correctly.

Login is rate-limited to 5 failed attempts per IP every 15 minutes.

Manual match overrides (weight / mixed type) are stored in the `override_logs` table and viewable at `/audit/overrides`.

## Project Structure

```
app.js              Entry point, middleware, routes
config/             Environment validation and app config
db.js               MySQL connection pool
docker/             Container entrypoint scripts
Dockerfile          App container image
docker-compose.yml  App + MySQL stack
controllers/        Request handlers
models/             Database queries
routes/             HTTP route definitions
views/              EJS templates
public/             Static CSS and client JS
middleware/         Auth guard
services/           Backup/restore logic
socket/             Socket.IO event rooms
sql/                Schema and migrations
backups/            SQL backup storage (gitignored)
```

## Routes

| Path | Auth | Description |
|------|------|-------------|
| `/login` | Public | PIN login |
| `/tv/meron`, `/tv/wala` | Public | TV display views |
| `/` | Required | Dashboard |
| `/events` | Required | Event management |
| `/owners` | Required | Owner and no-fight management |
| `/entries` | Required | Entry encoding |
| `/chickens` | Required | Gamecock editing |
| `/matching` | Required | Matching board |
| `/fights` | Required | Fight management |
| `/live` | Required | Live board |
| `/reset` | Required | Data reset and restore |
| `/audit/overrides` | Required | Manual override audit log + CSV export |

## Matching Rules

Auto-match and manual confirm enforce these constraints:

- Same owner cannot be matched against themselves
- Owner "no fight" pairs are blocked
- Gamecocks must be `available` and within event weight/type rules
- Weight difference must be within the event's give/take tolerance (manual override available with passcode)
- Auto-match additionally enforces a 5-fight entry spacing rule to avoid repeat entry appearances

See `controllers/matchingController.js` for the full algorithm.

## License

ISC
