// Integration tests using amqplib client

import * as amqp from 'amqplib';
import { DeepMQBroker } from '../../src/server';
import * as assert from 'assert';
import { describe, it, before, after } from 'node:test';

const TEST_PORT = 5673; // Use non-standard port for testing

describe('DeepMQ Integration Tests', () => {
  let broker: DeepMQBroker;

  before(async () => {
    broker = new DeepMQBroker({
      port: TEST_PORT,
      dataDir: './data/test',
    });
    await broker.start();
    console.log(`Test broker started on port ${TEST_PORT}`);
  });

  after(async () => {
    await broker.stop();
    console.log('Test broker stopped');
  });

  describe('Connection', () => {
    it('should connect and disconnect', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      assert.ok(conn, 'Connection should be established');
      await conn.close();
    });

    it('should create and close channels', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();
      assert.ok(ch, 'Channel should be created');
      await ch.close();
      await conn.close();
    });
  });

  describe('Queues', () => {
    it('should declare a queue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      const result = await ch.assertQueue('test-queue-1');
      assert.strictEqual(result.queue, 'test-queue-1');
      assert.strictEqual(result.messageCount, 0);
      assert.strictEqual(result.consumerCount, 0);

      await ch.deleteQueue('test-queue-1');
      await ch.close();
      await conn.close();
    });

    it('should generate queue name when empty', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      const result = await ch.assertQueue('', { exclusive: true });
      assert.ok(result.queue.startsWith('amq.gen-'), 'Should generate queue name');

      await ch.close();
      await conn.close();
    });

    it('should purge a queue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('purge-test');
      ch.sendToQueue('purge-test', Buffer.from('message 1'));
      ch.sendToQueue('purge-test', Buffer.from('message 2'));

      // Wait for messages to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await ch.purgeQueue('purge-test');
      assert.strictEqual(result.messageCount, 2);

      await ch.deleteQueue('purge-test');
      await ch.close();
      await conn.close();
    });

    it('should delete a queue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('delete-test');
      const result = await ch.deleteQueue('delete-test');
      assert.strictEqual(result.messageCount, 0);

      await ch.close();
      await conn.close();
    });
  });

  describe('Exchanges', () => {
    it('should declare a direct exchange', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('test-exchange', 'direct');
      await ch.deleteExchange('test-exchange');

      await ch.close();
      await conn.close();
    });

    it('should declare a fanout exchange', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('fanout-exchange', 'fanout');
      await ch.deleteExchange('fanout-exchange');

      await ch.close();
      await conn.close();
    });

    it('should declare a topic exchange', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('topic-exchange', 'topic');
      await ch.deleteExchange('topic-exchange');

      await ch.close();
      await conn.close();
    });
  });

  describe('Bindings', () => {
    it('should bind queue to exchange', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('bind-test-exchange', 'direct');
      await ch.assertQueue('bind-test-queue');
      await ch.bindQueue('bind-test-queue', 'bind-test-exchange', 'test-key');

      // Cleanup
      await ch.unbindQueue('bind-test-queue', 'bind-test-exchange', 'test-key');
      await ch.deleteQueue('bind-test-queue');
      await ch.deleteExchange('bind-test-exchange');

      await ch.close();
      await conn.close();
    });
  });

  describe('Publishing and Consuming', () => {
    it('should publish to default exchange and consume', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('pub-con-test');

      const testMessage = 'Hello DeepMQ!';
      ch.sendToQueue('pub-con-test', Buffer.from(testMessage));

      const received = await new Promise<string>((resolve) => {
        ch.consume('pub-con-test', (msg) => {
          if (msg) {
            ch.ack(msg);
            resolve(msg.content.toString());
          }
        });
      });

      assert.strictEqual(received, testMessage);

      await ch.deleteQueue('pub-con-test');
      await ch.close();
      await conn.close();
    });

    it('should publish to direct exchange and consume', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('direct-pub-test', 'direct');
      await ch.assertQueue('direct-pub-queue');
      await ch.bindQueue('direct-pub-queue', 'direct-pub-test', 'my-key');

      const testMessage = 'Direct message';
      ch.publish('direct-pub-test', 'my-key', Buffer.from(testMessage));

      const received = await new Promise<string>((resolve) => {
        ch.consume('direct-pub-queue', (msg) => {
          if (msg) {
            ch.ack(msg);
            resolve(msg.content.toString());
          }
        });
      });

      assert.strictEqual(received, testMessage);

      await ch.deleteQueue('direct-pub-queue');
      await ch.deleteExchange('direct-pub-test');
      await ch.close();
      await conn.close();
    });

    it('should publish to fanout exchange and consume from multiple queues', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('fanout-pub-test', 'fanout');
      await ch.assertQueue('fanout-queue-1');
      await ch.assertQueue('fanout-queue-2');
      await ch.bindQueue('fanout-queue-1', 'fanout-pub-test', '');
      await ch.bindQueue('fanout-queue-2', 'fanout-pub-test', '');

      const testMessage = 'Fanout message';
      ch.publish('fanout-pub-test', '', Buffer.from(testMessage));

      // Wait for message to be delivered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get from both queues
      const msg1 = await ch.get('fanout-queue-1', { noAck: true });
      const msg2 = await ch.get('fanout-queue-2', { noAck: true });

      assert.ok(msg1, 'Queue 1 should have message');
      assert.ok(msg2, 'Queue 2 should have message');
      assert.strictEqual(msg1.content.toString(), testMessage);
      assert.strictEqual(msg2.content.toString(), testMessage);

      await ch.deleteQueue('fanout-queue-1');
      await ch.deleteQueue('fanout-queue-2');
      await ch.deleteExchange('fanout-pub-test');
      await ch.close();
      await conn.close();
    });

    it('should publish to topic exchange with pattern matching', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertExchange('topic-pub-test', 'topic');
      await ch.assertQueue('topic-queue-all');
      await ch.assertQueue('topic-queue-stock');
      await ch.bindQueue('topic-queue-all', 'topic-pub-test', '#');
      await ch.bindQueue('topic-queue-stock', 'topic-pub-test', 'stock.*');

      ch.publish('topic-pub-test', 'stock.nasdaq', Buffer.from('NASDAQ update'));
      ch.publish('topic-pub-test', 'weather.usa', Buffer.from('Weather update'));

      // Wait for messages to be delivered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get from queues
      const allMsg1 = await ch.get('topic-queue-all', { noAck: true });
      const allMsg2 = await ch.get('topic-queue-all', { noAck: true });
      const stockMsg = await ch.get('topic-queue-stock', { noAck: true });
      const stockNoMore = await ch.get('topic-queue-stock', { noAck: true });

      assert.ok(allMsg1, 'All queue should have first message');
      assert.ok(allMsg2, 'All queue should have second message');
      assert.ok(stockMsg, 'Stock queue should have message');
      assert.strictEqual(stockNoMore, false, 'Stock queue should only have one message');

      await ch.deleteQueue('topic-queue-all');
      await ch.deleteQueue('topic-queue-stock');
      await ch.deleteExchange('topic-pub-test');
      await ch.close();
      await conn.close();
    });
  });

  describe('Message Properties', () => {
    it('should preserve message properties', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('props-test');

      const properties = {
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        correlationId: 'test-correlation-123',
        replyTo: 'reply-queue',
        messageId: 'msg-id-456',
        type: 'test.message',
        appId: 'test-app',
      };

      ch.sendToQueue('props-test', Buffer.from('{"test": true}'), properties);

      const received = await new Promise<amqp.Message | null>((resolve) => {
        ch.consume('props-test', (msg) => {
          if (msg) {
            ch.ack(msg);
            resolve(msg);
          }
        });
      });

      assert.ok(received, 'Should receive message');
      assert.strictEqual(received.properties.contentType, 'application/json');
      assert.strictEqual(received.properties.correlationId, 'test-correlation-123');
      assert.strictEqual(received.properties.replyTo, 'reply-queue');
      assert.strictEqual(received.properties.messageId, 'msg-id-456');
      assert.strictEqual(received.properties.type, 'test.message');
      assert.strictEqual(received.properties.appId, 'test-app');

      await ch.deleteQueue('props-test');
      await ch.close();
      await conn.close();
    });
  });

  describe('QoS and Prefetch', () => {
    it('should respect prefetch count', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('prefetch-test');

      // Set prefetch to 2
      await ch.prefetch(2);

      // Send 5 messages
      for (let i = 0; i < 5; i++) {
        ch.sendToQueue('prefetch-test', Buffer.from(`message ${i}`));
      }

      // Wait for messages to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      const received: amqp.Message[] = [];
      await new Promise<void>((resolve) => {
        ch.consume('prefetch-test', (msg) => {
          if (msg) {
            received.push(msg);
            // Only ack after receiving first 2
            if (received.length === 2) {
              // Wait a bit to ensure no more messages come
              setTimeout(() => {
                // We should only have 2 unacked messages
                assert.strictEqual(received.length, 2);
                // Now ack and continue
                ch.ack(received[0]);
                ch.ack(received[1]);
              }, 100);
            }
            if (received.length === 4) {
              ch.ack(received[2]);
              ch.ack(received[3]);
            }
            if (received.length === 5) {
              ch.ack(received[4]);
              resolve();
            }
          }
        });
      });

      assert.strictEqual(received.length, 5);

      await ch.deleteQueue('prefetch-test');
      await ch.close();
      await conn.close();
    });
  });

  describe('Acknowledgments', () => {
    it('should handle nack with requeue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('nack-test');
      ch.sendToQueue('nack-test', Buffer.from('requeue me'));

      // Wait for message to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      let count = 0;
      await new Promise<void>((resolve) => {
        ch.consume('nack-test', (msg) => {
          if (msg) {
            count++;
            if (count === 1) {
              // First time, nack with requeue
              ch.nack(msg, false, true);
            } else {
              // Second time, ack
              ch.ack(msg);
              resolve();
            }
          }
        });
      });

      assert.strictEqual(count, 2);

      await ch.deleteQueue('nack-test');
      await ch.close();
      await conn.close();
    });

    it('should handle reject without requeue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('reject-test');
      ch.sendToQueue('reject-test', Buffer.from('reject me'));

      // Wait for message to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      await new Promise<void>((resolve) => {
        ch.consume('reject-test', (msg) => {
          if (msg) {
            ch.reject(msg, false); // Don't requeue
            setTimeout(resolve, 100);
          }
        });
      });

      // Queue should be empty
      const remaining = await ch.get('reject-test', { noAck: true });
      assert.strictEqual(remaining, false);

      await ch.deleteQueue('reject-test');
      await ch.close();
      await conn.close();
    });
  });

  describe('Basic.Get', () => {
    it('should get message from queue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('get-test');
      ch.sendToQueue('get-test', Buffer.from('get this'));

      // Wait for message to be queued
      await new Promise(resolve => setTimeout(resolve, 100));

      const msg = await ch.get('get-test', { noAck: true });
      assert.ok(msg, 'Should get message');
      assert.strictEqual(msg.content.toString(), 'get this');

      await ch.deleteQueue('get-test');
      await ch.close();
      await conn.close();
    });

    it('should return false for empty queue', async () => {
      const conn = await amqp.connect(`amqp://localhost:${TEST_PORT}`);
      const ch = await conn.createChannel();

      await ch.assertQueue('empty-get-test');

      const msg = await ch.get('empty-get-test', { noAck: true });
      assert.strictEqual(msg, false);

      await ch.deleteQueue('empty-get-test');
      await ch.close();
      await conn.close();
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running DeepMQ integration tests...\n');
}

// Force exit after tests complete (workaround for lingering handles)
process.on('beforeExit', () => {
  setTimeout(() => process.exit(0), 1000);
});
