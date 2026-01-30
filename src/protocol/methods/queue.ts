// Queue method handlers

import { FrameParser } from '../frame-parser';
import { FrameBuilder } from '../frame-builder';
import {
  QueueDeclareArgs,
  QueueBindArgs,
  QueueUnbindArgs,
  QueuePurgeArgs,
  QueueDeleteArgs,
} from '../types';
import { CLASS_ID, QUEUE_METHOD } from '../constants';

// Parse Queue.Declare arguments
export function parseQueueDeclare(args: Buffer): QueueDeclareArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const flags = args.readUInt8(offset);
  offset += 1;

  const passive = (flags & 0x01) !== 0;
  const durable = (flags & 0x02) !== 0;
  const exclusive = (flags & 0x04) !== 0;
  const autoDelete = (flags & 0x08) !== 0;
  const noWait = (flags & 0x10) !== 0;

  const { value: arguments_ } = FrameParser.readFieldTable(args, offset);

  return {
    reserved1,
    queue,
    passive,
    durable,
    exclusive,
    autoDelete,
    noWait,
    arguments: arguments_,
  };
}

// Parse Queue.Bind arguments
export function parseQueueBind(args: Buffer): QueueBindArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const { value: exchange, bytesRead: exchBytes } = FrameParser.readShortString(args, offset);
  offset += exchBytes;

  const { value: routingKey, bytesRead: rkBytes } = FrameParser.readShortString(args, offset);
  offset += rkBytes;

  const noWait = args.readUInt8(offset) !== 0;
  offset += 1;

  const { value: arguments_ } = FrameParser.readFieldTable(args, offset);

  return {
    reserved1,
    queue,
    exchange,
    routingKey,
    noWait,
    arguments: arguments_,
  };
}

// Parse Queue.Unbind arguments
export function parseQueueUnbind(args: Buffer): QueueUnbindArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const { value: exchange, bytesRead: exchBytes } = FrameParser.readShortString(args, offset);
  offset += exchBytes;

  const { value: routingKey, bytesRead: rkBytes } = FrameParser.readShortString(args, offset);
  offset += rkBytes;

  const { value: arguments_ } = FrameParser.readFieldTable(args, offset);

  return {
    reserved1,
    queue,
    exchange,
    routingKey,
    arguments: arguments_,
  };
}

// Parse Queue.Purge arguments
export function parseQueuePurge(args: Buffer): QueuePurgeArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const noWait = args.readUInt8(offset) !== 0;

  return {
    reserved1,
    queue,
    noWait,
  };
}

// Parse Queue.Delete arguments
export function parseQueueDelete(args: Buffer): QueueDeleteArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const flags = args.readUInt8(offset);

  const ifUnused = (flags & 0x01) !== 0;
  const ifEmpty = (flags & 0x02) !== 0;
  const noWait = (flags & 0x04) !== 0;

  return {
    reserved1,
    queue,
    ifUnused,
    ifEmpty,
    noWait,
  };
}

// Build Queue.Declare-Ok frame
export function buildQueueDeclareOkFrame(
  channel: number,
  queueName: string,
  messageCount: number,
  consumerCount: number
): Buffer {
  const argsBuffer = FrameBuilder.buildQueueDeclareOk(queueName, messageCount, consumerCount);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.QUEUE,
    QUEUE_METHOD.DECLARE_OK,
    argsBuffer
  );
}

// Build Queue.Bind-Ok frame
export function buildQueueBindOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildQueueBindOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.QUEUE,
    QUEUE_METHOD.BIND_OK,
    argsBuffer
  );
}

// Build Queue.Unbind-Ok frame
export function buildQueueUnbindOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildQueueUnbindOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.QUEUE,
    QUEUE_METHOD.UNBIND_OK,
    argsBuffer
  );
}

// Build Queue.Purge-Ok frame
export function buildQueuePurgeOkFrame(channel: number, messageCount: number): Buffer {
  const argsBuffer = FrameBuilder.buildQueuePurgeOk(messageCount);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.QUEUE,
    QUEUE_METHOD.PURGE_OK,
    argsBuffer
  );
}

// Build Queue.Delete-Ok frame
export function buildQueueDeleteOkFrame(channel: number, messageCount: number): Buffer {
  const argsBuffer = FrameBuilder.buildQueueDeleteOk(messageCount);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.QUEUE,
    QUEUE_METHOD.DELETE_OK,
    argsBuffer
  );
}
