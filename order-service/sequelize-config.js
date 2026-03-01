"use strict";

const common = {
  username: process.env.DB_USER || process.env.POSTGRES_USER || "postgres",
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || "password",
  database: process.env.DB_NAME || process.env.POSTGRES_DB || "orders_db",
  host: process.env.DB_HOST || "orders_db",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  dialect: "postgres",
  logging: false
};

module.exports = {
  development: common,
  test: common,
  production: common
};
