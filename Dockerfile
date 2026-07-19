# Production image for the rssapp server (Next.js standalone output).
ARG APP_VERSION=development
ARG SOURCE_REVISION=local

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lockfile is written by npm 11 (dev machines); the bundled npm 10 chokes
# on its nested optional platform deps. Keep the installer in the same major.
RUN npm install -g npm@11 && npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
ARG APP_VERSION
ARG SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RSSAPP_VERSION=$APP_VERSION
ENV RSSAPP_REVISION=$SOURCE_REVISION
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
RUN mkdir /backups && chown nextjs:nodejs /backups

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# SQL migrations, applied at boot by src/instrumentation.ts.
COPY --from=builder /app/drizzle ./drizzle
# Admin scripts (password reset) — plain Node, run with `docker compose exec`.
COPY --from=builder /app/scripts ./scripts

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
