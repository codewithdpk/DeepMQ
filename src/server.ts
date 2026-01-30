// DeepMQ Broker - Main TCP server and AMQP handler

import * as net from 'net';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { FrameParser } from './protocol/frame-parser';
import { FrameBuilder } from './protocol/frame-builder';
import {
  PROTOCOL_HEADER,
  FRAME_TYPE,
  CLASS_ID,
  CONNECTION_METHOD,
  CHANNEL_METHOD,
  EXCHANGE_METHOD,
  QUEUE_METHOD,
  BASIC_METHOD,
  DEFAULT_PORT,
  DEFAULT_CHANNEL_MAX,
  DEFAULT_FRAME_MAX,
  DEFAULT_HEARTBEAT,
  REPLY_CODE,
} from './protocol/constants';
import { MethodFrame, ContentHeader, Message } from './protocol/types';

import { Connection } from './core/connection';
import { Channel } from './core/channel';
import { Exchange, ExchangeType } from './core/exchange';
import { Queue } from './core/queue';
import { Binding, BindingRegistry } from './core/binding';
import { Consumer, ConsumerRegistry } from './core/consumer';
import { createMessage } from './core/message';

import { MessageRouter, RouterContext } from './routing/router';

import { BrokerEventEmitter } from './events/broker-events';
import { FileStore } from './persistence/file-store';
import { MessageStore } from './persistence/message-store';
import { recoverFromStore, createDefaultExchanges } from './persistence/recovery';

import * as connectionMethods from './protocol/methods/connection';
import * as channelMethods from './protocol/methods/channel';
import * as exchangeMethods from './protocol/methods/exchange';
import * as queueMethods from './protocol/methods/queue';
import * as basicMethods from './protocol/methods/basic';

export interface BrokerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  channelMax?: number;
  frameMax?: number;
  heartbeat?: number;
}

export class DeepMQBroker extends EventEmitter {
  private server: net.Server | null = null;
  private options: Required<BrokerOptions>;

  // Connection tracking
  private connections: Map<string, Connection> = new Map();

  // Core entities
  private exchanges: Map<string, Exchange> = new Map();
  private queues: Map<string, Queue> = new Map();
  private bindings: BindingRegistry = new BindingRegistry();
  private consumers: ConsumerRegistry = new ConsumerRegistry();

  // Routing
  private router: MessageRouter;

  // Persistence
  private store: MessageStore;

  // Events
  readonly events: BrokerEventEmitter = new BrokerEventEmitter();

  constructor(options: BrokerOptions = {}) {
    super();

    this.options = {
      port: options.port ?? DEFAULT_PORT,
      host: options.host ?? '0.0.0.0',
      dataDir: options.dataDir ?? './data',
      channelMax: options.channelMax ?? DEFAULT_CHANNEL_MAX,
      frameMax: options.frameMax ?? DEFAULT_FRAME_MAX,
      heartbeat: options.heartbeat ?? DEFAULT_HEARTBEAT,
    };

    // Initialize router with context
    const routerContext: RouterContext = {
      exchanges: this.exchanges,
      queues: this.queues,
      bindings: this.bindings,
    };
    this.router = new MessageRouter(routerContext);

    // Initialize persistence
    this.store = new FileStore(this.options.dataDir);
  }

  async start(): Promise<void> {
    // Initialize persistence
    await this.store.initialize();

    // Recover state from persistence
    const recovered = await recoverFromStore(this.store);

    // Merge default exchanges with recovered
    const defaultExchanges = createDefaultExchanges();
    for (const [name, exchange] of defaultExchanges) {
      if (!recovered.exchanges.has(name)) {
        this.exchanges.set(name, exchange);
      }
    }
    for (const [name, exchange] of recovered.exchanges) {
      this.exchanges.set(name, exchange);
    }

    // Restore queues and bindings
    for (const [name, queue] of recovered.queues) {
      this.queues.set(name, queue);
    }
    this.bindings = recovered.bindings;

    // Update router context
    this.router.updateContext({
      exchanges: this.exchanges,
      queues: this.queues,
      bindings: this.bindings,
    });

    // Start TCP server
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (err) => {
        this.events.emitTyped('broker:error', err);
        reject(err);
      });

