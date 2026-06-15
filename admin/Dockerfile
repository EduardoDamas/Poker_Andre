# CAPA CONTEST admin UI — static React build served by nginx.
#
# Build:  docker build -t capa-admin ./admin
# Run:    docker run -p 8080:8080 capa-admin   → open http://localhost:8080
#
# The backend URL is baked in at build time (Vite env). It defaults to the
# Railway production API; override with --build-arg VITE_API_BASE=...

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=https://capa-contest-api-production.up.railway.app
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ---- serve stage ----
FROM nginx:alpine AS prod
# SPA config template; $PORT is substituted at startup (Railway injects PORT).
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
# nginx:alpine auto-runs envsubst on /etc/nginx/templates/*.template → conf.d/.
CMD ["nginx", "-g", "daemon off;"]
