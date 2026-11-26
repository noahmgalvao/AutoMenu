import { writeFile } from 'node:fs/promises';
import { revisionDatabase } from '../tests/support/revisionDatabase';
import { RevisionCodec } from '../src/infrastructure/revisions/codec';
const db = await revisionDatabase();
try {
    const codec = new RevisionCodec();
    for (let i = 0; i < 100; i++) {
        const e = await codec.encode({ products: [{ id: 'p', name: `Produto ${i}`, price: i }], style: { title: 'Fixture' } });
        await db.query("insert into public.revision_blobs(id,namespace,provider_id,bucket,object_key,byte_length,checksum,status) values($1,'w','fixture','private',$1,$2,$3,'ready')", [`b${i}`, e.bytes.length, e.payloadHash]);
        await db.query("insert into public.revision_states(id,namespace,state_hash,schema_version,representation,chain_depth,codec,byte_length,raw_length,payload_hash,blob_id,chain_bytes) values($1,'w',$2,1,'snapshot',0,$3,$4,$5,$6,$7,$4)", [`s${i}`, e.stateHash, e.codec, e.bytes.length, e.rawLength, e.payloadHash, `b${i}`]);
        await db.query("insert into public.menu_revisions(id,menu_id,sequence,kind,state_hash,state_id,schema_version,idempotency_key) values($1,'m',$2,'fixture',$3,$4,1,$1)", [`r${i}`, i, e.stateHash, `s${i}`]);
    }
    const result = (await db.query<{
        r: any;
    }>('select public.revision_measure_database() r')).rows[0].r;
    const report = { source: 'Isolated PostgreSQL/PGlite fixture; 100 metadata entries. No production measurements.', ...result, unavailable: ['physicalDiskIncludingWal', 'SupabaseStorage', 'organizationEgress', 'providerLimits', 'CPUquota', 'productionIndices'] };
    await writeFile('docs/revisions/benchmark-postgres-fixture.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
finally {
    await db.close();
}
