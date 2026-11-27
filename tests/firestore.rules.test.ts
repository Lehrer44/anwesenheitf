import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,collectionGroup,doc,getDoc,getDocs,limit,onSnapshot,orderBy,query,serverTimestamp,setDoc,updateDoc,deleteDoc,where,writeBatch,Timestamp,type Firestore} from 'firebase/firestore';
import {initial,mutate,attendanceCounts,needsTeacherSync} from '../src/model.ts';
import {documentsFor,tokenHash,type Lesson} from '../src/firebase-data.ts';
import {ownerAction,ownerRead,watchOwnerCourse} from '../src/firebase-repository.ts';
import {saveCourseLists} from '../src/firebase-course-management.ts';
import {writeClassBookEntry} from '../src/firebase-classbook.ts';

let env:RulesTestEnvironment,ownerDb:Firestore,otherDb:Firestore,groupDb:Firestore,publicDb:Firestore;
let firstHash:string,secondHash:string,student:string,secondStudent:string;
const courseId='course-one',day='2026-01-01',future='2099-01-01';
before(async()=>{
 const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080').split(':');
 env=await initializeTestEnvironment({projectId:'demo-kursblick',firestore:{host,port:Number(port),rules:readFileSync('firestore.rules','utf8')}});
 await env.clearFirestore();
 const verified={email_verified:true,firebase:{sign_in_provider:'password' as const}};
 ownerDb=env.authenticatedContext('owner',verified).firestore() as unknown as Firestore;
 otherDb=env.authenticatedContext('other-owner',verified).firestore() as unknown as Firestore;
 groupDb=env.authenticatedContext('group-device',{firebase:{sign_in_provider:'anonymous'}}).firestore() as unknown as Firestore;
 publicDb=env.unauthenticatedContext().firestore() as unknown as Firestore;
 const s=initial(7);mutate(s,{action:'addStudents',names:'First',group:s.groups[0].id});mutate(s,{action:'addStudents',names:'Second',group:s.groups[1].id});
 for(const date of [day,future])mutate(s,{action:'session',date});
 firstHash=await tokenHash(s.groups[0].token!);secondHash=await tokenHash(s.groups[1].token!);student=s.students[0].id;secondStudent=s.students[1].id;
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(s,courseId,'owner',0))batch.set(doc(ownerDb,path),value);await assertSucceeds(batch.commit());
 const other=writeBatch(otherDb);for(const [path,value] of await documentsFor(initial(7),'course-two','other-owner',0))other.set(doc(otherDb,path),value);await assertSucceeds(other.commit());
});
after(async()=>{await env?.cleanup();});

test('thirty dates can be added and deleted atomically with all class copies',async()=>{
 const id='bulk-dates',state=initial(7);for(let i=0;i<7;i++)mutate(state,{action:'addStudents',names:'Pupil '+i,group:state.groups[i].id});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const dates=Array.from({length:30},(_,i)=>{const d=new Date('2020-01-01T12:00:00Z');d.setUTCDate(d.getUTCDate()+i*7);return d.toISOString().slice(0,10);});
 await assertFails(ownerAction(otherDb,'other-owner',{action:'sessions',dates},id));await assertFails(ownerAction(groupDb,'group-device',{action:'sessions',dates},id));
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'sessions',dates:[...dates].reverse()},id));const loaded=await ownerRead(ownerDb,id);assert.deepEqual(loaded.meta.dates,dates);assert.equal(loaded.state.sessions.length,30);
 const hash=await tokenHash(state.groups[0].token!),pupil=state.students[0].id;assert.equal((await getDocs(collection(groupDb,'channels',hash,'lessons'))).size,30);
 await updateDoc(doc(groupDb,'channels',hash,'lessons',dates[0]),{marks:{[pupil]:'anwesend'},reportedAt:serverTimestamp()});const reported=await ownerRead(ownerDb,id);
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'sessions',dates:[dates[0],'2021-01-01']},id),/bereits angelegt/);assert.deepEqual((await ownerRead(ownerDb,id)).state.sessions,reported.state.sessions);
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'deleteSessions',dates:[dates[0],'1999-01-01']},id),/nicht mehr/);assert.equal((await ownerRead(ownerDb,id)).state.sessions.length,30);
 const removed=dates.slice(1);await assertFails(ownerAction(groupDb,'group-device',{action:'deleteSessions',dates:removed},id));await assertFails(ownerAction(otherDb,'other-owner',{action:'deleteSessions',dates:removed},id));
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'deleteSessions',dates:removed},id));const remaining=await ownerRead(ownerDb,id);assert.deepEqual(remaining.meta.dates,[dates[0]]);assert.deepEqual(remaining.state.sessions,reported.state.sessions.slice(0,1));assert.deepEqual(remaining.state.students,state.students);
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore() as unknown as Firestore;for(const g of state.groups){const channel=await tokenHash(g.token!);assert.equal((await getDocs(collection(db,'channels',channel,'lessons'))).size,1);}assert.equal((await getDocs(collection(db,'courses',id,'sessions'))).size,1);});
 assert.equal((await getDoc(doc(groupDb,'channels',hash,'lessons',dates[1]))).exists(),false);await assertFails(updateDoc(doc(groupDb,'channels',hash,'lessons',dates[1]),{marks:{[pupil]:'anwesend'},reportedAt:serverTimestamp()}));
 // Remove the isolated fixture so existing owner-query assertions stay unchanged.
 await saveCourseLists(ownerDb,'owner',[{id,title:state.title}],[]);
});

