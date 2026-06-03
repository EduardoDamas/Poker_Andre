# CAPA CONTEST backend — production image.
#
# Build:  docker build -t capa-api ./backend
# Run:    docker run -p 3000:3000 --env-file backend/.env capa-api
#
# On start it applies pending Prisma migrations, then launches the server.

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
# openssl is required by Prisma's query engine.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- production stage ----
FROM node:22-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# Carry over installed deps (incl. generated Prisma client + CLI), build output, schema.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# migrate deploy is safe/idempotent; for multi-instance, move it to a release step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
