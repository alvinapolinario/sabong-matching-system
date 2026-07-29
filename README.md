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
| `/health` | Public | Health check (DB ping) |
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
- Auto-match additionally enforces entry spacing (default: last 5 fights) so the same entry does not appear again too soon

Full algorithm, entry-spacing semantics, and performance notes: **[docs/MATCHING.md](docs/MATCHING.md)**.

Optional future enhancements (entry-pair spacing, global pairing): **[docs/FUTURE_MATCHING_OPTIONS.md](docs/FUTURE_MATCHING_OPTIONS.md)**.

| Env var | Default | Purpose |
|---------|---------|---------|
| `AUTO_MATCH_ENTRY_GAP` | `5` | Number of recent fights used for auto-match entry spacing |

## Socket.IO events

Clients join an event room with `socket.emit('event:join', eventId)`.

| Event | Payload | When emitted |
|-------|---------|--------------|
| `pool:updated` | `{ event_id }` | Matching pool changes |
| `match:created` | `{ event_id, match? }` | New fight confirmed |
| `match:deleted` | `{ event_id }` | Match removed |
| `fights:updated` | `{ event_id }` | Reorder, result, status, TV changes |
| `matches:updated` | `{ event_id }` | Alias of `fights:updated` |
| `tv:updated` | `{ event_id }` | Active TV fight or side changed |

Pages that auto-refresh: Matching Board, Fights, Live Board, TV displays.

### Multi-operator smoke test

1. Open **Matching**, **Fights**, and **Live Board** for the same event in separate browser tabs.
2. Confirm a manual match on Matching — Fights and Live should update within ~1s.
3. Reorder fights on Fights — other tabs should refresh.
4. Record a fight result — Live and Matching reflect the update.
5. Set an active TV fight — `/tv/meron` and `/tv/wala` reload when scoped to that event.

## Production

### Health check

Public endpoint for uptime monitors and load balancers:

```bash
curl -f http://localhost:3000/health
```

Returns `200` with `{ "ok": true, "status": "healthy", "database": "connected" }` when MySQL is reachable, or `503` when not.

### Process manager (PM2)

```bash
npm ci --omit=dev
cp .env.example .env   # edit for production
NODE_ENV=production pm2 start app.js --name sabong-matching
pm2 save
pm2 startup
```

### systemd (alternative)

```ini
[Unit]
Description=Sabong Matching System
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/sabong-matching-system
Environment=NODE_ENV=production
EnvironmentFile=/opt/sabong-matching-system/.env
ExecStart=/usr/bin/node app.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name matching.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Set in `.env`:

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

### MySQL backup schedule

The app creates SQL backups automatically before reset/restore via `/reset`. For scheduled off-site backups, run `mysqldump` on the host:

```bash
# /etc/cron.daily/sabong-mysql-backup
mysqldump -h localhost -u root -p"$DB_PASSWORD" \
  --single-transaction --routines --triggers matching_db \
  > /var/backups/sabong/matching_db_$(date +%F).sql
```

In Docker, backups written by the app land in `./backups` on the host (mounted volume). Copy that directory to external storage after each event.

### Backup and recovery

| Scenario | Action |
|----------|--------|
| **Before reset** | App auto-creates `matching_db_before-reset_*.sql` in `backups/` |
| **Before restore** | App auto-creates `matching_db_before-restore_*.sql` |
| **Manual backup** | Use `/reset` page or run `mysqldump` (see above) |
| **Restore from UI** | `/reset` → Restore Backup → select file → type `RESET` |
| **Restore from CLI** | `mysql -u root -p matching_db < backups/your-file.sql` |

**Recovery procedure**

1. Stop the app (avoid writes during restore): `pm2 stop sabong-matching` or `docker compose stop app`
2. Confirm the backup file exists in `backups/`
3. Restore via `/reset` (creates a safety backup first) or CLI `mysql ... < backup.sql`
4. Restart the app and verify: `curl -f http://localhost:3000/health`
5. Log in and spot-check Events, Matching, and Fights for the active event

**Note:** Restore replaces the entire database contents. Override audit logs (`override_logs`) are included in full dumps and cleared on full reset.

## License

ISC
