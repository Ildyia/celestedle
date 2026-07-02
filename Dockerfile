FROM node:25-alpine

WORKDIR /api

COPY backend/package*.json .

RUN npm ci

COPY backend/ .

CMD ["node", "server.js"]
