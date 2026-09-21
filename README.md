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

Store backups somewhere other than the Docker host, and test restoring them.

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

## Features

- Sidebar with workspaces and boards navigation
- Horizontal scrolling kanban board
- Add lists and cards
- Delete lists and cards
- Demo workspace with Backlog, To Do, In Progress, and Done lists
- Falls back to demo data if the backend is not running
