FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium qpdf poppler-utils fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm prune --omit=dev --ignore-scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090 CHROME_BIN=/usr/bin/chromium
USER node
EXPOSE 8090
CMD ["node", "dist/server.js"]
