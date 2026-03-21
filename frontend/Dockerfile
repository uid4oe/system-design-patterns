FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

COPY frontend/package.json frontend/
COPY packages/core/package.json packages/core/
COPY server/package.json server/

RUN npm ci

COPY frontend/ frontend/
COPY packages/core/ packages/core/
COPY tsconfig.base.json tsconfig.json ./

RUN npm run build --workspace=frontend

FROM nginx:alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
