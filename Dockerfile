FROM node:20-alpine

WORKDIR /app

# Required for backup/restore (mysqldump, mysql CLI).
# Alpine's "mysql-client" is the MariaDB client: mariadb-connector-c adds the
# caching_sha2_password plugin MySQL 8 needs, and MySQL 8's self-signed
# certificate is accepted (still TLS; traffic stays on the compose network).
RUN apk add --no-cache mysql-client mariadb-connector-c \
    && printf '[client]\nssl-verify-server-cert=0\n' > /etc/my.cnf.d/zz-docker-mysql8.cnf

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["node", "app.js"]
