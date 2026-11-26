import { configuredRevisionService } from '../src/infrastructure/revisions/http';
import { resultOf } from '../src/infrastructure/revisions/repository';
if (!process.argv.includes('--execute'))
    console.log(JSON.stringify({ dryRun: true, action: 'Queue existing menus for verified, bounded legacy backfill; requires the central worker. No source data removed.' }));
else {
    const { repo } = configuredRevisionService();
    let cursor = '', queued = 0;
    while (true) {
        const menus = await resultOf(repo.db.from('menus').select('id').not('current_draft_version_id', 'is', null).gt('id', cursor).order('id').limit(100));
        if (!menus.length)
            break;
        await resultOf(repo.db.from('revision_jobs').upsert(menus.map((menu: any) => ({ menu_id: menu.id, due_at: new Date().toISOString() })), { onConflict: 'menu_id', ignoreDuplicates: true }));
        queued += menus.length;
        cursor = menus[menus.length - 1].id;
        if (menus.length < 100)
            break;
    }
    console.log(JSON.stringify({ queued, deleted: 0 }));
}
