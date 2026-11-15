FROM node:22-alpine
WORKDIR /app

# Certbot performs Let's Encrypt HTTP-01 issuance and renewal. su-exec lets the
# container initialize the mounted volume as root, then run the gateway unprivileged.
RUN apk add --no-cache certbot su-exec

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint
RUN chmod 0755 /usr/local/bin/docker-entrypoint

ENV NODE_ENV=production
EXPOSE 80 465 587 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint"]
CMD ["node", "src/server.mjs"]