      this.server.listen(this.options.port, this.options.host, () => {
        this.events.emitTyped('broker:started', this.options.port);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all connections
    for (const connection of this.connections.values()) {
      connection.destroy();
    }
    this.connections.clear();

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Close persistence
    await this.store.close();

    this.events.emitTyped('broker:stopped');
  }

  private handleConnection(socket: net.Socket): void {
    const connectionId = randomUUID();
    const connection = new Connection(socket, connectionId);
    const frameParser = new FrameParser();

    this.connections.set(connectionId, connection);

    // Buffer for initial protocol header
    let awaitingProtocolHeader = true;
    let protocolBuffer = Buffer.alloc(0);

    socket.on('data', async (data: Buffer) => {
      try {
        if (awaitingProtocolHeader) {
          protocolBuffer = Buffer.concat([protocolBuffer, data]);

          if (protocolBuffer.length >= 8) {
            const header = protocolBuffer.subarray(0, 8);

            if (!header.equals(PROTOCOL_HEADER)) {
              // Wrong protocol, send our supported version and close
              socket.write(PROTOCOL_HEADER);
              socket.end();
              return;
            }

            // Protocol accepted, send Connection.Start
            connection.setState('awaiting_start_ok');
            connection.send(connectionMethods.buildConnectionStartFrame());

            awaitingProtocolHeader = false;

            // Process any remaining data
            if (protocolBuffer.length > 8) {
              frameParser.append(protocolBuffer.subarray(8));
            }
          }
        } else {
          frameParser.append(data);
        }

        // Process frames
        while (frameParser.hasCompleteFrame()) {
          const frame = frameParser.parseFrame();
          if (frame) {
            await this.handleFrame(connection, frame);
          }
        }
      } catch (err) {
        console.error(`Error handling data for connection ${connectionId}:`, err);
        this.closeConnectionWithError(
          connection,
          REPLY_CODE.INTERNAL_ERROR,
          (err as Error).message || 'Internal error'
        );
      }
    });

    socket.on('error', (err) => {
      this.events.emitTyped('connection:error', connection, err);
      this.cleanupConnection(connection);
    });

    socket.on('close', () => {
      this.cleanupConnection(connection);
    });
  }

  private async handleFrame(
    connection: Connection,
    frame: { type: number; channel: number; payload: Buffer }
  ): Promise<void> {
    switch (frame.type) {
      case FRAME_TYPE.METHOD:
        await this.handleMethodFrame(connection, frame.channel, frame.payload);
        break;

      case FRAME_TYPE.HEADER:
        await this.handleHeaderFrame(connection, frame.channel, frame.payload);
        break;

      case FRAME_TYPE.BODY:
        await this.handleBodyFrame(connection, frame.channel, frame.payload);
        break;

      case FRAME_TYPE.HEARTBEAT:
        connection.resetHeartbeat();
        // Send heartbeat back
        connection.send(FrameBuilder.buildHeartbeatFrame());
        break;

      default:
        console.error(`Unknown frame type: ${frame.type}`);
    }
  }

  private async handleMethodFrame(
    connection: Connection,
    channelNumber: number,
    payload: Buffer
  ): Promise<void> {
    const method = FrameParser.parseMethodFrame(payload);

    switch (method.classId) {
      case CLASS_ID.CONNECTION:
        await this.handleConnectionMethod(connection, method);
        break;

      case CLASS_ID.CHANNEL:
        await this.handleChannelMethod(connection, channelNumber, method);
        break;

      case CLASS_ID.EXCHANGE:
        await this.handleExchangeMethod(connection, channelNumber, method);
        break;

      case CLASS_ID.QUEUE:
        await this.handleQueueMethod(connection, channelNumber, method);
        break;

      case CLASS_ID.BASIC:
        await this.handleBasicMethod(connection, channelNumber, method);
        break;

      default:
        console.error(`Unknown class ID: ${method.classId}`);
    }
  }

  private async handleConnectionMethod(
    connection: Connection,
    method: MethodFrame
  ): Promise<void> {
    switch (method.methodId) {
      case CONNECTION_METHOD.START_OK: {
        const args = connectionMethods.parseConnectionStartOk(method.args);
        connection.clientProperties = args.clientProperties;

        // Validate authentication
        let authValid = false;
        if (args.mechanism === 'PLAIN') {
          const creds = connectionMethods.validatePlainAuth(args.response);
          authValid = creds !== null; // Accept any credentials for now
        } else if (args.mechanism === 'AMQPLAIN') {
          const creds = connectionMethods.validateAmqplainAuth(args.response);
          authValid = creds !== null;
        }

        if (!authValid) {
          this.closeConnectionWithError(
            connection,
            REPLY_CODE.ACCESS_REFUSED,
            'Authentication failed'
          );
          return;
        }

        // Send Connection.Tune
        connection.setState('awaiting_tune_ok');
        connection.send(connectionMethods.buildConnectionTuneFrame(
          this.options.channelMax,
          this.options.frameMax,
          this.options.heartbeat
        ));
        break;
      }

      case CONNECTION_METHOD.TUNE_OK: {
        const args = connectionMethods.parseConnectionTuneOk(method.args);
        connection.channelMax = Math.min(args.channelMax || this.options.channelMax, this.options.channelMax);
        connection.frameMax = Math.min(args.frameMax || this.options.frameMax, this.options.frameMax);
        connection.heartbeat = Math.min(args.heartbeat, this.options.heartbeat);

        connection.setState('awaiting_open');
        break;
      }

      case CONNECTION_METHOD.OPEN: {
        const args = connectionMethods.parseConnectionOpen(method.args);
        connection.virtualHost = args.virtualHost || '/';

        // For now, accept any virtual host
        connection.setState('open');
        connection.startHeartbeat();

        connection.send(connectionMethods.buildConnectionOpenOkFrame());

        this.events.emitTyped('connection:open', connection);
        break;
      }

      case CONNECTION_METHOD.CLOSE: {
        const args = connectionMethods.parseConnectionClose(method.args);
        connection.setState('closing');

        // Send Close-Ok
        connection.send(connectionMethods.buildConnectionCloseOkFrame());

        this.cleanupConnection(connection, args.replyText);
        break;
      }

      case CONNECTION_METHOD.CLOSE_OK: {
        this.cleanupConnection(connection);
        break;
      }
    }
  }

  private async handleChannelMethod(
    connection: Connection,
    channelNumber: number,
    method: MethodFrame
  ): Promise<void> {
    switch (method.methodId) {
      case CHANNEL_METHOD.OPEN: {
        if (connection.hasChannel(channelNumber)) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.CHANNEL_ERROR,
            'Channel already open'
          );
          return;
        }

        const channel = connection.createChannel(channelNumber);
        channel.setState('open');

        connection.send(channelMethods.buildChannelOpenOkFrame(channelNumber));

        this.events.emitTyped('channel:open', channel, connection);
        break;
      }

      case CHANNEL_METHOD.FLOW: {
        const channel = connection.getChannel(channelNumber);
        if (!channel) {
          return;
        }

        const args = channelMethods.parseChannelFlow(method.args);
        channel.setFlow(args.active);

        connection.send(channelMethods.buildChannelFlowOkFrame(channelNumber, args.active));

        this.events.emitTyped('channel:flow', channel, args.active);
        break;
      }

      case CHANNEL_METHOD.FLOW_OK: {
        // Client acknowledging our flow control
        break;
      }

      case CHANNEL_METHOD.CLOSE: {
        const channel = connection.getChannel(channelNumber);
        if (channel) {
          this.cleanupChannel(channel, connection);
        }

        connection.send(channelMethods.buildChannelCloseOkFrame(channelNumber));
        break;
      }

      case CHANNEL_METHOD.CLOSE_OK: {
        const channel = connection.getChannel(channelNumber);
        if (channel) {
          this.cleanupChannel(channel, connection);
        }
        break;
      }
    }
  }

  private async handleExchangeMethod(
    connection: Connection,
    channelNumber: number,
    method: MethodFrame
  ): Promise<void> {
    const channel = connection.getChannel(channelNumber);
    if (!channel || channel.state !== 'open') {
      return;
    }

    switch (method.methodId) {
      case EXCHANGE_METHOD.DECLARE: {
        const args = exchangeMethods.parseExchangeDeclare(method.args);

        // Check if exchange exists
        const existing = this.exchanges.get(args.exchange);

        if (args.passive) {
          // Passive declare - just check existence
          if (!existing) {
            this.closeChannelWithError(
              connection,
              channelNumber,
              REPLY_CODE.NOT_FOUND,
              `Exchange '${args.exchange}' not found`
            );
            return;
          }
        } else {
          if (existing) {
            // Check if declaration matches
            if (!existing.matches({ type: args.type as ExchangeType, durable: args.durable })) {
              this.closeChannelWithError(
                connection,
                channelNumber,
                REPLY_CODE.PRECONDITION_FAILED,
                'Exchange declaration mismatch'
              );
              return;
            }
          } else {
            // Don't allow redeclaring default exchanges
            if (args.exchange.startsWith('amq.')) {
              this.closeChannelWithError(
                connection,
                channelNumber,
                REPLY_CODE.ACCESS_REFUSED,
                'Cannot declare reserved exchange'
              );
              return;
            }

            // Create new exchange
            const exchange = new Exchange(args.exchange, args.type as ExchangeType, {
              durable: args.durable,
              autoDelete: args.autoDelete,
              internal: args.internal,
              arguments: args.arguments,
            });

            this.exchanges.set(args.exchange, exchange);

            // Persist if durable
            if (args.durable) {
              await this.store.saveExchange(exchange);
            }

            this.events.emitTyped('exchange:created', exchange);
          }
        }

        if (!args.noWait) {
          connection.send(exchangeMethods.buildExchangeDeclareOkFrame(channelNumber));
        }
        break;
      }

      case EXCHANGE_METHOD.DELETE: {
        const args = exchangeMethods.parseExchangeDelete(method.args);

        const exchange = this.exchanges.get(args.exchange);
        if (!exchange) {
          // Exchange doesn't exist - that's OK for delete
          if (!args.noWait) {
            connection.send(exchangeMethods.buildExchangeDeleteOkFrame(channelNumber));
          }
          return;
        }

        // Don't allow deleting default exchanges
        if (exchange.isDefault) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.ACCESS_REFUSED,
            'Cannot delete reserved exchange'
          );
          return;
        }

        // Delete exchange
        this.exchanges.delete(args.exchange);

        // Remove all bindings from this exchange
        this.bindings.removeBySource(args.exchange);

        // Persist deletion
        await this.store.deleteExchange(args.exchange);

        this.events.emitTyped('exchange:deleted', exchange);

        if (!args.noWait) {
          connection.send(exchangeMethods.buildExchangeDeleteOkFrame(channelNumber));
        }
        break;
      }
    }
  }

  private async handleQueueMethod(
    connection: Connection,
    channelNumber: number,
    method: MethodFrame
  ): Promise<void> {
    const channel = connection.getChannel(channelNumber);
    if (!channel || channel.state !== 'open') {
      return;
    }

    switch (method.methodId) {
      case QUEUE_METHOD.DECLARE: {
        const args = queueMethods.parseQueueDeclare(method.args);

        // Generate name if empty
        const queueName = args.queue || `amq.gen-${randomUUID()}`;

        // Check if queue exists
        const existing = this.queues.get(queueName);

        if (args.passive) {
          // Passive declare - just check existence
          if (!existing) {
            this.closeChannelWithError(
              connection,
              channelNumber,
              REPLY_CODE.NOT_FOUND,
              `Queue '${queueName}' not found`
            );
            return;
          }

          // Check exclusive access
          if (!existing.canAccess(connection.id)) {
            this.closeChannelWithError(
              connection,
              channelNumber,
              REPLY_CODE.RESOURCE_LOCKED,
              'Queue is exclusive to another connection'
            );
            return;
          }
        } else {
          if (existing) {
            // Check if declaration matches
            if (!existing.matches({ durable: args.durable, exclusive: args.exclusive })) {
              this.closeChannelWithError(
                connection,
                channelNumber,
                REPLY_CODE.PRECONDITION_FAILED,
                'Queue declaration mismatch'
              );
              return;
            }

            // Check exclusive access
            if (!existing.canAccess(connection.id)) {
              this.closeChannelWithError(
                connection,
                channelNumber,
                REPLY_CODE.RESOURCE_LOCKED,
                'Queue is exclusive to another connection'
              );
              return;
            }
          } else {
            // Create new queue
            const queue = new Queue(queueName, {
              durable: args.durable,
              exclusive: args.exclusive,
              autoDelete: args.autoDelete,
              arguments: args.arguments,
              exclusiveConnectionId: args.exclusive ? connection.id : null,
            });

            this.queues.set(queueName, queue);

            // Auto-bind to default exchange
            const defaultBinding = new Binding('', queueName, queueName);
            this.bindings.add(defaultBinding);

            // Persist if durable
            if (args.durable) {
              await this.store.saveQueue(queue);
              await this.store.saveBinding(defaultBinding);
            }

            this.events.emitTyped('queue:created', queue);
          }
        }

        const queue = this.queues.get(queueName)!;

        if (!args.noWait) {
          connection.send(queueMethods.buildQueueDeclareOkFrame(
            channelNumber,
            queueName,
            queue.getMessageCount(),
            queue.getConsumerCount()
          ));
        }
        break;
      }

      case QUEUE_METHOD.BIND: {
        const args = queueMethods.parseQueueBind(method.args);

        const queue = this.queues.get(args.queue);
        if (!queue) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.NOT_FOUND,
            `Queue '${args.queue}' not found`
          );
          return;
        }

        // Can't bind to default exchange
        if (args.exchange === '') {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.ACCESS_REFUSED,
            'Cannot bind to default exchange'
          );
          return;
        }

        const exchange = this.exchanges.get(args.exchange);
        if (!exchange) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.NOT_FOUND,
            `Exchange '${args.exchange}' not found`
          );
          return;
        }

        // Create binding
        const binding = new Binding(args.exchange, args.queue, args.routingKey, args.arguments);
        this.bindings.add(binding);

        // Persist if queue is durable
        if (queue.durable) {
          await this.store.saveBinding(binding);
        }

        this.events.emitTyped('binding:created', binding);

        if (!args.noWait) {
          connection.send(queueMethods.buildQueueBindOkFrame(channelNumber));
        }
        break;
      }

      case QUEUE_METHOD.UNBIND: {
        const args = queueMethods.parseQueueUnbind(method.args);

        const binding = this.bindings.remove(args.exchange, args.queue, args.routingKey);

        if (binding) {
          await this.store.deleteBinding(args.exchange, args.queue, args.routingKey);
          this.events.emitTyped('binding:deleted', binding);
        }

        connection.send(queueMethods.buildQueueUnbindOkFrame(channelNumber));
        break;
      }

      case QUEUE_METHOD.PURGE: {
        const args = queueMethods.parseQueuePurge(method.args);

        const queue = this.queues.get(args.queue);
        if (!queue) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.NOT_FOUND,
            `Queue '${args.queue}' not found`
          );
          return;
        }

        const messageCount = queue.purge();

        // Update persistence
        await this.store.purgeQueue(args.queue);

        this.events.emitTyped('queue:purged', queue, messageCount);

        if (!args.noWait) {
          connection.send(queueMethods.buildQueuePurgeOkFrame(channelNumber, messageCount));
        }
        break;
      }

      case QUEUE_METHOD.DELETE: {
        const args = queueMethods.parseQueueDelete(method.args);

        const queue = this.queues.get(args.queue);
        if (!queue) {
          // Queue doesn't exist - that's OK for delete
          if (!args.noWait) {
            connection.send(queueMethods.buildQueueDeleteOkFrame(channelNumber, 0));
          }
          return;
        }

        // Check conditions
        if (args.ifUnused && queue.getConsumerCount() > 0) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.PRECONDITION_FAILED,
            'Queue has consumers'
          );
          return;
        }

        if (args.ifEmpty && queue.getMessageCount() > 0) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.PRECONDITION_FAILED,
            'Queue is not empty'
          );
          return;
        }

        const messageCount = queue.getMessageCount();

        // Delete queue
        this.queues.delete(args.queue);

        // Remove all bindings to this queue
        this.bindings.removeByDestination(args.queue);

        // Remove consumers
        const consumers = this.consumers.getByQueue(args.queue);
        for (const consumer of consumers) {
          this.consumers.remove(consumer.consumerTag);
        }

        // Persist deletion
        await this.store.deleteQueue(args.queue);

        this.events.emitTyped('queue:deleted', queue);

        if (!args.noWait) {
          connection.send(queueMethods.buildQueueDeleteOkFrame(channelNumber, messageCount));
        }
        break;
      }
    }
  }

  private async handleBasicMethod(
    connection: Connection,
    channelNumber: number,
    method: MethodFrame
  ): Promise<void> {
    const channel = connection.getChannel(channelNumber);
    if (!channel || channel.state !== 'open') {
      return;
    }

    switch (method.methodId) {
      case BASIC_METHOD.QOS: {
        const args = basicMethods.parseBasicQos(method.args);
        channel.setQoS(args.prefetchSize, args.prefetchCount, args.global);
        connection.send(basicMethods.buildBasicQosOkFrame(channelNumber));
        break;
      }

      case BASIC_METHOD.CONSUME: {
        const args = basicMethods.parseBasicConsume(method.args);

        const queue = this.queues.get(args.queue);
        if (!queue) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.NOT_FOUND,
            `Queue '${args.queue}' not found`
          );
          return;
        }

        // Check exclusive access
        if (!queue.canAccess(connection.id)) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.RESOURCE_LOCKED,
            'Queue is exclusive to another connection'
          );
          return;
        }

        // Check for exclusive consumer
        if (args.exclusive && this.consumers.hasExclusiveConsumer(args.queue)) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.ACCESS_REFUSED,
            'Queue has exclusive consumer'
          );
          return;
        }

        // Generate consumer tag if not provided
        const consumerTag = args.consumerTag || channel.generateConsumerTag();

        // Create consumer
        const consumer = new Consumer(consumerTag, args.queue, channel, {
          noLocal: args.noLocal,
          noAck: args.noAck,
          exclusive: args.exclusive,
          arguments: args.arguments,
        });

        this.consumers.add(consumer);
        channel.addConsumer(consumer);
        queue.addConsumer();

        this.events.emitTyped('consumer:created', consumer);

        if (!args.noWait) {
          connection.send(basicMethods.buildBasicConsumeOkFrame(channelNumber, consumerTag));
        }

        // Deliver any existing messages
        this.deliverToConsumer(consumer);
        break;
      }

      case BASIC_METHOD.CANCEL: {
        const args = basicMethods.parseBasicCancel(method.args);

        const consumer = this.consumers.remove(args.consumerTag);
        if (consumer) {
          channel.removeConsumer(args.consumerTag);

          const queue = this.queues.get(consumer.queueName);
          if (queue) {
            queue.removeConsumer();
          }

          this.events.emitTyped('consumer:cancelled', consumer);
        }

        if (!args.noWait) {
          connection.send(basicMethods.buildBasicCancelOkFrame(channelNumber, args.consumerTag));
        }
        break;
      }

      case BASIC_METHOD.PUBLISH: {
        const args = basicMethods.parseBasicPublish(method.args);

        // Store publish info for content frames
        channel.setPendingMessage({
          method: 'publish',
          exchange: args.exchange,
          routingKey: args.routingKey,
          mandatory: args.mandatory,
          immediate: args.immediate,
          properties: {},
          bodySize: 0n,
          bodyChunks: [],
          receivedSize: 0n,
        });
        break;
      }

      case BASIC_METHOD.GET: {
        const args = basicMethods.parseBasicGet(method.args);

        const queue = this.queues.get(args.queue);
        if (!queue) {
          this.closeChannelWithError(
            connection,
            channelNumber,
            REPLY_CODE.NOT_FOUND,
            `Queue '${args.queue}' not found`
          );
          return;
        }

        const message = queue.dequeue();
        if (!message) {
          connection.send(basicMethods.buildBasicGetEmptyFrame(channelNumber));
          return;
        }

        const deliveryTag = channel.nextDeliveryTag();

        if (!args.noAck) {
          channel.trackUnacked(deliveryTag, message, args.queue, '');
        } else {
          // Auto-ack, remove from persistence
          if (queue.durable) {
            await this.store.deleteMessage(args.queue, message.id);
          }
        }

        // Send Get-Ok
        connection.send(basicMethods.buildBasicGetOkFrame(
          channelNumber,
          deliveryTag,
          false, // redelivered
          message.exchange,
          message.routingKey,
          queue.getMessageCount()
        ));

        // Send content
        const contentFrames = basicMethods.buildMessageFrames(
          channelNumber,
          message.content,
          message.properties,
          connection.frameMax
        );
        for (const frame of contentFrames) {
          connection.send(frame);
        }
        break;
      }

      case BASIC_METHOD.ACK: {
        const args = basicMethods.parseBasicAck(method.args);
        const acked = channel.ack(args.deliveryTag, args.multiple);

        for (const unacked of acked) {
          const queue = this.queues.get(unacked.queueName);
          if (queue?.durable) {
            await this.store.deleteMessage(unacked.queueName, unacked.message.id);
          }
        }

        this.events.emitTyped('message:acked', args.deliveryTag, channel, args.multiple);

        // Try to deliver more messages to this channel's consumers
        for (const consumer of channel.getConsumers()) {
          const c = this.consumers.get(consumer.consumerTag);
          if (c) {
            this.deliverToConsumer(c);
          }
        }
        break;
      }

      case BASIC_METHOD.REJECT: {
        const args = basicMethods.parseBasicReject(method.args);
        const rejected = channel.reject(args.deliveryTag);

        if (rejected) {
          if (args.requeue) {
            // Requeue the message
            const queue = this.queues.get(rejected.queueName);
            if (queue) {
              queue.requeue(rejected.message, true);
              // Trigger redelivery to consumers
              const consumers = this.consumers.getByQueue(rejected.queueName);
              for (const consumer of consumers) {
                setImmediate(() => this.deliverToConsumer(consumer));
              }
            }
          } else {
            // Delete the message
            const queue = this.queues.get(rejected.queueName);
            if (queue?.durable) {
              await this.store.deleteMessage(rejected.queueName, rejected.message.id);
            }
          }
        }

        this.events.emitTyped('message:rejected', args.deliveryTag, channel, args.requeue);
        break;
      }

      case BASIC_METHOD.NACK: {
        const args = basicMethods.parseBasicNack(method.args);
        const nacked = channel.nack(args.deliveryTag, args.multiple);

        const queuesToRedeliver = new Set<string>();
        for (const unacked of nacked) {
          if (args.requeue) {
            const queue = this.queues.get(unacked.queueName);
            if (queue) {
              queue.requeue(unacked.message, true);
              queuesToRedeliver.add(unacked.queueName);
            }
          } else {
            const queue = this.queues.get(unacked.queueName);
            if (queue?.durable) {
              await this.store.deleteMessage(unacked.queueName, unacked.message.id);
            }
          }
        }

        this.events.emitTyped('message:nacked', args.deliveryTag, channel, args.multiple, args.requeue);

        // Redeliver to consumers for requeued messages
        for (const queueName of queuesToRedeliver) {
          const consumers = this.consumers.getByQueue(queueName);
          for (const consumer of consumers) {
            setImmediate(() => this.deliverToConsumer(consumer));
          }
        }
        break;
      }

      case BASIC_METHOD.RECOVER:
      case BASIC_METHOD.RECOVER_ASYNC: {
        const args = basicMethods.parseBasicRecover(method.args);

        // Requeue all unacked messages
        const unackedMessages = channel.getUnackedMessages();
        for (const unacked of unackedMessages) {
          const queue = this.queues.get(unacked.queueName);
          if (queue) {
            queue.requeue(unacked.message, !args.requeue);
          }
        }

        // Clear unacked tracking
        for (const unacked of unackedMessages) {
          channel.ack(unacked.deliveryTag, false);
        }

        if (method.methodId === BASIC_METHOD.RECOVER) {
          connection.send(basicMethods.buildBasicRecoverOkFrame(channelNumber));
        }

        // Redeliver to consumers
        for (const consumer of channel.getConsumers()) {
          const c = this.consumers.get(consumer.consumerTag);
          if (c) {
            this.deliverToConsumer(c);
          }
        }
        break;
      }
    }
  }

  private async handleHeaderFrame(
    connection: Connection,
    channelNumber: number,
    payload: Buffer
  ): Promise<void> {
    const channel = connection.getChannel(channelNumber);
    if (!channel) {
      return;
    }

    const pending = channel.getPendingMessage();
    if (!pending) {
      return;
    }

    const header = FrameParser.parseContentHeader(payload);
    pending.bodySize = header.bodySize;
    pending.properties = header.properties;

    // If body size is 0, complete the message immediately
    if (header.bodySize === 0n) {
      await this.completeMessage(connection, channel);
    }
  }

  private async handleBodyFrame(
    connection: Connection,
    channelNumber: number,
    payload: Buffer
  ): Promise<void> {
    const channel = connection.getChannel(channelNumber);
    if (!channel) {
      return;
    }

    const complete = channel.appendBodyChunk(payload);
    if (complete) {
      await this.completeMessage(connection, channel);
    }
  }

  private async completeMessage(connection: Connection, channel: Channel): Promise<void> {
    const pending = channel.getPendingMessage();
    if (!pending) {
      return;
    }

    const content = Buffer.concat(pending.bodyChunks);
    const message = createMessage(
      pending.exchange,
      pending.routingKey,
      content,
      pending.properties,
      {
        mandatory: pending.mandatory,
        immediate: pending.immediate,
      }
    );

    channel.clearPendingMessage();

    this.events.emitTyped('message:published', message, pending.exchange, pending.routingKey);

    // Route the message
    const queues = this.router.route(message);

    if (queues.length === 0) {
      // No routes found
      if (pending.mandatory) {
        // Return the message to the publisher
        const returnFrame = basicMethods.buildBasicReturnFrame(
          channel.channelNumber,
          REPLY_CODE.NO_CONSUMERS,
          'No route',
          pending.exchange,
          pending.routingKey
        );
        connection.send(returnFrame);

        const contentFrames = basicMethods.buildMessageFrames(
          channel.channelNumber,
          content,
          pending.properties,
          connection.frameMax
        );
        for (const frame of contentFrames) {
          connection.send(frame);
        }

        this.events.emitTyped('message:returned', message, REPLY_CODE.NO_CONSUMERS, 'No route');
      }
      return;
    }

    // Deliver to queues
    const queueNames: string[] = [];
    for (const queue of queues) {
      queue.enqueue(message);
      queueNames.push(queue.name);

      // Persist if durable
      if (queue.durable && pending.properties.deliveryMode === 2) {
        await this.store.saveMessage(queue.name, message);
      }

      // Try to deliver to consumers
      const consumers = this.consumers.getByQueue(queue.name);
      for (const consumer of consumers) {
        this.deliverToConsumer(consumer);
      }
    }

    this.events.emitTyped('message:routed', message, queueNames);
  }

  private deliverToConsumer(consumer: Consumer): void {
    if (!consumer.canReceive()) {
      return;
    }

    const queue = this.queues.get(consumer.queueName);
    if (!queue) {
      return;
    }

    const message = queue.dequeue();
    if (!message) {
      return;
    }

    const channel = consumer.channel;
    const connection = channel.connection;
    const deliveryTag = channel.nextDeliveryTag();

    if (!consumer.noAck) {
      channel.trackUnacked(deliveryTag, message, consumer.queueName, consumer.consumerTag);
    }

    // Send Deliver
    connection.send(basicMethods.buildBasicDeliverFrame(
      channel.channelNumber,
      consumer.consumerTag,
      deliveryTag,
      false, // redelivered
      message.exchange,
      message.routingKey
    ));

    // Send content
    const contentFrames = basicMethods.buildMessageFrames(
      channel.channelNumber,
      message.content,
      message.properties,
      connection.frameMax
    );
    for (const frame of contentFrames) {
      connection.send(frame);
    }

    this.events.emitTyped('message:delivered', message, consumer, deliveryTag);

    // If auto-ack, remove from persistence
    if (consumer.noAck && queue.durable) {
      this.store.deleteMessage(consumer.queueName, message.id).catch(() => {});
    }

    // Try to deliver more if we can
    if (consumer.canReceive()) {
      setImmediate(() => this.deliverToConsumer(consumer));
    }
  }

  private closeConnectionWithError(
    connection: Connection,
    replyCode: number,
    replyText: string
  ): void {
    connection.send(connectionMethods.buildConnectionCloseFrame(replyCode, replyText, 0, 0));
    connection.setState('closing');
  }

  private closeChannelWithError(
    connection: Connection,
    channelNumber: number,
    replyCode: number,
    replyText: string
  ): void {
    connection.send(channelMethods.buildChannelCloseFrame(
      channelNumber,
      replyCode,
      replyText,
      0,
      0
    ));
  }

  private cleanupConnection(connection: Connection, reason?: string): void {
    // Clean up all channels
    for (const channel of connection.getChannels()) {
      this.cleanupChannel(channel, connection);
    }

    // Remove exclusive queues
    for (const [name, queue] of this.queues) {
      if (queue.exclusiveConnectionId === connection.id) {
        this.queues.delete(name);
        this.bindings.removeByDestination(name);
        this.events.emitTyped('queue:deleted', queue);
      }
    }

    this.connections.delete(connection.id);
    connection.close();

    this.events.emitTyped('connection:close', connection, reason);
  }

  private cleanupChannel(channel: Channel, connection: Connection): void {
    // Remove consumers
    const consumers = this.consumers.removeByChannel(channel);
    for (const consumer of consumers) {
      const queue = this.queues.get(consumer.queueName);
      if (queue) {
        queue.removeConsumer();
      }
      this.events.emitTyped('consumer:cancelled', consumer);
    }

    // Requeue unacked messages
    const unacked = channel.getUnackedMessages();
    for (const msg of unacked) {
      const queue = this.queues.get(msg.queueName);
      if (queue) {
        queue.requeue(msg.message, true);
      }
    }

    connection.closeChannel(channel.channelNumber);
    this.events.emitTyped('channel:close', channel, connection);
  }

  // Public API for management

  getConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  getExchanges(): Exchange[] {
    return Array.from(this.exchanges.values());
  }

  getQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  getBindings(): Binding[] {
    return this.bindings.getAll();
  }

  getConsumers(): Consumer[] {
    return this.consumers.getAll();
  }

  getStatus(): object {
    return {
      connections: this.connections.size,
      channels: Array.from(this.connections.values()).reduce(
        (sum, c) => sum + c.getChannelCount(),
        0
      ),
      exchanges: this.exchanges.size,
      queues: this.queues.size,
      consumers: this.consumers.getAll().length,
      messages: Array.from(this.queues.values()).reduce(
        (sum, q) => sum + q.getMessageCount(),
        0
      ),
    };
  }
}
