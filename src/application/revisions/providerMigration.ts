import type { BlobStore } from './contracts';
import type { BlobLocator } from '../../domain/revisions/model';
export interface MigrationEntry {
    locator: BlobLocator;
    copied?: BlobLocator;
    verified?: boolean;
}
export interface MigrationManifest {
    version: 1;
    createdAt: string;
    sourceProvider: string;
    targetProvider: string;
    entries: MigrationEntry[];
    totalBytes: number;
}
export interface LocatorRepository {
    /** Record a second location without changing the active locator. Must be idempotent. */
    recordAlternative(source: BlobLocator, target: BlobLocator): Promise<void>;
    /** CAS on logical id AND generation; retain old location for rollback. */
    cutover(source: BlobLocator, target: BlobLocator): Promise<boolean>;
}
export function migrationManifest(locators: BlobLocator[], sourceProvider: string, targetProvider: string): MigrationManifest {
    return { version: 1, createdAt: new Date().toISOString(), sourceProvider, targetProvider, entries: locators.filter(l => l.provider_id === sourceProvider).map(locator => ({ locator })), totalBytes: locators.filter(l => l.provider_id === sourceProvider).reduce((n, l) => n + l.byte_length, 0) };
}
export async function copyAndVerify(manifest: MigrationManifest, source: BlobStore, target: BlobStore, repository: LocatorRepository, onCheckpoint: (manifest: MigrationManifest) => Promise<void>) {
    if (source.providerId !== manifest.sourceProvider || target.providerId !== manifest.targetProvider)
        throw new Error('Provedor do manifesto divergente.');
    for (const entry of manifest.entries) {
        if (entry.verified && entry.copied) {
            const head = await target.head(entry.copied);
            if (head.available && head.checksum === entry.locator.checksum && head.size === entry.locator.byte_length) {
                await repository.recordAlternative(entry.locator, entry.copied);
                continue;
            }
        }
        const bytes = await source.get(entry.locator);
        const copied = await target.putImmutable(entry.locator.namespace, entry.locator.checksum, bytes, entry.locator.checksum);
        const verified = await target.head(copied);
        if (!verified.available || verified.size !== entry.locator.byte_length || verified.checksum !== entry.locator.checksum)
            throw new Error('Verificação do destino falhou. Origem preservada.');
        entry.copied = { ...copied, id: entry.locator.id };
        entry.verified = true;
        await repository.recordAlternative(entry.locator, entry.copied);
        await onCheckpoint(manifest);
    }
    return manifest;
}
export async function cutoverVerified(manifest: MigrationManifest, repository: LocatorRepository) {
    const conflicts: string[] = [];
    for (const entry of manifest.entries) {
        if (!entry.verified || !entry.copied)
            throw new Error('Cópia não verificada.');
        if (!await repository.cutover(entry.locator, entry.copied))
            conflicts.push(entry.locator.id);
    }
    return { conflicts };
}
/** Explicit rollback is also CAS. There is deliberately no source-deletion operation here. */
export async function rollbackMigration(manifest: MigrationManifest, repository: LocatorRepository) {
    const conflicts: string[] = [];
    for (const entry of manifest.entries) {
        if (!entry.copied)
            continue;
        const active = { ...entry.copied, id: entry.locator.id, generation: entry.locator.generation + 1 };
        if (!await repository.cutover(active, entry.locator))
            conflicts.push(entry.locator.id);
    }
    return { conflicts };
}
/** A reconciliation never loses already copied entries after primary locators have moved. */
export function reconcileManifest(previous: MigrationManifest | undefined, locators: BlobLocator[], sourceProvider: string, targetProvider: string): MigrationManifest {
    if (previous && (previous.version !== 1 || previous.sourceProvider !== sourceProvider || previous.targetProvider !== targetProvider))
        throw new Error('Manifesto pertence a outra migração; use um arquivo novo.');
    const manifest = previous ? { ...previous, entries: previous.entries.map(entry => ({ ...entry })) } : migrationManifest([], sourceProvider, targetProvider);
    const byId = new Map(manifest.entries.map(entry => [entry.locator.id, entry]));
    for (const locator of locators.filter(l => l.provider_id === sourceProvider)) {
        const existing = byId.get(locator.id);
        if (existing && (existing.locator.checksum !== locator.checksum || existing.locator.byte_length !== locator.byte_length || existing.locator.namespace !== locator.namespace))
            throw new Error('Identidade imutável divergente durante reconciliação.');
        if (!existing)
            byId.set(locator.id, { locator });
    }
    manifest.entries = [...byId.values()].sort((a, b) => a.locator.id.localeCompare(b.locator.id));
    manifest.totalBytes = manifest.entries.reduce((n, e) => n + e.locator.byte_length, 0);
    return manifest;
}
