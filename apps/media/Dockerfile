FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
ENV NODE_ENV=production MEDIA_PORT=55430 MEDIA_HOST=0.0.0.0
EXPOSE 55430
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:55430/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
