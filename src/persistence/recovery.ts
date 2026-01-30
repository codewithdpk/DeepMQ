// Startup recovery logic

import { MessageStore } from './message-store';
import { Exchange } from '../core/exchange';
import { Queue } from '../core/queue';
import { Binding, BindingRegistry } from '../core/binding';

export interface RecoveryResult {
  exchanges: Map<string, Exchange>;
  queues: Map<string, Queue>;
  bindings: BindingRegistry;
  messageCount: number;
}

export async function recoverFromStore(store: MessageStore): Promise<RecoveryResult> {
  const exchanges = new Map<string, Exchange>();
  const queues = new Map<string, Queue>();
  const bindings = new BindingRegistry();
  let messageCount = 0;

  // Recover exchanges
  const savedExchanges = await store.getExchanges();
  for (const exchange of savedExchanges) {
    // Only recover durable exchanges
    if (exchange.durable) {
      exchanges.set(exchange.name, exchange);
    }
  }

  // Recover queues
  const savedQueues = await store.getQueues();
  for (const queue of savedQueues) {
    // Only recover durable, non-exclusive queues
    if (queue.durable && !queue.exclusive) {
      queues.set(queue.name, queue);

      // Recover messages for this queue
      const messages = await store.getMessages(queue.name);
      for (const message of messages) {
        queue.enqueue(message);
        messageCount++;
      }
    }
  }

  // Recover bindings
  const savedBindings = await store.getBindings();
  for (const binding of savedBindings) {
    // Only recover bindings where both exchange and queue still exist
    const exchangeExists = binding.source === '' || exchanges.has(binding.source);
    const queueExists = queues.has(binding.destination);

    if (exchangeExists && queueExists) {
      bindings.add(binding);
    }
  }

  return {
    exchanges,
    queues,
    bindings,
    messageCount,
  };
}

// Create default exchanges
export function createDefaultExchanges(): Map<string, Exchange> {
  const exchanges = new Map<string, Exchange>();

  // Default direct exchange (empty string name)
  exchanges.set('', new Exchange('', 'direct', {
    durable: true,
    isDefault: true,
  }));

  // Standard AMQP exchanges
  exchanges.set('amq.direct', new Exchange('amq.direct', 'direct', {
    durable: true,
    isDefault: true,
  }));

  exchanges.set('amq.fanout', new Exchange('amq.fanout', 'fanout', {
    durable: true,
    isDefault: true,
  }));

  exchanges.set('amq.topic', new Exchange('amq.topic', 'topic', {
    durable: true,
    isDefault: true,
  }));

  exchanges.set('amq.headers', new Exchange('amq.headers', 'headers', {
    durable: true,
    isDefault: true,
  }));

  return exchanges;
}
