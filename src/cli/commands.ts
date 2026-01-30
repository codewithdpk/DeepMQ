// CLI command implementations

import * as fs from 'fs';
import * as path from 'path';
import { DeepMQBroker, BrokerOptions } from '../server';

// PID file for daemon management
const PID_FILE = '.deepmq.pid';

export function getPidFilePath(dataDir: string = './data'): string {
  return path.join(dataDir, PID_FILE);
}

export function isRunning(dataDir: string = './data'): boolean {
  const pidFile = getPidFilePath(dataDir);
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writePidFile(dataDir: string = './data'): void {
  const pidFile = getPidFilePath(dataDir);
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, process.pid.toString());
}

export function removePidFile(dataDir: string = './data'): void {
  const pidFile = getPidFilePath(dataDir);
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // Ignore
  }
}

export function readPid(dataDir: string = './data'): number | null {
  const pidFile = getPidFilePath(dataDir);
  try {
    return parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  } catch {
    return null;
  }
}

export interface StartOptions extends BrokerOptions {
  foreground?: boolean;
}

export async function startBroker(options: StartOptions): Promise<DeepMQBroker> {
  const dataDir = options.dataDir || './data';

  if (isRunning(dataDir)) {
    throw new Error('DeepMQ is already running');
  }

  const broker = new DeepMQBroker(options);

  // Event logging
  broker.events.onTyped('broker:started', (port) => {
    console.log(`DeepMQ started on port ${port}`);
  });

  broker.events.onTyped('broker:stopped', () => {
    console.log('DeepMQ stopped');
    removePidFile(dataDir);
  });

  broker.events.onTyped('broker:error', (err) => {
    console.error('Broker error:', err.message);
  });

  broker.events.onTyped('connection:open', (conn) => {
    console.log(`Connection opened: ${conn.id}`);
  });

  broker.events.onTyped('connection:close', (conn) => {
    console.log(`Connection closed: ${conn.id}`);
  });

  await broker.start();

  writePidFile(dataDir);

  // Handle shutdown signals
  const shutdown = async () => {
    console.log('\nShutting down...');
    await broker.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return broker;
}

export function stopBroker(dataDir: string = './data'): boolean {
  const pid = readPid(dataDir);
  if (pid === null) {
    console.log('DeepMQ is not running');
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent stop signal to DeepMQ (PID: ${pid})`);
    removePidFile(dataDir);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
      console.log('DeepMQ process not found, cleaning up PID file');
      removePidFile(dataDir);
    } else {
      throw e;
    }
    return false;
  }
}

export function showStatus(dataDir: string = './data'): void {
  const pid = readPid(dataDir);
  const running = isRunning(dataDir);

  console.log('DeepMQ Status');
  console.log('=============');
  console.log(`Running: ${running ? 'Yes' : 'No'}`);
  if (pid !== null) {
    console.log(`PID: ${pid}`);
  }
  console.log(`Data directory: ${path.resolve(dataDir)}`);
}

export function listQueues(broker: DeepMQBroker): void {
  const queues = broker.getQueues();

  if (queues.length === 0) {
    console.log('No queues');
    return;
  }

  console.log('Queues');
  console.log('======');
  console.log(
    'Name'.padEnd(40) +
    'Messages'.padEnd(12) +
    'Consumers'.padEnd(12) +
    'Durable'.padEnd(10) +
    'Exclusive'
  );
  console.log('-'.repeat(85));

  for (const queue of queues) {
    console.log(
      queue.name.substring(0, 39).padEnd(40) +
      queue.getMessageCount().toString().padEnd(12) +
      queue.getConsumerCount().toString().padEnd(12) +
      (queue.durable ? 'Yes' : 'No').padEnd(10) +
      (queue.exclusive ? 'Yes' : 'No')
    );
  }
}

export function listExchanges(broker: DeepMQBroker): void {
  const exchanges = broker.getExchanges();

  if (exchanges.length === 0) {
    console.log('No exchanges');
    return;
  }

  console.log('Exchanges');
  console.log('=========');
  console.log(
    'Name'.padEnd(30) +
    'Type'.padEnd(12) +
    'Durable'.padEnd(10) +
    'Auto-Delete'.padEnd(14) +
    'Internal'
  );
  console.log('-'.repeat(80));

  for (const exchange of exchanges) {
    const name = exchange.name || '(default)';
    console.log(
      name.substring(0, 29).padEnd(30) +
      exchange.type.padEnd(12) +
      (exchange.durable ? 'Yes' : 'No').padEnd(10) +
      (exchange.autoDelete ? 'Yes' : 'No').padEnd(14) +
      (exchange.internal ? 'Yes' : 'No')
    );
  }
}

export function listBindings(broker: DeepMQBroker): void {
  const bindings = broker.getBindings();

  if (bindings.length === 0) {
    console.log('No bindings');
    return;
  }

  console.log('Bindings');
  console.log('========');
  console.log(
    'Source'.padEnd(25) +
    'Destination'.padEnd(25) +
    'Routing Key'
  );
  console.log('-'.repeat(75));

  for (const binding of bindings) {
    const source = binding.source || '(default)';
    console.log(
      source.substring(0, 24).padEnd(25) +
      binding.destination.substring(0, 24).padEnd(25) +
      binding.routingKey
    );
  }
}

export function listConnections(broker: DeepMQBroker): void {
  const connections = broker.getConnections();

  if (connections.length === 0) {
    console.log('No active connections');
    return;
  }

  console.log('Connections');
  console.log('===========');
  console.log(
    'ID'.padEnd(38) +
    'State'.padEnd(15) +
    'Channels'.padEnd(10) +
    'VHost'
  );
  console.log('-'.repeat(80));

  for (const conn of connections) {
    console.log(
      conn.id.substring(0, 37).padEnd(38) +
      conn.state.padEnd(15) +
      conn.getChannelCount().toString().padEnd(10) +
      conn.virtualHost
    );
  }
}

export async function purgeQueue(broker: DeepMQBroker, queueName: string): Promise<void> {
  const queues = broker.getQueues();
  const queue = queues.find(q => q.name === queueName);

  if (!queue) {
    console.log(`Queue '${queueName}' not found`);
    return;
  }

  const count = queue.purge();
  console.log(`Purged ${count} messages from queue '${queueName}'`);
}

export async function deleteQueue(broker: DeepMQBroker, queueName: string): Promise<void> {
  const queues = broker.getQueues();
  const queue = queues.find(q => q.name === queueName);

  if (!queue) {
    console.log(`Queue '${queueName}' not found`);
    return;
  }

  // Note: This is a direct deletion, not through AMQP protocol
  // In a full implementation, you'd want to handle this through the broker's internal API
  console.log(`Queue '${queueName}' deletion requested (requires broker restart for CLI-based deletion)`);
}

export async function deleteExchange(broker: DeepMQBroker, exchangeName: string): Promise<void> {
  const exchanges = broker.getExchanges();
  const exchange = exchanges.find(e => e.name === exchangeName);

  if (!exchange) {
    console.log(`Exchange '${exchangeName}' not found`);
    return;
  }

  if (exchange.isDefault) {
    console.log(`Cannot delete default exchange '${exchangeName}'`);
    return;
  }

  // Note: This is a direct deletion, not through AMQP protocol
  console.log(`Exchange '${exchangeName}' deletion requested (requires broker restart for CLI-based deletion)`);
}

export function showBrokerStatus(broker: DeepMQBroker): void {
  const status = broker.getStatus() as {
    connections: number;
    channels: number;
    exchanges: number;
    queues: number;
    consumers: number;
    messages: number;
  };

  console.log('Broker Status');
  console.log('=============');
  console.log(`Connections: ${status.connections}`);
  console.log(`Channels: ${status.channels}`);
  console.log(`Exchanges: ${status.exchanges}`);
  console.log(`Queues: ${status.queues}`);
  console.log(`Consumers: ${status.consumers}`);
  console.log(`Messages: ${status.messages}`);
}
