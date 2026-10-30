import assert from 'node:assert/strict';
import {initial,mutate} from '../src/model.ts';
import {changesBetween,documentsFor,mergeLessons,groupState,tokenHash,equal,type Channel,type Lesson} from '../src/firebase-data.ts';
import {Timestamp} from 'firebase/firestore';
assert.equal(initial().groups.length,0);
for(const count of [0,1,2,7,30])assert.equal(initial(count).groups.length,count);
for(const count of [-1,1.5,31,NaN])assert.throws(()=>initial(count));
const state=initial(2);
assert.ok(equal({a:1,nested:{b:2,c:3}},{nested:{c:3,b:2},a:1}));
assert.ok(!equal(['a','b'],['b','a']));
mutate(state,{action:'addStudents',names:'A\nB',group:state.groups[0].id});
mutate(state,{action:'addStudents',names:'C',group:state.groups[1].id});
mutate(state,{action:'session',date:'2026-01-01'});
const docs=await documentsFor(state,'course','owner',0),hash=await tokenHash(state.groups[0].token!);
assert.equal(hash.length,64);assert.ok(!docs.get('channels/'+hash).group.token);
const lesson=docs.get('channels/'+hash+'/lessons/2026-01-01') as Lesson;
const ids=lesson.rosterIds;
const report={...lesson,marks:{[ids[0]]:'anwesend' as const,[ids[1]]:'abwesend' as const},reportedAt:Timestamp.fromMillis(12345)};
const merged=mergeLessons(state,[report]);assert.equal(merged.sessions[0].marks[ids[1]],'abwesend');
assert.ok(merged.sessions[0].reports[state.groups[0].id]);assert.deepEqual(state.sessions[0].marks,{});
const view=groupState(docs.get('channels/'+hash) as Channel,[report]);assert.equal(view.students.length,2);assert.equal(view.sessions[0].roster.length,2);assert.equal(view.groups[0].token,undefined);
// Renaming propagates to every existing group channel without replacing links or attendance.
const renamed=structuredClone(merged),original=structuredClone(merged);
mutate(renamed,{action:'title',title:'  Deutsch – Abendkurs  '});
assert.deepEqual(renamed,{...original,title:'Deutsch – Abendkurs'});
const beforeRename=await documentsFor(original,'course','owner',0);
const afterRename=await documentsFor(renamed,'course','owner',1);
const renameChanges=changesBetween(beforeRename,afterRename);
assert.deepEqual(renameChanges.deletes,[]);
assert.deepEqual(renameChanges.sets.map(([path])=>path).sort(),['courses/course',...await Promise.all(state.groups.map(async g=>'channels/'+await tokenHash(g.token!)))].sort());
for(const [path,value] of afterRename){
 if(path.startsWith('channels/')&&!path.includes('/lessons/')){
  assert.equal(groupState(value as Channel,[]).title,'Deutsch – Abendkurs');
  assert.deepEqual(value,{...beforeRename.get(path),title:'Deutsch – Abendkurs'});
 }
}
for(const title of ['', '   ', '\t\n', 'x'.repeat(101)]){
 assert.throws(()=>mutate(renamed,{action:'title',title}),/Kursnamen/);
 assert.equal(renamed.title,'Deutsch – Abendkurs');
}
assert.throws(()=>mutate(renamed,{action:'title',title:'Unerlaubt'},renamed.groups[0]));
mutate(renamed,{action:'title',title:'x'.repeat(100)});assert.equal(renamed.title.length,100);
const noGroups=initial();mutate(noGroups,{action:'title',title:'Einzelkurs'});assert.equal(noGroups.title,'Einzelkurs');
const stale={...report,rosterIds:['removed']};assert.deepEqual(mergeLessons(state,[stale]).sessions[0].marks,{});
const rotated=structuredClone(merged);mutate(rotated,{action:'rotate',id:state.groups[0].id});
const next=await documentsFor(rotated,'course','owner',1),changes=changesBetween(docs,next);
assert.ok(changes.deletes.includes('channels/'+hash));assert.ok(changes.deletes.includes('channels/'+hash+'/lessons/2026-01-01'));
assert.equal(mergeLessons(merged,[{...report,marks:{},reportedAt:null}]).sessions[0].marks[ids[0]],undefined);
const other=await documentsFor(state,'other-course','other-owner',0);assert.equal(other.get('courses/other-course').ownerUid,'other-owner');
await assert.rejects(tokenHash('invalid'));
const empty=initial();mutate(empty,{action:'groupCount',count:3});assert.equal(empty.groups.length,3);
const preserved=empty.groups[0].id;mutate(empty,{action:'groupCount',count:1});assert.equal(empty.groups[0].id,preserved);
mutate(empty,{action:'groupCount',count:0});assert.equal(empty.groups.length,0);
assert.throws(()=>mutate(empty,{action:'groupCount',count:1.5}));assert.throws(()=>mutate(empty,{action:'demo'}));
assert.throws(()=>mutate(state,{action:'groupCount',count:0}));assert.throws(()=>mutate(state,{action:'groupCount',count:3},state.groups[0]));
const historical=structuredClone(state);historical.students=[];assert.throws(()=>mutate(historical,{action:'groupCount',count:0}));
console.log('Firebase data checks passed: manual group count, safe resizing, split dates, group isolation, report merge, stale rosters, reset and link revocation.');

