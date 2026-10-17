FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node db-migrate.mjs && node index.mjs"]
