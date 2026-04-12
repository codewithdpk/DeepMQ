# DeepMQ — Low-Level Design Architecture

## Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DeepMQBroker                                       │
│                              (src/server.ts)                                    │
│                                                                                 │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  TCP Server  │   │  Connection  │   │   Channel    │   │  BrokerEvent     │  │
│  │  (net.Server)│──▶│   Manager    │──▶│   Manager    │   │  Emitter         │  │
│  └─────────────┘   └──────────────┘   └──────────────┘   └──────────────────┘  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         Protocol Layer                                      ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────────────┐ ││
│  │  │  FrameParser  │  │ FrameBuilder │  │  Method Handlers                 │ ││
│  │  │  (TCP→Frames) │  │ (Frames→TCP) │  │  connection│channel│exchange│    │ ││
│  │  │              │  │              │  │  queue│basic                    │ ││
│  │  └──────────────┘  └──────────────┘  └───────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                          Core Layer                                         ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ ││
│  │  │ Exchange  │  │  Queue   │  │ Binding  │  │ Consumer │  │  Message     │ ││
│  │  │          │  │          │  │ Registry │  │ Registry │  │             │ ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ┌─────────────────────────────┐  ┌────────────────────────────────────────────┐│
│  │      Routing Layer          │  │         Persistence Layer                  ││
│  │  ┌───────────────────────┐  │  │  ┌────────────────────────────────────┐   ││
│  │  │    MessageRouter      │  │  │  │          FileStore                 │   ││
│  │  │  ┌─────────────────┐  │  │  │  │  messages.log  (append-only)      │   ││
│  │  │  │ DirectExchange  │  │  │  │  │  queues.json   (atomic write)     │   ││
│  │  │  │ FanoutExchange  │  │  │  │  │  exchanges.json (atomic write)    │   ││
│  │  │  │ TopicExchange   │  │  │  │  │  bindings.json  (atomic write)    │   ││
│  │  │  └─────────────────┘  │  │  │  └────────────────────────────────────┘   ││
│  │  └───────────────────────┘  │  │  ┌────────────────────────────────────┐   ││
│  └─────────────────────────────┘  │  │   Recovery Module                  │   ││
│                                    │  │   (load on startup)               │   ││
│                                    │  └────────────────────────────────────┘   ││
│                                    └────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Types

### 1. Network / Transport

| Component | File | Responsibility |
|-----------|------|----------------|
| **TCP Server** | `server.ts` | Accepts TCP connections on port 5672 |
| **Connection** | `core/connection.ts` | Per-client TCP socket state machine, heartbeat management |
| **Channel** | `core/channel.ts` | Multiplexed logical channel within a connection |

### 2. Protocol (AMQP 0-9-1)

| Component | File | Responsibility |
|-----------|------|----------------|
| **FrameParser** | `protocol/frame-parser.ts` | TCP byte stream → typed AMQP frames |
| **FrameBuilder** | `protocol/frame-builder.ts` | Typed data → AMQP wire format frames |
| **Method Handlers** | `protocol/methods/*.ts` | Parse/build class-specific AMQP methods |

### 3. Core Domain

| Component | File | Responsibility |
|-----------|------|----------------|
| **Exchange** | `core/exchange.ts` | Named routing entity (direct, fanout, topic, headers) |
| **Queue** | `core/queue.ts` | In-memory message buffer with consumer tracking |
| **Binding** | `core/binding.ts` | Exchange→Queue routing rule with key and registry |
| **Consumer** | `core/consumer.ts` | Subscription handle with registry & queue index |
| **Message** | `core/message.ts` | Content envelope: body, properties, routing metadata |

### 4. Routing

| Component | File | Responsibility |
|-----------|------|----------------|
| **MessageRouter** | `routing/router.ts` | Dispatches messages through exchange→binding→queue chain |
| **DirectExchange** | `routing/direct-exchange.ts` | Exact routing key match |
| **FanoutExchange** | `routing/fanout-exchange.ts` | Broadcast to all bound queues |
| **TopicExchange** | `routing/topic-exchange.ts` | Wildcard pattern matching (`*`, `#`) |

