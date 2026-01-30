// Fanout exchange routing
// Routes messages to all bound queues (ignores routing key)

import { Binding } from '../core/binding';

export function matchFanout(bindings: Binding[]): string[] {
  const matchedQueues: string[] = [];

  for (const binding of bindings) {
    matchedQueues.push(binding.destination);
  }

  // Remove duplicates (a queue might have multiple bindings)
  return [...new Set(matchedQueues)];
}
