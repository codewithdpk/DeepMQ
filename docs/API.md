# DeepMQ API Reference

## DeepMQBroker

The main broker class that manages the AMQP server.

### Constructor

```typescript
new DeepMQBroker(options?: BrokerOptions)
```

#### BrokerOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `port` | `number` | `5672` | Port to listen on |
| `host` | `string` | `'0.0.0.0'` | Host to bind to |
| `dataDir` | `string` | `'./data'` | Directory for persistent data |
| `channelMax` | `number` | `2047` | Maximum channels per connection |
| `frameMax` | `number` | `131072` | Maximum frame size in bytes |
| `heartbeat` | `number` | `60` | Heartbeat interval in seconds |

### Methods

#### start()

Start the broker and listen for connections.

```typescript
async start(): Promise<void>
```

**Example:**
```typescript
const broker = new DeepMQBroker({ port: 5672 });
await broker.start();
console.log('Broker started');
```

#### stop()

Stop the broker and close all connections.

```typescript
async stop(): Promise<void>
```

**Example:**
```typescript
await broker.stop();
console.log('Broker stopped');
```

#### getConnections()

Get all active connections.

```typescript
getConnections(): Connection[]
```

#### getExchanges()

Get all declared exchanges.

```typescript
getExchanges(): Exchange[]
```

#### getQueues()

Get all declared queues.

```typescript
getQueues(): Queue[]
```

#### getBindings()

Get all bindings.

```typescript
getBindings(): Binding[]
```

#### getConsumers()

Get all active consumers.

```typescript
getConsumers(): Consumer[]
```

#### getStatus()

Get broker status summary.

```typescript
getStatus(): {
  connections: number;
  channels: number;
  exchanges: number;
  queues: number;
  consumers: number;
  messages: number;
}
```

### Properties

#### events

The event emitter for broker events.

```typescript
readonly events: BrokerEventEmitter
```

---

## BrokerEventEmitter

Typed event emitter for broker events.

### Methods

#### onTyped()

Subscribe to a typed event.

```typescript
onTyped<K extends keyof BrokerEvents>(
  event: K,
  listener: BrokerEvents[K]
): this
```

#### onceTyped()

Subscribe to a typed event once.

```typescript
onceTyped<K extends keyof BrokerEvents>(
  event: K,
  listener: BrokerEvents[K]
): this
```

#### offTyped()

Unsubscribe from a typed event.

```typescript
offTyped<K extends keyof BrokerEvents>(
  event: K,
  listener: BrokerEvents[K]
): this
```

### Events

#### Connection Events

```typescript
'connection:open': (connection: Connection) => void
'connection:close': (connection: Connection, reason?: string) => void
'connection:error': (connection: Connection, error: Error) => void
```

#### Channel Events

```typescript
'channel:open': (channel: Channel, connection: Connection) => void
'channel:close': (channel: Channel, connection: Connection) => void
'channel:flow': (channel: Channel, active: boolean) => void
```

#### Exchange Events

```typescript
'exchange:created': (exchange: Exchange) => void
'exchange:deleted': (exchange: Exchange) => void
```

#### Queue Events

```typescript
'queue:created': (queue: Queue) => void
'queue:deleted': (queue: Queue) => void
'queue:purged': (queue: Queue, messageCount: number) => void
```

#### Binding Events

```typescript
'binding:created': (binding: Binding) => void
'binding:deleted': (binding: Binding) => void
```

#### Consumer Events

```typescript
'consumer:created': (consumer: Consumer) => void
'consumer:cancelled': (consumer: Consumer) => void
```

#### Message Events

```typescript
'message:published': (message: Message, exchange: string, routingKey: string) => void
'message:routed': (message: Message, queues: string[]) => void
'message:delivered': (message: Message, consumer: Consumer, deliveryTag: bigint) => void
'message:acked': (deliveryTag: bigint, channel: Channel, multiple: boolean) => void
'message:nacked': (deliveryTag: bigint, channel: Channel, multiple: boolean, requeue: boolean) => void
'message:rejected': (deliveryTag: bigint, channel: Channel, requeue: boolean) => void
'message:returned': (message: Message, replyCode: number, replyText: string) => void
```

#### Broker Lifecycle Events

```typescript
'broker:started': (port: number) => void
'broker:stopped': () => void
'broker:error': (error: Error) => void
```

---

## Connection

Represents an AMQP client connection.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique connection identifier |
| `socket` | `Socket` | TCP socket |
| `state` | `ConnectionState` | Current state |
| `channelMax` | `number` | Maximum channels |
| `frameMax` | `number` | Maximum frame size |
| `heartbeat` | `number` | Heartbeat interval |
| `virtualHost` | `string` | Virtual host |
| `clientProperties` | `FieldTable` | Client metadata |

