// Queue implementation

import { EventEmitter } from 'events';
import { QueueDefinition, FieldTable, Message } from '../protocol/types';
import { randomUUID } from 'crypto';

export class Queue extends EventEmitter implements QueueDefinition {
  readonly name: string;
  readonly durable: boolean;
  readonly exclusive: boolean;
  readonly autoDelete: boolean;
  readonly arguments: FieldTable;
  readonly createdAt: number;

  // The connection ID that owns this exclusive queue
  readonly exclusiveConnectionId: string | null;

  // Message storage
  private messages: Message[] = [];

  // Consumer tracking for auto-delete
  private consumerCount: number = 0;

  constructor(
    name: string,
    options: {
      durable?: boolean;
      exclusive?: boolean;
      autoDelete?: boolean;
      arguments?: FieldTable;
      exclusiveConnectionId?: string | null;
    } = {}
  ) {
    super();
    this.name = name || `amq.gen-${randomUUID()}`;
    this.durable = options.durable ?? false;
    this.exclusive = options.exclusive ?? false;
    this.autoDelete = options.autoDelete ?? false;
    this.arguments = options.arguments ?? {};
    this.exclusiveConnectionId = options.exclusiveConnectionId ?? null;
    this.createdAt = Date.now();
  }

  // Message operations
  enqueue(message: Message): void {
    this.messages.push(message);
    this.emit('message', message);
  }

  dequeue(): Message | undefined {
    return this.messages.shift();
  }

  peek(): Message | undefined {
    return this.messages[0];
  }

  requeue(message: Message, front: boolean = true): void {
    if (front) {
      this.messages.unshift(message);
    } else {
      this.messages.push(message);
    }
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  purge(): number {
    const count = this.messages.length;
    this.messages = [];
    return count;
  }

  // Get messages without removing (for get without auto-ack)
  getMessages(): Message[] {
    return [...this.messages];
  }

  // Remove a specific message by ID
  removeMessage(messageId: string): boolean {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
      return true;
    }
    return false;
  }

  // Consumer tracking
  addConsumer(): void {
    this.consumerCount++;
  }

  removeConsumer(): number {
    this.consumerCount = Math.max(0, this.consumerCount - 1);
    if (this.autoDelete && this.consumerCount === 0) {
      this.emit('empty-consumers');
    }
    return this.consumerCount;
  }

  getConsumerCount(): number {
    return this.consumerCount;
  }

  // Check if queue definition matches (for passive declare)
  matches(other: Partial<QueueDefinition>): boolean {
    if (other.durable !== undefined && other.durable !== this.durable) {
      return false;
    }
    if (other.exclusive !== undefined && other.exclusive !== this.exclusive) {
      return false;
    }
    if (other.autoDelete !== undefined && other.autoDelete !== this.autoDelete) {
      return false;
    }
    return true;
  }

  // Check if a connection can access this exclusive queue
  canAccess(connectionId: string): boolean {
    if (!this.exclusive) {
      return true;
    }
    return this.exclusiveConnectionId === connectionId;
  }

  // Serialize for persistence
  toJSON(): object {
    return {
      name: this.name,
      durable: this.durable,
      exclusive: this.exclusive,
      autoDelete: this.autoDelete,
      arguments: this.arguments,
    };
  }

  // Deserialize from persistence
  static fromJSON(data: {
    name: string;
    durable: boolean;
    exclusive: boolean;
    autoDelete: boolean;
    arguments: FieldTable;
  }): Queue {
    return new Queue(data.name, {
      durable: data.durable,
      exclusive: data.exclusive,
      autoDelete: data.autoDelete,
      arguments: data.arguments,
    });
  }

  // Get queue info for status reporting
  getInfo(): object {
    return {
      name: this.name,
      durable: this.durable,
      exclusive: this.exclusive,
      autoDelete: this.autoDelete,
      messageCount: this.messages.length,
      consumerCount: this.consumerCount,
      arguments: this.arguments,
    };
  }
}
