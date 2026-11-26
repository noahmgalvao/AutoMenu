import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuredRevisionService } from '../src/infrastructure/revisions/http';
import { resultOf } from '../src/infrastructure/revisions/repository';
import { reconcileManifest, copyAndVerify, cutoverVerified, rollbackMigration } from '../src/application/revisions/providerMigration';
import type { BlobStore } from '../src/application/revisions/contracts';
import type { MigrationManifest } from '../src/application/revisions/providerMigration';
const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];
if (!process.argv.includes('--manifest'))
    throw new Error('Informe --manifest arquivo.json; padrão dry-run, sem copiar nem alterar locators.');
const targetId = arg('--target');
if (!targetId)
    throw new Error('Informe --target provider_id. Nenhuma conta/credencial é criada.');
let previous: MigrationManifest | undefined;
try {
    previous = JSON.parse(await readFile(arg('--manifest'), 'utf8'));
}
catch (error) {
    if ((error as {
        code?: string;
    }).code !== 'ENOENT')
        throw error;
}
const sourceId = previous?.sourceProvider || (process.argv.includes('--source') ? arg('--source') : process.env.REVISION_BLOB_PROVIDER) || 'supabase-v1';
const service=configuredRevisionService([],sourceId),repo=service.repo;
const locators = [];
let cursor = '';
while (true) {
    const rows = await resultOf(repo.db.from('revision_blobs').select('*').eq('status', 'ready').eq('provider_id', sourceId).gt('id', cursor).order('id').limit(100));
    locators.push(...rows);
    if (rows.length < 100)
        break;
    cursor = rows[rows.length - 1].id;
}
const manifest = reconcileManifest(previous, locators, sourceId, targetId);
const checkpoint = async (m: MigrationManifest) => { const path = arg('--manifest'), temporary = `${path}.${crypto.randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(m, null, 2), { mode: 0o600, flag: 'wx' }); await rename(temporary, path); };
await checkpoint(manifest);
console.log(JSON.stringify({ dryRun: !process.argv.includes('--execute'), objects: manifest.entries.length, bytes: manifest.totalBytes, sourceProvider: sourceId, targetProvider: targetId, checksRequired: ['target capacity', 'transfer budget', 'database backup', 'rollback window'] }));
if (process.argv.includes('--execute')) {
    const rollback = process.argv.includes('--rollback');
    if (rollback && !process.argv.includes('--authorized-cutover'))
        throw new Error('Rollback exige --authorized-cutover.');
    if (!rollback && (!process.argv.includes('--authorized-copy') || !process.argv.includes('--adapter-module')))
        throw new Error('Cópia requer --authorized-copy e --adapter-module local autorizado. Nenhum byte foi transferido.');
    let target: BlobStore | undefined;
    if (!rollback) {
        const module = await import(pathToFileURL(resolve(arg('--adapter-module'))).href);
        target = await module.createBlobStore() as BlobStore;
        if (target.providerId !== targetId)
            throw new Error('Adapter divergente.');
    }
    const repository = {
        recordAlternative: async (source: any, destination: any) => { await resultOf(repo.db.from('revision_blob_locations').upsert({ blob_id: source.id, ...Object.fromEntries(Object.entries(destination).filter(([k]) => ['provider_id', 'bucket', 'object_key', 'byte_length', 'checksum', 'generation'].includes(k))), verified_at: new Date().toISOString() }, { onConflict: 'blob_id,provider_id,object_key' })); },
        cutover: async (source: any, destination: any) => {
            await resultOf(repo.db.from('revision_blob_locations').upsert({ blob_id: source.id, provider_id: source.provider_id, bucket: source.bucket, object_key: source.object_key, byte_length: source.byte_length, checksum: source.checksum, generation: source.generation, verified_at: new Date().toISOString() }, { onConflict: 'blob_id,provider_id,object_key' }));
            const data = await resultOf(repo.db.from('revision_blobs').update({ provider_id: destination.provider_id, bucket: destination.bucket, object_key: destination.object_key, generation: source.generation + 1 }).eq('id', source.id).eq('generation', source.generation).eq('provider_id', source.provider_id).eq('status', 'ready').select('id'));
            if (data.length === 1)
                return true;
            const current = await resultOf(repo.db.from('revision_blobs').select('*').eq('id', source.id).single());
            return current.provider_id === destination.provider_id && current.object_key === destination.object_key && current.checksum === destination.checksum && current.generation >= source.generation + 1;
        },
    };
    if (rollback) {
        for (const entry of manifest.entries)
            await repo.stores.get(sourceId).head(entry.locator);
        console.log(await rollbackMigration(manifest, repository));
    }
    else {
        await copyAndVerify(manifest, repo.stores.get(sourceId), target!, repository, checkpoint);
        if (process.argv.includes('--authorized-cutover'))
            console.log(await cutoverVerified(manifest, repository));
    }
    // No object removal. Source deletion requires a separate authorized maintenance procedure.
}
