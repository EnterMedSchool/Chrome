/**
 * Logging utility for EMS Medical Glossary
 * Prefixes all logs with [EMS] for easy filtering
 * @module logger
 */

const PREFIX = '[EMS]';

/**
 * Check if we're in development mode
 * @returns {boolean}
 */
function isDev() {
  // In production builds, this will be replaced
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
}

/**
 * Log debug message (only in development)
 * @param {...any} args
 */
export function debug(...args) {
  if (isDev()) {
    console.debug(PREFIX, ...args);
  }
}

/**
 * Log info message
 * @param {...any} args
 */
export function info(...args) {
  console.info(PREFIX, ...args);
}

/**
 * Log warning message
 * @param {...any} args
 */
export function warn(...args) {
  console.warn(PREFIX, ...args);
}

/**
 * Log error message
 * @param {...any} args
 */
export function error(...args) {
  console.error(PREFIX, ...args);
}

/**
 * Log with timing
 * @param {string} label - Timer label
 */
export function time(label) {
  if (isDev()) {
    console.time(`${PREFIX} ${label}`);
  }
}

/**
 * End timing log
 * @param {string} label - Timer label
 */
export function timeEnd(label) {
  if (isDev()) {
    console.timeEnd(`${PREFIX} ${label}`);
  }
}

export default {
  debug,
  info,
  warn,
  error,
  time,
  timeEnd,
};
