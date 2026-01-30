// Main message router

import { Message } from '../protocol/types';
import { Exchange, ExchangeType } from '../core/exchange';
import { Queue } from '../core/queue';
import { Binding, BindingRegistry } from '../core/binding';
import { matchDirect } from './direct-exchange';
import { matchFanout } from './fanout-exchange';
import { matchTopic } from './topic-exchange';

export interface RouterContext {
  exchanges: Map<string, Exchange>;
  queues: Map<string, Queue>;
  bindings: BindingRegistry;
}

export class MessageRouter {
  private context: RouterContext;

  constructor(context: RouterContext) {
    this.context = context;
  }

  // Update the router context (used after recovery)
  updateContext(context: RouterContext): void {
    this.context = context;
  }

  // Route a message and return the list of queues it was routed to
  route(message: Message): Queue[] {
    const { exchange: exchangeName, routingKey } = message;

    // Handle default exchange (empty string)
    if (exchangeName === '') {
      return this.routeDefault(routingKey);
    }

    const exchange = this.context.exchanges.get(exchangeName);
    if (!exchange) {
      // Exchange doesn't exist - if mandatory, message should be returned
      return [];
    }

    const bindings = this.context.bindings.getBySource(exchangeName);
    const queueNames = this.matchBindings(exchange.type, routingKey, bindings);

    // Get actual queue objects
    const queues: Queue[] = [];
    for (const queueName of queueNames) {
      const queue = this.context.queues.get(queueName);
      if (queue) {
        queues.push(queue);
      }
    }

    return queues;
  }

  // Route to the default exchange (direct routing to queue by name)
  private routeDefault(routingKey: string): Queue[] {
    const queue = this.context.queues.get(routingKey);
    if (queue) {
      return [queue];
    }
    return [];
  }

  // Match bindings based on exchange type
  private matchBindings(type: ExchangeType, routingKey: string, bindings: Binding[]): string[] {
    switch (type) {
      case 'direct':
        return matchDirect(routingKey, bindings);
      case 'fanout':
        return matchFanout(bindings);
      case 'topic':
        return matchTopic(routingKey, bindings);
      case 'headers':
        // Headers exchange not implemented yet
        return [];
      default:
        return [];
    }
  }

  // Check if a message would be routed to any queue (for mandatory check)
  wouldRoute(exchangeName: string, routingKey: string): boolean {
    if (exchangeName === '') {
      return this.context.queues.has(routingKey);
    }

    const exchange = this.context.exchanges.get(exchangeName);
    if (!exchange) {
      return false;
    }

    const bindings = this.context.bindings.getBySource(exchangeName);
    const queueNames = this.matchBindings(exchange.type, routingKey, bindings);

    // Check if at least one matched queue exists
    return queueNames.some(name => this.context.queues.has(name));
  }
}
