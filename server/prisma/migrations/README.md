# Prisma migrations directory

This directory holds Prisma migration files. Run the following to create and apply migrations:

```bash
cd server
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

To start the server:
```bash
npm run dev
```

PostgreSQL must be running. Start it with Docker Compose from the project root:
```bash
docker compose up -d
```
