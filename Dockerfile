FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
RUN mkdir -p /data/bee-files && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["npm","start"]
