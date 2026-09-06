# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copie tout le repo (racine) pour accéder à packages/shared
COPY . .

# Installe les dépendances et build
WORKDIR /app/apps/web
RUN npm install

# Injectée par Railway (service variable du même nom) — Vite l'inline dans le
# bundle au build, elle n'existe plus à l'exécution (VITE_* n'est jamais lu au runtime).
ARG VITE_API_BASE
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app/apps/web

# Copie seulement le build + package.json + node_modules
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/node_modules ./node_modules

# Expose le port (Railway injectera $PORT à l'exécution)
EXPOSE 3000

# Démarre serve
CMD ["npm", "run", "start"]
