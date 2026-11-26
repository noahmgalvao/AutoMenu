export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export type RevisionFilter = 'all' | 'protected' | 'important';
export interface RevisionMetadata {
    id: string;
    menu_id: string;
    sequence: number;
    created_at: string;
    actor_id: string | null;
    kind: string;
    priority: number;
    event_tags: string[];
    name: string | null;
    protection: 'original' | 'user' | null;
    state_hash: string;
    state_id: string;
    schema_version: number;
    source_revision_id: string | null;
}
export interface HistoryStatus {
    migrating?: boolean;
    automatic: number;
    protected: number;
    original: number;
    nextManual: number;
    maxAutomatic: number;
    maxProtected: number;
    compacted: number;
    pausedReason: string | null;
    unavailableMetrics: string[];
}
export interface RevisionPage {
    items: RevisionMetadata[];
    nextCursor: number | null;
    status: HistoryStatus;
}
export interface BlobLocator {
    id: string;
    namespace: string;
    provider_id: string;
    bucket: string;
    object_key: string;
    byte_length: number;
    checksum: string;
    generation: number;
}
export interface StoredState {
    id: string;
    namespace: string;
    state_hash: string;
    schema_version: number;
    representation: 'snapshot' | 'delta';
    base_state_id: string | null;
    chain_depth: number;
    codec: 'gzip-v1' | 'raw-v1';
    patch_version: number;
    byte_length: number;
    raw_length: number;
    payload_hash: string;
    blob_id: string;
    chain_bytes: number;
}
