/**
 * Calculates Jaccard similarity between two sets
 * @param {Set} set1 - First set
 * @param {Set} set2 - Second set
 * @returns {number} - Similarity score between 0 and 1
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.size / union.size;
}

/**
 * Tokenizes a text string into words
 * @param {string} text - Text to tokenize
 * @returns {Set} - Set of lowercase tokens
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return new Set();
  }

  // Convert to lowercase and split on whitespace and punctuation
  const tokens = text
    .toLowerCase()
    .split(/[\s\.,;:!?()[\]{}'"]+/)
    .filter(token => token.length > 0);

  return new Set(tokens);
}

/**
 * Calculates similarity between two tool argument objects
 * @param {object} args1 - First argument object
 * @param {object} args2 - Second argument object
 * @returns {number} - Similarity score between 0 and 1
 */
export function calculateArgsSimilarity(args1, args2) {
  if (!args1 || !args2) {
    return 0;
  }

  // Exact match check
  const hash1 = JSON.stringify(args1);
  const hash2 = JSON.stringify(args2);
  if (hash1 === hash2) {
    return 1.0;
  }

  // If both have 'query' field, use text similarity
  if (args1.query && args2.query && typeof args1.query === 'string' && typeof args2.query === 'string') {
    const tokens1 = tokenize(args1.query);
    const tokens2 = tokenize(args2.query);
    return jaccardSimilarity(tokens1, tokens2);
  }

  // For other types of arguments, check if they're similar
  // by comparing all string values
  const strings1 = extractStrings(args1);
  const strings2 = extractStrings(args2);

  if (strings1.size === 0 && strings2.size === 0) {
    return 0;
  }

  return jaccardSimilarity(strings1, strings2);
}

/**
 * Extracts all string values from an object (recursively)
 * and tokenizes them
 * @param {any} obj - Object to extract strings from
 * @returns {Set} - Set of all tokens
 */
function extractStrings(obj) {
  const tokens = new Set();

  function extract(value) {
    if (typeof value === 'string') {
      const valueTokens = tokenize(value);
      valueTokens.forEach(token => tokens.add(token));
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  }

  extract(obj);
  return tokens;
}
