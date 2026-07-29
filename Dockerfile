FROM node:20-alpine

WORKDIR /app

# Required for backup/restore (mysqldump, mysql CLI)
RUN apk add --no-cache mysql-client

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["node", "app.js"]
