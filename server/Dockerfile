# NIGHTHAWK game server. Build from the REPO ROOT:   docker build -f server/Dockerfile -t nighthawk-server .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data
COPY server ./server
ENV PORT=2567 LOBBY_SECS=15 MATCH_SIZE=16 NODE_ENV=production
EXPOSE 2567
USER node
CMD ["node", "server/src/index.js"]