test('list editor atomically renames, creates and deletes complete courses',async()=>{
 const id='lists-delete',keep='lists-rename',state=initial(2),unchanged=initial(1);
 mutate(state,{action:'addStudents',names:'Delete pupil',group:state.groups[0].id});
 mutate(state,{action:'session',date:day});state.sessions[0].marks[state.students[0].id]='anwesend';
 mutate(unchanged,{action:'addStudents',names:'Keep pupil',group:unchanged.groups[0].id});mutate(unchanged,{action:'session',date:day});
 const all=new Map([...await documentsFor(state,id,'owner',0),...await documentsFor(unchanged,keep,'owner',0)]),batch=writeBatch(ownerDb);
 for(const [path,value] of all)batch.set(doc(ownerDb,path),value);await batch.commit();
 const original=[{id,title:state.title},{id:keep,title:unchanged.title}],rows=[{id:keep,title:'Geändert'},{title:'Neue Liste',groupCount:2}];
 await assertFails(deleteDoc(doc(ownerDb,'courses',id)));await assertFails(deleteDoc(doc(ownerDb,'courses',id,'private','config')));
 for(const db of [otherDb,groupDb,publicDb])await assertFails(saveCourseLists(db,'other-owner',original,rows));
 assert.ok((await getDoc(doc(ownerDb,'courses',id))).exists());
 const created=await assertSucceeds(saveCourseLists(ownerDb,'owner',original,rows));assert.equal(created.length,1);
 const fresh=await ownerRead(ownerDb,created[0]);assert.equal(fresh.state.title,'Neue Liste');assert.equal(fresh.state.groups.length,2);
 const renamed=await ownerRead(ownerDb,keep);assert.equal(renamed.meta.title,'Geändert');assert.equal(renamed.meta.ownerUid,'owner');assert.deepEqual(renamed.state.students,unchanged.students);assert.deepEqual(renamed.state.sessions,unchanged.sessions);
 const hash=await tokenHash(unchanged.groups[0].token!);assert.equal((await getDoc(doc(groupDb,'channels',hash))).data()!.title,'Geändert');
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore() as unknown as Firestore;for(const path of all.keys())if(path==='courses/'+id||path.startsWith('courses/'+id+'/')||path.startsWith('channels/')&&(all.get(path) as any).courseId===id)assert.equal((await getDoc(doc(db,path))).exists(),false,path);});
 const deletedHash=await tokenHash(state.groups[0].token!);await assertFails(getDoc(doc(groupDb,'channels',deletedHash)));await assertFails(updateDoc(doc(groupDb,'channels',deletedHash,'lessons',day),{marks:{[state.students[0].id]:'anwesend'},reportedAt:serverTimestamp()}));
 await assert.rejects(saveCourseLists(ownerDb,'owner',[{id:keep,title:unchanged.title}],[]),/zwischenzeitlich/);assert.ok((await getDoc(doc(ownerDb,'courses',keep))).exists());
 const admin=env.authenticatedContext('list-admin',{email_verified:true,administrator:true,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 await assertSucceeds(saveCourseLists(admin,'list-admin',[{id:keep,title:'Geändert'}],[]));
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore() as unknown as Firestore;assert.equal((await getDoc(doc(db,'courses',keep))).exists(),false);assert.equal((await getDocs(collection(db,'courses',keep,'sessions'))).size,0);});
 await assertSucceeds(saveCourseLists(ownerDb,'owner',[{id:created[0],title:'Neue Liste'}],[]));
});

test('orphaned class channels cannot be used after their course is removed',async()=>{
 const id='orphaned-list',state=initial(1);mutate(state,{action:'addStudents',names:'Pupil',group:state.groups[0].id});mutate(state,{action:'session',date:day});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const hash=await tokenHash(state.groups[0].token!);await assertSucceeds(getDoc(doc(groupDb,'channels',hash)));
 // A malicious client omitting cleanup still cannot leave a usable class link.
 const remove=writeBatch(ownerDb);remove.delete(doc(ownerDb,'courses',id));remove.delete(doc(ownerDb,'courses',id,'private','config'));await assertSucceeds(remove.commit());
 await assertFails(getDoc(doc(groupDb,'channels',hash)));await assertFails(getDoc(doc(groupDb,'channels',hash,'lessons',day)));await assertFails(updateDoc(doc(groupDb,'channels',hash,'lessons',day),{marks:{[state.students[0].id]:'anwesend'},reportedAt:serverTimestamp()}));
});


test('explicit manual approval permits only named nonanonymous administrators without email verification',async()=>{
 const context=(uid:string,claims:Record<string,unknown>,provider:'password'|'anonymous'='password')=>env.authenticatedContext(uid,{email_verified:false,...claims,firebase:{sign_in_provider:provider}}).firestore() as unknown as Firestore;
 const approved=context('manually-approved',{administrator:true,manualAccessApproved:true});
 await assertSucceeds(getDocs(collection(approved,'courses')));
 await assertSucceeds(ownerRead(approved,courseId));
 const id='manual-approval-course',state=initial(2),batch=writeBatch(approved);
 mutate(state,{action:'addStudents',names:'Manual approval test pupil',group:state.groups[0].id});
 mutate(state,{action:'session',date:day});
 for(const [path,value] of await documentsFor(state,id,'manually-approved',0))batch.set(doc(approved,path),value);
 await assertSucceeds(batch.commit());
 await ownerAction(approved,'manually-approved',{action:'groupCount',count:3},id);
 await ownerAction(approved,'manually-approved',{action:'title',title:'Manually approved course'},id);
 assert.equal((await ownerRead(approved,id)).state.title,'Manually approved course');
 const hash=await tokenHash(state.groups[0].token!);
 await ownerAction(approved,'manually-approved',{action:'rotate',id:state.groups[0].id},id);
 await assertFails(getDoc(doc(groupDb,'channels',hash)));
 for(const denied of [context('not-approved',{}),context('role-only',{administrator:true}),context('approval-only',{manualAccessApproved:true}),context('revoked',{administrator:false,manualAccessApproved:true}),context('fake-anonymous-admin',{administrator:true,manualAccessApproved:true},'anonymous')]){
  await assertFails(getDocs(collection(denied,'courses')));
  await assertFails(ownerRead(denied,id));
  await assertFails(setDoc(doc(denied,'courses','unapproved-new'),{ownerUid:'unapproved-new',title:'x',version:0,dates:[]}));
  await assertFails(setDoc(doc(denied,'administrators','not-approved'),{administrator:true,manualAccessApproved:true}));
 }
 await assertFails(setDoc(doc(approved,'administrators','manually-approved'),{manualAccessApproved:true}));
});

