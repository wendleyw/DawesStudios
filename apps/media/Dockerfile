FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# `/scratch` is where `compose.yaml`'s disk-backed `media-scratch` volume mounts (see its long
# comment there for why `/tmp` alone -- RAM tmpfs -- cannot hold a video-sized temp file). An
# empty named volume is populated from whatever already exists at its mount path in the image,
# ownership and permissions included, the first time a container using it starts; without this
# directory existing here, owned by `node` before that `USER node` switch below, Docker
# initializes the volume owned by root, and every `mkdtemp('/scratch/...')` the app makes as the
# unprivileged `node` user fails with `EACCES` for the life of that volume.
RUN mkdir -p /scratch && chown node:node /scratch
USER node
ENV NODE_ENV=production MEDIA_PORT=55430 MEDIA_HOST=0.0.0.0
EXPOSE 55430
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:55430/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
