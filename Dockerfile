FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