test('three approved administrators share courses without changing ownership; roles cannot be self-granted',async()=>{
 const verified={email_verified:true,firebase:{sign_in_provider:'password' as const}};
 const admins=['admin-one','admin-two','admin-three'].map(uid=>env.authenticatedContext(uid,{...verified,administrator:true}).firestore() as unknown as Firestore);
 const [a,b,c]=admins;
 for(const db of admins){
  assert.ok((await assertSucceeds(getDocs(collection(db,'courses')))).size>=2);
  await assertSucceeds(ownerRead(db,courseId));
 }
 await assertFails(getDoc(doc(a,'administrators','admin-one')));
 await assertFails(getDoc(doc(a,'administrators','admin-two')));
 await assertFails(getDocs(collection(a,'administrators')));
 for(const db of [ownerDb,groupDb,a]){
  await assertFails(setDoc(doc(db,'administrators','group-device'),{active:true}));
  await assertFails(updateDoc(doc(db,'administrators','admin-one'),{active:false}));
  await assertFails(deleteDoc(doc(db,'administrators','admin-two')));
 }
 const unverified=env.authenticatedContext('unverified-admin',{email_verified:false,administrator:true,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 await assertFails(getDocs(collection(unverified,'courses')));
 const id='shared-admin-course',batch=writeBatch(a);
 const state=initial(7);mutate(state,{action:'addStudents',names:'Shared pupil',group:state.groups[0].id});mutate(state,{action:'session',date:day});
 for(const [path,value] of await documentsFor(state,id,'admin-one',0))batch.set(doc(a,path),value);
 await assertSucceeds(batch.commit());
 const hash=await tokenHash(state.groups[0].token!),pupil=state.students[0].id;
 await Promise.all([
  ownerAction(b,'admin-two',{action:'title',title:'Shared title'},id).catch(e=>{throw Error('ADMIN TITLE: '+e.message);}),
  ownerAction(c,'admin-three',{action:'groupCount',count:8},id).catch(e=>{throw Error('ADMIN GROUP COUNT: '+e.message);}),
  updateDoc(doc(groupDb,'channels',hash,'lessons',day),{marks:{[pupil]:'anwesend'},reportedAt:serverTimestamp()}),
 ]);
 const shared=await ownerRead(a,id);
 assert.equal(shared.meta.ownerUid,'admin-one');assert.equal(shared.state.title,'Shared title');
 assert.equal(shared.state.groups.length,8);assert.equal(shared.state.sessions[0].marks[pupil],'anwesend');
 for(const [path,value] of shared.docs)if(path.startsWith('channels/'))assert.equal(value.ownerUid,'admin-one');
 await assertFails(updateDoc(doc(b,'courses',id),{ownerUid:'admin-two',version:shared.meta.version+1}));
 await assertFails(ownerRead(otherDb,id));
 await ownerAction(b,'admin-two',{action:'rotate',id:state.groups[0].id},id);
 await assertFails(getDoc(doc(groupDb,'channels',hash)));
 const revoked=env.authenticatedContext('admin-two',verified).firestore() as unknown as Firestore;
 await assertFails(getDocs(collection(revoked,'courses')));
 await assertFails(ownerRead(revoked,id));
 await assertFails(ownerAction(revoked,'admin-two',{action:'title',title:'Revoked'},id));
 await assertSucceeds(ownerRead(c,id));
});

test('manual group counts support empty courses and safe resizing',async()=>{
 const id='manual-groups',batch=writeBatch(otherDb);
 for(const [path,value] of await documentsFor(initial(),id,'other-owner',0))batch.set(doc(otherDb,path),value);
 await assertSucceeds(batch.commit());
 assert.equal((await ownerRead(otherDb,id)).state.groups.length,0);
 await ownerAction(otherDb,'other-owner',{action:'groupCount',count:3},id);
 const created=await ownerRead(otherDb,id);assert.equal(created.state.groups.length,3);
 const first=created.state.groups[0].id,removedHash=await tokenHash(created.state.groups[2].token!);
 await ownerAction(otherDb,'other-owner',{action:'groupCount',count:1},id);
 assert.equal((await ownerRead(otherDb,id)).state.groups[0].id,first);
 await assertFails(getDoc(doc(groupDb,'channels',removedHash)));
 await ownerAction(otherDb,'other-owner',{action:'groupCount',count:0},id);
 assert.equal((await ownerRead(otherDb,id)).state.groups.length,0);
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'groupCount',count:0},courseId),/Klassen.*Schüler/);
});

