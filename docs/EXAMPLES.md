# DeepMQ Examples

This document provides practical examples for using DeepMQ with various patterns and use cases.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Work Queues](#work-queues)
3. [Publish/Subscribe](#publishsubscribe)
4. [Routing](#routing)
5. [Topics](#topics)
6. [RPC Pattern](#rpc-pattern)
7. [Message Persistence](#message-persistence)
8. [Error Handling](#error-handling)
9. [Monitoring](#monitoring)

## Basic Usage

### Starting the Broker

```typescript
import { DeepMQBroker } from 'deepmq';

const broker = new DeepMQBroker({
  port: 5672,
  dataDir: './data',
});

await broker.start();
console.log('DeepMQ is running');

// Graceful shutdown
process.on('SIGINT', async () => {
  await broker.stop();
  process.exit(0);
});
```

### Simple Producer/Consumer

**Producer:**
```typescript
import amqp from 'amqplib';

async function produce() {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const queue = 'hello';
  const message = 'Hello World!';

  await channel.assertQueue(queue, { durable: false });
  channel.sendToQueue(queue, Buffer.from(message));

  console.log(`Sent: ${message}`);

  await channel.close();
  await connection.close();
}

produce();
```

**Consumer:**
```typescript
import amqp from 'amqplib';

async function consume() {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const queue = 'hello';

  await channel.assertQueue(queue, { durable: false });

  console.log('Waiting for messages...');

  channel.consume(queue, (msg) => {
    if (msg) {
      console.log(`Received: ${msg.content.toString()}`);
      channel.ack(msg);
    }
  });
}

consume();
```

## Work Queues

Distribute tasks among multiple workers with acknowledgments.

**Task Producer:**
```typescript
import amqp from 'amqplib';

async function sendTask(task: string) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const queue = 'task_queue';

  await channel.assertQueue(queue, { durable: true });

  channel.sendToQueue(queue, Buffer.from(task), {
    persistent: true,  // Message survives broker restart
  });

  console.log(`Sent task: ${task}`);

  await channel.close();
  await connection.close();
}

// Send multiple tasks
for (let i = 1; i <= 10; i++) {
  sendTask(`Task ${i}`);
}
```

**Worker:**
```typescript
import amqp from 'amqplib';

async function worker(workerId: number) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const queue = 'task_queue';

  await channel.assertQueue(queue, { durable: true });

  // Only receive one message at a time
  channel.prefetch(1);

  console.log(`Worker ${workerId} waiting for tasks...`);

  channel.consume(queue, async (msg) => {
    if (msg) {
      const task = msg.content.toString();
      console.log(`Worker ${workerId} processing: ${task}`);

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`Worker ${workerId} completed: ${task}`);
      channel.ack(msg);
    }
  });
}

// Start multiple workers
worker(1);
worker(2);
```

## Publish/Subscribe

Broadcast messages to multiple consumers using fanout exchange.

**Publisher:**
```typescript
import amqp from 'amqplib';

async function publish(message: string) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'logs';

  await channel.assertExchange(exchange, 'fanout', { durable: false });

  channel.publish(exchange, '', Buffer.from(message));
  console.log(`Published: ${message}`);

  await channel.close();
  await connection.close();
}

publish('Broadcast message to all subscribers');
```

**Subscriber:**
```typescript
import amqp from 'amqplib';

async function subscribe(subscriberId: number) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'logs';

  await channel.assertExchange(exchange, 'fanout', { durable: false });

  // Create exclusive queue for this subscriber
  const { queue } = await channel.assertQueue('', { exclusive: true });

  await channel.bindQueue(queue, exchange, '');

  console.log(`Subscriber ${subscriberId} waiting for messages...`);

  channel.consume(queue, (msg) => {
    if (msg) {
      console.log(`Subscriber ${subscriberId} received: ${msg.content.toString()}`);
      channel.ack(msg);
    }
  });
}

// Start multiple subscribers
subscribe(1);
subscribe(2);
subscribe(3);
```

## Routing

Route messages to specific queues using direct exchange.

**Emitter:**
```typescript
import amqp from 'amqplib';

async function emit(severity: string, message: string) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'direct_logs';

  await channel.assertExchange(exchange, 'direct', { durable: false });

  channel.publish(exchange, severity, Buffer.from(message));
  console.log(`[${severity}] ${message}`);

  await channel.close();
  await connection.close();
}

// Emit logs with different severities
emit('info', 'Application started');
emit('warning', 'Memory usage high');
emit('error', 'Database connection failed');
```

**Receiver:**
```typescript
import amqp from 'amqplib';

async function receive(severities: string[]) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'direct_logs';

  await channel.assertExchange(exchange, 'direct', { durable: false });

  const { queue } = await channel.assertQueue('', { exclusive: true });

  // Bind to specified severities
  for (const severity of severities) {
    await channel.bindQueue(queue, exchange, severity);
  }

  console.log(`Listening for: ${severities.join(', ')}`);

  channel.consume(queue, (msg) => {
    if (msg) {
      console.log(`[${msg.fields.routingKey}] ${msg.content.toString()}`);
      channel.ack(msg);
    }
  });
}

// One receiver for errors only
receive(['error']);

// Another receiver for all levels
receive(['info', 'warning', 'error']);
```

## Topics

Use pattern matching for flexible routing.

**Publisher:**
```typescript
import amqp from 'amqplib';

async function publishEvent(routingKey: string, data: object) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'topic_events';

  await channel.assertExchange(exchange, 'topic', { durable: false });

  channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(data)));
  console.log(`Published to ${routingKey}`);

  await channel.close();
  await connection.close();
}

// Publish various events
publishEvent('user.created', { userId: 1, name: 'Alice' });
publishEvent('user.updated', { userId: 1, name: 'Alice Smith' });
publishEvent('order.created', { orderId: 100, userId: 1 });
publishEvent('order.shipped', { orderId: 100 });
publishEvent('payment.received', { orderId: 100, amount: 99.99 });
```

**Subscriber:**
```typescript
import amqp from 'amqplib';

async function subscribeToPattern(pattern: string, name: string) {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const exchange = 'topic_events';

  await channel.assertExchange(exchange, 'topic', { durable: false });

  const { queue } = await channel.assertQueue('', { exclusive: true });

  await channel.bindQueue(queue, exchange, pattern);

  console.log(`${name} listening for: ${pattern}`);

  channel.consume(queue, (msg) => {
    if (msg) {
      const data = JSON.parse(msg.content.toString());
      console.log(`${name} [${msg.fields.routingKey}]:`, data);
      channel.ack(msg);
    }
  });
}

// All user events
subscribeToPattern('user.*', 'UserService');

// All order events
subscribeToPattern('order.#', 'OrderService');

// All events
subscribeToPattern('#', 'AuditLog');
```

## RPC Pattern

Implement request-response over message queues.

**RPC Server:**
```typescript
import amqp from 'amqplib';

async function startRpcServer() {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  const queue = 'rpc_queue';

  await channel.assertQueue(queue, { durable: false });
  channel.prefetch(1);

  console.log('RPC Server waiting for requests...');

  channel.consume(queue, async (msg) => {
    if (msg) {
      const n = parseInt(msg.content.toString());
      console.log(`Received request: fib(${n})`);

      // Calculate fibonacci
      const result = fibonacci(n);

      // Send response
      channel.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(result.toString()),
        { correlationId: msg.properties.correlationId }
      );

      channel.ack(msg);
    }
  });
}

function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

startRpcServer();
```

**RPC Client:**
```typescript
import amqp from 'amqplib';
import { randomUUID } from 'crypto';

async function callRpc(n: number): Promise<number> {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  // Create reply queue
  const { queue: replyQueue } = await channel.assertQueue('', { exclusive: true });

  const correlationId = randomUUID();

  return new Promise((resolve) => {
    channel.consume(replyQueue, (msg) => {
      if (msg && msg.properties.correlationId === correlationId) {
        const result = parseInt(msg.content.toString());
        resolve(result);
        channel.close();
        connection.close();
      }
    }, { noAck: true });

    channel.sendToQueue('rpc_queue', Buffer.from(n.toString()), {
      correlationId,
      replyTo: replyQueue,
    });

    console.log(`Sent request: fib(${n})`);
  });
}

// Make RPC calls
async function main() {
  const result = await callRpc(30);
  console.log(`Result: ${result}`);
}

main();
```

## Message Persistence

Ensure messages survive broker restarts.

```typescript
import amqp from 'amqplib';

async function persistentMessaging() {
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  // Durable queue survives restart
  await channel.assertQueue('persistent_queue', { durable: true });

  // Persistent message survives restart
  channel.sendToQueue('persistent_queue', Buffer.from('Important data'), {
    persistent: true,  // Same as deliveryMode: 2
  });

  console.log('Sent persistent message');

  await channel.close();
  await connection.close();
}

persistentMessaging();
```

## Error Handling

Handle errors gracefully.

```typescript
import amqp from 'amqplib';

async function robustConsumer() {
  let connection: amqp.Connection;
  let channel: amqp.Channel;

  async function connect() {
    try {
      connection = await amqp.connect('amqp://localhost:5672');
      channel = await connection.createChannel();

      connection.on('error', (err) => {
        console.error('Connection error:', err);
      });

      connection.on('close', () => {
        console.log('Connection closed, reconnecting...');
        setTimeout(connect, 5000);
      });

      await channel.assertQueue('work', { durable: true });
      channel.prefetch(1);

      channel.consume('work', async (msg) => {
        if (msg) {
          try {
            await processMessage(msg.content.toString());
            channel.ack(msg);
          } catch (err) {
            console.error('Processing error:', err);
            // Requeue on failure
            channel.nack(msg, false, true);
          }
        }
      });

      console.log('Connected and consuming');
    } catch (err) {
      console.error('Failed to connect:', err);
      setTimeout(connect, 5000);
    }
  }

  await connect();
}

async function processMessage(content: string) {
  // Simulate work that might fail
  if (Math.random() < 0.1) {
    throw new Error('Random failure');
  }
  console.log(`Processed: ${content}`);
}

robustConsumer();
```

## Monitoring

Monitor broker activity using events.

```typescript
import { DeepMQBroker } from 'deepmq';

const broker = new DeepMQBroker({ port: 5672 });

// Track statistics
const stats = {
  connections: 0,
  messagesPublished: 0,
  messagesDelivered: 0,
  messagesAcked: 0,
};

// Connection tracking
broker.events.onTyped('connection:open', (conn) => {
  stats.connections++;
  console.log(`Connection opened: ${conn.id} (total: ${stats.connections})`);
});

broker.events.onTyped('connection:close', (conn) => {
  stats.connections--;
  console.log(`Connection closed: ${conn.id} (total: ${stats.connections})`);
});

// Message tracking
broker.events.onTyped('message:published', (msg, exchange, routingKey) => {
  stats.messagesPublished++;
  console.log(`Published to ${exchange || '(default)'}/${routingKey}`);
});

broker.events.onTyped('message:delivered', (msg, consumer) => {
  stats.messagesDelivered++;
  console.log(`Delivered to consumer ${consumer.consumerTag}`);
});

broker.events.onTyped('message:acked', (deliveryTag, channel) => {
  stats.messagesAcked++;
});

// Queue tracking
broker.events.onTyped('queue:created', (queue) => {
  console.log(`Queue created: ${queue.name}`);
});

broker.events.onTyped('queue:deleted', (queue) => {
  console.log(`Queue deleted: ${queue.name}`);
});

// Periodic stats logging
setInterval(() => {
  console.log('Stats:', stats);
  console.log('Broker status:', broker.getStatus());
}, 10000);

await broker.start();
```

## Next Steps

- See [API Reference](API.md) for detailed API documentation
- See [Architecture](ARCHITECTURE.md) for internal design details
- See [Protocol](PROTOCOL.md) for AMQP protocol reference