### 5. Persistence

| Component | File | Responsibility |
|-----------|------|----------------|
| **FileStore** | `persistence/file-store.ts` | Append-only log + atomic JSON files for durability |
| **Recovery** | `persistence/recovery.ts` | Rebuild broker state from disk on startup |

### 6. Observability

| Component | File | Responsibility |
|-----------|------|----------------|
| **BrokerEventEmitter** | `events/broker-events.ts` | Typed event bus for all broker lifecycle events |

---

## Connection State Machine

```
  TCP connect
      │
      ▼
 ┌──────────────────┐   AMQP\x00\x00\x09\x01
 │ awaiting_header   │ ────────────────────────┐
 └──────────────────┘                          │
                                                ▼
                                   ┌──────────────────────┐
                          ┌────────│  awaiting_start_ok    │
                          │        └──────────────────────┘
                          │ Connection.Start-Ok (credentials)
                          ▼
                ┌──────────────────────┐
                │  awaiting_tune_ok    │
                └──────────────────────┘
                          │ Connection.Tune-Ok
                          ▼
                ┌──────────────────────┐
                │  awaiting_open       │
                └──────────────────────┘
                          │ Connection.Open (vhost)
                          ▼
                ┌──────────────────────┐
                │        open          │◄─── heartbeat loop
                └──────────────────────┘
                          │ Connection.Close
                          ▼
                ┌──────────────────────┐
                │      closing         │
                └──────────────────────┘
                          │ Connection.Close-Ok
                          ▼
                ┌──────────────────────┐
                │       closed         │ ──▶ socket.destroy()
                └──────────────────────┘
```

---

## Message Publishing Flow

```
 Producer (AMQP Client)                    DeepMQ Broker
 ═══════════════════════                   ══════════════

 ┌─────────────────┐
 │ Basic.Publish    │──── Method Frame ────▶ handleMethodFrame()
 │ (exchange, key)  │                        store in channel.pendingMessage
 └─────────────────┘

 ┌─────────────────┐
 │ Content Header   │──── Header Frame ────▶ handleHeaderFrame()
 │ (size, props)    │                        set expectedBodySize, properties
 └─────────────────┘

 ┌─────────────────┐
 │ Content Body     │──── Body Frame(s) ───▶ handleBodyFrame()
 │ (payload chunks) │                        accumulate until bodySize reached
 └─────────────────┘
                                             │
                                             ▼
                                      completeMessage()
                                             │
                            ┌────────────────┼────────────────┐
                            ▼                ▼                ▼
                     emit event       MessageRouter       Persist if
                  'message:published'   .route()          durable + mode=2
                                             │
                              ┌──────────────┼──────────────┐
                              ▼              ▼              ▼
                          Exchange       Binding         Queue(s)
                          lookup         match           .enqueue()
                              │              │              │
                              │              │              ▼
                              │              │     deliverToConsumer()
                              │              │     (setImmediate loop)
                              │              │
                              ▼              │
                    No routes + mandatory?   │
                         │                   │
                     ┌───┴────┐              │
                     │  Yes   │              │
                     ▼        │              │
               Basic.Return   │              │
               to publisher   │              │
                              │              │
                              ▼              ▼
                         emit 'message:routed'
```

---

## Message Consumption Flow

