// Channel method handlers

import { FrameParser } from '../frame-parser';
import { FrameBuilder } from '../frame-builder';
import { ChannelOpenArgs, ChannelCloseArgs, ChannelFlowArgs } from '../types';
import { CLASS_ID, CHANNEL_METHOD } from '../constants';

// Parse Channel.Open arguments
export function parseChannelOpen(args: Buffer): ChannelOpenArgs {
  const { value: reserved1 } = FrameParser.readShortString(args, 0);
  return { reserved1 };
}

// Parse Channel.Close arguments
export function parseChannelClose(args: Buffer): ChannelCloseArgs {
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

// Parse Channel.Flow arguments
export function parseChannelFlow(args: Buffer): ChannelFlowArgs {
  return {
    active: args.readUInt8(0) !== 0,
  };
}

// Build Channel.Open-Ok frame
export function buildChannelOpenOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildChannelOpenOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.CHANNEL,
    CHANNEL_METHOD.OPEN_OK,
    argsBuffer
  );
}

// Build Channel.Close frame
export function buildChannelCloseFrame(
  channel: number,
  replyCode: number,
  replyText: string,
  classId: number = 0,
  methodId: number = 0
): Buffer {
  const argsBuffer = FrameBuilder.buildChannelClose(replyCode, replyText, classId, methodId);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.CHANNEL,
    CHANNEL_METHOD.CLOSE,
    argsBuffer
  );
}

// Build Channel.Close-Ok frame
export function buildChannelCloseOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildChannelCloseOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.CHANNEL,
    CHANNEL_METHOD.CLOSE_OK,
    argsBuffer
  );
}

// Build Channel.Flow frame
export function buildChannelFlowFrame(channel: number, active: boolean): Buffer {
  const argsBuffer = Buffer.alloc(1);
  argsBuffer.writeUInt8(active ? 1 : 0, 0);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.CHANNEL,
    CHANNEL_METHOD.FLOW,
    argsBuffer
  );
}

// Build Channel.Flow-Ok frame
export function buildChannelFlowOkFrame(channel: number, active: boolean): Buffer {
  const argsBuffer = FrameBuilder.buildChannelFlowOk(active);

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.CHANNEL,
    CHANNEL_METHOD.FLOW_OK,
    argsBuffer
  );
}
