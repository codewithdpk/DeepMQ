// Topic exchange routing
// Routes messages using pattern matching with wildcards:
// - * matches exactly one word
// - # matches zero or more words
// Words are separated by dots (.)

import { Binding } from '../core/binding';

// Pre-compile pattern to regex for faster matching
const patternCache = new Map<string, RegExp>();

function patternToRegex(pattern: string): RegExp {
  let cached = patternCache.get(pattern);
  if (cached) {
    return cached;
  }

  // Escape regex special characters except * and #
  let regex = pattern
    .split('.')
    .map(word => {
      if (word === '*') {
        // * matches exactly one word (non-empty, no dots)
        return '[^.]+';
      } else if (word === '#') {
        // # matches zero or more words (including dots)
        return '.*';
      } else {
        // Escape any regex special characters in literal words
        return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    })
    .join('\\.');

  // Handle # at the edges correctly
  regex = regex.replace(/\.\.\*/g, '(?:\\..*)?');
  regex = regex.replace(/^\.\*\\\./, '(?:.*\\.)?');

  // Anchor the pattern
  regex = `^${regex}$`;

  const compiled = new RegExp(regex);
  patternCache.set(pattern, compiled);
  return compiled;
}

// Alternative: direct pattern matching without regex
function matchesPattern(routingKey: string, pattern: string): boolean {
  const routingWords = routingKey.split('.');
  const patternWords = pattern.split('.');

  let ri = 0; // routing key index
  let pi = 0; // pattern index

  while (pi < patternWords.length) {
    const patternWord = patternWords[pi];

    if (patternWord === '#') {
      // # can match zero or more words
      if (pi === patternWords.length - 1) {
        // # at the end matches everything remaining
        return true;
      }

      // Find the next non-# pattern word
      const nextPatternWord = patternWords[pi + 1];

      // Try to match the next pattern word at each remaining position
      while (ri <= routingWords.length) {
        if (ri === routingWords.length) {
          // No more routing words, check if remaining pattern is all #
          let allHash = true;
          for (let i = pi + 1; i < patternWords.length; i++) {
            if (patternWords[i] !== '#') {
              allHash = false;
              break;
            }
          }
          return allHash;
        }

        if (nextPatternWord === '*' || nextPatternWord === '#' || routingWords[ri] === nextPatternWord) {
          // Try matching from this position
          if (matchesPattern(routingWords.slice(ri).join('.'), patternWords.slice(pi + 1).join('.'))) {
            return true;
          }
        }
        ri++;
      }
      return false;
    } else if (patternWord === '*') {
      // * matches exactly one word
      if (ri >= routingWords.length) {
        return false;
      }
      ri++;
      pi++;
    } else {
      // Literal match required
      if (ri >= routingWords.length || routingWords[ri] !== patternWord) {
        return false;
      }
      ri++;
      pi++;
    }
  }

  // Pattern consumed, check if routing key is also consumed
  return ri === routingWords.length;
}

export function matchTopic(routingKey: string, bindings: Binding[]): string[] {
  const matchedQueues: string[] = [];

  for (const binding of bindings) {
    if (matchesPattern(routingKey, binding.routingKey)) {
      matchedQueues.push(binding.destination);
    }
  }

  // Remove duplicates
  return [...new Set(matchedQueues)];
}

// Export for testing
export { matchesPattern, patternToRegex };
