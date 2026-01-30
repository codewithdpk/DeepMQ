// AMQP 0-9-1 Protocol Constants

export const PROTOCOL_HEADER = Buffer.from([0x41, 0x4d, 0x51, 0x50, 0x00, 0x00, 0x09, 0x01]); // "AMQP\x00\x00\x09\x01"

export const FRAME_END = 0xce;

// Frame Types
export const FRAME_TYPE = {
  METHOD: 1,
  HEADER: 2,
  BODY: 3,
  HEARTBEAT: 8,
} as const;

// Class IDs
export const CLASS_ID = {
  CONNECTION: 10,
  CHANNEL: 20,
  EXCHANGE: 40,
  QUEUE: 50,
  BASIC: 60,
  TX: 90,
} as const;

// Connection Methods
export const CONNECTION_METHOD = {
  START: 10,
  START_OK: 11,
  SECURE: 20,
  SECURE_OK: 21,
  TUNE: 30,
  TUNE_OK: 31,
  OPEN: 40,
  OPEN_OK: 41,
  CLOSE: 50,
  CLOSE_OK: 51,
} as const;

// Channel Methods
export const CHANNEL_METHOD = {
  OPEN: 10,
  OPEN_OK: 11,
  FLOW: 20,
  FLOW_OK: 21,
  CLOSE: 40,
  CLOSE_OK: 41,
} as const;

// Exchange Methods
export const EXCHANGE_METHOD = {
  DECLARE: 10,
  DECLARE_OK: 11,
  DELETE: 20,
  DELETE_OK: 21,
} as const;

// Queue Methods
export const QUEUE_METHOD = {
  DECLARE: 10,
  DECLARE_OK: 11,
  BIND: 20,
  BIND_OK: 21,
  UNBIND: 50,
  UNBIND_OK: 51,
  PURGE: 30,
  PURGE_OK: 31,
  DELETE: 40,
  DELETE_OK: 41,
} as const;

// Basic Methods
export const BASIC_METHOD = {
  QOS: 10,
  QOS_OK: 11,
  CONSUME: 20,
  CONSUME_OK: 21,
  CANCEL: 30,
  CANCEL_OK: 31,
  PUBLISH: 40,
  RETURN: 50,
  DELIVER: 60,
  GET: 70,
  GET_OK: 71,
  GET_EMPTY: 72,
  ACK: 80,
  REJECT: 90,
  RECOVER_ASYNC: 100,
  RECOVER: 110,
  RECOVER_OK: 111,
  NACK: 120,
} as const;

// Default broker settings
export const DEFAULT_CHANNEL_MAX = 2047;
export const DEFAULT_FRAME_MAX = 131072; // 128KB
export const DEFAULT_HEARTBEAT = 60; // seconds

// Default port
export const DEFAULT_PORT = 5672;

// AMQP reply codes
export const REPLY_CODE = {
  SUCCESS: 200,
  CONTENT_TOO_LARGE: 311,
  NO_CONSUMERS: 313,
  CONNECTION_FORCED: 320,
  INVALID_PATH: 402,
  ACCESS_REFUSED: 403,
  NOT_FOUND: 404,
  RESOURCE_LOCKED: 405,
  PRECONDITION_FAILED: 406,
  FRAME_ERROR: 501,
  SYNTAX_ERROR: 502,
  COMMAND_INVALID: 503,
  CHANNEL_ERROR: 504,
  UNEXPECTED_FRAME: 505,
  RESOURCE_ERROR: 506,
  NOT_ALLOWED: 530,
  NOT_IMPLEMENTED: 540,
  INTERNAL_ERROR: 541,
} as const;

// Exchange types
export const EXCHANGE_TYPE = {
  DIRECT: 'direct',
  FANOUT: 'fanout',
  TOPIC: 'topic',
  HEADERS: 'headers',
} as const;

// Basic property flags (bit positions in the property flags field)
export const BASIC_PROPERTY_FLAGS = {
  CONTENT_TYPE: 0x8000,
  CONTENT_ENCODING: 0x4000,
  HEADERS: 0x2000,
  DELIVERY_MODE: 0x1000,
  PRIORITY: 0x0800,
  CORRELATION_ID: 0x0400,
  REPLY_TO: 0x0200,
  EXPIRATION: 0x0100,
  MESSAGE_ID: 0x0080,
  TIMESTAMP: 0x0040,
  TYPE: 0x0020,
  USER_ID: 0x0010,
  APP_ID: 0x0008,
  CLUSTER_ID: 0x0004,
} as const;
