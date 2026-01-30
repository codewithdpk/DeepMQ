// File-based persistence implementation

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { MessageStore } from './message-store';
import { Message, FieldTable } from '../protocol/types';
import { Exchange, ExchangeType } from '../core/exchange';
import { Queue } from '../core/queue';
import { Binding } from '../core/binding';
import { serializeMessage, deserializeMessage } from '../core/message';

interface LogEntry {
  type: 'message' | 'delete';
  queue: string;
  messageId: string;
  data?: string; // base64 encoded message for 'message' type
  checksum?: string;
}

export class FileStore implements MessageStore {
  private dataDir: string;
  private messagesLogPath: string;
  private queuesPath: string;
  private exchangesPath: string;
  private bindingsPath: string;

  // In-memory indexes
  private messagesByQueue: Map<string, Map<string, Message>> = new Map();
  private logFileHandle: fs.promises.FileHandle | null = null;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.messagesLogPath = path.join(dataDir, 'messages.log');
    this.queuesPath = path.join(dataDir, 'queues.json');
    this.exchangesPath = path.join(dataDir, 'exchanges.json');
    this.bindingsPath = path.join(dataDir, 'bindings.json');
  }

  async initialize(): Promise<void> {
    // Ensure data directory exists
    await fs.promises.mkdir(this.dataDir, { recursive: true });

    // Load existing data
    await this.loadMessages();

    // Open log file for appending
    this.logFileHandle = await fs.promises.open(this.messagesLogPath, 'a');
  }

  async close(): Promise<void> {
    if (this.logFileHandle) {
      await this.logFileHandle.close();
      this.logFileHandle = null;
    }
  }

  // Message operations

  async saveMessage(queueName: string, message: Message): Promise<void> {
    // Add to in-memory index
    let queueMessages = this.messagesByQueue.get(queueName);
    if (!queueMessages) {
      queueMessages = new Map();
      this.messagesByQueue.set(queueName, queueMessages);
    }
    queueMessages.set(message.id, message);

    // Append to log file
    const serialized = serializeMessage(message);
    const entry: LogEntry = {
      type: 'message',
      queue: queueName,
      messageId: message.id,
      data: serialized.toString('base64'),
      checksum: this.checksum(serialized),
    };

    await this.appendLog(entry);
  }

  async deleteMessage(queueName: string, messageId: string): Promise<void> {
    // Remove from in-memory index
    const queueMessages = this.messagesByQueue.get(queueName);
    if (queueMessages) {
      queueMessages.delete(messageId);
    }

    // Append delete entry to log
    const entry: LogEntry = {
      type: 'delete',
      queue: queueName,
      messageId,
    };

    await this.appendLog(entry);
  }

  async getMessages(queueName: string): Promise<Message[]> {
    const queueMessages = this.messagesByQueue.get(queueName);
    if (!queueMessages) {
      return [];
    }
    return Array.from(queueMessages.values());
  }

  async purgeQueue(queueName: string): Promise<number> {
    const queueMessages = this.messagesByQueue.get(queueName);
    if (!queueMessages) {
      return 0;
    }

    const count = queueMessages.size;

    // Mark all messages as deleted
    for (const messageId of queueMessages.keys()) {
      await this.appendLog({
        type: 'delete',
        queue: queueName,
        messageId,
      });
    }

    queueMessages.clear();
    return count;
  }

  // Queue operations

  async saveQueue(queue: Queue): Promise<void> {
    const queues = await this.loadJsonFile<object[]>(this.queuesPath, []);
    const existing = queues.findIndex((q: { name?: string }) => q.name === queue.name);

    if (existing >= 0) {
      queues[existing] = queue.toJSON();
    } else {
      queues.push(queue.toJSON());
    }

    await this.saveJsonFile(this.queuesPath, queues);
  }

  async deleteQueue(queueName: string): Promise<void> {
    const queues = await this.loadJsonFile<{ name?: string }[]>(this.queuesPath, []);
    const filtered = queues.filter((q) => q.name !== queueName);
    await this.saveJsonFile(this.queuesPath, filtered);

    // Also purge messages for this queue
    this.messagesByQueue.delete(queueName);
  }

  async getQueues(): Promise<Queue[]> {
    const data = await this.loadJsonFile<{
      name: string;
      durable: boolean;
      exclusive: boolean;
      autoDelete: boolean;
      arguments: FieldTable;
    }[]>(this.queuesPath, []);
    return data.map((q) => Queue.fromJSON(q));
  }

  // Exchange operations

  async saveExchange(exchange: Exchange): Promise<void> {
    const exchanges = await this.loadJsonFile<object[]>(this.exchangesPath, []);
    const existing = exchanges.findIndex((e: { name?: string }) => e.name === exchange.name);

    if (existing >= 0) {
      exchanges[existing] = exchange.toJSON();
    } else {
      exchanges.push(exchange.toJSON());
    }

    await this.saveJsonFile(this.exchangesPath, exchanges);
  }

  async deleteExchange(exchangeName: string): Promise<void> {
    const exchanges = await this.loadJsonFile<{ name?: string }[]>(this.exchangesPath, []);
    const filtered = exchanges.filter((e) => e.name !== exchangeName);
    await this.saveJsonFile(this.exchangesPath, filtered);
  }

  async getExchanges(): Promise<Exchange[]> {
    const data = await this.loadJsonFile<{
      name: string;
      type: ExchangeType;
      durable: boolean;
      autoDelete: boolean;
      internal: boolean;
      arguments: FieldTable;
    }[]>(this.exchangesPath, []);
    return data.map((e) => Exchange.fromJSON(e));
  }

  // Binding operations

  async saveBinding(binding: Binding): Promise<void> {
    const bindings = await this.loadJsonFile<object[]>(this.bindingsPath, []);

    // Check for duplicate
    const exists = bindings.some(
      (b: { source?: string; destination?: string; routingKey?: string }) =>
        b.source === binding.source &&
        b.destination === binding.destination &&
        b.routingKey === binding.routingKey
    );

    if (!exists) {
      bindings.push(binding.toJSON());
      await this.saveJsonFile(this.bindingsPath, bindings);
    }
  }

  async deleteBinding(source: string, destination: string, routingKey: string): Promise<void> {
    const bindings = await this.loadJsonFile<{
      source?: string;
      destination?: string;
      routingKey?: string;
    }[]>(this.bindingsPath, []);
    const filtered = bindings.filter(
      (b) =>
        !(b.source === source && b.destination === destination && b.routingKey === routingKey)
    );
    await this.saveJsonFile(this.bindingsPath, filtered);
  }

  async getBindings(): Promise<Binding[]> {
    const data = await this.loadJsonFile<{
      source: string;
      destination: string;
      routingKey: string;
      arguments: FieldTable;
    }[]>(this.bindingsPath, []);
    return data.map((b) => Binding.fromJSON(b));
  }

  // Compaction - rewrite the log file with only current messages
  async compact(): Promise<void> {
    const tempPath = `${this.messagesLogPath}.tmp`;

    // Close current handle
    if (this.logFileHandle) {
      await this.logFileHandle.close();
    }

    // Write all current messages to temp file
    const tempHandle = await fs.promises.open(tempPath, 'w');

    for (const [queueName, messages] of this.messagesByQueue) {
      for (const message of messages.values()) {
        const serialized = serializeMessage(message);
        const entry: LogEntry = {
          type: 'message',
          queue: queueName,
          messageId: message.id,
          data: serialized.toString('base64'),
          checksum: this.checksum(serialized),
        };
        await tempHandle.write(JSON.stringify(entry) + '\n');
      }
    }

    await tempHandle.close();

    // Replace old file with new one
    await fs.promises.rename(tempPath, this.messagesLogPath);

    // Reopen for appending
    this.logFileHandle = await fs.promises.open(this.messagesLogPath, 'a');
  }

  // Private helpers

  private async appendLog(entry: LogEntry): Promise<void> {
    if (!this.logFileHandle) {
      throw new Error('Log file not open');
    }
    await this.logFileHandle.write(JSON.stringify(entry) + '\n');
  }

  private async loadMessages(): Promise<void> {
    try {
      const content = await fs.promises.readFile(this.messagesLogPath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);

          if (entry.type === 'message' && entry.data) {
            const buffer = Buffer.from(entry.data, 'base64');

            // Verify checksum if present
            if (entry.checksum && this.checksum(buffer) !== entry.checksum) {
              console.error(`Checksum mismatch for message ${entry.messageId}, skipping`);
              continue;
            }

            const message = deserializeMessage(buffer);

            let queueMessages = this.messagesByQueue.get(entry.queue);
            if (!queueMessages) {
              queueMessages = new Map();
              this.messagesByQueue.set(entry.queue, queueMessages);
            }
            queueMessages.set(message.id, message);
          } else if (entry.type === 'delete') {
            const queueMessages = this.messagesByQueue.get(entry.queue);
            if (queueMessages) {
              queueMessages.delete(entry.messageId);
            }
          }
        } catch (e) {
          console.error(`Failed to parse log entry: ${e}`);
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
      // File doesn't exist yet, that's OK
    }
  }

  private async loadJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return defaultValue;
      }
      throw e;
    }
  }

  private async saveJsonFile(filePath: string, data: unknown): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.promises.rename(tempPath, filePath);
  }

  private checksum(data: Buffer): string {
    return createHash('md5').update(data).digest('hex');
  }
}
