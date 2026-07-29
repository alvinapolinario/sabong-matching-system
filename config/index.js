require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

function readEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  return String(value).trim();
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback) {
  return readEnv(name) ?? fallback;
}

function optionalPositiveInt(name, fallback) {
  const raw = readEnv(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function validateProductionConfig(config) {
  if (!isProduction) return;

  if (!/^\d{6}$/.test(config.loginPin)) {
    throw new Error('LOGIN_PIN must be a 6-digit code when NODE_ENV=production.');
  }

  if (config.manualMixedTypePasscode === config.loginPin) {
    throw new Error('MANUAL_MIXED_TYPE_PASSCODE must differ from LOGIN_PIN when NODE_ENV=production.');
  }

  if (config.manualWeightOverridePasscode === config.loginPin) {
    throw new Error('MANUAL_WEIGHT_OVERRIDE_PASSCODE must differ from LOGIN_PIN when NODE_ENV=production.');
  }
}

const loginPin = isProduction
  ? requireEnv('LOGIN_PIN')
  : optionalEnv('LOGIN_PIN', '112233');

const config = {
  isProduction,
  port: Number(process.env.PORT || 3000),
  sessionSecret: isProduction
    ? requireEnv('SESSION_SECRET')
    : optionalEnv('SESSION_SECRET', 'dev-only-session-secret'),
  sessionCookieName: 'sabong.sid',
  appName: 'Sabong Matching System',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  loginPin,
  manualMixedTypePasscode: isProduction
    ? requireEnv('MANUAL_MIXED_TYPE_PASSCODE')
    : optionalEnv('MANUAL_MIXED_TYPE_PASSCODE', loginPin),
  manualWeightOverridePasscode: isProduction
    ? requireEnv('MANUAL_WEIGHT_OVERRIDE_PASSCODE')
    : optionalEnv('MANUAL_WEIGHT_OVERRIDE_PASSCODE', loginPin),
  autoMatchEntryGap: optionalPositiveInt('AUTO_MATCH_ENTRY_GAP', 5),
  db: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT || 3306),
    user: optionalEnv('DB_USER', 'root'),
    password: optionalEnv('DB_PASSWORD', ''),
    database: optionalEnv('DB_NAME', 'matching_db')
  }
};

validateProductionConfig(config);

module.exports = config;
