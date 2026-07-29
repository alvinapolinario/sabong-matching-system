#!/bin/sh
set -e

host="${DB_HOST:-db}"
port="${DB_PORT:-3306}"
user="${DB_USER:-root}"
password="${DB_PASSWORD:-}"
database="${DB_NAME:-matching_db}"

echo "Waiting for MySQL at ${host}:${port}..."

until node -e "
const mysql = require('mysql2/promise');
(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'matching_db'
  });
  await connection.ping();
  await connection.end();
})().catch(() => process.exit(1));
" 2>/dev/null; do
  sleep 2
done

echo "MySQL is ready (${database}@${host})."
exec "$@"
