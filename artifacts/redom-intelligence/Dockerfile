FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm install --no-save typescript @types/node
RUN ./node_modules/.bin/tsc -p tsconfig.json

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8088
CMD ["node", "dist/src/server.js"]