### Methods

#### getInfo()

Get connection info for status reporting.

```typescript
getInfo(): object
```

#### getChannels()

Get all channels on this connection.

```typescript
getChannels(): Channel[]
```

#### getChannelCount()

Get number of open channels.

```typescript
getChannelCount(): number
```

---

## Channel

Represents an AMQP channel.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `channelNumber` | `number` | Channel number |
| `connection` | `Connection` | Parent connection |
| `state` | `ChannelState` | Current state |
| `flowActive` | `boolean` | Flow control state |

### Methods

#### getInfo()

Get channel info for status reporting.

```typescript
getInfo(): object
```

#### getConsumers()

Get all consumers on this channel.

```typescript
getConsumers(): ConsumerDefinition[]
```

#### getUnackedCount()

Get number of unacknowledged messages.

```typescript
getUnackedCount(): number
```

---

## Exchange

Represents an AMQP exchange.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Exchange name |
| `type` | `ExchangeType` | Exchange type |
| `durable` | `boolean` | Survives restart |
| `autoDelete` | `boolean` | Auto-delete when unused |
| `internal` | `boolean` | Internal exchange |
| `isDefault` | `boolean` | Is a default exchange |

### Methods

#### getInfo()

Get exchange info for status reporting.

```typescript
getInfo(): object
```

---

## Queue

Represents an AMQP queue.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Queue name |
| `durable` | `boolean` | Survives restart |
| `exclusive` | `boolean` | Exclusive to connection |
| `autoDelete` | `boolean` | Auto-delete when unused |

### Methods

#### getMessageCount()

Get number of messages in queue.

```typescript
getMessageCount(): number
```

#### getConsumerCount()

Get number of consumers.

```typescript
getConsumerCount(): number
```

#### getInfo()

Get queue info for status reporting.

```typescript
getInfo(): object
```

---

## Binding

Represents a binding between an exchange and a queue.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `source` | `string` | Exchange name |
| `destination` | `string` | Queue name |
| `routingKey` | `string` | Routing key/pattern |
| `arguments` | `FieldTable` | Binding arguments |

### Methods

#### getInfo()

Get binding info for status reporting.

```typescript
getInfo(): object
```

---

## Consumer

Represents a queue consumer.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `consumerTag` | `string` | Consumer identifier |
| `queueName` | `string` | Queue being consumed |
| `noLocal` | `boolean` | Don't receive own messages |
| `noAck` | `boolean` | Auto-acknowledge |
| `exclusive` | `boolean` | Exclusive consumer |
| `channel` | `Channel` | Parent channel |

### Methods

#### canReceive()

Check if consumer can receive more messages.

```typescript
canReceive(): boolean
```

#### getInfo()

Get consumer info for status reporting.

```typescript
getInfo(): object
```

---

## Message

Represents an AMQP message.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Message identifier |
| `exchange` | `string` | Source exchange |
| `routingKey` | `string` | Routing key |
| `mandatory` | `boolean` | Mandatory flag |
| `immediate` | `boolean` | Immediate flag |
| `properties` | `MessageProperties` | Message properties |
| `content` | `Buffer` | Message body |
| `timestamp` | `number` | Timestamp (ms) |

---

## MessageProperties

Message properties/headers.

| Property | Type | Description |
|----------|------|-------------|
| `contentType` | `string?` | MIME type |
| `contentEncoding` | `string?` | Encoding |
| `headers` | `FieldTable?` | Custom headers |
| `deliveryMode` | `number?` | 1=transient, 2=persistent |
| `priority` | `number?` | Priority (0-9) |
| `correlationId` | `string?` | Correlation ID |
| `replyTo` | `string?` | Reply queue |
| `expiration` | `string?` | TTL in ms |
| `messageId` | `string?` | Message ID |
| `timestamp` | `number?` | Unix timestamp |
| `type` | `string?` | Message type |
| `userId` | `string?` | User ID |
| `appId` | `string?` | Application ID |

---

## Type Definitions

### ConnectionState

```typescript
type ConnectionState =
  | 'awaiting_header'
  | 'awaiting_start_ok'
  | 'awaiting_tune_ok'
  | 'awaiting_open'
  | 'open'
  | 'closing'
  | 'closed';
```

### ChannelState

```typescript
type ChannelState = 'opening' | 'open' | 'closing' | 'closed';
```

### ExchangeType

```typescript
type ExchangeType = 'direct' | 'fanout' | 'topic' | 'headers';
```

### FieldTable

```typescript
interface FieldTable {
  [key: string]: FieldValue;
}

type FieldValue =
  | boolean
  | number
  | bigint
  | string
  | Date
  | Buffer
  | FieldTable
  | FieldValue[]
  | null
  | undefined;
```
