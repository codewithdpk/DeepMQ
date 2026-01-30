// Connection state management

import { Socket } from 'net';
import { EventEmitter } from 'events';
import { ConnectionState, FieldTable } from '../protocol/types';
import { Channel } from './channel';
import {
  DEFAULT_CHANNEL_MAX,
  DEFAULT_FRAME_MAX,
  DEFAULT_HEARTBEAT,
} from '../protocol/constants';

export interface ConnectionOptions {
  channelMax?: number;
  frameMax?: number;
  heartbeat?: number;
}

export class Connection extends EventEmitter {
  readonly id: string;
  readonly socket: Socket;

  private _state: ConnectionState = 'awaiting_header';
  private channels: Map<number, Channel> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = Date.now();

  // Negotiated parameters
  channelMax: number = DEFAULT_CHANNEL_MAX;
  frameMax: number = DEFAULT_FRAME_MAX;
  heartbeat: number = DEFAULT_HEARTBEAT;

  // Client info
  clientProperties: FieldTable = {};
  virtualHost: string = '/';

  constructor(socket: Socket, id: string) {
    super();
    this.socket = socket;
    this.id = id;
  }

  get state(): ConnectionState {
    return this._state;
  }

  setState(state: ConnectionState): void {
    const oldState = this._state;
    this._state = state;
    this.emit('stateChange', oldState, state);
  }

  // Channel management
  createChannel(channelNumber: number): Channel {
    if (this.channels.has(channelNumber)) {
      throw new Error(`Channel ${channelNumber} already exists`);
    }
    if (channelNumber > this.channelMax) {
      throw new Error(`Channel number ${channelNumber} exceeds maximum ${this.channelMax}`);
    }

    const channel = new Channel(channelNumber, this);
    this.channels.set(channelNumber, channel);

    channel.on('close', () => {
      this.channels.delete(channelNumber);
    });

    return channel;
  }

  getChannel(channelNumber: number): Channel | undefined {
    return this.channels.get(channelNumber);
  }

  hasChannel(channelNumber: number): boolean {
    return this.channels.has(channelNumber);
  }

  closeChannel(channelNumber: number): void {
    const channel = this.channels.get(channelNumber);
    if (channel) {
      channel.close();
      this.channels.delete(channelNumber);
    }
  }

  getChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  getChannelCount(): number {
    return this.channels.size;
  }

  // Heartbeat management
  startHeartbeat(): void {
    if (this.heartbeat === 0) {
      return;
    }

    this.lastHeartbeat = Date.now();

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastHeartbeat) / 1000;

      // If no heartbeat received in 2x the interval, consider connection dead
      if (elapsed > this.heartbeat * 2) {
        this.emit('heartbeatTimeout');
        this.close();
      }
    }, this.heartbeat * 1000);
  }

  resetHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Send data to client
  send(data: Buffer): boolean {
    if (this.socket.destroyed || this._state === 'closed') {
      return false;
    }

    try {
      this.socket.write(data);
      return true;
    } catch {
      return false;
    }
  }

  // Close connection
  close(): void {
    if (this._state === 'closed') {
      return;
    }

    this.stopHeartbeat();

    // Close all channels
    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();

    this.setState('closed');

    if (!this.socket.destroyed) {
      this.socket.end();
    }

    this.emit('close');
  }

  // Force close without graceful shutdown
  destroy(): void {
    this.stopHeartbeat();

    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();

    this.setState('closed');

    if (!this.socket.destroyed) {
      this.socket.destroy();
    }

    this.emit('close');
  }

  // Get connection info for status reporting
  getInfo(): object {
    return {
      id: this.id,
      state: this._state,
      channelCount: this.channels.size,
      virtualHost: this.virtualHost,
      clientProperties: this.clientProperties,
      frameMax: this.frameMax,
      heartbeat: this.heartbeat,
      remoteAddress: this.socket.remoteAddress,
      remotePort: this.socket.remotePort,
    };
  }
}
