FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack pnpm install --frozen-lockfile
COPY . .
RUN corepack pnpm run build:host && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PUBLISHER_HOSTED=true PUBLISHER_DATA_DIR=/data PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/api.mjs"]
