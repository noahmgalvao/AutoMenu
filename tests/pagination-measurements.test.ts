import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergePaginationMeasurements} from '../src/domain/menu/paginationMeasurements';
test('fractional height changes cannot repeatedly reopen the previous column',()=>{
 let measured:ReadonlyMap<string,number>=new Map([['category:361',600.75]]);
 for(const height of [599.25,600.75,599.25,600.75]){
  const previous=measured;measured=mergePaginationMeasurements(measured,new Map([['category:361',height]]));
  assert.equal(measured,previous);assert.equal(measured.get('category:361'),600.75);
 }
 measured=mergePaginationMeasurements(measured,new Map([['category:361',605],['category:400',500],['invalid',Infinity]]));
 assert.equal(measured.get('category:361'),605);assert.equal(measured.get('category:400'),500);assert.equal(measured.has('invalid'),false);
 // A new document configuration owns a fresh ledger and can shrink again.
 assert.equal(mergePaginationMeasurements(new Map(),new Map([['category:361',400]])).get('category:361'),400);
});
