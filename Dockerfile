# ⚠️ THIS DOCKERFILE DOES NOT BUILD AS-IS SINCE 2026-08-25.
# `output: 'standalone'` was removed from next.config.ts when the deploy
# target moved to Vercel (which ignores it). The COPY of .next/standalone
# below therefore has no source. Kept deliberately as a future exit route
# from Vercel: restore that one line in next.config.ts and this works again.
# See docs/COMPANY-CONTEXT.md §3 for the current deployment target.

# Mesa OS Lite — production image.
# Multi-stage build over node:22-alpine. Outputs a Next 16 standalone server
# at /app/server.js, with public/ and .next/static/ alongside. Runs as a
# non-root user on port 3000.
#
# Build:  docker build -t mesa-os-lite .
# Run:    docker run --rm -p 3000:3000 --env-file .env.production mesa-os-lite

# ─────────────────────────── deps ───────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# sharp ships prebuilt linux-musl binaries since v0.33; libc6-compat covers
# rare edge cases on Alpine (Next swc native module).
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --include=optional --no-audit --no-fund

# ─────────────────────────── builder ───────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public envs MUST be present at build time so Next can inline them. Pass
# them as build args (Coolify exposes its env vars as build args by default).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# R2_PUBLIC_URL is NOT inlined into the client bundle (no NEXT_PUBLIC_ prefix),
# but next.config.ts reads it at BUILD time to add the custom R2 host to
# images.remotePatterns. Without it here a custom R2 domain (e.g.
# images.qaema.app) would throw "hostname not configured" in next/image at
# runtime — the default pub-*.r2.dev is already covered by the wildcard pattern.
ARG R2_PUBLIC_URL
ENV R2_PUBLIC_URL=$R2_PUBLIC_URL

RUN npm run build

# ─────────────────────────── runner ───────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache curl libc6-compat \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Fail the build LOUDLY if the native modules (sharp musl binary, bcrypt
# prebuild) didn't get traced into the standalone node_modules — otherwise a
# broken @vercel/nft trace only surfaces as a runtime 500 on the first image
# upload / login. Cheap insurance, runs at build time only.
RUN node -e "require('sharp'); require('bcrypt'); console.log('native modules OK')"

USER nextjs
EXPOSE 3000

# Liveness probe hits the dedicated /api/health endpoint (cheap, no DB) rather
# than the landing page. Coolify should use the same path for its health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
