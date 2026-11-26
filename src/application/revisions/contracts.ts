import type { BlobLocator, Json, RevisionFilter, RevisionMetadata, RevisionPage } from '../../domain/revisions/model';
export interface BlobStore {
    readonly providerId: string;
    /** Deterministic location journaled before upload, so a failed upload/commit remains recoverable. */
    planImmutable(namespace: string, key: string, byteLength: number, checksum: string): BlobLocator;
    putImmutable(namespace: string, key: string, bytes: Uint8Array, checksum: string): Promise<BlobLocator>;
    get(locator: BlobLocator): Promise<Uint8Array>;
    head(locator: BlobLocator): Promise<{
        size: number;
        checksum: string;
        available: boolean;
    }>;
    remove(locator: BlobLocator, expectedGeneration: number): Promise<void>;
    createReadAccess(locator: BlobLocator, ttl: number, authorized: {
        namespace: string;
    }): Promise<string | Uint8Array>;
}
export interface RevisionGateway {
    page(input: {
        menuId: string;
        cursor?: number | null;
        filter: RevisionFilter;
        since?: string;
        until?: string;
        signal?: AbortSignal;
    }): Promise<RevisionPage>;
    load(input: {
        menuId: string;
        revisionId: string;
        workspaceId?: string;
        signal?: AbortSignal;
    }): Promise<Json>;
    manual(input: {
        menuId: string;
        name: string;
        defaultName: boolean;
        expectedWrite: number;
        operationId: string;
    }): Promise<RevisionMetadata>;
    protect(input: {
        menuId: string;
        revisionId: string;
        name?: string;
        protect: boolean;
        confirmed?: boolean;
        operationId: string;
    }): Promise<RevisionMetadata>;
    restore(input: {
        menuId: string;
        revisionId: string;
        expectedWrite: number;
        operationId: string;
    }): Promise<void>;
    copy(input: {
        menuId: string;
        revisionId: string;
        operationId: string;
    }): Promise<{
        menuId: string;
    }>;
    beforeOperation(menuId: string): Promise<void>;
    currentWrite(menuId: string): Promise<number>;
    finalize(menuId: string): Promise<void>;
}
