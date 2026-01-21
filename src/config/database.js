/**
 * Database configuration module
 * Loads configuration from environment variables with sensible defaults
 */

require('dotenv').config();

const config = {
  // Connection settings
  host: process.env.INFORMIX_HOST || 'localhost',
  port: parseInt(process.env.INFORMIX_PORT, 10) || 9088,
  database: process.env.INFORMIX_DATABASE || '',
  user: process.env.INFORMIX_USER || '',
  password: process.env.INFORMIX_PASSWORD || '',
  server: process.env.INFORMIX_SERVER || '',

  // Locale settings
  clientLocale: process.env.INFORMIX_CLIENT_LOCALE || 'en_US.utf8',
  dbLocale: process.env.INFORMIX_DB_LOCALE || 'en_US.utf8',

  // Connection pool settings
  pool: {
    min: parseInt(process.env.INFORMIX_POOL_MIN, 10) || 2,
    max: parseInt(process.env.INFORMIX_POOL_MAX, 10) || 10,
  },
};

/**
 * Build the connection string for Informix
 * @returns {string} Connection string for Informix
 */
function buildConnectionString() {
  const {
    host,
    port,
    database,
    user,
    password,
    server,
    clientLocale,
    dbLocale,
  } = config;

  // Validate required fields
  if (!database || !user || !password || !server) {
    throw new Error(
      'Missing required database configuration. Please check your .env file.'
    );
  }

  // Build connection string for informixdb package
  return [
    `SERVER=${server}`,
    `DATABASE=${database}`,
    `HOST=${host}`,
    `SERVICE=${port}`,
    `UID=${user}`,
    `PWD=${password}`,
    `PROTOCOL=onsoctcp`,
    `CLIENT_LOCALE=${clientLocale}`,
    `DB_LOCALE=${dbLocale}`,
  ].join(';');
}

module.exports = {
  config,
  buildConnectionString,
};
