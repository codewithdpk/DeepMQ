// Message structure

import { randomUUID } from 'crypto';
import { Message, MessageProperties } from '../protocol/types';

export function createMessage(
  exchange: string,
  routingKey: string,
  content: Buffer,
  properties: MessageProperties = {},
  options: {
    mandatory?: boolean;
    immediate?: boolean;
  } = {}
): Message {
  return {
    id: properties.messageId || randomUUID(),
    exchange,
    routingKey,
    mandatory: options.mandatory ?? false,
    immediate: options.immediate ?? false,
    properties: {
      ...properties,
      timestamp: properties.timestamp ?? Math.floor(Date.now() / 1000),
    },
    content,
    timestamp: Date.now(),
  };
}

// Serialize message for persistence
export function serializeMessage(message: Message): Buffer {
  const json = JSON.stringify({
    id: message.id,
    exchange: message.exchange,
    routingKey: message.routingKey,
    mandatory: message.mandatory,
    immediate: message.immediate,
    properties: message.properties,
    content: message.content.toString('base64'),
    timestamp: message.timestamp,
  });
  return Buffer.from(json, 'utf8');
}

// Deserialize message from persistence
export function deserializeMessage(data: Buffer): Message {
  const json = JSON.parse(data.toString('utf8'));
  return {
    id: json.id,
    exchange: json.exchange,
    routingKey: json.routingKey,
    mandatory: json.mandatory,
    immediate: json.immediate,
    properties: json.properties,
    content: Buffer.from(json.content, 'base64'),
    timestamp: json.timestamp,
  };
}

// Check if message has expired
export function isMessageExpired(message: Message): boolean {
  if (!message.properties.expiration) {
    return false;
  }

  const ttl = parseInt(message.properties.expiration, 10);
  if (isNaN(ttl)) {
    return false;
  }

  const expiresAt = message.timestamp + ttl;
  return Date.now() > expiresAt;
}

// Get message size in bytes
export function getMessageSize(message: Message): number {
  return message.content.length;
}