test('owner query works; unauthenticated and foreign course access is denied',async()=>{
 const q=query(collection(ownerDb,'courses'),where('ownerUid','==','owner'));assert.equal((await assertSucceeds(getDocs(q))).size,1);
 await assertFails(getDocs(collection(publicDb,'courses')));await assertFails(getDocs(collection(groupDb,'courses')));
 await assertFails(getDocs(collection(ownerDb,'courses')));await assertFails(getDoc(doc(otherDb,'courses',courseId)));
 await assertFails(getDoc(doc(groupDb,'courses',courseId,'private','config')));
 await assertFails(getDoc(doc(publicDb,'channels',firstHash)));
 await assertFails(getDocs(collection(groupDb,'channels')));await assertFails(getDocs(collectionGroup(groupDb,'lessons')));
 await assertFails(getDocs(query(collectionGroup(groupDb,'lessons'),where('courseId','==',courseId))));
 const unverified=env.authenticatedContext('unverified',{email_verified:false,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 await assertFails(setDoc(doc(unverified,'courses','unverified-course'),{ownerUid:'unverified',title:'x',version:0,dates:[]}));
 await assertSucceeds(getDocs(collection(groupDb,'channels',firstHash,'lessons')));
 // An unknown link does not permit finding another group's random channel ID.
 await assertFails(getDoc(doc(groupDb,'channels','f'.repeat(64),'lessons',day)));
});
test('groups cannot elevate roles, change rosters, pollute schema or write foreign courses',async()=>{
 const ref=doc(groupDb,'channels',firstHash,'lessons',day);
 await assertFails(updateDoc(ref,{roster:[]}));await assertFails(updateDoc(ref,{ownerUid:'group-device'}));
 await assertFails(updateDoc(ref,{extra:'unexpected'}));await assertFails(updateDoc(ref,{cancelled:'attack'}));
 await assertFails(deleteDoc(ref));await assertFails(setDoc(doc(groupDb,'users','group-device'),{role:'admin'}));
 await assertFails(updateDoc(doc(groupDb,'courses',courseId),{ownerUid:'group-device'}));
 await assertFails(setDoc(doc(groupDb,'courses','forged'),{ownerUid:'group-device',title:'Attack',version:0,dates:[]}));
 await assertFails(setDoc(doc(groupDb,'channels',firstHash,'lessons','2026-02-01'),{...(await getDoc(ref)).data(),date:'2026-02-01'}));
});
test('complete enum-validated submissions require a server timestamp',async()=>{
 const ref=doc(groupDb,'channels',firstHash,'lessons',day);
 await assertFails(updateDoc(ref,{marks:{},reportedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{marks:{[student]:'invalid'},reportedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend',[secondStudent]:'anwesend'},reportedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:Timestamp.fromMillis(0)}));
 await assertSucceeds(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:serverTimestamp()}));
 // A sent class report cannot be withdrawn or backdated by the class link.
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:null}));
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:Timestamp.fromMillis(0)}));
 const own=await ownerRead(ownerDb,courseId);assert.equal(own.state.sessions[0].marks[student],'anwesend');
});
test('seven-group owner edits preserve concurrent reports and separate course data',async()=>{
 await Promise.all([
  updateDoc(doc(groupDb,'channels',firstHash,'lessons',day),{marks:{[student]:'abwesend'},reportedAt:serverTimestamp()}),
  updateDoc(doc(groupDb,'channels',secondHash,'lessons',day),{marks:{[secondStudent]:'entschuldigt'},reportedAt:serverTimestamp()}),
  ownerAction(ownerDb,'owner',{action:'title',title:'Updated course'},courseId),
 ]);
 const result=await ownerRead(ownerDb,courseId);assert.equal(result.state.title,'Updated course');
 assert.equal(result.state.sessions[0].marks[student],'abwesend');assert.equal(result.state.sessions[0].marks[secondStudent],'entschuldigt');
 assert.equal((await getDoc(doc(otherDb,'courses','course-two'))).data()!.title,'Mein Wochenkurs');
 await assertFails(ownerAction(otherDb,'other-owner',{action:'title',title:'Hijack'},courseId));
});
test('future enrollment changes reject stale submissions, while past rosters stay intact',async()=>{
 const before=await ownerRead(ownerDb,courseId),group=before.state.groups[0];
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'addStudents',names:'New arrival',group:group.id},courseId));
 const after=await ownerRead(ownerDb,courseId);assert.equal(after.state.sessions[0].roster.length,2);assert.equal(after.state.sessions[1].roster.length,3);
 const ref=doc(groupDb,'channels',firstHash,'lessons',future);
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:serverTimestamp()}));
 const lesson=(await getDoc(ref)).data() as Lesson;
 await assertSucceeds(updateDoc(ref,{marks:Object.fromEntries(lesson.rosterIds.map(id=>[id,'anwesend'])),reportedAt:serverTimestamp()}));
});
test('cancellation, reset and deleted students are enforced for group submissions',async()=>{
 await ownerAction(ownerDb,'owner',{action:'cancel',date:future,reason:'Ferien'},courseId);
 const ref=doc(groupDb,'channels',firstHash,'lessons',future),old=(await getDoc(ref)).data() as Lesson;
 await assertFails(updateDoc(ref,{marks:Object.fromEntries(old.rosterIds.map(id=>[id,'anwesend'])),reportedAt:serverTimestamp()}));
 await ownerAction(ownerDb,'owner',{action:'resetSession',date:future},courseId);
 assert.deepEqual((await getDoc(ref)).data()!.marks,{});assert.equal((await getDoc(ref)).data()!.reportedAt,null);
 await ownerAction(ownerDb,'owner',{action:'deleteStudent',id:student},courseId);
 await assertFails(updateDoc(ref,{marks:Object.fromEntries(old.rosterIds.map(id=>[id,'anwesend'])),reportedAt:serverTimestamp()}));
});
test('owner validation blocks ownership hijacking, missing fields and oversized updates',async()=>{
 const ref=doc(ownerDb,'courses',courseId),meta=(await getDoc(ref)).data()!;
 await assertFails(updateDoc(ref,{ownerUid:'other-owner',version:meta.version+1}));
 await assertFails(setDoc(ref,{ownerUid:'owner',version:meta.version+1,dates:[]}));
 await assertFails(updateDoc(ref,{title:'x'.repeat(101),version:meta.version+1}));
 await assertFails(updateDoc(ref,{title:42,version:meta.version+1}));
 await assertFails(updateDoc(ref,{title:'Valid',extra:'pollution',version:meta.version+1}));
 await assertFails(setDoc(doc(ownerDb,'courses','forged-owner'),{ownerUid:'other-owner',title:'x',version:0,dates:[]}));
 await assertFails(deleteDoc(ref));
 const lessonRef=doc(ownerDb,'channels',firstHash,'lessons',day),lesson=(await getDoc(lessonRef)).data()!;
 await assertFails(updateDoc(lessonRef,{courseId:'course-two'}));
 await assertFails(setDoc(doc(ownerDb,'channels',firstHash,'lessons','2026-02-01'),{...lesson,date:'2026-02-01',courseId:'course-two'}));
});
test('rotated links immediately lose reads, listeners and writes; replacement works',async()=>{
 const s=await ownerRead(ownerDb,courseId),group=s.state.groups[0];
 const ref=doc(groupDb,'channels',firstHash,'lessons',future);
 let rejected=false;
 const stop=onSnapshot(collection(groupDb,'channels',firstHash,'lessons'),()=>{},()=>{rejected=true;});
 await ownerAction(ownerDb,'owner',{action:'rotate',id:group.id},courseId);
 await assertFails(getDoc(doc(groupDb,'channels',firstHash)));
 await assertFails(getDocs(collection(groupDb,'channels',firstHash,'lessons')));
 await assertFails(updateDoc(ref,{marks:{},reportedAt:serverTimestamp()}));
 const next=await ownerRead(ownerDb,courseId),replacement=await tokenHash(next.state.groups[0].token!);
 await assertSucceeds(getDocs(collection(groupDb,'channels',replacement,'lessons')));
 const limit=Date.now()+5000;while(!rejected&&Date.now()<limit)await new Promise(r=>setTimeout(r,25));stop();assert.equal(rejected,true);
 // The orphaned-subcollection case remains denied even with a guessed lesson date.
 await assertFails(getDoc(ref));
});




