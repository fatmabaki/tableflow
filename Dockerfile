# Host-neutral container image for TableFlow (Railway, Fly.io, any VPS/Docker host).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/db.js ./scripts/db.js
COPY public ./public
# The host injects PORT; the app reads it (default 5173). DATABASE_URL etc. come from the host's environment.
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies migrations + idempotent seed, then starts the web server (email worker runs inside it).
CMD ["sh", "-c", "node scripts/db.js setup && node src/server.js"]
