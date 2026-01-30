# AMQP 0-9-1 Protocol Reference

This document provides a reference for the AMQP 0-9-1 protocol as implemented in DeepMQ.

## Frame Format

All AMQP communication is done through frames. Each frame has the following structure:

```
+----------+----------+----------+----------------+---------+
| Type     | Channel  | Size     | Payload        | End     |
| (1 byte) | (2 bytes)| (4 bytes)| (size bytes)   | (1 byte)|
+----------+----------+----------+----------------+---------+
```

| Field | Size | Description |
|-------|------|-------------|
| Type | 1 byte | Frame type (1=method, 2=header, 3=body, 8=heartbeat) |
| Channel | 2 bytes | Channel number (0 for connection-level) |
| Size | 4 bytes | Payload size in bytes |
| Payload | variable | Frame-specific data |
| End | 1 byte | Frame end marker (always 0xCE) |

## Frame Types

### Method Frame (Type 1)

Method frames carry AMQP commands.

```
+----------+----------+----------------+
| Class ID | Method ID| Arguments      |
| (2 bytes)| (2 bytes)| (variable)     |
+----------+----------+----------------+
```

### Content Header Frame (Type 2)

Content headers carry message properties.

```
+----------+--------+----------+-------+------------+
| Class ID | Weight | Body Size| Flags | Properties |
| (2 bytes)| (2)    | (8 bytes)| (2)   | (variable) |
+----------+--------+----------+-------+------------+
```

### Content Body Frame (Type 3)

Body frames carry message content. Large messages may span multiple body frames.

```
+------------------+
| Body Data        |
| (up to frameMax) |
+------------------+
```

### Heartbeat Frame (Type 8)

Heartbeat frames have no payload and are used to detect dead connections.

## Class and Method IDs

### Connection Class (10)

| Method | ID | Direction | Description |
|--------|----|-----------| ------------|
| Start | 10 | S→C | Initiate connection |
| Start-Ok | 11 | C→S | Respond to Start |
| Tune | 30 | S→C | Propose connection parameters |
| Tune-Ok | 31 | C→S | Accept connection parameters |
| Open | 40 | C→S | Open virtual host |
| Open-Ok | 41 | S→C | Confirm virtual host |
| Close | 50 | Both | Request close |
| Close-Ok | 51 | Both | Confirm close |

### Channel Class (20)

| Method | ID | Direction | Description |
|--------|----|-----------| ------------|
| Open | 10 | C→S | Open channel |
| Open-Ok | 11 | S→C | Confirm channel |
| Flow | 20 | Both | Enable/disable flow |
| Flow-Ok | 21 | Both | Confirm flow |
| Close | 40 | Both | Request close |
| Close-Ok | 41 | Both | Confirm close |

### Exchange Class (40)

| Method | ID | Direction | Description |
|--------|----|-----------| ------------|
| Declare | 10 | C→S | Declare exchange |
| Declare-Ok | 11 | S→C | Confirm declaration |
| Delete | 20 | C→S | Delete exchange |
| Delete-Ok | 21 | S→C | Confirm deletion |

### Queue Class (50)

| Method | ID | Direction | Description |
|--------|----|-----------| ------------|
| Declare | 10 | C→S | Declare queue |
| Declare-Ok | 11 | S→C | Confirm declaration |
| Bind | 20 | C→S | Bind queue to exchange |
| Bind-Ok | 21 | S→C | Confirm binding |
| Unbind | 50 | C→S | Remove binding |
| Unbind-Ok | 51 | S→C | Confirm unbind |
| Purge | 30 | C→S | Delete all messages |
| Purge-Ok | 31 | S→C | Confirm purge |
| Delete | 40 | C→S | Delete queue |
| Delete-Ok | 41 | S→C | Confirm deletion |

### Basic Class (60)

| Method | ID | Direction | Description |
|--------|----|-----------| ------------|
| Qos | 10 | C→S | Set prefetch |
| Qos-Ok | 11 | S→C | Confirm QoS |
| Consume | 20 | C→S | Start consuming |
| Consume-Ok | 21 | S→C | Confirm consumer |
| Cancel | 30 | C→S | Stop consuming |
| Cancel-Ok | 31 | S→C | Confirm cancel |
| Publish | 40 | C→S | Publish message |
| Return | 50 | S→C | Return unroutable message |
| Deliver | 60 | S→C | Deliver message |
| Get | 70 | C→S | Get single message |
| Get-Ok | 71 | S→C | Message available |
| Get-Empty | 72 | S→C | No message |
| Ack | 80 | C→S | Acknowledge message |
| Reject | 90 | C→S | Reject message |
| Recover | 110 | C→S | Redeliver unacked |
| Recover-Ok | 111 | S→C | Confirm recover |
| Nack | 120 | C→S | Negative ack (RabbitMQ extension) |

## Field Types

AMQP uses typed fields in field tables:

| Type | Code | Description |
|------|------|-------------|
| boolean | 't' | Single byte, 0 or 1 |
| signed byte | 'b' | 8-bit signed |
| unsigned byte | 'B' | 8-bit unsigned |
| signed short | 's' | 16-bit signed |
| unsigned short | 'u' | 16-bit unsigned |
| signed int | 'I' | 32-bit signed |
| unsigned int | 'i' | 32-bit unsigned |
| signed long | 'l' | 64-bit signed |
| float | 'f' | 32-bit float |
| double | 'd' | 64-bit double |
| decimal | 'D' | Scale + 32-bit value |
| long string | 'S' | 4-byte length + string |
| array | 'A' | 4-byte length + values |
| timestamp | 'T' | 64-bit Unix timestamp |
| field table | 'F' | Nested table |
| void/null | 'V' | No value |
| byte array | 'x' | 4-byte length + bytes |