test('deleting a class preserves pupils and historical reports and revokes the old class link',async()=>{
 const id='delete-class-course',state=initial(2),removed=state.groups[0],kept=state.groups[1];
 mutate(state,{action:'addStudents',names:'Leader\nPupil',group:removed.id});
 mutate(state,{action:'group',id:removed.id,name:'Klasse A',leaderId:state.students[0].id});
 mutate(state,{action:'addStudents',names:'Other pupil',group:kept.id});
 for(const date of ['2000-01-01','2099-01-01'])mutate(state,{action:'session',date});
 const hash=await tokenHash(removed.token!),keptHash=await tokenHash(kept.token!),pupil=state.students[1].id;
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 await updateDoc(doc(groupDb,'channels',hash,'lessons','2000-01-01'),{marks:{[state.students[0].id]:'anwesend',[pupil]:'entschuldigt'},reportedAt:serverTimestamp()});
 const before=await ownerRead(ownerDb,id);
 await assertFails(ownerAction(otherDb,'other-owner',{action:'deleteGroup',id:removed.id},id));
 await assertFails(ownerAction(groupDb,'group-device',{action:'deleteGroup',id:removed.id},id));
 const admin=env.authenticatedContext('deletion-admin',{email_verified:true,administrator:true,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 await assertSucceeds(ownerAction(admin,'deletion-admin',{action:'deleteGroup',id:removed.id},id));
 const after=await ownerRead(ownerDb,id);
 assert.equal(after.meta.ownerUid,'owner');assert.equal(after.state.students.length,3);
 assert.deepEqual(after.state.groups.map(g=>g.id),[kept.id]);
 assert.ok(after.state.students.filter(p=>p.id!==state.students[2].id).every(p=>p.group===''));
 assert.deepEqual(after.state.sessions.find(d=>d.date==='2000-01-01'),before.state.sessions.find(d=>d.date==='2000-01-01'));
 assert.equal(after.state.sessions[0].marks[pupil],'entschuldigt');
 assert.ok(after.state.sessions[1].roster.filter(p=>p.id!==state.students[2].id).every(p=>p.group===''));
 await assertFails(getDoc(doc(groupDb,'channels',hash)));
 await assertFails(getDocs(collection(groupDb,'channels',hash,'lessons')));
 await assertFails(updateDoc(doc(groupDb,'channels',hash,'lessons','2000-01-01'),{marks:{[pupil]:'anwesend'},reportedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(groupDb,'channels',keptHash)));
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore() as unknown as Firestore;
  assert.equal((await getDoc(doc(db,'channels',hash))).exists(),false);
  assert.equal((await getDocs(collection(db,'channels',hash,'lessons'))).size,0);
 });
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'deleteGroup',id:removed.id},id),/Klasse nicht gefunden/);
});


test('deleting a lesson removes all copies and blocks stale class submissions',async()=>{
 const id='delete-lesson-course',state=initial(2),deleted='2000-02-01',retained='2000-02-08';
 for(const [i,g] of state.groups.entries())mutate(state,{action:'addStudents',names:'Pupil '+i,group:g.id});
 for(const date of [deleted,retained])mutate(state,{action:'session',date});
 const hashes=await Promise.all(state.groups.map(g=>tokenHash(g.token!)));
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 for(const [i,hash] of hashes.entries())await updateDoc(doc(groupDb,'channels',hash,'lessons',deleted),{marks:{[state.students[i].id]:'entschuldigt'},reportedAt:serverTimestamp()});
 await assertFails(ownerAction(otherDb,'other-owner',{action:'deleteSession',date:deleted},id));
 await assertFails(ownerAction(groupDb,'group-device',{action:'deleteSession',date:deleted},id));
 const before=await ownerRead(ownerDb,id);
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'deleteSession',date:deleted},id));
 const after=await ownerRead(ownerDb,id);
 assert.deepEqual(after.meta.dates,[retained]);assert.deepEqual(after.state.sessions,before.state.sessions.filter(d=>d.date!==deleted));
 assert.deepEqual(after.state.students,before.state.students);assert.deepEqual(after.state.groups,before.state.groups);
 assert.equal((await getDoc(doc(ownerDb,'courses',id,'sessions',deleted))).exists(),false);
 for(const [i,hash] of hashes.entries()){
  assert.equal((await getDoc(doc(ownerDb,'channels',hash,'lessons',deleted))).exists(),false);
  assert.equal((await getDocs(collection(groupDb,'channels',hash,'lessons'))).size,1);
  await assertFails(updateDoc(doc(groupDb,'channels',hash,'lessons',deleted),{marks:{[state.students[i].id]:'anwesend'},reportedAt:serverTimestamp()}));
 }
 const admin=env.authenticatedContext('lesson-admin',{email_verified:true,administrator:true,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 await assertSucceeds(ownerAction(admin,'lesson-admin',{action:'deleteSession',date:retained},id));
 assert.deepEqual((await ownerRead(ownerDb,id)).state.sessions,[]);
 await ownerAction(ownerDb,'owner',{action:'session',date:deleted},id);
 const recreated=await ownerRead(ownerDb,id);assert.deepEqual(recreated.state.sessions[0].marks,{});assert.deepEqual(recreated.state.sessions[0].reports,{});
});


