# Cockpit Event Matching System

Web app for managing cockpit derby events: encoding gamecock entries, drag-and-drop matching, fight scheduling, live/TV displays, and real-time board updates.

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

Edit `.env` if needed. Defaults work for local Docker.

### 2. Start the stack

```bash
docker compose up --build -d
```

This starts:
- **app** — Express app on [http://localhost:3000](http://localhost:3000)
- **db** — MySQL 8 with schema from `sql/schema.sql` on first run

### 3. Log in

Open [http://localhost:3000](http://localhost:3000) and use the 6-digit PIN from `.env` (default `112233`).

### Useful commands

```bash
docker compose logs -f app    # App logs
docker compose down         # Stop containers
docker compose down -v      # Stop and remove database volume (fresh DB)
docker compose up --build     # Rebuild and run in foreground
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

For an existing database, apply numbered migrations in `sql/` in order (`001` through `005`).

### 3. Configure environment

Create a `.env` file in the project root (see `.env.example`):

```env
PORT=3000
SESSION_SECRET=change-me-to-a-random-string
LOGIN_PIN=112233
MANUAL_MIXED_TYPE_PASSCODE=112233
MANUAL_WEIGHT_OVERRIDE_PASSCODE=112233
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=matching_db
```

### 4. Run the app

```bash
npm start
```

Development with auto-reload:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the 6-digit PIN.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `SESSION_SECRET` | (built-in fallback) | Express session signing secret |
| `LOGIN_PIN` | `112233` | 6-digit login PIN |
| `MANUAL_MIXED_TYPE_PASSCODE` | `LOGIN_PIN` | Passcode for manual cross-type matches |
| `MANUAL_WEIGHT_OVERRIDE_PASSCODE` | `LOGIN_PIN` | Passcode for manual matches exceeding weight tolerance |
| `DB_HOST` | `localhost` | MySQL host (`db` inside Docker Compose) |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `''` | MySQL password |
| `DB_NAME` | `matching_db` | MySQL database name |

## Project Structure

```
app.js              Entry point, middleware, routes
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
