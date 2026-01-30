// AMQP 0-9-1 Frame Parser
// Parses incoming AMQP frames from TCP stream

import {
  AMQPFrame,
  MethodFrame,
  ContentHeader,
  MessageProperties,
  FieldTable,
  FieldValue,
  FrameType,
} from './types';
import { FRAME_END, BASIC_PROPERTY_FLAGS, CLASS_ID } from './constants';

export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  // Add data to the internal buffer
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  // Check if we have enough data for a complete frame
  hasCompleteFrame(): boolean {
    if (this.buffer.length < 7) {
      return false; // Need at least type(1) + channel(2) + size(4)
    }
    const size = this.buffer.readUInt32BE(3);
    return this.buffer.length >= 7 + size + 1; // +1 for frame end
  }

  // Parse and remove one frame from the buffer
  parseFrame(): AMQPFrame | null {
    if (!this.hasCompleteFrame()) {
      return null;
    }

    const type = this.buffer.readUInt8(0) as FrameType;
    const channel = this.buffer.readUInt16BE(1);
    const size = this.buffer.readUInt32BE(3);
    const payload = this.buffer.subarray(7, 7 + size);
    const frameEnd = this.buffer.readUInt8(7 + size);

    if (frameEnd !== FRAME_END) {
      throw new Error(`Invalid frame end marker: expected 0xCE, got 0x${frameEnd.toString(16)}`);
    }

    // Remove the parsed frame from buffer
    this.buffer = this.buffer.subarray(8 + size);

    return { type, channel, payload };
  }

  // Parse method frame payload
  static parseMethodFrame(payload: Buffer): MethodFrame {
    const classId = payload.readUInt16BE(0);
    const methodId = payload.readUInt16BE(2);
    const args = payload.subarray(4);

    return { classId, methodId, args };
  }

  // Parse content header frame payload
  static parseContentHeader(payload: Buffer): ContentHeader {
    const classId = payload.readUInt16BE(0);
    const weight = payload.readUInt16BE(2);
    const bodySize = payload.readBigUInt64BE(4);
    const propertyFlags = payload.readUInt16BE(12);

    let offset = 14;
    const properties: MessageProperties = {};

    if (classId === CLASS_ID.BASIC) {
      if (propertyFlags & BASIC_PROPERTY_FLAGS.CONTENT_TYPE) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.contentType = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.CONTENT_ENCODING) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.contentEncoding = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.HEADERS) {
        const { value, bytesRead } = FrameParser.readFieldTable(payload, offset);
        properties.headers = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.DELIVERY_MODE) {
        properties.deliveryMode = payload.readUInt8(offset);
        offset += 1;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.PRIORITY) {
        properties.priority = payload.readUInt8(offset);
        offset += 1;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.CORRELATION_ID) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.correlationId = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.REPLY_TO) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.replyTo = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.EXPIRATION) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.expiration = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.MESSAGE_ID) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.messageId = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.TIMESTAMP) {
        properties.timestamp = Number(payload.readBigUInt64BE(offset));
        offset += 8;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.TYPE) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.type = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.USER_ID) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.userId = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.APP_ID) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.appId = value;
        offset += bytesRead;
      }
      if (propertyFlags & BASIC_PROPERTY_FLAGS.CLUSTER_ID) {
        const { value, bytesRead } = FrameParser.readShortString(payload, offset);
        properties.clusterId = value;
        offset += bytesRead;
      }
    }

    return { classId, weight, bodySize, propertyFlags, properties };
  }

  // Read a short string (length byte + string)
  static readShortString(buffer: Buffer, offset: number): { value: string; bytesRead: number } {
    const length = buffer.readUInt8(offset);
    const value = buffer.toString('utf8', offset + 1, offset + 1 + length);
    return { value, bytesRead: 1 + length };
  }

  // Read a long string (4-byte length + string)
  static readLongString(buffer: Buffer, offset: number): { value: string; bytesRead: number } {
    const length = buffer.readUInt32BE(offset);
    const value = buffer.toString('utf8', offset + 4, offset + 4 + length);
    return { value, bytesRead: 4 + length };
  }

  // Read a field table
  static readFieldTable(buffer: Buffer, offset: number): { value: FieldTable; bytesRead: number } {
    const tableLength = buffer.readUInt32BE(offset);
    const table: FieldTable = {};
    let pos = offset + 4;
    const endPos = offset + 4 + tableLength;

    while (pos < endPos) {
      // Read field name
      const { value: fieldName, bytesRead: nameBytes } = FrameParser.readShortString(buffer, pos);
      pos += nameBytes;

      // Read field value
      const { value: fieldValue, bytesRead: valueBytes } = FrameParser.readFieldValue(buffer, pos);
      pos += valueBytes;

      table[fieldName] = fieldValue;
    }

    return { value: table, bytesRead: 4 + tableLength };
  }

  // Read a field value (type byte + value)
  static readFieldValue(buffer: Buffer, offset: number): { value: FieldValue; bytesRead: number } {
    const type = String.fromCharCode(buffer.readUInt8(offset));
    let pos = offset + 1;

    switch (type) {
      case 't': { // boolean
        const value = buffer.readUInt8(pos) !== 0;
        return { value, bytesRead: 2 };
      }
      case 'b': { // signed byte
        const value = buffer.readInt8(pos);
        return { value, bytesRead: 2 };
      }
      case 'B': { // unsigned byte
        const value = buffer.readUInt8(pos);
        return { value, bytesRead: 2 };
      }
      case 's': { // signed short
        const value = buffer.readInt16BE(pos);
        return { value, bytesRead: 3 };
      }
      case 'u': { // unsigned short
        const value = buffer.readUInt16BE(pos);
        return { value, bytesRead: 3 };
      }
      case 'I': { // signed int
        const value = buffer.readInt32BE(pos);
        return { value, bytesRead: 5 };
      }
      case 'i': { // unsigned int
        const value = buffer.readUInt32BE(pos);
        return { value, bytesRead: 5 };
      }
      case 'l': { // signed long
        const value = buffer.readBigInt64BE(pos);
        return { value, bytesRead: 9 };
      }
      case 'f': { // float
        const value = buffer.readFloatBE(pos);
        return { value, bytesRead: 5 };
      }
      case 'd': { // double
        const value = buffer.readDoubleBE(pos);
        return { value, bytesRead: 9 };
      }
      case 'D': { // decimal
        const scale = buffer.readUInt8(pos);
        const unscaled = buffer.readInt32BE(pos + 1);
        const value = unscaled / Math.pow(10, scale);
        return { value, bytesRead: 6 };
      }
      case 'S': { // long string
        const { value, bytesRead } = FrameParser.readLongString(buffer, pos);
        return { value, bytesRead: 1 + bytesRead };
      }
      case 'A': { // array
        const arrayLength = buffer.readUInt32BE(pos);
        const array: FieldValue[] = [];
        let arrayPos = pos + 4;
        const arrayEnd = pos + 4 + arrayLength;
        while (arrayPos < arrayEnd) {
          const { value, bytesRead } = FrameParser.readFieldValue(buffer, arrayPos);
          array.push(value);
          arrayPos += bytesRead;
        }
        return { value: array, bytesRead: 1 + 4 + arrayLength };
      }
      case 'T': { // timestamp
        const timestamp = Number(buffer.readBigUInt64BE(pos));
        const value = new Date(timestamp * 1000);
        return { value, bytesRead: 9 };
      }
      case 'F': { // field table
        const { value, bytesRead } = FrameParser.readFieldTable(buffer, pos);
        return { value, bytesRead: 1 + bytesRead };
      }
      case 'V': { // void/null
        return { value: null, bytesRead: 1 };
      }
      case 'x': { // byte array
        const length = buffer.readUInt32BE(pos);
        const value = buffer.subarray(pos + 4, pos + 4 + length);
        return { value: Buffer.from(value), bytesRead: 1 + 4 + length };
      }
      default:
        throw new Error(`Unknown field type: ${type} (0x${buffer.readUInt8(offset).toString(16)})`);
    }
  }

  // Parse method-specific arguments
  static parseMethodArgs(classId: number, methodId: number, args: Buffer): Record<string, unknown> {
    // These are implemented in the specific method handlers
    return { classId, methodId, rawArgs: args };
  }

  // Clear the buffer
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }

  // Get remaining buffer (for debugging)
  getBuffer(): Buffer {
    return this.buffer;
  }
}
