// Typed event emitter for broker events

import { EventEmitter } from 'events';
import { Message, MessageProperties } from '../protocol/types';
import { Connection } from '../core/connection';
import { Channel } from '../core/channel';
import { Exchange } from '../core/exchange';
import { Queue } from '../core/queue';
import { Consumer } from '../core/consumer';
import { Binding } from '../core/binding';

export interface BrokerEvents {
  // Connection events
  'connection:open': (connection: Connection) => void;
  'connection:close': (connection: Connection, reason?: string) => void;
  'connection:error': (connection: Connection, error: Error) => void;

  // Channel events
  'channel:open': (channel: Channel, connection: Connection) => void;
  'channel:close': (channel: Channel, connection: Connection) => void;
  'channel:flow': (channel: Channel, active: boolean) => void;

  // Exchange events
  'exchange:created': (exchange: Exchange) => void;
  'exchange:deleted': (exchange: Exchange) => void;

  // Queue events
  'queue:created': (queue: Queue) => void;
  'queue:deleted': (queue: Queue) => void;
  'queue:purged': (queue: Queue, messageCount: number) => void;

  // Binding events
  'binding:created': (binding: Binding) => void;
  'binding:deleted': (binding: Binding) => void;

  // Consumer events
  'consumer:created': (consumer: Consumer) => void;
  'consumer:cancelled': (consumer: Consumer) => void;

  // Message events
  'message:published': (message: Message, exchange: string, routingKey: string) => void;
  'message:routed': (message: Message, queues: string[]) => void;
  'message:delivered': (message: Message, consumer: Consumer, deliveryTag: bigint) => void;
  'message:acked': (deliveryTag: bigint, channel: Channel, multiple: boolean) => void;
  'message:nacked': (deliveryTag: bigint, channel: Channel, multiple: boolean, requeue: boolean) => void;
  'message:rejected': (deliveryTag: bigint, channel: Channel, requeue: boolean) => void;
  'message:returned': (message: Message, replyCode: number, replyText: string) => void;
  'message:expired': (message: Message, queue: Queue) => void;

  // Broker lifecycle events
  'broker:started': (port: number) => void;
  'broker:stopped': () => void;
  'broker:error': (error: Error) => void;
}

export class BrokerEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to avoid warnings in high-traffic scenarios
    this.setMaxListeners(100);
  }

  // Type-safe emit
  emitTyped<K extends keyof BrokerEvents>(
    event: K,
    ...args: Parameters<BrokerEvents[K]>
  ): boolean {
    return this.emit(event, ...args);
  }

  // Type-safe on
  onTyped<K extends keyof BrokerEvents>(
    event: K,
    listener: BrokerEvents[K]
  ): this {
    return this.on(event, listener as (...args: unknown[]) => void);
  }

  // Type-safe once
  onceTyped<K extends keyof BrokerEvents>(
    event: K,
    listener: BrokerEvents[K]
  ): this {
    return this.once(event, listener as (...args: unknown[]) => void);
  }

  // Type-safe off
  offTyped<K extends keyof BrokerEvents>(
    event: K,
    listener: BrokerEvents[K]
  ): this {
    return this.off(event, listener as (...args: unknown[]) => void);
  }
}
