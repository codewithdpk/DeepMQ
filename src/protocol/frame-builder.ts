// AMQP 0-9-1 Frame Builder
// Builds outgoing AMQP frames

import {
  MessageProperties,
  FieldTable,
  FieldValue,
} from './types';
import {
  FRAME_TYPE,
  FRAME_END,
  CLASS_ID,
  BASIC_PROPERTY_FLAGS,
  DEFAULT_FRAME_MAX,
} from './constants';

export class FrameBuilder {
  // Build a complete frame with header and end marker
  static buildFrame(type: number, channel: number, payload: Buffer): Buffer {
    const frame = Buffer.alloc(7 + payload.length + 1);
    frame.writeUInt8(type, 0);
    frame.writeUInt16BE(channel, 1);
    frame.writeUInt32BE(payload.length, 3);
    payload.copy(frame, 7);
    frame.writeUInt8(FRAME_END, 7 + payload.length);
    return frame;
  }

  // Build a method frame
  static buildMethodFrame(
    channel: number,
    classId: number,
    methodId: number,
    argsBuffer: Buffer = Buffer.alloc(0)
  ): Buffer {
    const payload = Buffer.alloc(4 + argsBuffer.length);
    payload.writeUInt16BE(classId, 0);
    payload.writeUInt16BE(methodId, 2);
    argsBuffer.copy(payload, 4);
    return FrameBuilder.buildFrame(FRAME_TYPE.METHOD, channel, payload);
  }

  // Build a content header frame
  static buildContentHeaderFrame(
    channel: number,
    classId: number,
    bodySize: bigint,
    properties: MessageProperties
  ): Buffer {
    const { flags, propertiesBuffer } = FrameBuilder.encodeProperties(properties);
    const payload = Buffer.alloc(14 + propertiesBuffer.length);
    payload.writeUInt16BE(classId, 0);
    payload.writeUInt16BE(0, 2); // weight (always 0)
    payload.writeBigUInt64BE(bodySize, 4);
    payload.writeUInt16BE(flags, 12);
    propertiesBuffer.copy(payload, 14);
    return FrameBuilder.buildFrame(FRAME_TYPE.HEADER, channel, payload);
  }

  // Build content body frame(s) - may need to split into multiple frames
  static buildContentBodyFrames(
    channel: number,
    body: Buffer,
    frameMax: number = DEFAULT_FRAME_MAX
  ): Buffer[] {
    const frames: Buffer[] = [];
    const maxPayloadSize = frameMax - 8; // 7 byte header + 1 byte end marker
    let offset = 0;

    while (offset < body.length) {
      const chunkSize = Math.min(body.length - offset, maxPayloadSize);
      const chunk = body.subarray(offset, offset + chunkSize);
      frames.push(FrameBuilder.buildFrame(FRAME_TYPE.BODY, channel, chunk));
      offset += chunkSize;
    }

    return frames;
  }

  // Build a heartbeat frame
  static buildHeartbeatFrame(): Buffer {
    return FrameBuilder.buildFrame(FRAME_TYPE.HEARTBEAT, 0, Buffer.alloc(0));
  }

