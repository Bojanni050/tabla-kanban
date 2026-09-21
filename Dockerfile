# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Kala frontend (React + Vite) - production image
#
#   build   : compiles the Vite app to static files
#   runtime : nginx serves those files and reverse-proxies /api (including the
#             Server-Sent Events stream) to the backend, so the browser only
#             ever talks to one origin. See docker/nginx.conf.
#
# Build context is the repository root (this file lives next to package.json).
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22

# ---- build ---------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The API is reached through the same origin, so the client uses a relative URL.
# (src/lib/api.ts and src/lib/realtime.ts read VITE_API_URL at build time.)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The unprivileged nginx image listens on 8080 as a non-root user.
EXPOSE 8080
