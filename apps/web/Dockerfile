FROM node:22-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_BEE_API=""
ENV VITE_BEE_API=$VITE_BEE_API
RUN npm run build
FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