```
Consumer (AMQP Client)                    DeepMQ Broker
═══════════════════════                   ══════════════

 ┌──────────────────┐
 │ Basic.Consume     │────────────────────▶ Register Consumer
 │ (queue, tag, ack) │                      ConsumerRegistry.add()
 └──────────────────┘                       Channel.addConsumer()
                                                    │
                                                    ▼
                                           deliverToConsumer()
                                                    │
                                         ┌──────────┴──────────┐
                                         │ QoS check:          │
                                         │ unacked < prefetch?  │
                                         └──────────┬──────────┘
                                              yes   │   no
                                              ┌─────┘   └─── wait for ack
                                              ▼
                                        queue.dequeue()
                                              │
                                              ▼
                                     channel.nextDeliveryTag()
                                     channel.trackUnacked()
                                              │
 ┌──────────────────┐                         │
 │ Basic.Deliver     │◀── Method Frame ───────┘
 │ Content Header    │◀── Header Frame
 │ Content Body      │◀── Body Frame(s)
 └──────────────────┘
         │
         │  (client processes message)
         ▼
 ┌──────────────────┐
 │ Basic.Ack         │────────────────────▶ channel.ack(deliveryTag)
 │ (deliveryTag)     │                            │
 └──────────────────┘                    ┌────────┼────────┐
                                         ▼        ▼        ▼
                                     remove    persist   deliver
                                     unacked   .delete() next msg
                                                         to consumer

 ─── OR ───

 ┌──────────────────┐
 │ Basic.Nack/Reject │────────────────────▶ channel.nack(tag, requeue)
 └──────────────────┘                            │
                                        ┌────────┴────────┐
                                        ▼                 ▼
                                   requeue=true      requeue=false
                                   queue.requeue()   delete message
                                   redeliver
```

---

## Exchange Routing Strategies

```
                    ┌──────────────┐
                    │   Exchange   │
                    │   (source)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  direct   │ │  fanout  │ │  topic   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             ▼             ▼             ▼
       routingKey     ignore key    pattern match
       == binding     return ALL    * = one word
       key (exact)    bound queues  # = zero+ words
             │             │             │
             ▼             ▼             ▼
     ┌───────────┐  ┌────────────┐ ┌─────────────────────────┐
     │  Queue A   │  │  Queue A   │ │ "stock.#"   → Queue A  │
     │  (key=rk1) │  │  Queue B   │ │ "*.error"   → Queue B  │
     └───────────┘  │  Queue C   │ │ "log.#.warn" → Queue C │
                    └────────────┘ └─────────────────────────┘


Default Exchange (name=""):
  Implicit direct routing: routingKey == queueName
  Every queue auto-bound on creation
```

---

## Persistence Architecture

```
                 ┌──────────────────┐
                 │   FileStore      │
                 │  (data/ dir)     │
                 └────────┬─────────┘
                          │
         ┌────────────────┼──────────────────┐
         ▼                ▼                  ▼
  ┌─────────────┐  ┌────────────┐   ┌──────────────┐
  │ messages.log │  │ Metadata   │   │  Recovery     │
  │ (append-only)│  │ JSON files │   │  Module       │
  └──────┬──────┘  └─────┬──────┘   └──────┬───────┘
         │               │                  │
         ▼               ▼                  ▼
  ┌─────────────┐  ┌────────────┐   On startup:
  │ JSON Lines: │  │queues.json │   1. Load exchanges
  │ {type:msg,  │  │exchanges.  │   2. Load queues
  │  queue,     │  │  json      │   3. Replay messages.log
  │  data:b64,  │  │bindings.   │   4. Load bindings
  │  checksum}  │  │  json      │   5. Create defaults
  │             │  └────────────┘
  │ {type:del,  │        │
  │  queue,     │        ▼
  │  messageId} │  Atomic write:
  └──────┬──────┘  .tmp → rename
         │
         ▼
  Compaction:
  Rewrites log with
  only live messages
  (removes deletes)
```

---

## Frame Processing Pipeline

```
TCP Socket                FrameParser              Broker Handler
══════════                ═══════════              ══════════════

 raw bytes ──▶ append(data)
                    │
                    ▼
              ┌───────────┐
              │  Buffer    │◀── accumulates until
              │  (partial) │    complete frame
              └─────┬─────┘
                    │ hasCompleteFrame()
                    ▼
              parseFrame()
              ┌─────────────────────────────────┐
              │ [type:1B][channel:2B][size:4B]   │
              │ [payload: size bytes]             │
              │ [frame_end: 0xCE]                │
              └─────────────────────────────────┘
                    │
         ┌─────────┼──────────┬─────────────┐
         ▼         ▼          ▼             ▼
      type=1    type=2     type=3        type=8
      METHOD    HEADER     BODY          HEARTBEAT
         │         │          │             │
         ▼         ▼          ▼             ▼
   parseMethod  parseCH   raw Buffer   resetHeartbeat
   (classId,   (bodySize,              send heartbeat
    methodId,   props)                 back
    args)          │          │
         │         └────┬─────┘
         │              ▼
         │     channel.pendingMessage
         │     (accumulate multi-frame)
         │              │
         ▼              ▼
  Route by classId:   When bodySize reached:
  10=connection       completeMessage()
  20=channel              │
  40=exchange             ▼
  50=queue           route + deliver
  60=basic
```

