// AMQP 0-9-1 Type Definitions

export type FrameType = 1 | 2 | 3 | 8;

export interface AMQPFrame {
  type: FrameType;
  channel: number;
  payload: Buffer;
}

export interface MethodFrame {
  classId: number;
  methodId: number;
  args: Buffer;
}

export interface ContentHeader {
  classId: number;
  weight: number;
  bodySize: bigint;
  propertyFlags: number;
  properties: MessageProperties;
}

export interface MessageProperties {
  contentType?: string;
  contentEncoding?: string;
  headers?: FieldTable;
  deliveryMode?: number;
  priority?: number;
  correlationId?: string;
  replyTo?: string;
  expiration?: string;
  messageId?: string;
  timestamp?: number;
  type?: string;
  userId?: string;
  appId?: string;
  clusterId?: string;
}

// AMQP Field Table (key-value pairs with typed values)
export type FieldValue =
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

export interface FieldTable {
  [key: string]: FieldValue;
}

// Connection state
export type ConnectionState =
  | 'awaiting_header'
  | 'awaiting_start_ok'
  | 'awaiting_tune_ok'
  | 'awaiting_open'
  | 'open'
  | 'closing'
  | 'closed';

// Channel state
export type ChannelState = 'opening' | 'open' | 'closing' | 'closed';

// Exchange definition
export interface ExchangeDefinition {
  name: string;
  type: 'direct' | 'fanout' | 'topic' | 'headers';
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  arguments: FieldTable;
}

// Queue definition
export interface QueueDefinition {
  name: string;
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  arguments: FieldTable;
}

// Binding definition
export interface BindingDefinition {
  source: string;       // exchange name
  destination: string;  // queue name
  routingKey: string;
  arguments: FieldTable;
}

// Consumer definition
export interface ConsumerDefinition {
  consumerTag: string;
  queueName: string;
  noLocal: boolean;
  noAck: boolean;
  exclusive: boolean;
  arguments: FieldTable;
}

// Message structure
export interface Message {
  id: string;
  exchange: string;
  routingKey: string;
  mandatory: boolean;
  immediate: boolean;
  properties: MessageProperties;
  content: Buffer;
  timestamp: number;
}

// Delivery info for consumed messages
export interface Delivery {
  consumerTag: string;
  deliveryTag: bigint;
  redelivered: boolean;
  exchange: string;
  routingKey: string;
}

// Unacked message tracking
export interface UnackedMessage {
  message: Message;
  queueName: string;
  deliveryTag: bigint;
  consumerTag: string;
  deliveredAt: number;
}

// QoS settings
export interface QoSSettings {
  prefetchSize: number;
  prefetchCount: number;
  global: boolean;
}

// Parsed method arguments for each AMQP method
export interface ConnectionStartArgs {
  versionMajor: number;
  versionMinor: number;
  serverProperties: FieldTable;
  mechanisms: string;
  locales: string;
}

export interface ConnectionStartOkArgs {
  clientProperties: FieldTable;
  mechanism: string;
  response: Buffer;
  locale: string;
}

export interface ConnectionTuneArgs {
  channelMax: number;
  frameMax: number;
  heartbeat: number;
}

export interface ConnectionTuneOkArgs {
  channelMax: number;
  frameMax: number;
  heartbeat: number;
}

export interface ConnectionOpenArgs {
  virtualHost: string;
  reserved1: string;
  reserved2: boolean;
}

export interface ConnectionCloseArgs {
  replyCode: number;
  replyText: string;
  classId: number;
  methodId: number;
}

export interface ChannelOpenArgs {
  reserved1: string;
}

export interface ChannelCloseArgs {
  replyCode: number;
  replyText: string;
  classId: number;
  methodId: number;
}

export interface ChannelFlowArgs {
  active: boolean;
}

export interface ExchangeDeclareArgs {
  reserved1: number;
  exchange: string;
  type: string;
  passive: boolean;
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  noWait: boolean;
  arguments: FieldTable;
}

export interface ExchangeDeleteArgs {
  reserved1: number;
  exchange: string;
  ifUnused: boolean;
  noWait: boolean;
}

export interface QueueDeclareArgs {
  reserved1: number;
  queue: string;
  passive: boolean;
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  noWait: boolean;
  arguments: FieldTable;
}

export interface QueueBindArgs {
  reserved1: number;
  queue: string;
  exchange: string;
  routingKey: string;
  noWait: boolean;
  arguments: FieldTable;
}

export interface QueueUnbindArgs {
  reserved1: number;
  queue: string;
  exchange: string;
  routingKey: string;
  arguments: FieldTable;
}

export interface QueuePurgeArgs {
  reserved1: number;
  queue: string;
  noWait: boolean;
}

export interface QueueDeleteArgs {
  reserved1: number;
  queue: string;
  ifUnused: boolean;
  ifEmpty: boolean;
  noWait: boolean;
}

export interface BasicQosArgs {
  prefetchSize: number;
  prefetchCount: number;
  global: boolean;
}

export interface BasicConsumeArgs {
  reserved1: number;
  queue: string;
  consumerTag: string;
  noLocal: boolean;
  noAck: boolean;
  exclusive: boolean;
  noWait: boolean;
  arguments: FieldTable;
}

export interface BasicCancelArgs {
  consumerTag: string;
  noWait: boolean;
}

export interface BasicPublishArgs {
  reserved1: number;
  exchange: string;
  routingKey: string;
  mandatory: boolean;
  immediate: boolean;
}

export interface BasicGetArgs {
  reserved1: number;
  queue: string;
  noAck: boolean;
}

export interface BasicAckArgs {
  deliveryTag: bigint;
  multiple: boolean;
}

export interface BasicRejectArgs {
  deliveryTag: bigint;
  requeue: boolean;
}

export interface BasicNackArgs {
  deliveryTag: bigint;
  multiple: boolean;
  requeue: boolean;
}

export interface BasicRecoverArgs {
  requeue: boolean;
}
