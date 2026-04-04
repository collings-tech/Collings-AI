'use strict';

require('dotenv').config();

const required = [
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'AES_ENCRYPTION_KEY',
  'ANTHROPIC_API_KEY',
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

module.exports = {
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  AES_ENCRYPTION_KEY: process.env.AES_ENCRYPTION_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};
