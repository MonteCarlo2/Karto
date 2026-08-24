# KARTO — Next.js standalone для Timeweb App Platform (деплой через Dockerfile).
# ca-certificates уже в образе node — в панели Timeweb поле «Зависимости» оставьте пустым.

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_CACHE_DIR=/tmp
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# copy-standalone.js кладёт public, .next/static и start.js внутрь standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3000

CMD ["node", "start.js"]
