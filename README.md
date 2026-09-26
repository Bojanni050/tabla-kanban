# Kanban — Project Management App

A modern Trello-like kanban board built with React, TypeScript, Express, Prisma, and PostgreSQL.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (via Prisma ORM)
- **Real-time collaboration:** Server-Sent Events (`GET /api/realtime`)

---

## Running Kala with Docker

The production setup runs three containers with Docker Compose:

```
                     host port 8080 (KALA_PORT)
                              │
        ┌─────────────────────▼─────────────────────┐
        │ frontend  (nginx)                         │   network "edge"
        │   /            static React build         │
        │   /api/*       ──proxy──▶ backend:3001    │
        │   /api/realtime ─proxy──▶ backend:3001    │   (Server-Sent Events, unbuffered)
        └─────────────────────┬─────────────────────┘
                              │
        ┌─────────────────────▼─────────────────────┐
        │ backend   (Node.js / Express / Prisma)    │   networks "edge" + "internal"
        │   runs `prisma migrate deploy` on start   │
        └─────────────────────┬─────────────────────┘
                              │  internal network only
        ┌─────────────────────▼─────────────────────┐
        │ postgres  (PostgreSQL 16)                 │   network "internal" (no outside access)
        │   named volume: postgres_data             │
        └───────────────────────────────────────────┘
```

- The browser only ever talks to **one origin** (the nginx container). The frontend is built with a relative API URL (`/api`), so there is no CORS and no second port to publish.
- **Only the frontend port is published.** The backend and PostgreSQL are reachable solely on private Docker networks; PostgreSQL is never exposed to the host.
- The backend starts only once PostgreSQL passes its health check, and the frontend starts only once the backend is healthy.
- Prisma migrations are applied automatically each time the backend starts.

### 1. Clone the repository

```bash
git clone <repository-url> kala
cd kala
```

Docker with the Compose plugin (`docker compose`) is the only requirement.

### 2. Create `.env`

```bash
cp .env.example .env
```

`.env` holds your secrets and is git-ignored — never commit it. `docker compose` reads it automatically.

### 3. Configure the environment variables

Open `.env` and replace every `CHANGE_ME`. Generate strong values with:

```bash
openssl rand -hex 24   # for POSTGRES_PASSWORD
openssl rand -hex 32   # for SESSION_SECRET
```

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_DB` | yes | Database name (default in the template: `kala`). |
| `POSTGRES_USER` | yes | Database user (default: `kala`). |
| `POSTGRES_PASSWORD` | yes | Database password. Keep it URL-safe (letters and digits) because it is embedded in `DATABASE_URL`. |
| `SESSION_SECRET` | yes | Signs session cookies. The backend refuses to start in production without it. Changing it logs everyone out. |
| `COOKIE_SECURE` | no | `true` when Kala is served over HTTPS, `false` (default) for plain `http://localhost`. |
| `KALA_PORT` | no | Host port to publish Kala on (default `8080`). |
| `KALA_PUBLIC_URL` | no | The URL users open in the browser (default `http://localhost:8080`). |

`DATABASE_URL` is assembled by `docker-compose.yml` from the PostgreSQL variables (`postgresql://USER:PASSWORD@postgres:5432/DB?schema=public`), so the password is only stored once. `NODE_ENV=production` and the backend port are set by the compose file. Real-time collaboration needs no extra configuration.

> **PostgreSQL only reads `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` when the data volume is first created.** Editing them later does not change an existing database. To change the password afterwards, run `ALTER USER` inside the database *and* update `.env`.

### 4. Start Docker Compose

```bash
docker compose up -d
```

The first run builds the images, creates the database volume and applies all migrations. Check that everything is healthy:

```bash
docker compose ps
```

### 5. Database migrations

Migrations run automatically: on every start the backend executes `prisma migrate deploy`, which applies any pending migrations from `server/prisma/migrations` and does nothing if the database is up to date. The Prisma client is generated while the image is built.

To run them manually (for example after pulling new code and rebuilding) or to check the state:

