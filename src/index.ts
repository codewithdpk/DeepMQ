// DeepMQ - Minimal AMQP 0-9-1 Message Broker
// Main entry point

export { DeepMQBroker, BrokerOptions } from './server';
export { BrokerEventEmitter, BrokerEvents } from './events/broker-events';
export { Connection } from './core/connection';
export { Channel } from './core/channel';
export { Exchange, ExchangeType } from './core/exchange';
export { Queue } from './core/queue';
export { Binding, BindingRegistry } from './core/binding';
export { Consumer, ConsumerRegistry } from './core/consumer';
export { Message, MessageProperties } from './protocol/types';
export { MessageStore } from './persistence/message-store';
export { FileStore } from './persistence/file-store';
export {
  DEFAULT_PORT,
  DEFAULT_CHANNEL_MAX,
  DEFAULT_FRAME_MAX,
  DEFAULT_HEARTBEAT,
} from './protocol/constants';

// Quick start example:
//
// import { DeepMQBroker } from 'deepmq';
//
// const broker = new DeepMQBroker({ port: 5672 });
// await broker.start();
//
// // Listen to events
// broker.events.onTyped('message:published', (message, exchange, routingKey) => {
//   console.log(`Message published to ${exchange} with key ${routingKey}`);
// });
//
// // Connect with amqplib or any AMQP 0-9-1 client
// // import amqp from 'amqplib';
// // const conn = await amqp.connect('amqp://localhost:5672');