test('existing rules persist teachers separately from pupils and protect private assignments',async()=>{
 const id='class-role-course',state=initial(2),past='2000-04-01',future='2099-04-01';
 mutate(state,{action:'addStudents',names:'Responsible\nHelper',group:state.groups[0].id});
 state.groups[0].leader='Responsible';state.groups[0].leaderId=state.students[0].id;state.groups[0].helperId=state.students[1].id;
 for(const date of [past,future])mutate(state,{action:'session',date});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const helper=state.students[1],target=state.groups[1],hash=await tokenHash(target.token!);
 const before=await ownerRead(ownerDb,id);
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'group',id:target.id,name:'Role class',l1:'Lehrerin A',l2:'Lehrer B'},id));
 const after=await ownerRead(ownerDb,id),group=after.state.groups.find(g=>g.id===target.id)!;
 assert.equal(group.lehrer!.l1!.name,'Lehrerin A');assert.equal(group.lehrer!.l2!.name,'Lehrer B');
 assert.notEqual(group.lehrer!.l1!.id,state.students[0].id);
 assert.deepEqual(after.state.students,before.state.students);
 for(const d of after.state.sessions)assert.deepEqual(d.roster.filter(p=>!p.teacherId),before.state.sessions.find(x=>x.date===d.date)!.roster);
 assert.ok(after.state.sessions.every(d=>d.roster.filter(p=>p.teacherId).length===2));
 assert.equal(after.state.groups[0].leaderId,undefined);assert.equal(after.state.groups[0].helperId,undefined);
 assert.equal((await getDoc(doc(groupDb,'channels',hash))).data()!.group.leader,'Lehrerin A');
 await assertFails(getDoc(doc(groupDb,'courses',id,'private','config')));
 await assertFails(updateDoc(doc(groupDb,'channels',hash),{'group.lehrer':{l1:{id:'hijack',name:'Hijack'},l2:null}}));
 await assertFails(ownerAction(otherDb,'other-owner',{action:'group',id:target.id,name:'Hijack',l1:'Hijack'},id));
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'group',id:target.id,name:'Invalid',l1:'Same',l2:'same'},id),/unterschiedliche Lehrer/);
 await ownerAction(ownerDb,'owner',{action:'renameStudent',id:helper.id,name:'Renamed pupil'},id);
 await ownerAction(ownerDb,'owner',{action:'deleteStudent',id:helper.id},id);
 const reloaded=(await ownerRead(ownerDb,id)).state.groups.find(g=>g.id===target.id)!;
 assert.deepEqual(reloaded.lehrer,group.lehrer);
 await ownerAction(ownerDb,'owner',{action:'group',id:target.id,name:'Renamed class',l1:'',l2:''},id);
 assert.deepEqual((await ownerRead(ownerDb,id)).state.groups.find(g=>g.id===target.id)!.lehrer,{l1:null,l2:null});
});

