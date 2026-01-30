// Consumer management

import { ConsumerDefinition, FieldTable } from '../protocol/types';
import { Channel } from './channel';

export class Consumer implements ConsumerDefinition {
  readonly consumerTag: string;
  readonly queueName: string;
  readonly noLocal: boolean;
  readonly noAck: boolean;
  readonly exclusive: boolean;
  readonly arguments: FieldTable;
  readonly channel: Channel;
  readonly createdAt: number;

  constructor(
    consumerTag: string,
    queueName: string,
    channel: Channel,
    options: {
      noLocal?: boolean;
      noAck?: boolean;
      exclusive?: boolean;
      arguments?: FieldTable;
    } = {}
  ) {
    this.consumerTag = consumerTag;
    this.queueName = queueName;
    this.channel = channel;
    this.noLocal = options.noLocal ?? false;
    this.noAck = options.noAck ?? false;
    this.exclusive = options.exclusive ?? false;
    this.arguments = options.arguments ?? {};
    this.createdAt = Date.now();
  }

  // Check if consumer can receive more messages (based on QoS)
  canReceive(): boolean {
    if (!this.channel.flowActive) {
      return false;
    }
    return this.channel.canDeliver();
  }

  // Get consumer info for status reporting
  getInfo(): object {
    return {
      consumerTag: this.consumerTag,
      queueName: this.queueName,
      channelNumber: this.channel.channelNumber,
      noLocal: this.noLocal,
      noAck: this.noAck,
      exclusive: this.exclusive,
      arguments: this.arguments,
    };
  }
}

// Consumer registry - manages all consumers across connections
export class ConsumerRegistry {
  private consumers: Map<string, Consumer> = new Map();
  private queueConsumers: Map<string, Set<string>> = new Map();

  add(consumer: Consumer): void {
    this.consumers.set(consumer.consumerTag, consumer);

    let queueSet = this.queueConsumers.get(consumer.queueName);
    if (!queueSet) {
      queueSet = new Set();
      this.queueConsumers.set(consumer.queueName, queueSet);
    }
    queueSet.add(consumer.consumerTag);
  }

  remove(consumerTag: string): Consumer | undefined {
    const consumer = this.consumers.get(consumerTag);
    if (consumer) {
      this.consumers.delete(consumerTag);

      const queueSet = this.queueConsumers.get(consumer.queueName);
      if (queueSet) {
        queueSet.delete(consumerTag);
        if (queueSet.size === 0) {
          this.queueConsumers.delete(consumer.queueName);
        }
      }
    }
    return consumer;
  }

  get(consumerTag: string): Consumer | undefined {
    return this.consumers.get(consumerTag);
  }

  getByQueue(queueName: string): Consumer[] {
    const tags = this.queueConsumers.get(queueName);
    if (!tags) {
      return [];
    }
    return Array.from(tags)
      .map(tag => this.consumers.get(tag))
      .filter((c): c is Consumer => c !== undefined);
  }

  hasExclusiveConsumer(queueName: string): boolean {
    const consumers = this.getByQueue(queueName);
    return consumers.some(c => c.exclusive);
  }

  getConsumerCountForQueue(queueName: string): number {
    const tags = this.queueConsumers.get(queueName);
    return tags ? tags.size : 0;
  }

  removeByChannel(channel: Channel): Consumer[] {
    const removed: Consumer[] = [];
    for (const [tag, consumer] of this.consumers) {
      if (consumer.channel === channel) {
        this.remove(tag);
        removed.push(consumer);
      }
    }
    return removed;
  }

  getAll(): Consumer[] {
    return Array.from(this.consumers.values());
  }

  clear(): void {
    this.consumers.clear();
    this.queueConsumers.clear();
  }
}
