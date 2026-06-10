# ---------- Estágio 1: build do front Angular ----------
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- Estágio 2: servidor Node + front compilado ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3099 CLIENT_DIST=/app/public

COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server/src ./src
COPY --from=client-build /app/client/dist/truco-client/browser ./public

EXPOSE 3099
CMD ["node", "src/index.js"]
