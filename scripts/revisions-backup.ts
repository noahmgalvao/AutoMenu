import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, rm, stat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { configuredRevisionService } from '../src/infrastructure/revisions/http';
import { resultOf } from '../src/infrastructure/revisions/repository';
import { sha256 } from '../src/infrastructure/revisions/codec';
const run = (command: string, args: string[], env = process.env) => new Promise<void>((ok, fail) => { const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] }); child.stderr.resume(); child.on('error', () => fail(new Error(`${command} não disponível`))); child.on('close', code => code === 0 ? ok() : fail(new Error(`${command} falhou; verifique configuração sem registrar credenciais.`))); });
if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ dryRun: true, steps: ['export PostgreSQL including metadata/auth/storage metadata', 'copy every bucket object including original assets and published files', 'manifest with SHA-256 and byte lengths', 'encrypt archive with age recipient', 'verify isolated database and object restore'], requires: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_RECIPIENT', 'BACKUP_DIRECTORY', 'explicit authorized destination'] }));
}
else {
    if (!process.argv.includes('--authorized-destination'))
        throw new Error('Destino externo precisa ser autorizado explicitamente.');
    const directory = process.env.BACKUP_DIRECTORY, recipient = process.env.BACKUP_RECIPIENT, connection = process.env.DATABASE_URL;
    if (!directory || !recipient || !connection)
        throw new Error('Configuração de backup incompleta.');
    const temp = await mkdtemp(join(tmpdir(), 'automenu-backup-')), files: {
        path: string;
        bytes: number;
        sha256: string;
    }[] = [];
    try {
        const url = new URL(connection), env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'require' };
        // Database snapshot establishes references. GC must be paused for the entire backup window.
        const { repo } = configuredRevisionService();
        await resultOf(repo.db.from('revision_leases').insert({ id: `backup:${Date.now()}`, expires_at: new Date(Date.now() + 86400000).toISOString() }));
        await run('pg_dump', ['--format=custom', '--file', join(temp, 'database.dump')], env);
        const databasePath = join(temp, 'database.dump'), databaseHash = createHash('sha256');
        for await (const chunk of createReadStream(databasePath))
            databaseHash.update(chunk);
        files.push({ path: 'database.dump', bytes: (await stat(databasePath)).size, sha256: databaseHash.digest('hex') });
        await mkdir(join(temp, 'objects'), { recursive: true, mode: 0o700 });
        const buckets = await resultOf(repo.db.storage.listBuckets());
        for (const bucket of buckets) {
            const queue = [''];
            for (let index = 0; index < queue.length; index++) {
                const prefix = queue[index];
                let offset = 0;
                while (true) {
                    const objects = await resultOf(repo.db.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }));
                    for (const object of objects) {
                        const key = prefix ? `${prefix}/${object.name}` : object.name;
                        if (!object.id) {
                            queue.push(key);
                            continue;
                        }
                        const blob = await resultOf(repo.db.storage.from(bucket.id).download(key));
                        const bytes = new Uint8Array(await blob.arrayBuffer());
                        const safe = sha256(`${bucket.id}:${key}`), path = `objects/${safe}`;
                        await mkdir(join(temp, 'objects'), { recursive: true, mode: 0o700 });
                        await writeFile(join(temp, path), bytes, { mode: 0o600 });
                        files.push({ path, bytes: bytes.length, sha256: sha256(bytes), ...{ bucket: bucket.id, key } });
                    }
                    if (objects.length < 100)
                        break;
                    offset += 100;
                }
            }
        }
        await writeFile(join(temp, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files, notes: ['Restore database and all object bytes; database backup alone does not include Storage contents.', 'Source writes during backup require immutable objects; verify full reference closure before accepting the backup.'] }, null, 2), { mode: 0o600 });
        await run('tar', ['-cf', join(temp, 'backup.tar'), '-C', temp, 'database.dump', 'manifest.json', 'objects']);
        await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
        const output = join(resolve(directory), `automenu-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.age`);
        await run('age', ['-r', recipient, '-o', `${output}.partial`, join(temp, 'backup.tar')]);
        await rename(`${output}.partial`, output);
        console.log(JSON.stringify({ encryptedBackup: output, objects: files.length - 1, verifiedRestore: false }));
    }
    finally {
        await rm(temp, { recursive: true, force: true });
    }
}