```bash
docker compose exec backend ./node_modules/.bin/prisma migrate deploy
docker compose exec backend ./node_modules/.bin/prisma migrate status
```

`prisma migrate dev` and the seed script are development tools and are **not** used in the production containers. A fresh production database starts empty — register your first account in the UI.

### 6. Access Kala

Open **http://localhost:8080** (or the port you set in `KALA_PORT`) and create an account.

Health checks: `http://localhost:8080/healthz` (nginx) and `http://localhost:8080/api/health` (backend).

To serve Kala on a real domain, put a TLS-terminating reverse proxy in front of the frontend container, then set `COOKIE_SECURE=true` and `KALA_PUBLIC_URL=https://your-domain`. That proxy must forward `X-Forwarded-Proto` and must **not buffer** `/api/realtime` (a Server-Sent Events stream): for nginx use `proxy_buffering off;` and a long `proxy_read_timeout`, for Caddy/Traefik streaming works by default.

### 7. View logs

```bash
docker compose logs -f              # all services
docker compose logs -f backend      # a single service
docker compose logs --tail=100 postgres
```

### 8. Stop the application

```bash
docker compose stop          # stop containers, keep everything
docker compose down          # remove containers and networks - the database volume is KEPT
docker compose down -v       # ALSO DELETES THE DATABASE VOLUME - all data is lost
```

The database lives in the named volume `postgres_data` (`docker volume ls`), not in a container, so it survives restarts, `docker compose down`, and re-creating the PostgreSQL container.

### 9. Back up PostgreSQL

