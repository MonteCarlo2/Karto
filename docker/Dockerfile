# Сборка из корня репозитория: docker build -f docker/Dockerfile .
# Использовать только если в Timeweb явно выбран тип «Dockerfile» (не Nest).
# Без apt-get — Timeweb build network часто не достаёт до deb.debian.org.

FROM node:24-bookworm AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_CACHE_DIR=/tmp
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=node:node /app/.next/standalone ./

USER node
EXPOSE 3000 8080

CMD ["node", "start.js"]
