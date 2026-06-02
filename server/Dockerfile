FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS production
RUN npm ci --only=production && npm cache clean --force
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]

FROM base AS development
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 3001
CMD ["npx", "nodemon", "--legacy-watch", "server.js"]
