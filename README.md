# Kanban — Project Management App

A modern Trello-like kanban board built with React, TypeScript, Express, Prisma, and PostgreSQL.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (via Prisma ORM)

## Getting Started

### 1. Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

This starts a PostgreSQL container on port 5432.

### 2. Set up the backend

```bash
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

The API server runs on `http://localhost:3001`.

### 3. Start the frontend

From the project root (in a separate terminal):

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and connects to the backend API automatically.

## Project Structure

```
├── server/                  # Express + Prisma backend
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── seed.ts          # Seed script with demo data
│   ├── src/
│   │   ├── routes/          # REST API route handlers
│   │   ├── db.ts            # Prisma client
│   │   └── index.ts         # Express server
│   └── .env.example
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
├── docker-compose.yml       # PostgreSQL container
└── .env.example
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
