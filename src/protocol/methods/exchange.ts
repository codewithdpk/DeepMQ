// Exchange method handlers

import { FrameParser } from '../frame-parser';
import { FrameBuilder } from '../frame-builder';
import { ExchangeDeclareArgs, ExchangeDeleteArgs } from '../types';
import { CLASS_ID, EXCHANGE_METHOD } from '../constants';

// Parse Exchange.Declare arguments
export function parseExchangeDeclare(args: Buffer): ExchangeDeclareArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: exchange, bytesRead: exchBytes } = FrameParser.readShortString(args, offset);
  offset += exchBytes;

  const { value: type, bytesRead: typeBytes } = FrameParser.readShortString(args, offset);
  offset += typeBytes;

  const flags = args.readUInt8(offset);
  offset += 1;

  const passive = (flags & 0x01) !== 0;
  const durable = (flags & 0x02) !== 0;
  const autoDelete = (flags & 0x04) !== 0;
  const internal = (flags & 0x08) !== 0;
  const noWait = (flags & 0x10) !== 0;

  const { value: arguments_ } = FrameParser.readFieldTable(args, offset);

  return {
    reserved1,
    exchange,
    type: type || 'direct',
    passive,
    durable,
    autoDelete,
    internal,
    noWait,
    arguments: arguments_,
  };
}

// Parse Exchange.Delete arguments
export function parseExchangeDelete(args: Buffer): ExchangeDeleteArgs {
  let offset = 0;

  const reserved1 = args.readUInt16BE(offset);
  offset += 2;

  const { value: exchange, bytesRead: exchBytes } = FrameParser.readShortString(args, offset);
  offset += exchBytes;

  const flags = args.readUInt8(offset);

  const ifUnused = (flags & 0x01) !== 0;
  const noWait = (flags & 0x02) !== 0;

  return {
    reserved1,
    exchange,
    ifUnused,
    noWait,
  };
}

// Build Exchange.Declare-Ok frame
export function buildExchangeDeclareOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildExchangeDeclareOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.EXCHANGE,
    EXCHANGE_METHOD.DECLARE_OK,
    argsBuffer
  );
}

// Build Exchange.Delete-Ok frame
export function buildExchangeDeleteOkFrame(channel: number): Buffer {
  const argsBuffer = FrameBuilder.buildExchangeDeleteOk();

  return FrameBuilder.buildMethodFrame(
    channel,
    CLASS_ID.EXCHANGE,
    EXCHANGE_METHOD.DELETE_OK,
    argsBuffer
  );
}
