import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,collectionGroup,doc,getDoc,getDocs,onSnapshot,query,serverTimestamp,setDoc,updateDoc,deleteDoc,where,writeBatch,Timestamp,type Firestore} from 'firebase/firestore';
import {initial,mutate} from '../src/model.ts';
import {documentsFor,tokenHash,type Lesson} from '../src/firebase-data.ts';
import {ownerAction,ownerRead} from '../src/firebase-repository.ts';

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
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'groupCount',count:0},courseId),/Gruppen.*Schüler/);
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
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:null}));
 await assertFails(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:Timestamp.fromMillis(0)}));
 await assertSucceeds(updateDoc(ref,{marks:{[student]:'anwesend'},reportedAt:serverTimestamp()}));
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
