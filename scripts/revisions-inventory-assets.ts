import { configuredRevisionService } from '../src/infrastructure/revisions/http';
if (!process.argv.includes('--execute'))
    console.log(JSON.stringify({ dryRun: true, tables: ['menu_versions', 'menu_publications', 'template_versions', 'catalog_products', 'ai_import_jobs'], note: 'Non-destructive reference ledger backfill; does not enable GC or delete objects.' }));
else {
    const { repo } = configuredRevisionService();
    for (const table of ['menu_versions', 'menu_publications', 'template_versions', 'catalog_products', 'ai_import_jobs']) {
        let cursor = '', count = 0;
        while (true) {
            const batch = await repo.rpc('revision_inventory_refs', { p_table: table, p_cursor: cursor, p_limit: 100 });
            count += batch.count;
            if (batch.count < 100)
                break;
            cursor = batch.cursor;
        }
        console.log(JSON.stringify({ table, rows: count }));
    }
}
