// Exchange implementation

import { ExchangeDefinition, FieldTable } from '../protocol/types';

export type ExchangeType = 'direct' | 'fanout' | 'topic' | 'headers';

export class Exchange implements ExchangeDefinition {
  readonly name: string;
  readonly type: ExchangeType;
  readonly durable: boolean;
  readonly autoDelete: boolean;
  readonly internal: boolean;
  readonly arguments: FieldTable;
  readonly createdAt: number;

  // Track if this is a default exchange
  readonly isDefault: boolean;

  constructor(
    name: string,
    type: ExchangeType,
    options: {
      durable?: boolean;
      autoDelete?: boolean;
      internal?: boolean;
      arguments?: FieldTable;
      isDefault?: boolean;
    } = {}
  ) {
    this.name = name;
    this.type = type;
    this.durable = options.durable ?? false;
    this.autoDelete = options.autoDelete ?? false;
    this.internal = options.internal ?? false;
    this.arguments = options.arguments ?? {};
    this.isDefault = options.isDefault ?? false;
    this.createdAt = Date.now();
  }

  // Check if exchange definition matches (for passive declare)
  matches(other: Partial<ExchangeDefinition>): boolean {
    if (other.type !== undefined && other.type !== this.type) {
      return false;
    }
    if (other.durable !== undefined && other.durable !== this.durable) {
      return false;
    }
    if (other.autoDelete !== undefined && other.autoDelete !== this.autoDelete) {
      return false;
    }
    if (other.internal !== undefined && other.internal !== this.internal) {
      return false;
    }
    return true;
  }

  // Serialize for persistence
  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      durable: this.durable,
      autoDelete: this.autoDelete,
      internal: this.internal,
      arguments: this.arguments,
    };
  }

  // Deserialize from persistence
  static fromJSON(data: {
    name: string;
    type: ExchangeType;
    durable: boolean;
    autoDelete: boolean;
    internal: boolean;
    arguments: FieldTable;
  }): Exchange {
    return new Exchange(data.name, data.type, {
      durable: data.durable,
      autoDelete: data.autoDelete,
      internal: data.internal,
      arguments: data.arguments,
    });
  }

  // Get exchange info for status reporting
  getInfo(): object {
    return {
      name: this.name,
      type: this.type,
      durable: this.durable,
      autoDelete: this.autoDelete,
      internal: this.internal,
      isDefault: this.isDefault,
      arguments: this.arguments,
    };
  }
}
