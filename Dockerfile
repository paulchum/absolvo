FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ABSOLVO_DATA_DIR=/app/.data
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 3020
CMD ["npm", "start"]
