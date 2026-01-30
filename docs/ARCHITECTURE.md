# DeepMQ Architecture

This document describes the internal architecture of DeepMQ.

## Overview

DeepMQ is structured as a layered architecture, with each layer responsible for specific functionality:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
│                    (CLI, Programmatic API)                       │
├─────────────────────────────────────────────────────────────────┤
│                         Broker Layer                             │
│              (DeepMQBroker - Orchestration)                      │
├─────────────────────────────────────────────────────────────────┤
│                        Protocol Layer                            │
│        (Frame Parser, Frame Builder, Method Handlers)            │
├─────────────────────────────────────────────────────────────────┤
│                          Core Layer                              │
│    (Connection, Channel, Exchange, Queue, Binding, Consumer)     │
├─────────────────────────────────────────────────────────────────┤
│                        Routing Layer                             │
│           (MessageRouter, Exchange Type Strategies)              │
├─────────────────────────────────────────────────────────────────┤
│                      Persistence Layer                           │
│              (FileStore, Recovery, Message Log)                  │
├─────────────────────────────────────────────────────────────────┤
│                         Event Layer                              │
│                   (BrokerEventEmitter)                           │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Protocol Layer (`src/protocol/`)

The protocol layer handles AMQP 0-9-1 frame encoding and decoding.

#### Frame Structure

AMQP frames have the following structure:

```
+----------+----------+----------+----------------+---------+
| Type (1) | Channel  | Size (4) | Payload (size) | End (1) |
| byte     | (2 bytes)| bytes    | bytes          | 0xCE    |
+----------+----------+----------+----------------+---------+
```

Frame types:
- `1` - Method frame (commands)
- `2` - Content header frame (message properties)
- `3` - Content body frame (message data)
- `8` - Heartbeat frame

#### Key Files

- **`constants.ts`** - Protocol constants, class/method IDs, reply codes
- **`types.ts`** - TypeScript type definitions for all AMQP structures
- **`frame-parser.ts`** - Parses binary AMQP frames into structured objects
- **`frame-builder.ts`** - Builds binary AMQP frames from structured objects
- **`methods/*.ts`** - Handlers for specific AMQP method classes

### 2. Core Layer (`src/core/`)

The core layer contains the fundamental entities of the message broker.

#### Connection (`connection.ts`)

Represents a TCP connection from an AMQP client.

```typescript
class Connection {
  id: string;                    // Unique connection identifier
  socket: Socket;                // TCP socket
  state: ConnectionState;        // awaiting_header, open, closing, closed
  channels: Map<number, Channel>;
  clientProperties: FieldTable;  // Client metadata
  virtualHost: string;           // Virtual host (default: "/")
  frameMax: number;              // Negotiated max frame size
  heartbeat: number;             // Heartbeat interval
}
```

State machine:
```
awaiting_header → awaiting_start_ok → awaiting_tune_ok → awaiting_open → open → closing → closed
```

#### Channel (`channel.ts`)

Represents a virtual connection within a TCP connection.

```typescript
class Channel {
  channelNumber: number;
  connection: Connection;
  state: ChannelState;
  qos: QoSSettings;              // Prefetch settings
  unackedMessages: Map<bigint, UnackedMessage>;
  consumers: Map<string, ConsumerDefinition>;
  pendingMessage: PendingMessage | null;  // For multi-frame messages
}
```

#### Exchange (`exchange.ts`)

Routes messages to queues based on routing rules.

```typescript
class Exchange {
  name: string;
  type: 'direct' | 'fanout' | 'topic' | 'headers';
  durable: boolean;              // Survives broker restart
  autoDelete: boolean;           // Delete when no bindings
  internal: boolean;             // Cannot publish directly
}
```

#### Queue (`queue.ts`)

Stores messages for consumers.

```typescript
class Queue {
  name: string;
  durable: boolean;              // Survives broker restart
  exclusive: boolean;            // Only one connection can use
  autoDelete: boolean;           // Delete when no consumers
  messages: Message[];           // In-memory message storage
  consumerCount: number;
}
```

#### Binding (`binding.ts`)

Links exchanges to queues with routing rules.

```typescript
class Binding {
  source: string;                // Exchange name
  destination: string;           // Queue name
  routingKey: string;            // Routing pattern
  arguments: FieldTable;         // Optional arguments
}
```

### 3. Routing Layer (`src/routing/`)

The routing layer implements message routing strategies for different exchange types.

#### MessageRouter (`router.ts`)

Main router that delegates to exchange-specific routing logic.

