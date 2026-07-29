const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getEntry(req) {
  cleanupExpired();
  const key = clientKey(req);
  const now = Date.now();
  let entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, entry);
  }

  return entry;
}

function isLoginRateLimited(req) {
  const entry = getEntry(req);
  return entry.count >= MAX_ATTEMPTS;
}

function remainingLockMinutes(req) {
  const entry = getEntry(req);
  return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 60000));
}

function recordFailedLogin(req) {
  getEntry(req).count += 1;
}

function clearLoginAttempts(req) {
  attempts.delete(clientKey(req));
}

module.exports = {
  isLoginRateLimited,
  remainingLockMinutes,
  recordFailedLogin,
  clearLoginAttempts
};
