FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY server/websocket/package*.json ./
RUN npm ci --omit=dev

COPY server/websocket/src ./src
COPY server/websocket/README.md ./

EXPOSE 80

CMD ["npm", "start"]
