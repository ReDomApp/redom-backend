FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/redom-mail/package.json artifacts/redom-mail/package.json
COPY artifacts/redom-mail/tsconfig.json artifacts/redom-mail/tsconfig.json
COPY artifacts/redom-mail/src artifacts/redom-mail/src
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/redom-mail run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/artifacts/redom-mail/dist /app/artifacts/redom-mail/dist
COPY --from=build /app/artifacts/redom-mail/package.json /app/artifacts/redom-mail/package.json
USER node
CMD ["node", "/app/artifacts/redom-mail/dist/index.js"]
