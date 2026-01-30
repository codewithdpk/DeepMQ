# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-30

### Added

- Initial release of DeepMQ
- Full AMQP 0-9-1 protocol implementation
  - Connection handshake with PLAIN authentication
  - Channel management
  - Exchange operations (declare, delete)
  - Queue operations (declare, bind, unbind, purge, delete)
  - Basic operations (publish, consume, get, ack, nack, reject, recover)
- Exchange types
  - Direct exchange with exact routing key matching
  - Fanout exchange for broadcasting
  - Topic exchange with wildcard pattern matching (`*` and `#`)
- Message features
  - Full message properties support
  - Persistent messages (delivery mode 2)
  - Message acknowledgments (ack, nack, reject)
  - Requeue on nack/reject
  - QoS/prefetch for flow control
- Persistence layer
  - Append-only message log
  - Durable queues and exchanges
  - Recovery on broker restart
- Event system
  - Typed event emitter for all broker events
  - Connection, channel, message, queue, and exchange events
- CLI interface
  - Start/stop broker
  - Status display
  - Interactive mode for monitoring
- Zero runtime dependencies
  - Pure Node.js implementation
  - Uses only built-in modules (net, fs, events, crypto)

### Technical Details

- Written in TypeScript with full type definitions
- Integration tests using amqplib client
- Support for Node.js 18+

## [Unreleased]

### Planned

- TLS/SSL support for secure connections
- HTTP management API
- Dead letter exchanges
- Message TTL (time-to-live)
- Headers exchange type
- Publisher confirms
- Consumer priorities
- Alternate exchanges
- Queue message limits
