import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareMenuDeletion} from '../src/application/workspace/prepareMenuDeletion';
test('deletion checkpoints run concurrently with at most three in flight and include all eleven menus',async()=>{
 let active=0,peak=0;const done:string[]=[];
 const ids=Array.from({length:11},(_,i)=>String(i));
 await prepareMenuDeletion(ids,async id=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));done.push(id);active--;});
 assert.equal(peak,3);assert.equal(active,0);assert.deepEqual(done.sort(),[...ids].sort());
});
test('a checkpoint failure blocks deletion, waits for in-flight checks and stops scheduling',async()=>{
 let active=0;let attempted=0;
 await assert.rejects(prepareMenuDeletion(Array.from({length:11},(_,i)=>String(i)),async id=>{attempted++;active++;await new Promise(r=>setTimeout(r,2));active--;if(id==='0')throw new Error('unavailable');}),/unavailable/);
 assert.equal(active,0);assert.equal(attempted,3);
});
