// Direct exchange routing
// Routes messages to queues where binding key exactly matches routing key

import { Binding } from '../core/binding';

export function matchDirect(routingKey: string, bindings: Binding[]): string[] {
  const matchedQueues: string[] = [];

  for (const binding of bindings) {
    if (binding.routingKey === routingKey) {
      matchedQueues.push(binding.destination);
    }
  }

  return matchedQueues;
}
