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

- Node.js 18+
- MySQL 8+

## Setup

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

Create a `.env` file in the project root:

```env
PORT=3000
SESSION_SECRET=change-me-to-a-random-string
LOGIN_PIN=112233
MANUAL_MIXED_TYPE_PASSCODE=112233
MANUAL_WEIGHT_OVERRIDE_PASSCODE=112233
```

Update `db.js` with your MySQL host, user, password, and database name.

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

## Project Structure

```
app.js              Entry point, middleware, routes
db.js               MySQL connection pool
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
