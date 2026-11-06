# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY migrations ./migrations
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json next.config.mjs ./
RUN mkdir -p /var/data/uploads && chown -R node:node /app /var/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npm run db:migrate && npx next start -p ${PORT}"]