---

## QoS / Flow Control

```
                          Channel
                    ┌──────────────────┐
                    │ prefetchCount: 5  │
                    │ unacked: [■■■□□]  │  (3 of 5 used)
                    └────────┬─────────┘
                             │
               canDeliver()? │
              ┌──────────────┤
              ▼              ▼
         unacked.size    prefetchCount
            (3)       <      (5)
              │
              ▼
          true → deliver next message
                 trackUnacked(msg)
                 unacked: [■■■■□]  (4 of 5)

         ...after Basic.Ack...
                 unacked: [■■■□□]  (3 of 5)
                 → deliver another message
```

---

## Event Flow

```
Broker Action                       Event Emitted
═════════════                       ═════════════
TCP accept                    ──▶   connection:open
Auth failure / close          ──▶   connection:close
Channel.Open-Ok               ──▶   channel:open
Exchange.Declare (new)         ──▶   exchange:created
Queue.Declare (new)            ──▶   queue:created
Queue.Bind                     ──▶   binding:created
Basic.Consume                  ──▶   consumer:created
Basic.Publish (assembled)      ──▶   message:published
Router matched queues          ──▶   message:routed
Basic.Deliver sent             ──▶   message:delivered
Basic.Ack received             ──▶   message:acked
Basic.Nack received            ──▶   message:nacked
Basic.Reject received          ──▶   message:rejected
No route + mandatory           ──▶   message:returned
Queue.Delete                   ──▶   queue:deleted
broker.start()                 ──▶   broker:started
broker.stop()                  ──▶   broker:stopped
```

---

## Startup / Shutdown Sequence

```
START                                    STOP
═════                                    ════

FileStore.initialize()                   Close all connections
       │                                 (requeue unacked msgs)
       ▼                                        │
Recovery.recoverFromStore()                     ▼
  ├─ load durable exchanges              Close TCP server
  ├─ load durable queues                        │
  ├─ replay messages.log                        ▼
  └─ load bindings                        FileStore.close()
       │                                        │
       ▼                                        ▼
createDefaultExchanges()                  emit 'broker:stopped'
  ├─ "" (default direct)
  ├─ amq.direct
  ├─ amq.fanout
  └─ amq.topic
       │
       ▼
Update router context
       │
       ▼
TCP server.listen(5672)
       │
       ▼
emit 'broker:started'
```

---

## Data Structures & Indexes

```
Broker State (in-memory)
════════════════════════

connections: Map<connId, Connection>
     │
     └──▶ Connection.channels: Map<channelNum, Channel>
               │
               └──▶ Channel.consumers: Map<tag, ConsumerDef>
               └──▶ Channel.unackedMessages: Map<deliveryTag, UnackedMessage>

exchanges: Map<name, Exchange>

queues: Map<name, Queue>
     │
     └──▶ Queue.messages: Message[]   (in-memory FIFO)

bindings: BindingRegistry
     ├── bindings: Map<key, Binding>            key = "src:dst:routingKey"
     ├── bySource: Map<exchange, Set<key>>      fast "all from exchange"
     └── byDestination: Map<queue, Set<key>>    fast "all to queue"

consumers: ConsumerRegistry
     ├── consumers: Map<tag, Consumer>
     └── queueConsumers: Map<queue, Set<tag>>   fast "all on queue"

router: MessageRouter
     └── context: { exchanges, queues, bindings }

store: FileStore
     └── messagesByQueue: Map<queue, Map<msgId, Message>>
```
