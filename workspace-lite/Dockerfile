# Integral Workspace Lite for online hosting (Render, Railway, Fly.io or any server that runs Docker).
# No packages to install: the workspace needs only Node.js 22.13 or newer.
FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
# The database and uploaded files live here: mount a persistent disk at /data, or they're lost on every deploy.
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
