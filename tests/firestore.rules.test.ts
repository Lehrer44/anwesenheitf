import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,collectionGroup,doc,getDoc,getDocs,onSnapshot,query,serverTimestamp,setDoc,updateDoc,deleteDoc,where,writeBatch,Timestamp,type Firestore} from 'firebase/firestore';
import {initial,mutate} from '../src/model.ts';
import {documentsFor,tokenHash,type Lesson} from '../src/firebase-data.ts';
import {ownerAction,ownerRead,watchOwnerCourse} from '../src/firebase-repository.ts';

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


test('existing rules persist private helper choices without exposing writable roles through class links',async()=>{
 const id='class-role-course',state=initial(2),past='2000-04-01',future='2099-04-01';
 mutate(state,{action:'addStudents',names:'Responsible\nHelper',group:state.groups[0].id});
 for(const date of [past,future])mutate(state,{action:'session',date});
 const batch=writeBatch(ownerDb);for(const [path,value] of await documentsFor(state,id,'owner',0))batch.set(doc(ownerDb,path),value);await batch.commit();
 const [responsible,helper]=state.students,target=state.groups[1],hash=await tokenHash(target.token!);
 const before=await ownerRead(ownerDb,id);
 await assertSucceeds(ownerAction(ownerDb,'owner',{action:'group',id:target.id,name:'Role class',leaderId:responsible.id,helperId:helper.id},id));
 const after=await ownerRead(ownerDb,id),group=after.state.groups.find(g=>g.id===target.id)!;
 assert.equal(group.helperId,helper.id);assert.equal(group.leaderId,responsible.id);assert.equal(after.state.students.length,2);
 assert.deepEqual(after.state.sessions.find(d=>d.date===past),before.state.sessions.find(d=>d.date===past));
 assert.ok(after.state.sessions.find(d=>d.date===future)!.roster.every(p=>p.group===target.id));
 assert.equal((await getDoc(doc(groupDb,'channels',hash))).data()!.group.helperId,undefined);
 await assertFails(getDoc(doc(groupDb,'courses',id,'private','config')));
 await assertFails(updateDoc(doc(groupDb,'channels',hash),{'group.helperId':helper.id}));
 await assertFails(ownerAction(otherDb,'other-owner',{action:'group',id:target.id,name:'Hijack',leaderId:helper.id,helperId:responsible.id},id));
 await assert.rejects(ownerAction(ownerDb,'owner',{action:'group',id:target.id,name:'Invalid',leaderId:responsible.id,helperId:responsible.id},id),/verschiedene Schüler/);
 await ownerAction(ownerDb,'owner',{action:'renameStudent',id:helper.id,name:'Renamed helper'},id);
 assert.equal((await ownerRead(ownerDb,id)).state.students.find(p=>p.id===helper.id)!.name,'Renamed helper');
 await ownerAction(ownerDb,'owner',{action:'deleteStudent',id:helper.id},id);
 assert.equal((await ownerRead(ownerDb,id)).state.groups.find(g=>g.id===target.id)!.helperId,undefined);
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
   {action:'group',id:g.id,name:'Renamed class',leaderId:s.students[0].id,helperId:s.students[1].id},
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
