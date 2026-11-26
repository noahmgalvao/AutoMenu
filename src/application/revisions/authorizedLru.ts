/** Account-scoped, bounded transient state cache; never an authoritative store. */
export class AuthorizedLru<T> {
    private items = new Map<string, {
        value: T;
        bytes: number;
        expiresAt: number;
    }>();
    private bytes = 0;
    constructor(readonly namespace: string, readonly maxBytes = 4 * 1024 * 1024, readonly maxEntries = 4, readonly ttlMs = 240000) { }
    get(namespace: string, key: string) {
        if (namespace !== this.namespace)
            throw new Error('Cache não autorizado.');
        const entry = this.items.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.items.delete(key);
            this.bytes -= entry.bytes;
            return undefined;
        }
        this.items.delete(key);
        this.items.set(key, entry);
        return entry.value;
    }
    set(namespace: string, key: string, value: T, bytes: number) {
        if (namespace !== this.namespace)
            throw new Error('Cache não autorizado.');
        if (bytes < 0 || !Number.isFinite(bytes))
            throw new Error('Tamanho inválido.');
        const old = this.items.get(key);
        if (old) {
            this.bytes -= old.bytes;
            this.items.delete(key);
        }
        if (bytes > this.maxBytes)
            return;
        this.items.set(key, { value, bytes, expiresAt: Date.now() + this.ttlMs });
        this.bytes += bytes;
        while (this.bytes > this.maxBytes || this.items.size > this.maxEntries) {
            const id = this.items.keys().next().value!;
            this.bytes -= this.items.get(id)!.bytes;
            this.items.delete(id);
        }
    }
    clear() { this.items.clear(); this.bytes = 0; }
    get size() { return this.bytes; }
}
