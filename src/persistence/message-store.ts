// Message persistence interface

import { Message } from '../protocol/types';
import { Exchange } from '../core/exchange';
import { Queue } from '../core/queue';
import { Binding } from '../core/binding';

export interface MessageStore {
  // Message operations
  saveMessage(queueName: string, message: Message): Promise<void>;
  deleteMessage(queueName: string, messageId: string): Promise<void>;
  getMessages(queueName: string): Promise<Message[]>;
  purgeQueue(queueName: string): Promise<number>;

  // Queue operations
  saveQueue(queue: Queue): Promise<void>;
  deleteQueue(queueName: string): Promise<void>;
  getQueues(): Promise<Queue[]>;

  // Exchange operations
  saveExchange(exchange: Exchange): Promise<void>;
  deleteExchange(exchangeName: string): Promise<void>;
  getExchanges(): Promise<Exchange[]>;

  // Binding operations
  saveBinding(binding: Binding): Promise<void>;
  deleteBinding(source: string, destination: string, routingKey: string): Promise<void>;
  getBindings(): Promise<Binding[]>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  compact(): Promise<void>;
}
