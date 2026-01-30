// Connection method handlers

import { FrameParser } from '../frame-parser';
import { FrameBuilder } from '../frame-builder';
import {
  ConnectionStartOkArgs,
  ConnectionTuneOkArgs,
  ConnectionOpenArgs,
  ConnectionCloseArgs,
  FieldTable,
} from '../types';
import {
  CLASS_ID,
  CONNECTION_METHOD,
  DEFAULT_CHANNEL_MAX,
  DEFAULT_FRAME_MAX,
  DEFAULT_HEARTBEAT,
} from '../constants';

// Parse Connection.Start-Ok arguments
export function parseConnectionStartOk(args: Buffer): ConnectionStartOkArgs {
  let offset = 0;

  // Client properties (field table)
  const { value: clientProperties, bytesRead: propsBytes } = FrameParser.readFieldTable(args, offset);
  offset += propsBytes;

  // Mechanism (short string)
  const { value: mechanism, bytesRead: mechBytes } = FrameParser.readShortString(args, offset);
  offset += mechBytes;

  // Response (long string as bytes)
  const responseLength = args.readUInt32BE(offset);
  offset += 4;
  const response = args.subarray(offset, offset + responseLength);
  offset += responseLength;

  // Locale (short string)
  const { value: locale } = FrameParser.readShortString(args, offset);

  return {
    clientProperties,
    mechanism,
    response: Buffer.from(response),
    locale,
  };
}

// Parse Connection.Tune-Ok arguments
export function parseConnectionTuneOk(args: Buffer): ConnectionTuneOkArgs {
  return {
    channelMax: args.readUInt16BE(0),
    frameMax: args.readUInt32BE(2),
    heartbeat: args.readUInt16BE(6),
  };
}

// Parse Connection.Open arguments
export function parseConnectionOpen(args: Buffer): ConnectionOpenArgs {
  let offset = 0;

  const { value: virtualHost, bytesRead: vhBytes } = FrameParser.readShortString(args, offset);
  offset += vhBytes;

  const { value: reserved1, bytesRead: r1Bytes } = FrameParser.readShortString(args, offset);
  offset += r1Bytes;

  const reserved2 = args.readUInt8(offset) !== 0;

  return {
    virtualHost,
    reserved1,
    reserved2,
  };
}

// Parse Connection.Close arguments
export function parseConnectionClose(args: Buffer): ConnectionCloseArgs {
  let offset = 0;

  const replyCode = args.readUInt16BE(offset);
  offset += 2;

  const { value: replyText, bytesRead: textBytes } = FrameParser.readShortString(args, offset);
  offset += textBytes;

  const classId = args.readUInt16BE(offset);
  offset += 2;

  const methodId = args.readUInt16BE(offset);

  return {
    replyCode,
    replyText,
    classId,
    methodId,
  };
}

// Build Connection.Start frame
export function buildConnectionStartFrame(serverProperties: FieldTable = {}): Buffer {
  const props: FieldTable = {
    product: 'DeepMQ',
    version: '1.0.0',
    platform: 'Node.js',
    capabilities: {
      'publisher_confirms': true,
      'exchange_exchange_bindings': false,
      'basic.nack': true,
      'consumer_cancel_notify': true,
      'connection.blocked': false,
      'consumer_priorities': false,
      'authentication_failure_close': true,
      'per_consumer_qos': true,
      'direct_reply_to': false,
    },
    ...serverProperties,
  };

  const argsBuffer = FrameBuilder.buildConnectionStart(
    0, // version major
    9, // version minor
    props,
    'PLAIN AMQPLAIN', // mechanisms
    'en_US' // locales
  );

  return FrameBuilder.buildMethodFrame(
    0, // channel 0 for connection methods
    CLASS_ID.CONNECTION,
    CONNECTION_METHOD.START,
    argsBuffer
  );
}

// Build Connection.Tune frame
export function buildConnectionTuneFrame(
  channelMax: number = DEFAULT_CHANNEL_MAX,
  frameMax: number = DEFAULT_FRAME_MAX,
  heartbeat: number = DEFAULT_HEARTBEAT
): Buffer {
  const argsBuffer = FrameBuilder.buildConnectionTune(channelMax, frameMax, heartbeat);

  return FrameBuilder.buildMethodFrame(
    0,
    CLASS_ID.CONNECTION,
    CONNECTION_METHOD.TUNE,
    argsBuffer
  );
}

// Build Connection.Open-Ok frame
export function buildConnectionOpenOkFrame(): Buffer {
  const argsBuffer = FrameBuilder.buildConnectionOpenOk();

  return FrameBuilder.buildMethodFrame(
    0,
    CLASS_ID.CONNECTION,
    CONNECTION_METHOD.OPEN_OK,
    argsBuffer
  );
}

// Build Connection.Close frame
export function buildConnectionCloseFrame(
  replyCode: number,
  replyText: string,
  classId: number = 0,
  methodId: number = 0
): Buffer {
  const argsBuffer = FrameBuilder.buildConnectionClose(replyCode, replyText, classId, methodId);

  return FrameBuilder.buildMethodFrame(
    0,
    CLASS_ID.CONNECTION,
    CONNECTION_METHOD.CLOSE,
    argsBuffer
  );
}

// Build Connection.Close-Ok frame
export function buildConnectionCloseOkFrame(): Buffer {
  const argsBuffer = FrameBuilder.buildConnectionCloseOk();

  return FrameBuilder.buildMethodFrame(
    0,
    CLASS_ID.CONNECTION,
    CONNECTION_METHOD.CLOSE_OK,
    argsBuffer
  );
}

// Validate PLAIN authentication
export function validatePlainAuth(response: Buffer): { username: string; password: string } | null {
  // PLAIN auth format: \0username\0password
  const parts = response.toString('utf8').split('\0');

  if (parts.length >= 3) {
    // Format is: [empty, username, password]
    return {
      username: parts[1] || 'guest',
      password: parts[2] || 'guest',
    };
  }

  return null;
}

// Validate AMQPLAIN authentication
export function validateAmqplainAuth(response: Buffer): { username: string; password: string } | null {
  // AMQPLAIN is a field table with LOGIN and PASSWORD keys
  try {
    const { value: table } = FrameParser.readFieldTable(response, 0);
    const username = table['LOGIN'] as string || 'guest';
    const password = table['PASSWORD'] as string || 'guest';
    return { username, password };
  } catch {
    return null;
  }
}
