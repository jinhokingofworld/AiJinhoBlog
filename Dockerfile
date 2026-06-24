FROM node:20-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY aijinhoblog/package.json aijinhoblog/package-lock.json ./aijinhoblog/

RUN npm ci && npm --prefix aijinhoblog ci

FROM base AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/aijinhoblog/node_modules ./aijinhoblog/node_modules
COPY . .

RUN npm run prisma:generate
RUN npm run build

FROM builder AS migrator

ENV NODE_ENV=production

CMD ["npm", "run", "prisma:migrate"]

FROM base AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/aijinhoblog/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/aijinhoblog/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/aijinhoblog/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