```typescript
class MessageRouter {
  route(message: Message): Queue[] {
    // 1. Find exchange
    // 2. Get bindings for exchange
    // 3. Apply exchange-type-specific matching
    // 4. Return matched queues
  }
}
```

#### Exchange Types

**Direct Exchange** (`direct-exchange.ts`)
- Routes to queues where `binding.routingKey === message.routingKey`
- Exact string match

**Fanout Exchange** (`fanout-exchange.ts`)
- Routes to all bound queues
- Ignores routing key

**Topic Exchange** (`topic-exchange.ts`)
- Pattern matching with wildcards:
  - `*` matches exactly one word
  - `#` matches zero or more words
- Words separated by dots (`.`)
- Example: `stock.*.nyse` matches `stock.ibm.nyse`

### 4. Persistence Layer (`src/persistence/`)

The persistence layer provides durable storage for messages and metadata.

#### Storage Format

**Message Log** (`messages.log`)
- Append-only log format
- Each line is a JSON entry:
```json
{"type":"message","queue":"myqueue","messageId":"uuid","data":"base64...","checksum":"md5"}
{"type":"delete","queue":"myqueue","messageId":"uuid"}
```

**Metadata Files**
- `queues.json` - Queue definitions
- `exchanges.json` - Exchange definitions
- `bindings.json` - Binding definitions

#### Recovery Process

On startup:
1. Load exchange definitions (durable only)
2. Load queue definitions (durable, non-exclusive only)
3. Replay message log to restore queue contents
4. Load bindings (only where both exchange and queue exist)

### 5. Event Layer (`src/events/`)

The event layer provides a typed event system for monitoring and extensibility.

```typescript
interface BrokerEvents {
  'connection:open': (connection: Connection) => void;
  'connection:close': (connection: Connection, reason?: string) => void;
  'channel:open': (channel: Channel, connection: Connection) => void;
  'message:published': (message: Message, exchange: string, routingKey: string) => void;
  'message:delivered': (message: Message, consumer: Consumer, deliveryTag: bigint) => void;
  'message:acked': (deliveryTag: bigint, channel: Channel, multiple: boolean) => void;
  'queue:created': (queue: Queue) => void;
  'exchange:created': (exchange: Exchange) => void;
  // ... more events
}
```

## Message Flow

### Publishing

```
1. Client sends Basic.Publish method frame
2. Client sends Content Header frame (properties, body size)
3. Client sends Content Body frame(s) (actual message data)
4. Broker assembles complete message
5. Router finds matching queues based on exchange type
6. Message enqueued to each matched queue
7. If durable queue + persistent message, write to log
8. Trigger delivery to any waiting consumers
```

### Consuming

```
1. Client sends Basic.Consume
2. Broker registers consumer for queue
3. Broker sends Basic.Consume-Ok
4. For each available message:
   a. Check QoS (prefetch) limits
   b. Send Basic.Deliver frame
   c. Send Content Header frame
   d. Send Content Body frame(s)
   e. Track as unacked (unless noAck)
5. Client sends Basic.Ack
6. Broker removes from unacked tracking
7. If durable, delete from persistence
```

### Connection Handshake

```
Client                              Server
  │                                   │
  │──── Protocol Header ─────────────▶│ "AMQP\x00\x00\x09\x01"
  │                                   │
  │◀──── Connection.Start ───────────│ Server capabilities
  │                                   │
  │──── Connection.Start-Ok ─────────▶│ Client auth (PLAIN)
  │                                   │
  │◀──── Connection.Tune ────────────│ Negotiate parameters
  │                                   │
  │──── Connection.Tune-Ok ──────────▶│ Accept parameters
  │                                   │
  │──── Connection.Open ─────────────▶│ Virtual host
  │                                   │
  │◀──── Connection.Open-Ok ─────────│ Ready
  │                                   │
```

## Memory Management

### Message Storage

Messages are stored in-memory in queue objects. For durable queues with persistent messages, a copy is also written to the append-only log.

### Connection Cleanup

When a connection closes:
1. All channels are closed
2. Unacked messages are requeued
3. Consumers are cancelled
4. Exclusive queues are deleted

### Compaction

The message log can grow indefinitely. The `FileStore.compact()` method rewrites the log with only current messages, removing deleted entries.

## Thread Safety

Node.js is single-threaded, so DeepMQ doesn't require locks for data structures. All operations are executed in the event loop, ensuring consistency.

## Extensibility Points

1. **Custom Persistence** - Implement `MessageStore` interface
2. **Event Handlers** - Subscribe to broker events
3. **Exchange Types** - Add new routing strategies
4. **Authentication** - Extend `validatePlainAuth` in connection methods
