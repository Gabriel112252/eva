/** Emissor de eventos tipado e minimalista (sem dependências). */
export type Listener<T> = (payload: T) => void;

export class TypedEvent<T = void> {
  private listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  once(listener: Listener<T>): () => void {
    const off = this.on((payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  emit(payload: T): void {
    for (const l of [...this.listeners]) l(payload);
  }

  clear(): void {
    this.listeners.clear();
  }

  get count(): number {
    return this.listeners.size;
  }
}
