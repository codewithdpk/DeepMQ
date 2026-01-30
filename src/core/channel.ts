// Channel state management

import { EventEmitter } from 'events';
import { ChannelState, QoSSettings, UnackedMessage, Message, ConsumerDefinition } from '../protocol/types';
import { Connection } from './connection';

export class Channel extends EventEmitter {
  readonly channelNumber: number;
  readonly connection: Connection;

  private _state: ChannelState = 'opening';
  private _flowActive: boolean = true;

  // QoS settings
  private qos: QoSSettings = {
    prefetchSize: 0,
    prefetchCount: 0,
    global: false,
  };

  // Delivery tracking
  private deliveryTagCounter: bigint = 0n;
  private unackedMessages: Map<bigint, UnackedMessage> = new Map();

  // Consumers on this channel
  private consumers: Map<string, ConsumerDefinition> = new Map();
  private consumerTagCounter: number = 0;

  // Current message being assembled (for content frames)
  private pendingMessage: {
    method: 'publish' | 'return';
    exchange: string;
    routingKey: string;
    mandatory: boolean;
    immediate: boolean;
    properties: Message['properties'];
    bodySize: bigint;
    bodyChunks: Buffer[];
    receivedSize: bigint;
  } | null = null;

  constructor(channelNumber: number, connection: Connection) {
    super();
    this.channelNumber = channelNumber;
    this.connection = connection;
  }

  get state(): ChannelState {
    return this._state;
  }

  setState(state: ChannelState): void {
    const oldState = this._state;
    this._state = state;
    this.emit('stateChange', oldState, state);
  }

  get flowActive(): boolean {
    return this._flowActive;
  }

  setFlow(active: boolean): void {
    this._flowActive = active;
    this.emit('flow', active);
  }

  // QoS management
  setQoS(prefetchSize: number, prefetchCount: number, global: boolean): void {
    this.qos = { prefetchSize, prefetchCount, global };
  }

  getQoS(): QoSSettings {
    return { ...this.qos };
  }

  canDeliver(): boolean {
    if (this.qos.prefetchCount === 0) {
      return true; // No limit
    }
    return this.unackedMessages.size < this.qos.prefetchCount;
  }

  // Delivery tag management
  nextDeliveryTag(): bigint {
    return ++this.deliveryTagCounter;
  }

  trackUnacked(deliveryTag: bigint, message: Message, queueName: string, consumerTag: string): void {
    this.unackedMessages.set(deliveryTag, {
      message,
      queueName,
      deliveryTag,
      consumerTag,
      deliveredAt: Date.now(),
    });
  }

  getUnacked(deliveryTag: bigint): UnackedMessage | undefined {
    return this.unackedMessages.get(deliveryTag);
  }

  ack(deliveryTag: bigint, multiple: boolean): UnackedMessage[] {
    const acked: UnackedMessage[] = [];

    if (multiple) {
      // Ack all messages up to and including deliveryTag
      for (const [tag, unacked] of this.unackedMessages) {
        if (tag <= deliveryTag) {
          acked.push(unacked);
          this.unackedMessages.delete(tag);
        }
      }
    } else {
      const unacked = this.unackedMessages.get(deliveryTag);
      if (unacked) {
        acked.push(unacked);
        this.unackedMessages.delete(deliveryTag);
      }
    }

    return acked;
  }

  nack(deliveryTag: bigint, multiple: boolean): UnackedMessage[] {
    // Same as ack but returns messages for potential requeue
    return this.ack(deliveryTag, multiple);
  }

  reject(deliveryTag: bigint): UnackedMessage | undefined {
    const unacked = this.unackedMessages.get(deliveryTag);
    if (unacked) {
      this.unackedMessages.delete(deliveryTag);
    }
    return unacked;
  }

  getUnackedMessages(): UnackedMessage[] {
    return Array.from(this.unackedMessages.values());
  }

  getUnackedCount(): number {
    return this.unackedMessages.size;
  }

  // Consumer management
  addConsumer(consumer: ConsumerDefinition): void {
    this.consumers.set(consumer.consumerTag, consumer);
  }

  removeConsumer(consumerTag: string): ConsumerDefinition | undefined {
    const consumer = this.consumers.get(consumerTag);
    if (consumer) {
      this.consumers.delete(consumerTag);
    }
    return consumer;
  }

  getConsumer(consumerTag: string): ConsumerDefinition | undefined {
    return this.consumers.get(consumerTag);
  }

  getConsumers(): ConsumerDefinition[] {
    return Array.from(this.consumers.values());
  }

  hasConsumer(consumerTag: string): boolean {
    return this.consumers.has(consumerTag);
  }

  generateConsumerTag(): string {
    return `amq.ctag-${this.connection.id}-${this.channelNumber}-${++this.consumerTagCounter}`;
  }

  // Pending message management (for content frames)
  setPendingMessage(pending: typeof this.pendingMessage): void {
    this.pendingMessage = pending;
  }

  getPendingMessage(): typeof this.pendingMessage {
    return this.pendingMessage;
  }

  clearPendingMessage(): void {
    this.pendingMessage = null;
  }

  appendBodyChunk(chunk: Buffer): boolean {
    if (!this.pendingMessage) {
      return false;
    }

    this.pendingMessage.bodyChunks.push(chunk);
    this.pendingMessage.receivedSize += BigInt(chunk.length);

    return this.pendingMessage.receivedSize >= this.pendingMessage.bodySize;
  }

  // Close channel
  close(): void {
    if (this._state === 'closed') {
      return;
    }

    // Return unacked messages to queues
    // This will be handled by the broker
    this.emit('closing', this.getUnackedMessages());

    this.unackedMessages.clear();
    this.consumers.clear();
    this.pendingMessage = null;

    this.setState('closed');
    this.emit('close');
  }

  // Get channel info for status reporting
  getInfo(): object {
    return {
      channelNumber: this.channelNumber,
      state: this._state,
      flowActive: this._flowActive,
      qos: this.qos,
      consumerCount: this.consumers.size,
      unackedCount: this.unackedMessages.size,
      consumers: Array.from(this.consumers.keys()),
    };
  }
}