  // Encode message properties
  static encodeProperties(properties: MessageProperties): { flags: number; propertiesBuffer: Buffer } {
    let flags = 0;
    const parts: Buffer[] = [];

    if (properties.contentType !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.CONTENT_TYPE;
      parts.push(FrameBuilder.encodeShortString(properties.contentType));
    }
    if (properties.contentEncoding !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.CONTENT_ENCODING;
      parts.push(FrameBuilder.encodeShortString(properties.contentEncoding));
    }
    if (properties.headers !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.HEADERS;
      parts.push(FrameBuilder.encodeFieldTable(properties.headers));
    }
    if (properties.deliveryMode !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.DELIVERY_MODE;
      const buf = Buffer.alloc(1);
      buf.writeUInt8(properties.deliveryMode, 0);
      parts.push(buf);
    }
    if (properties.priority !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.PRIORITY;
      const buf = Buffer.alloc(1);
      buf.writeUInt8(properties.priority, 0);
      parts.push(buf);
    }
    if (properties.correlationId !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.CORRELATION_ID;
      parts.push(FrameBuilder.encodeShortString(properties.correlationId));
    }
    if (properties.replyTo !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.REPLY_TO;
      parts.push(FrameBuilder.encodeShortString(properties.replyTo));
    }
    if (properties.expiration !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.EXPIRATION;
      parts.push(FrameBuilder.encodeShortString(properties.expiration));
    }
    if (properties.messageId !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.MESSAGE_ID;
      parts.push(FrameBuilder.encodeShortString(properties.messageId));
    }
    if (properties.timestamp !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.TIMESTAMP;
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(BigInt(properties.timestamp), 0);
      parts.push(buf);
    }
    if (properties.type !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.TYPE;
      parts.push(FrameBuilder.encodeShortString(properties.type));
    }
    if (properties.userId !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.USER_ID;
      parts.push(FrameBuilder.encodeShortString(properties.userId));
    }
    if (properties.appId !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.APP_ID;
      parts.push(FrameBuilder.encodeShortString(properties.appId));
    }
    if (properties.clusterId !== undefined) {
      flags |= BASIC_PROPERTY_FLAGS.CLUSTER_ID;
      parts.push(FrameBuilder.encodeShortString(properties.clusterId));
    }

    return {
      flags,
      propertiesBuffer: Buffer.concat(parts),
    };
  }

  // Encode a short string (length byte + string)
  static encodeShortString(str: string): Buffer {
    const strBuffer = Buffer.from(str, 'utf8');
    if (strBuffer.length > 255) {
      throw new Error('Short string too long (max 255 bytes)');
    }
    const buffer = Buffer.alloc(1 + strBuffer.length);
    buffer.writeUInt8(strBuffer.length, 0);
    strBuffer.copy(buffer, 1);
    return buffer;
  }

  // Encode a long string (4-byte length + string)
  static encodeLongString(str: string): Buffer {
    const strBuffer = Buffer.from(str, 'utf8');
    const buffer = Buffer.alloc(4 + strBuffer.length);
    buffer.writeUInt32BE(strBuffer.length, 0);
    strBuffer.copy(buffer, 4);
    return buffer;
  }

  // Encode a field table
  static encodeFieldTable(table: FieldTable): Buffer {
    const parts: Buffer[] = [];

    for (const [key, value] of Object.entries(table)) {
      parts.push(FrameBuilder.encodeShortString(key));
      parts.push(FrameBuilder.encodeFieldValue(value));
    }

    const tableContent = Buffer.concat(parts);
    const buffer = Buffer.alloc(4 + tableContent.length);
    buffer.writeUInt32BE(tableContent.length, 0);
    tableContent.copy(buffer, 4);
    return buffer;
  }