Create a backup (custom `pg_dump` format) and copy it out of the container. This works the same on Linux, macOS and Windows:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" -f /tmp/kala.dump'
docker compose cp postgres:/tmp/kala.dump ./kala-backup.dump
docker compose exec -T postgres sh -c 'rm /tmp/kala.dump'
```

Restore it into the running database (replaces the current contents):

```bash
docker compose cp ./kala-backup.dump postgres:/tmp/kala.dump
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/kala.dump'
docker compose exec -T postgres sh -c 'rm /tmp/kala.dump'
```

**Automated backups.** `scripts/backup-db.sh` does the backup step for you: it dumps the database, checks that the dump can be read back, and keeps the newest 14 files in `backups/` (git-ignored). Run it from anywhere; it exits non-zero on any failure, so cron/Plesk can report problems.

```bash
bash scripts/backup-db.sh                 # one backup now
KEEP=30 bash scripts/backup-db.sh         # keep 30 instead of 14
BACKUP_DIR=/srv/kala-backups bash scripts/backup-db.sh
```

To run it daily, add a Plesk *Scheduled Task* (Tools & Settings → Scheduled Tasks) with the command below, run as a user that may use Docker (root, or `bojan` if he is in the `docker` group):

```bash
/bin/bash /opt/kala/scripts/backup-db.sh >> /opt/kala/backups/backup.log 2>&1
```

Store backups somewhere other than the Docker host (for example `rsync` or `scp` the newest dump to another machine), and test restoring them.

### Updating

```bash
git pull
docker compose up -d --build
```

Pending migrations are applied automatically when the new backend starts.

### Operational notes

- **Sessions live in the backend's memory.** Restarting or re-creating the backend container signs users out (they just log in again); no board data is lost, because it is all in PostgreSQL.
- **Run a single backend container.** Real-time board rooms are also kept in that process's memory, so scaling the backend to several replicas would split collaborators into separate rooms.
- Container logs are rotated (`10m` × 3 files per service).

### Deploying on a Strato server with Plesk

Plesk's own nginx keeps ports 80/443 and the TLS certificate; Kala runs as the Docker stack above, listening only on `127.0.0.1`, and Plesk forwards your domain to it.

**Requirements**

- A Strato **VPS or dedicated server** with root access and Plesk (shared web hosting cannot run Docker). Plesk supports Docker on 64-bit Ubuntu 18.04+, Debian 10+, AlmaLinux/Rocky 8+.
- The Plesk **Docker extension** (Tools & Settings → Extensions). Depending on your Plesk edition it may need a Docker licence — see the [Plesk Docker documentation](https://docs.plesk.com/en-US/obsidian/administrator-guide/plesk-administration/using-docker.75823/).
- A domain (or subdomain, e.g. `kala.example.com`) whose DNS `A` record points at the server, added to Plesk as a website with a Let's Encrypt certificate (Websites & Domains → the domain → SSL/TLS Certificates), and HTTP→HTTPS redirect enabled.
- Ports 80 and 443 open in the Strato firewall. Kala's own port is **not** opened: it is bound to localhost.

**1. Put the code on the server — outside `httpdocs`**

Anything inside a domain's web root can be downloaded, and the checkout will contain your `.env`. Clone next to the web root instead, over SSH (or as root):

```bash
cd /var/www/vhosts/kala.example.com
git clone https://github.com/Bojanni050/tabla-kanban.git kala
cd kala
```

**2. Create `.env`**

```bash
cp .env.example .env
chmod 600 .env
```

Edit it (values as described in step 3 above), setting in particular:

```
POSTGRES_PASSWORD=<openssl rand -hex 24>
SESSION_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true                      # Plesk serves Kala over HTTPS
KALA_BIND_ADDRESS=127.0.0.1             # only Plesk's nginx can reach Kala
KALA_PORT=8080                          # pick a free port: ss -ltn | grep 8080
KALA_PUBLIC_URL=https://kala.example.com
```

**3. Build and start the stack**

*Over SSH (most reliable):*

```bash
cd /var/www/vhosts/kala.example.com/kala
docker compose up -d --build
docker compose ps        # postgres, backend, frontend should all become "healthy"
```

*Or in the Plesk UI:* open the Docker extension, use **Compose**, add a project from a file in the domain's home directory (*Webspace*) and select `kala/docker-compose.yml`, then deploy. Plesk builds the images from the checkout. Make sure the `.env` next to the compose file is picked up (the deployed stack must show your `POSTGRES_*` values, not empty ones); if not, use the SSH method.

**4. Send the domain to the container**

- *Plesk Docker proxy rules (documented by Plesk):* in Docker → Containers → `kala-frontend-1` → Settings, turn off **Automatic port mapping** and map container port `8080` to host port `8080`; then Websites & Domains → the domain → **Docker Proxy Rules** → Add Rule with URL `/`, that container and that port.
- *Or plain nginx directives:* Websites & Domains → the domain → **Apache & nginx Settings**, untick **Proxy mode**, and add to **Additional nginx directives**:

  ```nginx
  location ^~ / {
      proxy_pass http://127.0.0.1:8080;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 3600s;
  }
  ```

The forwarded protocol header is what lets Kala mark its session cookie `Secure`. Real-time updates (Server-Sent Events) work through Plesk's nginx because Kala's frontend container sends `X-Accel-Buffering: no` on the stream, which tells Plesk's nginx not to buffer it.

**5. Check it**

```bash
curl -i https://kala.example.com/api/health       # {"status":"ok"}
ss -ltn | grep 8080                               # must show 127.0.0.1:8080, not 0.0.0.0
```

Then open `https://kala.example.com`, register, and open the same board in two browsers to confirm live updates.

**Updating and backups**

```bash
cd /var/www/vhosts/kala.example.com/kala
git pull && docker compose up -d --build
```

**Automatic deployment (optional).** `.github/workflows/deploy.yml` deploys on every push to `main` by SSHing into the server, running `git reset --hard origin/main` and `docker compose up -d --build --wait` (your `.env` is untracked and stays untouched). Add these repository secrets under Settings → Secrets and variables → Actions; until all four exist the workflow skips itself:

| Secret | Value |
|--------|-------|
| `SSH_HOST` | server host name or IP |
| `SSH_USER` | SSH user that may run `docker` |
| `SSH_PRIVATE_KEY` | private key whose public half is in that user's `~/.ssh/authorized_keys` |
| `DEPLOY_PATH` | the checkout folder on the server, e.g. `/var/www/vhosts/example.com/kala` |

The first deployment (clone, `.env`, Plesk proxy) still has to be done by hand as described above. You can also start the workflow manually from the repository's Actions tab.

