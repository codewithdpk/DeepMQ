// Binding management

import { BindingDefinition, FieldTable } from '../protocol/types';

export class Binding implements BindingDefinition {
  readonly source: string;
  readonly destination: string;
  readonly routingKey: string;
  readonly arguments: FieldTable;
  readonly createdAt: number;

  constructor(
    source: string,
    destination: string,
    routingKey: string,
    args: FieldTable = {}
  ) {
    this.source = source;
    this.destination = destination;
    this.routingKey = routingKey;
    this.arguments = args;
    this.createdAt = Date.now();
  }

  // Generate a unique key for this binding
  get key(): string {
    return `${this.source}:${this.destination}:${this.routingKey}`;
  }

  // Check if this binding matches the given criteria
  matches(source: string, destination: string, routingKey: string): boolean {
    return this.source === source &&
           this.destination === destination &&
           this.routingKey === routingKey;
  }

  // Serialize for persistence
  toJSON(): object {
    return {
      source: this.source,
      destination: this.destination,
      routingKey: this.routingKey,
      arguments: this.arguments,
    };
  }

  // Deserialize from persistence
  static fromJSON(data: {
    source: string;
    destination: string;
    routingKey: string;
    arguments: FieldTable;
  }): Binding {
    return new Binding(data.source, data.destination, data.routingKey, data.arguments);
  }

  // Get binding info for status reporting
  getInfo(): object {
    return {
      source: this.source,
      destination: this.destination,
      routingKey: this.routingKey,
      arguments: this.arguments,
    };
  }
}

// Binding registry - manages all bindings
export class BindingRegistry {
  private bindings: Map<string, Binding> = new Map();
  private bySource: Map<string, Set<string>> = new Map();
  private byDestination: Map<string, Set<string>> = new Map();

  add(binding: Binding): void {
    const key = binding.key;

    // Don't add duplicate bindings
    if (this.bindings.has(key)) {
      return;
    }

    this.bindings.set(key, binding);

    // Index by source
    let sourceSet = this.bySource.get(binding.source);
    if (!sourceSet) {
      sourceSet = new Set();
      this.bySource.set(binding.source, sourceSet);
    }
    sourceSet.add(key);

    // Index by destination
    let destSet = this.byDestination.get(binding.destination);
    if (!destSet) {
      destSet = new Set();
      this.byDestination.set(binding.destination, destSet);
    }
    destSet.add(key);
  }

  remove(source: string, destination: string, routingKey: string): Binding | undefined {
    const key = `${source}:${destination}:${routingKey}`;
    const binding = this.bindings.get(key);

    if (binding) {
      this.bindings.delete(key);

      const sourceSet = this.bySource.get(source);
      if (sourceSet) {
        sourceSet.delete(key);
        if (sourceSet.size === 0) {
          this.bySource.delete(source);
        }
      }

      const destSet = this.byDestination.get(destination);
      if (destSet) {
        destSet.delete(key);
        if (destSet.size === 0) {
          this.byDestination.delete(destination);
        }
      }
    }

    return binding;
  }

  get(source: string, destination: string, routingKey: string): Binding | undefined {
    return this.bindings.get(`${source}:${destination}:${routingKey}`);
  }

  getBySource(source: string): Binding[] {
    const keys = this.bySource.get(source);
    if (!keys) {
      return [];
    }
    return Array.from(keys)
      .map(key => this.bindings.get(key))
      .filter((b): b is Binding => b !== undefined);
  }

  getByDestination(destination: string): Binding[] {
    const keys = this.byDestination.get(destination);
    if (!keys) {
      return [];
    }
    return Array.from(keys)
      .map(key => this.bindings.get(key))
      .filter((b): b is Binding => b !== undefined);
  }

  removeBySource(source: string): Binding[] {
    const bindings = this.getBySource(source);
    for (const binding of bindings) {
      this.remove(binding.source, binding.destination, binding.routingKey);
    }
    return bindings;
  }

  removeByDestination(destination: string): Binding[] {
    const bindings = this.getByDestination(destination);
    for (const binding of bindings) {
      this.remove(binding.source, binding.destination, binding.routingKey);
    }
    return bindings;
  }

  getAll(): Binding[] {
    return Array.from(this.bindings.values());
  }

  // Get all bindings as serializable array
  toJSON(): object[] {
    return this.getAll().map(b => b.toJSON());
  }

  clear(): void {
    this.bindings.clear();
    this.bySource.clear();
    this.byDestination.clear();
  }
}