  // Encode a field value
  static encodeFieldValue(value: FieldValue): Buffer {
    if (value === null || value === undefined) {
      return Buffer.from('V');
    }

    if (typeof value === 'boolean') {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt8(0x74, 0); // 't'
      buffer.writeUInt8(value ? 1 : 0, 1);
      return buffer;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value >= -128 && value <= 127) {
          const buffer = Buffer.alloc(2);
          buffer.writeUInt8(0x62, 0); // 'b'
          buffer.writeInt8(value, 1);
          return buffer;
        }
        if (value >= -32768 && value <= 32767) {
          const buffer = Buffer.alloc(3);
          buffer.writeUInt8(0x73, 0); // 's'
          buffer.writeInt16BE(value, 1);
          return buffer;
        }
        if (value >= -2147483648 && value <= 2147483647) {
          const buffer = Buffer.alloc(5);
          buffer.writeUInt8(0x49, 0); // 'I'
          buffer.writeInt32BE(value, 1);
          return buffer;
        }
      }
      // For larger integers or floats, use double
      const buffer = Buffer.alloc(9);
      buffer.writeUInt8(0x64, 0); // 'd'
      buffer.writeDoubleBE(value, 1);
      return buffer;
    }

    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(9);
      buffer.writeUInt8(0x6c, 0); // 'l'
      buffer.writeBigInt64BE(value, 1);
      return buffer;
    }

    if (typeof value === 'string') {
      const strBuffer = Buffer.from(value, 'utf8');
      const buffer = Buffer.alloc(5 + strBuffer.length);
      buffer.writeUInt8(0x53, 0); // 'S'
      buffer.writeUInt32BE(strBuffer.length, 1);
      strBuffer.copy(buffer, 5);
      return buffer;
    }

    if (value instanceof Date) {
      const buffer = Buffer.alloc(9);
      buffer.writeUInt8(0x54, 0); // 'T'
      buffer.writeBigUInt64BE(BigInt(Math.floor(value.getTime() / 1000)), 1);
      return buffer;
    }

    if (Buffer.isBuffer(value)) {
      const buffer = Buffer.alloc(5 + value.length);
      buffer.writeUInt8(0x78, 0); // 'x'
      buffer.writeUInt32BE(value.length, 1);
      value.copy(buffer, 5);
      return buffer;
    }

    if (Array.isArray(value)) {
      const parts = value.map((v) => FrameBuilder.encodeFieldValue(v));
      const arrayContent = Buffer.concat(parts);
      const buffer = Buffer.alloc(5 + arrayContent.length);
      buffer.writeUInt8(0x41, 0); // 'A'
      buffer.writeUInt32BE(arrayContent.length, 1);
      arrayContent.copy(buffer, 5);
      return buffer;
    }

    if (typeof value === 'object') {
      const tableBuffer = FrameBuilder.encodeFieldTable(value as FieldTable);
      const buffer = Buffer.alloc(1 + tableBuffer.length);
      buffer.writeUInt8(0x46, 0); // 'F'
      tableBuffer.copy(buffer, 1);
      return buffer;
    }

    throw new Error(`Cannot encode field value of type: ${typeof value}`);
  }

  // Build common method frames

  // Connection.Start
  static buildConnectionStart(
    versionMajor: number,
    versionMinor: number,
    serverProperties: FieldTable,
    mechanisms: string,
    locales: string
  ): Buffer {
    const parts: Buffer[] = [];
    const header = Buffer.alloc(2);
    header.writeUInt8(versionMajor, 0);
    header.writeUInt8(versionMinor, 1);
    parts.push(header);
    parts.push(FrameBuilder.encodeFieldTable(serverProperties));
    parts.push(FrameBuilder.encodeLongString(mechanisms));
    parts.push(FrameBuilder.encodeLongString(locales));
    return Buffer.concat(parts);
  }

  // Connection.Tune
  static buildConnectionTune(channelMax: number, frameMax: number, heartbeat: number): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt16BE(channelMax, 0);
    buffer.writeUInt32BE(frameMax, 2);
    buffer.writeUInt16BE(heartbeat, 6);
    return buffer;
  }

  // Connection.Open-Ok
  static buildConnectionOpenOk(): Buffer {
    return FrameBuilder.encodeShortString('');
  }

  // Connection.Close
  static buildConnectionClose(
    replyCode: number,
    replyText: string,
    classId: number,
    methodId: number
  ): Buffer {
    const parts: Buffer[] = [];
    const header = Buffer.alloc(2);
    header.writeUInt16BE(replyCode, 0);
    parts.push(header);
    parts.push(FrameBuilder.encodeShortString(replyText));
    const footer = Buffer.alloc(4);
    footer.writeUInt16BE(classId, 0);
    footer.writeUInt16BE(methodId, 2);
    parts.push(footer);
    return Buffer.concat(parts);
  }

  // Connection.Close-Ok
  static buildConnectionCloseOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Channel.Open-Ok
  static buildChannelOpenOk(): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(0, 0); // reserved long string (length 0)
    return buffer;
  }

  // Channel.Close
  static buildChannelClose(
    replyCode: number,
    replyText: string,
    classId: number,
    methodId: number
  ): Buffer {
    return FrameBuilder.buildConnectionClose(replyCode, replyText, classId, methodId);
  }

  // Channel.Close-Ok
  static buildChannelCloseOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Channel.Flow-Ok
  static buildChannelFlowOk(active: boolean): Buffer {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(active ? 1 : 0, 0);
    return buffer;
  }

  // Exchange.Declare-Ok
  static buildExchangeDeclareOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Exchange.Delete-Ok
  static buildExchangeDeleteOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Queue.Declare-Ok
  static buildQueueDeclareOk(queueName: string, messageCount: number, consumerCount: number): Buffer {
    const parts: Buffer[] = [];
    parts.push(FrameBuilder.encodeShortString(queueName));
    const counts = Buffer.alloc(8);
    counts.writeUInt32BE(messageCount, 0);
    counts.writeUInt32BE(consumerCount, 4);
    parts.push(counts);
    return Buffer.concat(parts);
  }

  // Queue.Bind-Ok
  static buildQueueBindOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Queue.Unbind-Ok
  static buildQueueUnbindOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Queue.Purge-Ok
  static buildQueuePurgeOk(messageCount: number): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(messageCount, 0);
    return buffer;
  }

  // Queue.Delete-Ok
  static buildQueueDeleteOk(messageCount: number): Buffer {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(messageCount, 0);
    return buffer;
  }

  // Basic.Qos-Ok
  static buildBasicQosOk(): Buffer {
    return Buffer.alloc(0);
  }

  // Basic.Consume-Ok
  static buildBasicConsumeOk(consumerTag: string): Buffer {
    return FrameBuilder.encodeShortString(consumerTag);
  }

  // Basic.Cancel-Ok
  static buildBasicCancelOk(consumerTag: string): Buffer {
    return FrameBuilder.encodeShortString(consumerTag);
  }

  // Basic.Deliver
  static buildBasicDeliver(
    consumerTag: string,
    deliveryTag: bigint,
    redelivered: boolean,
    exchange: string,
    routingKey: string
  ): Buffer {
    const parts: Buffer[] = [];
    parts.push(FrameBuilder.encodeShortString(consumerTag));
    const deliveryInfo = Buffer.alloc(9);
    deliveryInfo.writeBigUInt64BE(deliveryTag, 0);
    deliveryInfo.writeUInt8(redelivered ? 1 : 0, 8);
    parts.push(deliveryInfo);
    parts.push(FrameBuilder.encodeShortString(exchange));
    parts.push(FrameBuilder.encodeShortString(routingKey));
    return Buffer.concat(parts);
  }

  // Basic.Get-Ok
  static buildBasicGetOk(
    deliveryTag: bigint,
    redelivered: boolean,
    exchange: string,
    routingKey: string,
    messageCount: number
  ): Buffer {
    const parts: Buffer[] = [];
    const deliveryInfo = Buffer.alloc(9);
    deliveryInfo.writeBigUInt64BE(deliveryTag, 0);
    deliveryInfo.writeUInt8(redelivered ? 1 : 0, 8);
    parts.push(deliveryInfo);
    parts.push(FrameBuilder.encodeShortString(exchange));
    parts.push(FrameBuilder.encodeShortString(routingKey));
    const msgCount = Buffer.alloc(4);
    msgCount.writeUInt32BE(messageCount, 0);
    parts.push(msgCount);
    return Buffer.concat(parts);
  }

  // Basic.Get-Empty
  static buildBasicGetEmpty(): Buffer {
    return FrameBuilder.encodeShortString('');
  }

  // Basic.Return
  static buildBasicReturn(
    replyCode: number,
    replyText: string,
    exchange: string,
    routingKey: string
  ): Buffer {
    const parts: Buffer[] = [];
    const header = Buffer.alloc(2);
    header.writeUInt16BE(replyCode, 0);
    parts.push(header);
    parts.push(FrameBuilder.encodeShortString(replyText));
    parts.push(FrameBuilder.encodeShortString(exchange));
    parts.push(FrameBuilder.encodeShortString(routingKey));
    return Buffer.concat(parts);
  }

  // Basic.Recover-Ok
  static buildBasicRecoverOk(): Buffer {
    return Buffer.alloc(0);
  }
}
