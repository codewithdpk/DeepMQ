#!/usr/bin/env node

// DeepMQ CLI

import {
  startBroker,
  stopBroker,
  showStatus,
  listQueues,
  listExchanges,
  listBindings,
  listConnections,
  showBrokerStatus,
  purgeQueue,
} from './commands';
import { DEFAULT_PORT } from '../protocol/constants';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log(`
DeepMQ - Minimal AMQP 0-9-1 Message Broker

Usage: deepmq <command> [options]

Commands:
  start                    Start the broker
    --port <port>          Port to listen on (default: ${DEFAULT_PORT})
    --host <host>          Host to bind to (default: 0.0.0.0)
    --data-dir <dir>       Data directory (default: ./data)

  stop                     Stop the broker
  status                   Show broker status

  list queues              List all queues
  list exchanges           List all exchanges
  list bindings            List all bindings
  list connections         List active connections

  purge <queue>            Purge messages from queue

Options:
  --help                   Show this help message
  --version                Show version

Examples:
  deepmq start
  deepmq start --port 5673
  deepmq status
  deepmq list queues
  deepmq stop
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2).replace(/-/g, '_');
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      i += 1;
    }
  }

  return result;
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log('DeepMQ v1.0.0');
    process.exit(0);
  }

  const options = parseArgs(args.slice(1));

  try {
    switch (command) {
      case 'start': {
        const port = options.port ? parseInt(options.port as string, 10) : DEFAULT_PORT;
        const host = (options.host as string) || '0.0.0.0';
        const dataDir = (options.data_dir as string) || './data';

        const broker = await startBroker({
          port,
          host,
          dataDir,
          foreground: true,
        });

        // Keep the process running
        console.log('Press Ctrl+C to stop the broker');

        // Interactive mode - allow listing while running
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.on('data', async (data) => {
            const key = data.toString();
            if (key === '\u0003') { // Ctrl+C
              await broker.stop();
              process.exit(0);
            } else if (key === 's' || key === 'S') {
              showBrokerStatus(broker);
            } else if (key === 'q' || key === 'Q') {
              listQueues(broker);
            } else if (key === 'e' || key === 'E') {
              listExchanges(broker);
            } else if (key === 'b' || key === 'B') {
              listBindings(broker);
            } else if (key === 'c' || key === 'C') {
              listConnections(broker);
            } else if (key === 'h' || key === 'H' || key === '?') {
              console.log('\nInteractive commands:');
              console.log('  s - Show broker status');
              console.log('  q - List queues');
              console.log('  e - List exchanges');
              console.log('  b - List bindings');
              console.log('  c - List connections');
              console.log('  h - Show this help');
              console.log('  Ctrl+C - Stop broker\n');
            }
          });
        }
        break;
      }

      case 'stop': {
        const dataDir = (options.data_dir as string) || './data';
        stopBroker(dataDir);
        break;
      }

      case 'status': {
        const dataDir = (options.data_dir as string) || './data';
        showStatus(dataDir);
        break;
      }

      case 'list': {
        const subCommand = args[1];
        if (!subCommand) {
          console.log('Usage: deepmq list <queues|exchanges|bindings|connections>');
          process.exit(1);
        }

        // For list commands, we need a running broker
        // In a production system, this would connect to the broker via a management API
        console.log('Note: List commands require the broker to be started with "deepmq start"');
        console.log('Use the interactive mode (press the corresponding key while broker is running):');
        console.log('  s - status, q - queues, e - exchanges, b - bindings, c - connections');
        break;
      }

      case 'purge': {
        const queueName = args[1];
        if (!queueName) {
          console.log('Usage: deepmq purge <queue-name>');
          process.exit(1);
        }
        console.log('Note: Purge requires connecting to the running broker');
        console.log('This feature will be available in a future version with management API');
        break;
      }

      case 'delete': {
        const entityType = args[1];
        const entityName = args[2];
        if (!entityType || !entityName) {
          console.log('Usage: deepmq delete <queue|exchange> <name>');
          process.exit(1);
        }
        console.log('Note: Delete requires connecting to the running broker');
        console.log('This feature will be available in a future version with management API');
        break;
      }

      default:
        console.log(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
