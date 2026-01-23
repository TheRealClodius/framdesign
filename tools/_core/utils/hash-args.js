import crypto from 'crypto';

/**
 * Creates a consistent hash of tool arguments for deduplication
 * @param {object} args - Tool arguments object
 * @returns {string} - SHA256 hash of the arguments
 */
export function hashArgs(args) {
  if (!args || typeof args !== 'object') {
    return '';
  }

  // Sort keys to ensure consistent hashing
  const sortedArgs = sortObjectKeys(args);
  const argsString = JSON.stringify(sortedArgs);

  return crypto.createHash('sha256')
    .update(argsString)
    .digest('hex')
    .substring(0, 16); // First 16 chars for brevity
}

/**
 * Recursively sorts object keys for consistent serialization
 * @param {any} obj - Object to sort
 * @returns {any} - Object with sorted keys
 */
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObjectKeys(obj[key]);
  });

  return sorted;
}
