import assert from 'node:assert/strict';
import {viewFromHash,hashForView,type View} from '../src/navigation.ts';
for(const view of ['overview','matrix','groups'] as View[]){
 const hash=hashForView('#course=list-1',view);
 assert.equal(viewFromHash(hash),view); // The reload uses exactly this URL again.
 assert.equal(new URLSearchParams(hash.slice(1)).get('course'),'list-1');
 assert.equal(hashForView(hash,view),hash);
}
for(const hash of ['', '#view=unknown','#view=students','#view=__proto__'])assert.equal(viewFromHash(hash),'overview');
const classLink='#course=list-1&group=personal-token&view=groups';
assert.equal(viewFromHash(classLink),'overview');assert.equal(hashForView(classLink,'matrix'),classLink);
assert.equal(viewFromHash(hashForView('#view=matrix','groups')),'groups');
console.log('Navigation checks passed: every admin page survives reload, invalid pages fall back safely and personal class links stay unchanged.');