## Connection Handshake

```
Client                              Server
  │                                   │
  │──── "AMQP\x00\x00\x09\x01" ──────▶│ Protocol header
  │                                   │
  │◀──── Connection.Start ───────────│
  │      - version: 0-9              │
  │      - mechanisms: PLAIN         │
  │      - locales: en_US            │
  │                                   │
  │──── Connection.Start-Ok ─────────▶│
  │      - mechanism: PLAIN          │
  │      - response: \0user\0pass    │
  │      - locale: en_US             │
  │                                   │
  │◀──── Connection.Tune ────────────│
  │      - channel-max: 2047         │
  │      - frame-max: 131072         │
  │      - heartbeat: 60             │
  │                                   │
  │──── Connection.Tune-Ok ──────────▶│
  │      (echo agreed values)        │
  │                                   │
  │──── Connection.Open ─────────────▶│
  │      - virtual-host: /           │
  │                                   │
  │◀──── Connection.Open-Ok ─────────│
  │                                   │
  │          [Connected]              │
```

## Message Publishing

```
Client                              Server
  │                                   │
  │──── Basic.Publish ───────────────▶│
  │      - exchange: ""              │
  │      - routing-key: "myqueue"    │
  │                                   │
  │──── Content Header ──────────────▶│
  │      - content-type: text/plain  │
  │      - body-size: 13             │
  │                                   │
  │──── Content Body ────────────────▶│
  │      - "Hello, World!"           │
  │                                   │
```

## Message Consuming

```
Client                              Server
  │                                   │
  │──── Basic.Consume ───────────────▶│
  │      - queue: "myqueue"          │
  │      - consumer-tag: ""          │
  │                                   │
  │◀──── Basic.Consume-Ok ───────────│
  │      - consumer-tag: "amq.ctag-1"│
  │                                   │
  │◀──── Basic.Deliver ──────────────│
  │      - consumer-tag: "amq.ctag-1"│
  │      - delivery-tag: 1           │
  │      - exchange: ""              │
  │      - routing-key: "myqueue"    │
  │                                   │
  │◀──── Content Header ─────────────│
  │                                   │
  │◀──── Content Body ───────────────│
  │                                   │
  │──── Basic.Ack ───────────────────▶│
  │      - delivery-tag: 1           │
  │                                   │
```

## Reply Codes

| Code | Name | Description |
|------|------|-------------|
| 200 | Success | Operation successful |
| 311 | Content Too Large | Message too large |
| 313 | No Consumers | No consumers for queue |
| 320 | Connection Forced | Connection closed by admin |
| 402 | Invalid Path | Invalid virtual host |
| 403 | Access Refused | Access denied |
| 404 | Not Found | Exchange or queue not found |
| 405 | Resource Locked | Exclusive access denied |
| 406 | Precondition Failed | Declaration mismatch |
| 501 | Frame Error | Invalid frame |
| 502 | Syntax Error | Invalid syntax |
| 503 | Command Invalid | Invalid command |
| 504 | Channel Error | Channel error |
| 505 | Unexpected Frame | Unexpected frame type |
| 540 | Not Implemented | Feature not implemented |
| 541 | Internal Error | Internal broker error |

## Basic Property Flags

Property flags indicate which properties are present in a content header:

| Flag | Bit | Property |
|------|-----|----------|
| 0x8000 | 15 | content-type |
| 0x4000 | 14 | content-encoding |
| 0x2000 | 13 | headers |
| 0x1000 | 12 | delivery-mode |
| 0x0800 | 11 | priority |
| 0x0400 | 10 | correlation-id |
| 0x0200 | 9 | reply-to |
| 0x0100 | 8 | expiration |
| 0x0080 | 7 | message-id |
| 0x0040 | 6 | timestamp |
| 0x0020 | 5 | type |
| 0x0010 | 4 | user-id |
| 0x0008 | 3 | app-id |
| 0x0004 | 2 | cluster-id |

## Default Exchanges

DeepMQ creates these exchanges on startup:

| Name | Type | Description |
|------|------|-------------|
| `""` (empty) | direct | Default exchange, routes to queue by name |
| `amq.direct` | direct | Standard direct exchange |
| `amq.fanout` | fanout | Standard fanout exchange |
| `amq.topic` | topic | Standard topic exchange |
| `amq.headers` | headers | Standard headers exchange |

## Topic Exchange Patterns

Topic exchanges support pattern matching:

| Pattern | Matches |
|---------|---------|
| `stock.nyse.ibm` | Exactly "stock.nyse.ibm" |
| `stock.*.ibm` | "stock.nyse.ibm", "stock.nasdaq.ibm" |
| `stock.#` | "stock", "stock.nyse", "stock.nyse.ibm" |
| `#.ibm` | "ibm", "stock.ibm", "stock.nyse.ibm" |
| `#` | Any routing key |

Rules:
- `*` matches exactly one word
- `#` matches zero or more words
- Words are separated by dots (`.`)

## References

- [AMQP 0-9-1 Specification](https://www.rabbitmq.com/amqp-0-9-1-reference.html)
- [AMQP 0-9-1 Complete Reference](https://www.rabbitmq.com/amqp-0-9-1-quickref.html)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials)
