# DeepMQ

A minimal, zero-dependency AMQP 0-9-1 message broker written in TypeScript.

DeepMQ implements the AMQP 0-9-1 protocol, allowing you to use standard AMQP client libraries like [amqplib](https://github.com/amqp-node/amqplib) (Node.js), [pika](https://pika.readthedocs.io/) (Python), or any other AMQP 0-9-1 compatible client.

## Features

- **Full AMQP 0-9-1 Protocol Support** - Connect using any standard AMQP client
- **Multiple Exchange Types** - Direct, Fanout, and Topic exchanges with pattern matching
- **Message Persistence** - Durable queues and persistent messages survive broker restarts
- **Consumer Acknowledgments** - Manual ack, nack with requeue, and reject
- **QoS/Prefetch** - Control message flow to consumers
- **Zero Runtime Dependencies** - Pure Node.js implementation using only built-in modules
- **Event-Driven Architecture** - Subscribe to broker events for monitoring and extensibility
- **CLI Interface** - Easy broker management from the command line

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/deepmq.git
cd deepmq

# Install dependencies
npm install

# Build
npm run build
```

## Quick Start

### Starting the Broker

**Using CLI:**

```bash
npm run cli -- start
# or with custom port
npm run cli -- start --port 5673
```

**Programmatically:**

```typescript
import { DeepMQBroker } from 'deepmq';

const broker = new DeepMQBroker({
  port: 5672,
  host: '0.0.0.0',
  dataDir: './data',
});

await broker.start();
console.log('DeepMQ is running on port 5672');

// Listen to broker events
broker.events.onTyped('message:published', (message, exchange, routingKey) => {
  console.log(`Message published to ${exchange} with key ${routingKey}`);
});
```

### Connecting with amqplib

```typescript
import amqp from 'amqplib';

async function main() {
  // Connect to DeepMQ
  const connection = await amqp.connect('amqp://localhost:5672');
  const channel = await connection.createChannel();

  // Declare a queue
  await channel.assertQueue('my-queue');

  // Publish a message
  channel.sendToQueue('my-queue', Buffer.from('Hello DeepMQ!'));

  // Consume messages
  channel.consume('my-queue', (msg) => {
    if (msg) {
      console.log('Received:', msg.content.toString());
      channel.ack(msg);
    }
  });
}

main();
```

### Using Exchanges

```typescript
// Direct Exchange
await channel.assertExchange('logs', 'direct');
await channel.assertQueue('error-logs');
await channel.bindQueue('error-logs', 'logs', 'error');
channel.publish('logs', 'error', Buffer.from('An error occurred'));

// Fanout Exchange (broadcasts to all bound queues)
await channel.assertExchange('notifications', 'fanout');
await channel.assertQueue('email-notifications');
await channel.assertQueue('sms-notifications');
await channel.bindQueue('email-notifications', 'notifications', '');
await channel.bindQueue('sms-notifications', 'notifications', '');
channel.publish('notifications', '', Buffer.from('New notification'));

// Topic Exchange (pattern matching)
await channel.assertExchange('events', 'topic');
await channel.assertQueue('all-stock-events');
await channel.bindQueue('all-stock-events', 'events', 'stock.#');
channel.publish('events', 'stock.nasdaq.tech', Buffer.from('NASDAQ update'));
```

## CLI Commands

```bash
# Start the broker
deepmq start [--port <port>] [--host <host>] [--data-dir <dir>]

# Stop the broker
deepmq stop

# Show broker status
deepmq status

# Interactive commands while broker is running:
#   s - Show broker status
#   q - List queues
#   e - List exchanges
#   b - List bindings
#   c - List connections
#   h - Show help
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | 5672 | Port to listen on |
| `host` | 0.0.0.0 | Host to bind to |
| `dataDir` | ./data | Directory for persistent data |
| `channelMax` | 2047 | Maximum channels per connection |
| `frameMax` | 131072 | Maximum frame size (bytes) |
| `heartbeat` | 60 | Heartbeat interval (seconds) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DeepMQ Broker                           │
├─────────────────────────────────────────────────────────────────┤
│  TCP Server (port 5672)                                         │
│       ↓                                                         │
│  AMQP Frame Parser/Builder                                      │
│       ↓                                                         │
│  Connection Manager → Channels                                  │
│       ↓                                                         │
│  Message Router                                                 │
│       ↓                                                         │
│  Exchanges (Direct, Fanout, Topic) → Bindings → Queues          │
│       ↓                                                         │
│  Persistence Layer (Append-only Log)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Broker Events

Subscribe to broker events for monitoring and custom logic:

```typescript
// Connection events
broker.events.onTyped('connection:open', (connection) => { });
broker.events.onTyped('connection:close', (connection, reason) => { });

// Channel events
broker.events.onTyped('channel:open', (channel, connection) => { });
broker.events.onTyped('channel:close', (channel, connection) => { });

// Message events
broker.events.onTyped('message:published', (message, exchange, routingKey) => { });
broker.events.onTyped('message:delivered', (message, consumer, deliveryTag) => { });
broker.events.onTyped('message:acked', (deliveryTag, channel, multiple) => { });

// Queue/Exchange events
broker.events.onTyped('queue:created', (queue) => { });
broker.events.onTyped('exchange:created', (exchange) => { });
```

## Testing

```bash
# Run all tests
npm test

# Build and test
npm run build && npm test
```

## Project Structure

```
deepMQ/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── server.ts                # TCP server & broker
│   ├── protocol/                # AMQP protocol implementation
│   │   ├── constants.ts         # Protocol constants
│   │   ├── types.ts             # Type definitions
│   │   ├── frame-parser.ts      # Frame parsing
│   │   ├── frame-builder.ts     # Frame building
│   │   └── methods/             # AMQP method handlers
│   ├── core/                    # Core entities
│   │   ├── connection.ts        # Connection management
│   │   ├── channel.ts           # Channel management
│   │   ├── exchange.ts          # Exchange implementation
│   │   ├── queue.ts             # Queue implementation
│   │   ├── binding.ts           # Binding management
│   │   └── consumer.ts          # Consumer management
│   ├── routing/                 # Message routing
│   │   ├── router.ts            # Main router
│   │   ├── direct-exchange.ts   # Direct routing
│   │   ├── fanout-exchange.ts   # Fanout routing
│   │   └── topic-exchange.ts    # Topic routing
│   ├── persistence/             # Message persistence
│   │   ├── file-store.ts        # File-based storage
│   │   └── recovery.ts          # Recovery logic
│   ├── events/                  # Event system
│   │   └── broker-events.ts     # Typed events
│   └── cli/                     # CLI interface
├── tests/                       # Integration tests
├── docs/                        # Documentation
└── data/                        # Persistent data (runtime)
```

## Comparison with RabbitMQ

DeepMQ is designed to be a lightweight alternative for development and small-scale deployments:

| Feature | DeepMQ | RabbitMQ |
|---------|--------|----------|
| Protocol | AMQP 0-9-1 | AMQP 0-9-1, 1.0, MQTT, STOMP |
| Dependencies | Zero | Erlang/OTP |
| Memory Footprint | ~50MB | ~100MB+ |
| Clustering | No | Yes |
| Management UI | No | Yes |
| Plugins | No | Yes |
| Use Case | Development, Small Apps | Production, Enterprise |

## Limitations

- No clustering or high availability
- No management HTTP API (yet)
- No TLS/SSL support (yet)
- Headers exchange not implemented
- No dead letter exchanges (yet)

## Contributing

Contributions are welcome! Please read the [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [AMQP 0-9-1 Specification](https://www.rabbitmq.com/amqp-0-9-1-reference.html)
- [RabbitMQ](https://www.rabbitmq.com/) for protocol documentation
- [amqplib](https://github.com/amqp-node/amqplib) for client testing
