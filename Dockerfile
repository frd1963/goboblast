# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Optional path prefix, baked into the Next build. `gobos` and `/gobos` both work.
ARG BASE_PATH=
ENV BASE_PATH=${BASE_PATH}
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ARG BASE_PATH=
ENV BASE_PATH=${BASE_PATH}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=4317

RUN addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs server/collapse-slashes.js ./collapse-slashes.js

USER nextjs
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const raw=(process.env.BASE_PATH||'').trim();const prefix=!raw?'/':raw.startsWith('/')?raw:'/'+raw;fetch('http://127.0.0.1:'+(process.env.PORT||4317)+prefix).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--require", "./collapse-slashes.js", "server.js"]