test('confirmed edits immediately return the saved state and live listeners publish complete versions',async()=>{
 const id='live-edit-course',s=initial(1),g=s.groups[0];
 mutate(s,{action:'addStudents',names:'Responsible\nHelper',group:g.id});
 mutate(s,{action:'session',date:future});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(s,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const snapshots:Awaited<ReturnType<typeof ownerAction>>[]=[],errors:Error[]=[];
 const expected=new Map([[0,(await ownerRead(ownerDb,id)).state]]);
 const observer=env.authenticatedContext('owner',{email_verified:true,firebase:{sign_in_provider:'password'}}).firestore() as unknown as Firestore;
 const stop=watchOwnerCourse(observer,id,value=>snapshots.push(value),error=>errors.push(error));
 const waitFor=async(version:number)=>{
  const limit=Date.now()+10000;
  while(!snapshots.some(v=>v.meta.version===version)&&!errors.length&&Date.now()<limit)await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(errors,[],`Live listener failed at version ${version}`);assert.ok(snapshots.some(v=>v.meta.version===version),`Live version ${version} did not arrive`);
 };
 try{
  await waitFor(0);
  const actions=[
   {action:'addStudents',names:'New pupil',group:g.id},
   {action:'renameStudent',id:s.students[0].id,name:'Renamed responsible'},
   {action:'group',id:g.id,name:'Renamed class',l1:'Teacher A',l2:'Teacher B'},
   {action:'renameStudent',id:s.students[1].id,name:'Renamed helper'},
   {action:'rotate',id:g.id},
   {action:'group',name:'Additional class',leader:''},
   {action:'deleteGroup',id:g.id},
  ];
  for(const action of actions){
   console.log('Live edit regression action:',action.action);
   const saved=await ownerAction(ownerDb,'owner',action,id);
   expected.set(saved.meta.version,saved.state);
   const stored=await ownerRead(ownerDb,id);
   assert.deepEqual(saved.state,stored.state);assert.deepEqual(saved.meta,stored.meta);
   await waitFor(saved.meta.version);
  }
  for(const value of snapshots)assert.deepEqual(value.state,expected.get(value.meta.version),`Mixed live state at version ${value.meta.version}`);
  const last=await ownerRead(ownerDb,id);
  await assertFails(ownerAction(otherDb,'other-owner',{action:'renameStudent',id:s.students[0].id,name:'Denied'},id));
  assert.deepEqual((await ownerRead(ownerDb,id)).state,last.state);
 }finally{stop();}
 // The zero-class state must also publish after subscriptions are removed.
 const last=await ownerRead(ownerDb,id),remaining=last.state.groups[0];
 const seen:Awaited<ReturnType<typeof ownerAction>>[]=[],emptyStop=watchOwnerCourse(ownerDb,id,v=>seen.push(v),e=>errors.push(e));
 try{
  const saved=await ownerAction(ownerDb,'owner',{action:'deleteGroup',id:remaining.id},id);
  const limit=Date.now()+10000;while(!seen.some(v=>v.meta.version===saved.meta.version)&&Date.now()<limit)await new Promise(r=>setTimeout(r,20));
  assert.ok(seen.some(v=>v.meta.version===saved.meta.version&&v.state.groups.length===0));assert.deepEqual(errors,[]);
  for(const value of seen)assert.deepEqual(value.state,value.meta.version===saved.meta.version?saved.state:last.state);
 }finally{emptyStop();}
});

test('central teacher list: shared marks for all class links, school link and migration',async()=>{
 const id='teacher-staff-course',date='2099-03-01',legacy=initial(2),[a,b]=legacy.groups;delete legacy.teachers;delete legacy.school;
 mutate(legacy,{action:'addStudents',names:'Pupil A',group:a.id});mutate(legacy,{action:'addStudents',names:'Pupil B',group:b.id});
 mutate(legacy,{action:'session',date});
 mutate(legacy,{action:'group',id:a.id,name:a.name,l1:'Teacher A',l2:'Teacher B'});mutate(legacy,{action:'group',id:b.id,name:b.name,l1:'Teacher A'});
 delete legacy.teachers;
 // A course from the previous version has no central list yet; opening it as owner migrates it.
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(legacy,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 assert.equal(needsTeacherSync((await ownerRead(ownerDb,id)).state),true);
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'syncTeachers'},id));
 let loaded=await ownerRead(ownerDb,id);assert.equal(needsTeacherSync(loaded.state),false);
 const school=loaded.state.school!,staffHash=await tokenHash(school.staff),portalHash=await tokenHash(school.portal);
 const hash=await tokenHash(a.token!),otherHash=await tokenHash(b.token!);
 for(const h of [hash,otherHash])assert.equal((await getDoc(doc(groupDb,'channels',h))).data()!.staff,staffHash);
 const staff=(await getDoc(doc(groupDb,'staff',staffHash))).data()!;assert.deepEqual(staff.teachers.map((t:any)=>t.name),['Teacher A','Teacher B']);
 const dayRef=doc(groupDb,'staff',staffHash,'days',date),day=(await getDoc(dayRef)).data()!;
 assert.equal(day.teacherIds.length,2);assert.ok((await getDoc(doc(groupDb,'channels',hash,'lessons',date))).data()!.rosterIds.every((x:string)=>!x.startsWith('teacher-')));
 const [first,second]=day.teacherIds as string[];
 // Any class link may mark any teacher; only valid marks of listed teachers are accepted.
 await assertSucceeds(updateDoc(dayRef,{marks:{[first]:'anwesend'}}));
 await assertSucceeds(updateDoc(dayRef,{marks:{[first]:'anwesend',[second]:'abwesend'}}));
 for(const bad of [{marks:{[first]:'krank'}},{marks:{unknown:'anwesend'}},{teacherIds:[first]},{cancelled:'x'},{marks:{},date:'2099-03-02'}])await assertFails(updateDoc(dayRef,bad));
 await assertFails(getDoc(doc(publicDb,'staff',staffHash)));await assertFails(getDocs(collection(publicDb,'staff',staffHash,'days')));
 await assertFails(getDocs(collection(groupDb,'staff')));await assertFails(getDocs(collection(groupDb,'portals')));
 loaded=await ownerRead(ownerDb,id);assert.deepEqual(attendanceCounts(loaded.state,loaded.state.sessions[0]).teachers,{present:1,total:2});
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'title',title:'Renamed staff course'},id));
 loaded=await ownerRead(ownerDb,id);assert.equal(loaded.state.sessions[0].marks[first],'anwesend');
 assert.equal((await getDoc(doc(groupDb,'staff',staffHash))).data()!.title,'Renamed staff course');
 // The school link lists every class with its class link.
 const portal=(await getDoc(doc(groupDb,'portals',portalHash))).data()!;assert.deepEqual(portal.classes.map((c:any)=>c.token),[a.token,b.token]);
 await assertFails(getDoc(doc(publicDb,'portals',portalHash)));
 await assertFails(setDoc(doc(groupDb,'portals',portalHash),{...portal,active:false}));await assertFails(updateDoc(doc(groupDb,'staff',staffHash),{teachers:[]}));
 // A cancelled lesson accepts no teacher marks.
 await ownerAction(ownerDb,'owner',{action:'cancel',date,reason:'Ferien'},id);
 await assertFails(updateDoc(dayRef,{marks:{[second]:'anwesend'}}));
 await ownerAction(ownerDb,'owner',{action:'restore',date},id);
 // Renewing the school link revokes the old link and teacher list; marks move with it.
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'rotateSchool'},id));
 loaded=await ownerRead(ownerDb,id);const renewed=await tokenHash(loaded.state.school!.staff),renewedPortal=await tokenHash(loaded.state.school!.portal);
 assert.notEqual(renewed,staffHash);
 await assertFails(getDoc(doc(groupDb,'portals',portalHash)));await assertFails(getDoc(dayRef));await assertFails(updateDoc(dayRef,{marks:{}}));
 assert.equal((await getDoc(doc(groupDb,'staff',renewed,'days',date))).data()!.marks[first],'anwesend');
 assert.equal((await getDoc(doc(groupDb,'channels',hash))).data()!.staff,renewed);assert.ok((await getDoc(doc(groupDb,'portals',renewedPortal))).exists());
 // Editing the list updates every class link at once; deleting the list removes everything.
 const teachers=loaded.state.teachers!;
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'editTeachers',original:teachers,teachers:[...teachers,{name:'Substitute'}]},id));
 assert.equal((await getDoc(doc(groupDb,'staff',renewed))).data()!.teachers.length,3);
 assert.equal((await getDoc(doc(groupDb,'staff',renewed,'days',date))).data()!.teacherIds.length,3);
 await saveCourseLists(ownerDb,'owner',[{id,title:'Renamed staff course'}],[]);
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore() as unknown as Firestore;
  for(const path of ['staff/'+renewed,'portals/'+renewedPortal,'staff/'+renewed+'/days/'+date])assert.equal((await getDoc(doc(db,path))).exists(),false);});
});

