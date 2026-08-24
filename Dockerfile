# KARTO — Next.js standalone для Timeweb App Platform.
# Без apt-get/curl: на сборке Timeweb deb.debian.org часто недоступен (IPv6/timeout).
# Полный node:24-bookworm уже содержит ca-certificates; slim + apt ломает деплой.

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