// Removing a populated class retains history and pupils, and removes its channel documents.
const removal=structuredClone(merged),removedClass=removal.groups[0],keptClass=structuredClone(removal.groups[1]);
const historic=structuredClone(removal.sessions),beforeRemoval=await documentsFor(removal,'course','owner',0);
assert.throws(()=>mutate(removal,{action:'deleteGroup',id:removedClass.id},removedClass));
mutate(removal,{action:'deleteGroup',id:removedClass.id});
assert.equal(removal.students.length,merged.students.length);
assert.ok(removal.students.filter(p=>merged.students.find(x=>x.id===p.id)?.group===removedClass.id).every(p=>p.group===''));
assert.deepEqual(removal.sessions,historic);assert.deepEqual(removal.groups,[keptClass]);
const removalChanges=changesBetween(beforeRemoval,await documentsFor(removal,'course','owner',1));
assert.deepEqual(removalChanges.deletes.sort(),[...beforeRemoval.keys()].filter(p=>p==='channels/'+hash||p.startsWith('channels/'+hash+'/')).sort());
assert.throws(()=>mutate(removal,{action:'deleteGroup',id:'missing'}),/Klasse nicht gefunden/);
mutate(removal,{action:'deleteGroup',id:keptClass.id});assert.equal(removal.groups.length,0);
mutate(removal,{action:'group',name:'Neue Klasse',leader:''});assert.equal(removal.groups.length,1);
console.log('Class deletion checks passed: pupils and historical attendance preserved; links removed; group submissions cannot delete classes.');


const teachers=initial(1);mutate(teachers,{action:'addStudents',names:'Pupil',group:teachers.groups[0].id});
mutate(teachers,{action:'group',id:teachers.groups[0].id,name:'Roles',l1:'Lehrerin A',l2:'Lehrer B'});
const teacherDocs=await documentsFor(teachers,'role-course','owner',0),teacherHash=await tokenHash(teachers.groups[0].token!);
assert.deepEqual(teacherDocs.get('courses/role-course/private/config').groups[0].lehrer,teachers.groups[0].lehrer);
assert.equal(teacherDocs.get('courses/role-course/private/config').students.length,1);
const channel=teacherDocs.get('channels/'+teacherHash);
assert.deepEqual(Object.keys(channel.group).sort(),['id','leader','name']);
assert.equal(channel.group.leader,'Lehrerin A');assert.equal(channel.students.length,1);
const reloaded=JSON.parse(JSON.stringify(teacherDocs.get('courses/role-course/private/config')));
assert.equal(reloaded.groups[0].lehrer.l2.name,'Lehrer B');
console.log('Teacher document checks passed: separate private teacher records, reload and compatible public channel schema.');