test('class book entries are class-scoped, conflict-checked and follow renewed links',async()=>{
 const id='classbook-course',state=initial(3),[first,second,spare]=state.groups,day1='2026-11-14',day2='2026-11-17',today='2026-11-19';
 mutate(state,{action:'addStudents',names:'Pupil',group:first.id});mutate(state,{action:'session',date:day1});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const hash=await tokenHash(first.token!),otherHash=await tokenHash(second.token!),ref=doc(groupDb,'channels',hash,'classbook',day1);
 const entry={date:day1,quran:'Sure 114',bildung:'Band 1, Seite 10',arabisch:'A und B',bemerkungen:''};
 await assertSucceeds(writeClassBookEntry(groupDb,hash,entry,null));
 const saved=(await getDoc(ref)).data()!;assert.equal(saved.groupId,first.id);assert.equal(saved.courseId,id);assert.equal(saved.ownerUid,'owner');
 const stamp=saved.updatedAt.toDate().toISOString();
 // A second form that opened before the first save must not overwrite it.
 await assert.rejects(writeClassBookEntry(groupDb,hash,{...entry,quran:'Andere Sure'},null),/zwischenzeitlich/);
 await assertSucceeds(writeClassBookEntry(groupDb,hash,{...entry,quran:'Sure 113\nSure 114'},stamp));
 await assertSucceeds(writeClassBookEntry(groupDb,hash,{date:day2,quran:'',bildung:'Gebet',arabisch:'',bemerkungen:''},null));
 assert.equal((await getDoc(ref)).data()!.quran,'Sure 113\nSure 114');
 // Shape, ownership and server timestamps are enforced for direct writes.
 const base={ownerUid:'owner',courseId:id,groupId:first.id,date:'2026-11-10',quran:'x',bildung:'',arabisch:'',updatedAt:serverTimestamp()};
 const target=doc(groupDb,'channels',hash,'classbook','2026-11-10');
 for(const bad of [{...base,extra:true},{...base,groupId:second.id},{...base,courseId:'course-one'},{...base,date:'2026-11-11'},{...base,quran:''},{...base,quran:'x'.repeat(2001)},{...base,updatedAt:Timestamp.fromDate(new Date('2020-01-01'))}])await assertFails(setDoc(target,bad));
 for(const bad of [{...base,quran:'',bemerkungen:''},{...base,bemerkungen:'x'.repeat(2001)},{...base,bemerkungen:3}])await assertFails(setDoc(target,bad));
 // Entries saved before remarks existed stay valid; remarks alone are enough.
 await assertSucceeds(setDoc(target,base));await assertFails(updateDoc(target,{groupId:second.id,updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(target,{quran:'',bemerkungen:'Ausflug',updatedAt:serverTimestamp()}));await assertSucceeds(deleteDoc(target));
 // Entries can be planned for future days.
 await assertSucceeds(writeClassBookEntry(groupDb,hash,{date:'2099-12-31',quran:'',bildung:'',arabisch:'',bemerkungen:'Vorbereitung'},null));
 assert.equal((await getDoc(doc(groupDb,'channels',hash,'classbook','2099-12-31'))).data()!.bemerkungen,'Vorbereitung');
 await assertSucceeds(writeClassBookEntry(groupDb,hash,{date:'2099-12-31',delete:true},(await getDoc(doc(groupDb,'channels',hash,'classbook','2099-12-31'))).data()!.updatedAt.toDate().toISOString()));
 await assertFails(setDoc(doc(groupDb,'channels',otherHash,'classbook','2026-11-10'),base));
 await assertFails(getDocs(collection(publicDb,'channels',hash,'classbook')));
 // Like lessons, the secret channel hash itself is the read credential.
 assert.equal((await getDocs(query(collection(ownerDb,'channels',hash,'classbook'),where('ownerUid','==','owner')))).size,2);
 // Renewing the link moves the class book; the old link loses access immediately.
 await ownerAction(ownerDb,'owner',{action:'rotate',id:first.id},id);
 const renewed=await tokenHash((await ownerRead(ownerDb,id)).state.groups[0].token!);
 await assertFails(getDocs(collection(groupDb,'channels',hash,'classbook')));
 await assert.rejects(writeClassBookEntry(groupDb,hash,{...entry,quran:'alt'},null),/ungültig/);
 const moved=await getDocs(collection(groupDb,'channels',renewed,'classbook'));
 assert.deepEqual(moved.docs.map(d=>d.id).sort(),[day1,day2]);assert.equal(moved.docs.find(d=>d.id===day1)!.data().quran,'Sure 113\nSure 114');
 await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await getDocs(collection(ctx.firestore() as unknown as Firestore,'channels',hash,'classbook'))).size,0);});
 // Unrelated owner edits do not touch entries; class deletion removes them; automatic resizing refuses.
 await ownerAction(ownerDb,'owner',{action:'title',title:'Neu'},id);assert.equal((await getDocs(collection(groupDb,'channels',renewed,'classbook'))).size,2);
 const spareHash=await tokenHash(spare.token!);
 await assertSucceeds(writeClassBookEntry(groupDb,spareHash,{date:day1,quran:'x',bildung:'',arabisch:'',bemerkungen:''},null));
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'groupCount',count:2},id),/Klassenbuch/);
 await assertSucceeds(writeClassBookEntry(groupDb,spareHash,{date:day1,delete:true},(await getDoc(doc(groupDb,'channels',spareHash,'classbook',day1))).data()!.updatedAt.toDate().toISOString()));
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'groupCount',count:2},id));
 await ownerAction(ownerDb,'owner',{action:'deleteGroup',id:first.id},id);
 await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await getDocs(collection(ctx.firestore() as unknown as Firestore,'channels',renewed,'classbook'))).size,0);});
 // Deleting the whole list also removes the remaining class books.
 await assertSucceeds(writeClassBookEntry(groupDb,otherHash,{date:day1,quran:'x',bildung:'',arabisch:'',bemerkungen:''},null));
 await saveCourseLists(ownerDb,'owner',[{id,title:'Neu'}],[]);
 await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await getDocs(collection(ctx.firestore() as unknown as Firestore,'channels',otherHash,'classbook'))).size,0);});
});

test('the school overview reads only the latest lessons and teacher days through the class links',async()=>{
 const id='overview-course',s=initial(2),dates=['2026-01-06','2026-01-08','2026-01-10','2026-01-13','2026-01-15','2026-01-17','2099-01-01'];
 for(const g of s.groups)mutate(s,{action:'addStudents',names:'P '+g.id,group:g.id});
 mutate(s,{action:'group',id:s.groups[0].id,name:'K1',l1:'T'});mutate(s,{action:'sessions',dates});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(s,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const hash=await tokenHash(s.groups[0].token!),staff=await tokenHash(s.school!.staff),today='2026-01-16';
 const recent=(...path:string[])=>query(collection(groupDb,path[0],...path.slice(1)),where('date','<=',today),orderBy('date','desc'),limit(5));
 const lessons=await assertSucceeds(getDocs(recent('channels',hash,'lessons')));
 assert.deepEqual(lessons.docs.map(d=>d.id),['2026-01-15','2026-01-13','2026-01-10','2026-01-08','2026-01-06']);
 const days=await assertSucceeds(getDocs(recent('staff',staff,'days')));assert.equal(days.size,5);assert.equal(days.docs[0].id,'2026-01-15');
 await assertFails(getDocs(query(collection(publicDb,'channels',hash,'lessons'),where('date','<=',today),orderBy('date','desc'),limit(5))));
 await saveCourseLists(ownerDb,'owner',[{id,title:s.title}],[]);
});
