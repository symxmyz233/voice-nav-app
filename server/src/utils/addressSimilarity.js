/**
 * Address text similarity utilities.
 * Compares user's original voice input against geocoded formatted address
 * to detect silent corrections (e.g., "Weekly Ave" → "Wickley Ave").
 */

const ABBREVIATION_MAP = {
  // Street types
  'st': 'street',
  'ave': 'avenue',
  'blvd': 'boulevard',
  'dr': 'drive',
  'rd': 'road',
  'ln': 'lane',
  'ct': 'court',
  'pl': 'place',
  'cir': 'circle',
  'pkwy': 'parkway',
  'hwy': 'highway',
  'trl': 'trail',
  'ter': 'terrace',
  'way': 'way',
  // Directions
  'n': 'north',
  's': 'south',
  'e': 'east',
  'w': 'west',
  'ne': 'northeast',
  'nw': 'northwest',
  'se': 'southeast',
  'sw': 'southwest',
  // US state abbreviations (only unambiguous ones — skip 'in', 'or', 'me', 'hi', 'oh', 'ok', 'id', 'al', 'co', 'de', 'la', 'md', 'mi', 'mo', 'mt', 'ne', 'ct')
  'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas',
  'ca': 'california', 'fl': 'florida', 'ga': 'georgia',
  'il': 'illinois', 'ia': 'iowa', 'ks': 'kansas',
  'ky': 'kentucky', 'ma': 'massachusetts', 'mn': 'minnesota', 'ms': 'mississippi',
  'nv': 'nevada',
  'nh': 'new hampshire', 'nj': 'new jersey', 'nm': 'new mexico', 'ny': 'new york',
  'nc': 'north carolina', 'nd': 'north dakota',
  'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
  'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah',
  'vt': 'vermont', 'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia',
  'wi': 'wisconsin', 'wy': 'wyoming', 'dc': 'district of columbia',
  // Infrastructure
  'brg': 'bridge',
  'br': 'bridge',
  'bdg': 'bridge',
  'tpk': 'turnpike',
  'tpke': 'turnpike',
  'tunl': 'tunnel',
  'tnl': 'tunnel',
  'fwy': 'freeway',
  'expy': 'expressway',
  'expwy': 'expressway',
  // Unit types
  'apt': 'apartment',
  'ste': 'suite',
  'bldg': 'building',
  'fl': 'floor',
};

// Common words that should be ignored in address comparison
const STOP_WORDS = new Set([
  'in', 'at', 'to', 'on', 'the', 'of', 'and', 'or', 'near', 'by', 'from', 'for',
]);

// Multi-word abbreviations — expanded before tokenization
const CITY_ABBREVIATIONS = {
  'nyc': 'new york',
  'philly': 'philadelphia',
  'sf': 'san francisco',
  'la': 'los angeles',
  'gw': 'george washington',
  'gwb': 'george washington bridge',
  'lga': 'laguardia',
  'jfk': 'john f kennedy',
  'bqe': 'brooklyn queens expressway',
  'lic': 'long island city',
};

/**
 * Compute Levenshtein (edit) distance between two strings.
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalize an address string for comparison:
 * - lowercase
 * - expand abbreviations
 * - remove ZIP codes (5-digit or 5+4 format)
 * - remove country names (USA, United States)
 * - remove punctuation and collapse whitespace
 */
function normalizeAddressForComparison(text) {
  let normalized = text.toLowerCase();

  // Remove ZIP codes (5-digit or 5+4 digit format)
  normalized = normalized.replace(/\b\d{5}(-\d{4})?\b/g, '');

  // Remove country
  normalized = normalized.replace(/\b(usa|us|united states of america|united states)\b/gi, '');

  // Remove punctuation (commas, periods, hashes, etc.)
  normalized = normalized.replace(/[,.\-#]/g, ' ');

  // Expand city abbreviations (multi-word) before tokenizing
  for (const [abbr, full] of Object.entries(CITY_ABBREVIATIONS)) {
    normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }

  // Expand single-word abbreviations and filter stop words
  const words = normalized.split(/\s+/).filter(Boolean);
  const expanded = words
    .map(word => ABBREVIATION_MAP[word] || word)
    .filter(word => !STOP_WORDS.has(word));

  return expanded.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Check for text mismatch between the user's original input and the geocoded formatted address.
 *
 * @param {string} originalText - The user's original voice/text input
 * @param {string} formattedAddress - The geocoded formatted address from Google
 * @returns {{ hasMismatch: boolean, reason?: string, mismatchedTokens?: Array }}
 */
function checkAddressTextMismatch(originalText, formattedAddress) {
  if (!originalText || !formattedAddress) {
    return { hasMismatch: false };
  }

  const normalizedOriginal = normalizeAddressForComparison(originalText);
  const normalizedFormatted = normalizeAddressForComparison(formattedAddress);

  const originalTokens = normalizedOriginal.split(/\s+/).filter(t => t.length >= 2);
  const formattedTokens = normalizedFormatted.split(/\s+/).filter(t => t.length >= 2);

  if (originalTokens.length === 0) {
    return { hasMismatch: false };
  }

  const PER_TOKEN_THRESHOLD = 0.3;
  const OVERALL_THRESHOLD = 0.5;

  const mismatchedTokens = [];
  let matchedCount = 0;

  for (const origToken of originalTokens) {
    let bestDistance = Infinity;
    let bestMatch = '';

    for (const fmtToken of formattedTokens) {
      const dist = levenshteinDistance(origToken, fmtToken);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = fmtToken;
      }
    }

    const maxLen = Math.max(origToken.length, bestMatch.length);
    const normalizedDist = maxLen > 0 ? bestDistance / maxLen : 0;

    if (normalizedDist < PER_TOKEN_THRESHOLD) {
      matchedCount++;
    } else {
      mismatchedTokens.push({ original: origToken, bestMatch, distance: normalizedDist });
    }
  }

  const overallSimilarity = matchedCount / originalTokens.length;

  if (overallSimilarity < OVERALL_THRESHOLD) {
    const mismatchDescriptions = mismatchedTokens
      .map(t => `"${t.original}" → "${t.bestMatch}"`)
      .join(', ');
    return {
      hasMismatch: true,
      reason: `Address text may not match what you said: ${mismatchDescriptions}`,
      mismatchedTokens,
    };
  }

  return { hasMismatch: false };
}

export { levenshteinDistance, normalizeAddressForComparison, checkAddressTextMismatch };
