import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canRestorePendingWorkspace,isRemoteMenuNewer} from '../src/application/workspace/latestWorkspace';
import type {Menu} from '../src/domain/workspace/model';
const menu={id:'menu',revisionWriteVersion:4,updatedAt:'2026-11-27T09:00:00Z',currentDraftVersionId:'v4'} as Menu;
test('an older pending write never replaces a newer remote version, even with a newer local clock',()=>{
 assert.equal(canRestorePendingWorkspace({expectedWrite:3,updatedAt:'2030-01-01'},menu,''),false);
 assert.equal(canRestorePendingWorkspace({expectedWrite:4,updatedAt:'2026-11-27'},menu,''),true);
 assert.equal(canRestorePendingWorkspace({updatedAt:'2026-11-26'},menu,'2025-01-01'),false);
 assert.equal(canRestorePendingWorkspace({updatedAt:'2026-11-28'},menu,'2025-01-01'),true);
});
test('remote freshness follows the write version rather than an old response or local clock',()=>{
 assert.equal(isRemoteMenuNewer({...menu,revisionWriteVersion:5,updatedAt:'2025-01-01'},menu),true);
 assert.equal(isRemoteMenuNewer({...menu,revisionWriteVersion:3,updatedAt:'2030-01-01'},menu),false);
 assert.equal(isRemoteMenuNewer({...menu,currentDraftVersionId:'v5'},menu),true);
 assert.equal(isRemoteMenuNewer({...menu,id:'other'},menu),false);
});