Plesk's own backups do **not** include Docker volumes. Schedule the PostgreSQL backup from section 9 (for example as a Plesk *Scheduled Task*) and copy the dump off the server.

---

## Transactional email (Resend)

Kala sends board invitation emails through [Resend](https://resend.com). The
integration is configured with three environment variables (already in
`.env.example`):

```env
RESEND_API_KEY="re_..."                  # API key from Resend - backend only, never in Git
EMAIL_FROM="Kala <noreply@kala.studiovanderheide.nl>"
APP_URL="https://kala.studiovanderheide.nl"
```

- `RESEND_API_KEY` is read **only** by the backend. It is never sent to the
  browser and must never be committed.
- `EMAIL_FROM` must use the verified production domain. Do **not** use
  `onboarding@resend.dev` for production.
- `APP_URL` is the public origin of the app; invitation emails link to
  `${APP_URL}/invitations/<token>`.

If `RESEND_API_KEY` is not set, creating an invitation returns a clear error
instead of pretending it was sent: the invitation is only stored when Resend
accepts the email.

### DNS records for the sending domain

Before Resend will send from your domain, add it at
[resend.com/domains](https://resend.com/domains) (enter
`kala.studiovanderheide.nl`) and create these DNS records with your DNS
provider (the exact values are shown by Resend when you add the domain):

| Type  | Name                                     | Value                                        | Purpose                          |
| ----- | ---------------------------------------- | -------------------------------------------- | -------------------------------- |
| TXT   | `resend._domainkey` (or `_resend`)       | shown by Resend (starts with `p=`)          | DKIM - signs outgoing mail       |
| TXT   | `@` (root)                               | shown by Resend (starts with `v=spf1`)      | SPF - authorizes Resend to send  |

Recommended, so invitations do not end up in spam and spoofed mail is rejected:

| Type  | Name  | Value                                                                    | Purpose                  |
| ----- | ----- | ------------------------------------------------------------------------ | ------------------------ |
| TXT   | `@`   | `v=DMARC1; p=quarantine; rua=mailto:dmarc@studiovanderheide.nl`          | DMARC policy             |

After adding the records, press **Verify** in Resend (DNS propagation can take
up to 48 hours, usually minutes). The domain status must be **Verified** before
`noreply@kala.studiovanderheide.nl` can be used as the sender. The DNS
configuration itself lives entirely in Resend and at the DNS provider - Kala
only needs the API key and sender address.

---

## Kala AI

Kala AI is a **read-only** assistant in the board header ("Kala AI") and in every card ("Ask Kala AI"). It answers questions about the board you have open — summaries, overdue and high-priority work, what to focus on this week, cards that appear blocked or have no deadline, recent activity — and makes suggestions for a card (improve the description, suggest a checklist, priority or deadline, point out missing information). It never changes anything: answers are text you can read or copy, and there is no way for it to create, edit, move or delete data.

### Choosing a provider and model (Settings → Kala AI)

Every user picks their own **provider** and **model** in the sidebar's **Settings** and can paste **their own API key** there. The key is sent to the server once, stored **encrypted** (AES-256-GCM) and never shown again — Settings only shows the last four characters. "Browse models" lists what the provider offers, and you can always type any model id.

| Provider | Notes |
|----------|-------|
| Anthropic (Claude) | Native API. Model ids like `claude-opus-5`, `claude-sonnet-5`. |
| OpenAI | OpenAI-compatible API. |
| OpenRouter | OpenAI-compatible gateway with many models, ids like `google/gemini-2.5-flash`. |
| Google Gemini | Gemini's OpenAI-compatible endpoint, ids like `gemini-2.5-flash`. |
| Eden AI | OpenAI-compatible gateway, ids like `google/gemini-2.5-flash`. |
| Custom | Any OpenAI-compatible endpoint (a self-hosted gateway, LiteLLM, Ollama…), added by the administrator. |

All providers except Anthropic are used through the same **OpenAI-compatible** chat-completions adapter. Provider URLs are fixed: users choose a provider, never a URL, so nobody can point the server at an arbitrary address.

### Server configuration (optional)

Kala AI works for a user when they saved their own key, **or** the server has a key for the provider they chose. To offer AI without users bringing keys, set one or more server keys in `.env` (Docker) or `server/.env` (development) and run `docker compose up -d`:

| Variable | Description |
|----------|-------------|
| `AI_ANTHROPIC_API_KEY`, `AI_OPENAI_API_KEY`, `AI_OPENROUTER_API_KEY`, `AI_GOOGLE_API_KEY`, `AI_EDENAI_API_KEY` | Shared server keys, per provider. |
| `AI_CUSTOM_BASE_URL`, `AI_CUSTOM_API_KEY`, `AI_CUSTOM_LABEL` | Optional custom OpenAI-compatible endpoint and its display name. |
| `AI_PROVIDER`, `AI_MODEL` | Server default for people who chose nothing. Empty provider = the first one that has a key; empty model = the provider's suggestion (`claude-opus-5`, `gpt-5`, …). |
| `AI_EFFORT` | Optional (Anthropic default only): `low`…`max`. Only for models that support it. |
| `AI_MAX_REQUESTS_PER_HOUR` | Per-user limit for requests that use a **server** key (default 60). People using their own key are not limited. |
| `AI_KEY_ENCRYPTION_SECRET` | Optional secret for encrypting users' saved keys. Defaults to `SESSION_SECRET`. Changing either makes saved keys unreadable (users re-enter them). |

The variable names are `AI_`-prefixed on purpose: Kala never reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and the like, which may belong to other tools on the same machine. The older `AI_API_KEY` / `AI_BASE_URL` (for `AI_PROVIDER`) still work. The start-up log states what is configured (never a key).

### How it works

Browser → Kala backend (`POST /api/ai/boards/:boardId/chat`) → Kala AI service → provider. The browser never talks to a provider and never sees a key. Every request checks that you are signed in and a member of the board (viewers may ask questions; they can already see everything the AI sees), and a card is only accepted if it belongs to that board. For each request the backend reads a fresh snapshot of that one board — name, workspace, you and your role, lists, cards with descriptions, priorities, due dates, labels and checklist progress, and recent activity — and sends it with your question. The model has no database access and no tools.

**Things to know**

- **Privacy:** when someone uses Kala AI, that board's content is sent to the provider they chose. Pick a provider and plan whose data terms you are comfortable with.
- **Recent activity** is derived from timestamps (created, edited/moved, archived, checklist changes). Kala does not record who changed what, so Kala AI can't say that either.
- **Finished work:** lists named like *Done*, *Completed* or *Afgerond* are treated as finished, so their cards are not reported as open or overdue.
- Large boards: the first 150 open cards are listed in full; totals always cover every card. Conversations are not stored — closing the browser tab forgets them.
- Kala AI can make mistakes, especially on vague cards. It is told to say when the board doesn't contain enough information rather than guess.

---

## Integration API (external systems)

Kala exposes a small, generic integration API so an external system — **DocArchitect** first, any provider later — can create, retrieve and update Kala cards idempotently, discover boards/lists/labels/members, and receive webhooks. It lives under `/api/integrations`, is entirely optional and environment-driven: **without any `INTEGRATION_*` variables Kala has no integrations and works exactly as before.** There is no provider-specific code anywhere — a provider is a lower-case slug (`docarchitect`, `github`, …) configured through `INTEGRATION_<PROVIDER>_*` variables.

Design principles:

- **One permission model.** An integration API key is issued by a signed-in Kala user and every request it makes runs *as that user*. The existing board membership rules apply unchanged: a viewer's key can read, an editor's key can create and move cards, and a key can never touch a board its user is not a member of. There is no parallel auth system.
- **Idempotent by design.** Every external record is stored as an `ExternalReference` unique on `(provider, external_id)`. Retrying `POST /:provider/tasks` returns the existing card with `200` + `X-Idempotent-Replay: true` instead of creating a duplicate (concurrent retries are handled too).
- **Normalized status.** Kala's workflow is lists, so the API derives a small stable status set from the list title (see [Status mapping](#status-mapping)).

### 1. Configure a provider (environment)

```bash
INTEGRATION_DOCARCHITECT_ENABLED=true
INTEGRATION_DOCARCHITECT_LABEL=DocArchitect          # display name in the UI
INTEGRATION_DOCARCHITECT_BASE_URL=https://docarchitect.example.com   # informational, never hardcoded
INTEGRATION_DOCARCHITECT_DEFAULT_BOARD_ID=           # placement when a create omits board_id/list_id
INTEGRATION_DOCARCHITECT_DEFAULT_LIST_ID=
INTEGRATION_DOCARCHITECT_WEBHOOK_URL=                # where Kala POSTs events (empty = no webhooks)
INTEGRATION_DOCARCHITECT_WEBHOOK_SECRET=             # shared secret for HMAC signing
INTEGRATION_DOCARCHITECT_WEBHOOK_EVENTS=card.created,card.updated,card.moved,card.completed,card.archived
```

See [.env.example](.env.example) and [server/.env.example](server/.env.example) for the full annotated list.

### 2. Create an integration API key (browser session)

A person signs in to Kala and mints a key for the provider — in the UI under **Settings → Integrations** (which also lists the configured providers and lets you revoke keys), or by calling the endpoint directly. The plaintext token is returned **exactly once** (only its SHA-256 hash is stored).

```http
POST /api/integrations/keys          (session cookie; not machine auth)
Content-Type: application/json

{ "provider": "docarchitect", "name": "DocArchitect production" }
```

```json
{
  "id": "…", "name": "DocArchitect production", "provider": "docarchitect",
  "token": "kala_it_…", "token_prefix": "kala_it_ab12cd", "created_at": "…"
}
```

- `GET /api/integrations/keys` lists the caller's keys (never the token; shows `revoked` and `last_used_at`).
- `DELETE /api/integrations/keys/:id` revokes a key — revocation is immediate.
- `GET /api/integrations/providers` shows configured providers (label, enabled, webhook subscription, defaults) and never exposes secrets.

### 3. Machine requests

Authenticate with `Authorization: Bearer kala_it_…` (or `X-Kala-Key: kala_it_…`). Every response is JSON; errors are `401/403/404/409/422/429/500` with a machine-readable `code`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/integrations/:provider/tasks` | Create a card (idempotent on `external_id`) |
| `GET` | `/api/integrations/:provider/tasks/:externalId` | Current state of the mapped card |
| `PATCH` | `/api/integrations/:provider/tasks/:externalId` | Update title/description/status/list/priority/due date |
| `GET` | `/api/integrations/:provider/boards` | Boards the key's user can see |
| `GET` | `/api/integrations/:provider/boards/:boardId/lists` | Lists with normalized `status` |
| `GET` | `/api/integrations/:provider/boards/:boardId/labels` | Labels (`id`, `name`, `color`) |
| `GET` | `/api/integrations/:provider/boards/:boardId/members` | Members (`id`, `name`, `email`, `role`) |

**Create a task**

```http
POST /api/integrations/docarchitect/tasks
Authorization: Bearer kala_it_…
Content-Type: application/json

{
  "title": "Gevelbestek — constructietekening",
  "description": "Uitwerking gewenst vóór de week 40",
  "source": "docarchitect",                  // must equal :provider in the URL
  "external_id": "action-8842",              // stable id in the external system
  "external_url": "https://docarchitect.example.com/actions/8842",
  "board_id": "…", "list_id": "…",           // optional (see placement below)
  "label_ids": ["…"], "member_ids": ["…"],   // optional; labels must belong to the board,
                                             // member_ids holds at most one id (Kala cards
                                             // have a single assignee)
  "priority": "HIGH",                        // LOW | MEDIUM | HIGH
  "due_date": "2026-10-01",                  // ISO 8601
  "metadata": { "project": "ABC-123" }       // stored with the external reference, echoed back
}
```

`201` returns the task payload; a retry of the same `(provider, external_id)` returns `200` with the header `X-Idempotent-Replay: true`. **Placement:** `list_id` wins over `board_id` (which falls back to the configured defaults); unknown ids are `422`, Kala never creates boards or lists implicitly, and without any placement a clear `422` tells the caller to send one. `GET`/`PATCH` identify the card by `externalId` alone.

**Task payload** (stable, snake_case — never a raw internal Kala payload):

```json
{
  "id": "clx…", "title": "…", "description": "…",
  "status": "in_progress",
  "board": { "id": "…", "name": "Project X" },
  "list":  { "id": "…", "title": "Doing" },
  "members": [{ "id": "…", "name": "Ada", "email": "ada@…" }],
  "labels": [{ "id": "…", "name": "Urgent", "color": "#CE6F51" }],
  "priority": "HIGH", "due_date": "2026-10-01T00:00:00.000Z",
  "archived": false,
  "external_reference": { "provider": "docarchitect", "external_id": "action-8842",
                          "external_url": "https://…", "metadata": { "project": "ABC-123" },
                          "created_at": "…", "updated_at": "…" },
  "created_at": "…", "updated_at": "…"
}
```

A freshly created task reports `"status": "created"`; every later read normalizes its list.

**Update a task** (`PATCH …/tasks/:externalId`): send any of `title`, `description`, `priority`, `due_date` (or `null` to clear), and exactly one of `status` (`todo | in_progress | completed | cancelled`) or `list_id` — never both (`422`). Moving a card requires edit rights on the target list, exactly like dragging it in the UI.

**Errors** — always `{ "error": "human message", "code": "stable_code", "details"?: [{ "field", "message" }] }`, never a stack trace:

| Status | `code` | Meaning |
|--------|--------|---------|
| 401 | `unauthorized` | Missing, invalid or revoked key |
| 403 | `forbidden`, `provider_disabled`, `provider_mismatch` | No permission / provider off / key issued for another provider |
| 404 | `not_found`, `unknown_provider` | No task for that `external_id`, or unknown board/list/provider |
| 409 | — | Unique-concurrency conflicts are resolved into an idempotent `200` replay |
| 422 | `validation_error` | Body/field problems, per-field in `details` |
| 429 | `rate_limited` | Per-key limit (`INTEGRATION_RATE_LIMIT_PER_HOUR`, default 600/h); honours `Retry-After` |
| 500 | `internal_error` | Generic message only |

### Status mapping

Kala cards sit in lists; the normalized status is derived from the list title (case-insensitive): *Done/Completed/Finished/Closed/Shipped/…* → `completed`, *Cancelled/Rejected/Dropped/…* → `cancelled`, *Doing/In progress/WIP/Review/…* → `in_progress`, *To do/Backlog/New/Ready/…* → `todo`, anything unrecognized → `todo`. Override any title with a JSON map:

```bash
INTEGRATION_STATUS_MAP={"Triaging":"todo","Building":"in_progress","Shipped":"completed"}
```

`PATCH` with a `status` moves the card to the first list (by position) whose title normalizes to that status; if no list matches, it answers `422` rather than guessing.

### Webhooks

When a card **with an external reference** changes, Kala POSTs a minimal payload to each configured provider's `WEBHOOK_URL` (only for subscribed events; deliveries are fire-and-forget with a 5s timeout, and normal Kala cards never produce webhooks):

| Event | Fires when |
|-------|------------|
| `card.created` | A card was created for the provider |
| `card.updated` | Title, description, priority or due date changed |
| `card.moved` | The card moved to another list |
| `card.completed` | The card moved into a `completed` list |
| `card.archived` | The card was archived |

```json
{
  "provider": "docarchitect",
  "event": "card.moved",
  "card_id": "clx…",
  "external_reference": { "provider": "docarchitect", "external_id": "action-8842", "external_url": "https://…" },
  "status": "in_progress",
  "updated_at": "2026-09-26T12:00:00.000Z"
}
```

Headers: `X-Kala-Event`, `X-Kala-Delivery` (unique per attempt), `X-Kala-Timestamp` (Unix seconds), `X-Kala-Provider`, and — when a secret is set — `X-Kala-Signature: sha256=<hex HMAC-SHA256 of "${timestamp}.${rawBody}">`. Verify it (and reject stale timestamps) before trusting a delivery:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, { timestamp, signature }, rawBody) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 5 min window
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Kala logs delivery failures (provider, event, status) but never payloads or secrets; there is no retry queue — events are signals, the `GET …/tasks/:externalId` endpoint is the source of truth.

### In the Kala UI

Cards created through the integration show a subtle source badge in list/board/swimlane views and a **Source** section in the card detail with the provider, external id and an **“Open in …”** link back to the external system. Nothing else changes: externally created cards are ordinary Kala cards that everyone can edit.

---

## Local development

Development uses the Vite dev server and `tsx watch` on your machine; only PostgreSQL runs in Docker. (The production stack above is **not** used for development.)

### 1. Start PostgreSQL

From the project root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts a PostgreSQL container on `127.0.0.1:5432` with the development credentials from `server/.env.example`. (You can also use any PostgreSQL you already run locally.)

### 2. Set up the backend

```bash
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

The API server runs on `http://localhost:3001`. `npm run db:seed` **deletes existing data** and loads a demo account — use it for development only.

### 3. Start the frontend

From the project root (in a separate terminal):

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and calls the API at `http://localhost:3001/api` (override with `VITE_API_URL` in a root `.env` file).

## Project Structure

```
├── server/                  # Express + Prisma backend
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   ├── migrations/       # SQL migrations (applied with `prisma migrate deploy` in Docker)
│   │   └── seed.ts          # Seed script with demo data (development only)
│   ├── src/
│   │   ├── routes/          # REST API route handlers
│   │   ├── realtime.ts      # Server-Sent Events rooms
│   │   ├── db.ts            # Prisma client
│   │   └── index.ts         # Express server
│   ├── Dockerfile           # Backend production image
│   └── .env.example         # Local development environment
├── src/                     # React frontend
│   ├── components/
│   │   ├── Sidebar.tsx      # Workspace & board navigation
│   │   ├── BoardView.tsx    # Kanban board with horizontal lists
│   │   └── ListView.tsx     # Lists and cards
│   ├── lib/
│   │   ├── api.ts           # REST API client
│   │   └── demo-data.ts     # Fallback demo data
│   └── types/
│       └── index.ts         # Shared TypeScript types
├── Dockerfile               # Frontend production image (Vite build + nginx)
├── docker/nginx.conf        # nginx: static files + /api and SSE reverse proxy
├── docker-compose.yml       # Production stack: frontend + backend + PostgreSQL
├── docker-compose.dev.yml   # Development PostgreSQL only
└── .env.example             # Environment template for the Docker stack
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces` | List all workspaces with boards |
| GET | `/api/boards` | List all boards |
| GET | `/api/boards/:id` | Get a board with lists and cards |
| POST | `/api/boards` | Create a board |
| PATCH | `/api/boards/:id` | Update a board |
| DELETE | `/api/boards/:id` | Delete a board |
| POST | `/api/lists` | Create a list |
| PATCH | `/api/lists/:id` | Update a list |
| DELETE | `/api/lists/:id` | Delete a list |
| POST | `/api/cards` | Create a card |
| PATCH | `/api/cards/:id` | Update a card |
| DELETE | `/api/cards/:id` | Delete a card |
| POST | `/api/integrations/keys` | Create an integration API key (session) |
| GET / DELETE | `/api/integrations/keys[/:id]` | List / revoke integration keys (session) |
| GET | `/api/integrations/providers` | Configured integration providers (session) |
| POST | `/api/integrations/:provider/tasks` | Create a card from an external system (machine) |
| GET / PATCH | `/api/integrations/:provider/tasks/:externalId` | Retrieve / update an externally created card (machine) |
| GET | `/api/integrations/:provider/boards[/:boardId/lists\|labels\|members]` | Discovery for external systems (machine) |

## Features

- Sidebar with workspaces and boards navigation
- Horizontal scrolling kanban board
- Add lists and cards
- Delete lists and cards
- Demo workspace with Backlog, To Do, In Progress, and Done lists
- Falls back to demo data if the backend is not running
