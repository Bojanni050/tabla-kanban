# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Kala backend (Express + Prisma) - production image
#
#   build   : installs all dependencies, generates the Prisma client and compiles
#             the TypeScript sources to dist/
#   runtime : production dependencies only + the compiled output. On start it
#             applies pending migrations with `prisma migrate deploy` and then
#             runs the compiled server with plain `node` (no watchers).
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
# Prisma's query and schema engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /app

# ---- build ---------------------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

COPY package.json package-lock.json ./
# The Prisma CLI is a regular dependency because `migrate deploy` runs in this image.
RUN npm ci --omit=dev && npm cache clean --force

# Generate the Prisma client for this platform inside the image; keep the schema and
# migrations next to it so `prisma migrate deploy` can find them at start-up.
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001

# Apply pending migrations, then start the server. `exec` makes node PID 1's child
# receive SIGTERM directly (compose also runs an init process, see docker-compose.yml).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
