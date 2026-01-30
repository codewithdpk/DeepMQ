// Basic method handlers

import { FrameParser } from '../frame-parser';
import { FrameBuilder } from '../frame-builder';
import {
  BasicQosArgs,
  BasicConsumeArgs,
  BasicCancelArgs,
  BasicPublishArgs,
  BasicGetArgs,
  BasicAckArgs,
  BasicRejectArgs,
  BasicNackArgs,
  BasicRecoverArgs,
  MessageProperties,
} from '../types';
import { CLASS_ID, BASIC_METHOD } from '../constants';

// Parse Basic.Qos arguments
export function parseBasicQos(args: Buffer): BasicQosArgs {
  return {
    prefetchSize: args.readUInt32BE(0),
    prefetchCount: args.readUInt16BE(4),
    global: args.readUInt8(6) !== 0,
  };
}

// Parse Basic.Consume arguments
export function parseBasicConsume(args: Buffer): BasicConsumeArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const { value: consumerTag, bytesRead: tagBytes } = FrameParser.readShortString(args, offset);
  offset += tagBytes;

  const flags = args.readUInt8(offset);
  offset += 1;

  const noLocal = (flags & 0x01) !== 0;
  const noAck = (flags & 0x02) !== 0;
  const exclusive = (flags & 0x04) !== 0;
  const noWait = (flags & 0x08) !== 0;

  const { value: arguments_ } = FrameParser.readFieldTable(args, offset);

  return {
    reserved1,
    queue,
    consumerTag,
    noLocal,
    noAck,
    exclusive,
    noWait,
    arguments: arguments_,
  };
}

// Parse Basic.Cancel arguments
export function parseBasicCancel(args: Buffer): BasicCancelArgs {
  let offset = 0;

  const { value: consumerTag, bytesRead: tagBytes } = FrameParser.readShortString(args, offset);
  offset += tagBytes;

  const noWait = args.readUInt8(offset) !== 0;

  return {
    consumerTag,
    noWait,
  };
}

// Parse Basic.Publish arguments
export function parseBasicPublish(args: Buffer): BasicPublishArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: exchange, bytesRead: exchBytes } = FrameParser.readShortString(args, offset);
  offset += exchBytes;

  const { value: routingKey, bytesRead: rkBytes } = FrameParser.readShortString(args, offset);
  offset += rkBytes;

  const flags = args.readUInt8(offset);

  const mandatory = (flags & 0x01) !== 0;
  const immediate = (flags & 0x02) !== 0;

  return {
    reserved1,
    exchange,
    routingKey,
    mandatory,
    immediate,
  };
}

// Parse Basic.Get arguments
export function parseBasicGet(args: Buffer): BasicGetArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: queue, bytesRead: queueBytes } = FrameParser.readShortString(args, offset);
  offset += queueBytes;

  const noAck = args.readUInt8(offset) !== 0;

  return {
    reserved1,
    queue,
    noAck,
  };
}

// Parse Basic.Ack arguments
export function parseBasicAck(args: Buffer): BasicAckArgs {
  return {
    deliveryTag: args.readBigUInt64BE(0),
    multiple: args.readUInt8(8) !== 0,
  };
}

// Parse Basic.Reject arguments
export function parseBasicReject(args: Buffer): BasicRejectArgs {
  return {
    deliveryTag: args.readBigUInt64BE(0),
    requeue: args.readUInt8(8) !== 0,
  };
}

// Parse Basic.Nack arguments
export function parseBasicNack(args: Buffer): BasicNackArgs {
  return {
    deliveryTag: args.readBigUInt64BE(0),
    multiple: (args.readUInt8(8) & 0x01) !== 0,
    requeue: (args.readUInt8(8) & 0x02) !== 0,
  };
}

// Parse Basic.Recover arguments
export function parseBasicRecover(args: Buffer): BasicRecoverArgs {
  return {
    requeue: args.readUInt8(0) !== 0,
  };
}

// Build Basic.Qos-Ok frame
export function buildBasicQosOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildBasicQosOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.QOS_OK,
    argsBuffer
  );
}

// Build Basic.Consume-Ok frame
export function buildBasicConsumeOkFrame(channel: number, consumerTag: string): Buffer {
  const argsBuffer = FrameBuilder.buildBasicConsumeOk(consumerTag);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.CONSUME_OK,
    argsBuffer
  );
}

// Build Basic.Cancel-Ok frame
export function buildBasicCancelOkFrame(channel: number, consumerTag: string): Buffer {
  const argsBuffer = FrameBuilder.buildBasicCancelOk(consumerTag);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.CANCEL_OK,
    argsBuffer
  );
}

// Build Basic.Deliver frame
export function buildBasicDeliverFrame(
  channel: number,
  consumerTag: string,
  deliveryTag: bigint,
  redelivered: boolean,
  exchange: string,
  routingKey: string
): Buffer {
  const argsBuffer = FrameBuilder.buildBasicDeliver(
    consumerTag,
    deliveryTag,
    redelivered,
    exchange,
    routingKey
  );

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.DELIVER,
    argsBuffer
  );
}

// Build Basic.Get-Ok frame
export function buildBasicGetOkFrame(
  channel: number,
  deliveryTag: bigint,
  redelivered: boolean,
  exchange: string,
  routingKey: string,
  messageCount: number
): Buffer {
  const argsBuffer = FrameBuilder.buildBasicGetOk(
    deliveryTag,
    redelivered,
    exchange,
    routingKey,
    messageCount
  );

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.GET_OK,
    argsBuffer
  );
}

// Build Basic.Get-Empty frame
export function buildBasicGetEmptyFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildBasicGetEmpty();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.GET_EMPTY,
    argsBuffer
  );
}

// Build Basic.Return frame
export function buildBasicReturnFrame(
  channel: number,
  replyCode: number,
  replyText: string,
  exchange: string,
  routingKey: string
): Buffer {
  const argsBuffer = FrameBuilder.buildBasicReturn(replyCode, replyText, exchange, routingKey);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.RETURN,
    argsBuffer
  );
}

// Build Basic.Recover-Ok frame
export function buildBasicRecoverOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildBasicRecoverOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.BASIC,
    BASIC_METHOD.RECOVER_OK,
    argsBuffer
  );
}

// Build content header and body frames for message delivery
export function buildMessageFrames(
  channel: number,
  content: Buffer,
  properties: MessageProperties,
  frameMax: number
): Buffer[] {
  const frames: Buffer[] = [];

  // Content header frame
  frames.push(FrameBuilder.buildContentHeaderFrame(
    channel,
    CLASS_ID.BASIC,
    BigInt(content.length),
    properties
  ));

  // Content body frames
  const bodyFrames = FrameBuilder.buildContentBodyFrames(channel, content, frameMax);
  frames.push(...bodyFrames);

  return frames;
}
