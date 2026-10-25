import assert from 'node:assert/strict';
import {initial,mutate,normalizeLeaders,groupView} from '../src/model.ts';

// The class editor saves all changes atomically and rejects stale drafts.
{
 const state=initial(2),[a,b]=state.groups;
 mutate(state,{action:'addStudents',names:'Leitung\nHelfer\nAnna\nBen',group:a.id});
 mutate(state,{action:'addStudents',names:'Andere Klasse',group:b.id});
 const [leader,helper,anna,ben]=state.students;
 mutate(state,{action:'group',id:a.id,name:a.name,leaderId:leader.id,helperId:helper.id});
 mutate(state,{action:'session',date:'2026-01-01'});state.sessions[0].marks[ben.id]='anwesend';
 const original=structuredClone(state.students.filter(p=>p.group===a.id));
 const draft=[{...anna,name:'Anna Neu',group:b.id},{...helper,name:'Helfer Neu'},{...leader,name:'Leitung Neu'}];
 const body={action:'editClassStudents',group:a.id,original,students:draft};
 assert.throws(()=>mutate(state,body,a));
 const unchanged=structuredClone(state);
 for(const students of [[...draft,{...draft[0]}],[{...draft[0],name:' '}],[{...draft[0],group:'unknown'}],[{...draft[0],id:'missing'}],[{...helper,group:b.id}]]){
  assert.throws(()=>mutate(state,{...body,students}));assert.deepEqual(state,unchanged);
 }
 mutate(state,body);
 assert.deepEqual(state.students.map(p=>p.id),[anna.id,helper.id,leader.id,unchanged.students[4].id]);
 assert.equal(state.students[0].group,b.id);assert.equal(state.groups[0].leader,'Leitung Neu');assert.equal(state.groups[0].helperId,helper.id);
 assert.equal(state.sessions[0].roster.find(p=>p.id===anna.id)?.name,'Anna');
 assert.ok(!state.sessions[0].roster.some(p=>p.id===ben.id));assert.equal(state.sessions[0].marks[ben.id],undefined);
 const after=structuredClone(state);assert.throws(()=>mutate(state,body),/zwischenzeitlich/);assert.deepEqual(state,after);
 const remaining=structuredClone(state.students.filter(p=>p.group===a.id));
 mutate(state,{action:'editClassStudents',group:a.id,original:remaining,students:[]});
 assert.ok(!state.students.some(p=>p.group===a.id));assert.equal(state.groups[0].leaderId,undefined);assert.equal(state.groups[0].helperId,undefined);
 const unassigned=initial();mutate(unassigned,{action:'addStudents',names:'Ohne Klasse'});
 mutate(unassigned,{action:'editClassStudents',group:'',original:structuredClone(unassigned.students),students:[{...unassigned.students[0],name:'Neuer Name'}]});assert.equal(unassigned.students[0].name,'Neuer Name');
 const stale=initial(1);mutate(stale,{action:'addStudents',names:'A',group:stale.groups[0].id});const old=structuredClone(stale.students);mutate(stale,{action:'addStudents',names:'B',group:stale.groups[0].id});assert.throws(()=>mutate(stale,{action:'editClassStudents',group:stale.groups[0].id,original:old,students:old}),/zwischenzeitlich/);
 console.log('Class editor checks passed: atomic rename/move/reorder/delete, protected roles, stale drafts, empty classes, unassigned pupils and preserved history.');
}
const s=initial(7);mutate(s,{action:'addStudents',names:'Anna\nBen\nClara'});const anna=s.students[0],ben=s.students[1],g=s.groups[0];
mutate(s,{action:'group',id:g.id,name:g.name,leader:'Anna'});assert.equal(g.leaderId,anna.id);assert.equal(s.students.length,3);assert.equal(anna.group,g.id);
mutate(s,{action:'distribute'});assert.equal(anna.group,g.id);assert.throws(()=>mutate(s,{action:'assign',id:anna.id,group:s.groups[1].id}));assert.throws(()=>mutate(s,{action:'archive',id:anna.id}));
mutate(s,{action:'session',date:'2026-10-13'});const snapshot=structuredClone(s.sessions[0].roster);
mutate(s,{action:'renameStudent',id:anna.id,name:'Anna Neu'});assert.equal(g.leader,'Anna Neu');assert.deepEqual(s.sessions[0].roster,snapshot);
mutate(s,{action:'mark',date:'2026-10-13',id:anna.id,status:'anwesend'});s.sessions[0].reports[g.id]='sent';mutate(s,{action:'mark',date:'2026-10-13',id:anna.id,status:''});assert.equal(s.sessions[0].marks[anna.id],undefined);assert.equal(s.sessions[0].reports[g.id],undefined);assert.equal(Object.keys(s.sessions[0].marks).length,0);
assert.throws(()=>mutate(s,{action:'deleteStudent',id:ben.id},g));assert.throws(()=>mutate(s,{action:'mark',date:'2026-10-13',id:anna.id,status:''},g));
mutate(s,{action:'mark',date:'2026-10-13',id:anna.id,status:'entschuldigt'});mutate(s,{action:'deleteStudent',id:anna.id});assert.ok(!s.students.some(p=>p.id===anna.id));assert.ok(!s.sessions[0].roster.some(p=>p.id===anna.id));assert.equal(s.sessions[0].marks[anna.id],undefined);assert.equal(g.leader,'');assert.equal(g.leaderId,undefined);normalizeLeaders(s);assert.ok(!s.students.some(p=>p.id===anna.id));
mutate(s,{action:'group',id:g.id,name:g.name,leader:'Dora'});const dora=s.students.find(p=>p.name==='Dora')!;assert.equal(dora.group,g.id);assert.equal(g.leaderId,dora.id);const count=s.students.length;mutate(s,{action:'group',id:g.id,name:g.name,leader:'Dora',leaderId:dora.id});assert.equal(s.students.length,count);mutate(s,{action:'distribute'});assert.equal(dora.group,g.id);
mutate(s,{action:'session',date:'2026-10-20'});assert.ok(groupView(s,g).sessions.find(d=>d.date==='2026-10-20')!.roster.some(p=>p.id===dora.id));assert.deepEqual(s.sessions[0].roster,snapshot.filter(p=>p.id!==anna.id));
const legacy=initial(7);mutate(legacy,{action:'addStudents',names:'Sam\nSam\nAlex'});legacy.groups[0].leader='Alex';legacy.groups[1].leader='Sam';legacy.groups[2].leader='Neuer Leiter';normalizeLeaders(legacy);assert.equal(legacy.groups[0].leaderId,legacy.students.find(p=>p.name==='Alex')!.id);assert.equal(legacy.groups[1].leaderNeedsSelection,true);assert.equal(legacy.groups[1].leaderId,undefined);assert.equal(legacy.students.length,4);const version=JSON.stringify(legacy);normalizeLeaders(legacy);assert.equal(JSON.stringify(legacy),version);
mutate(legacy,{action:'group',id:legacy.groups[1].id,name:legacy.groups[1].name,leader:'Sam',leaderId:legacy.students[0].id});assert.equal(legacy.groups[1].leaderId,legacy.students[0].id);assert.equal(legacy.students.length,4);assert.throws(()=>mutate(legacy,{action:'group',id:legacy.groups[3].id,name:'Andere Gruppe',leader:'Sam',leaderId:legacy.students[0].id}));
console.log('Change checks passed: permanent removal, status reset, pinned leaders, no duplicate students, duplicate-name selection, preserved historical rosters.');

// A deletion while a group draft is open must never reintroduce the removed student.
mutate(s,{action:'assign',id:ben.id,group:g.id});mutate(s,{action:'session',date:'2026-10-27'});const staleMarks={[dora.id]:'anwesend',[ben.id]:'anwesend'};mutate(s,{action:'deleteStudent',id:ben.id});assert.throws(()=>mutate(s,{action:'submit',date:'2026-10-27',marks:staleMarks},g));mutate(s,{action:'submit',date:'2026-10-27',marks:{[dora.id]:'anwesend'}},g);assert.equal(s.sessions.find(d=>d.date==='2026-10-27')!.marks[ben.id],undefined);
console.log('Concurrent deletion check passed: stale submissions rejected, remaining group can submit.');


// Responsible person and helper are existing, distinct pupils, pinned to their class.
const roles=initial(2);mutate(roles,{action:'addStudents',names:'أحمد\nمحمد\nعلي\nحسن',group:roles.groups[0].id});
const [responsible,helper,other]=roles.students,roleClass=roles.groups[1];
mutate(roles,{action:'session',date:'2000-01-01'});const roleHistory=structuredClone(roles.sessions);
mutate(roles,{action:'group',id:roleClass.id,name:'Klasse Rollen',leaderId:responsible.id,helperId:helper.id});
assert.equal(roles.students.length,4);assert.equal(roleClass.leaderId,responsible.id);assert.equal(roleClass.helperId,helper.id);assert.equal(helper.group,roleClass.id);
assert.deepEqual(roles.sessions,roleHistory);
mutate(roles,{action:'distribute'});assert.equal(responsible.group,roleClass.id);assert.equal(helper.group,roleClass.id);
assert.throws(()=>mutate(roles,{action:'assign',id:helper.id,group:roles.groups[0].id}));assert.throws(()=>mutate(roles,{action:'archive',id:helper.id}));
assert.throws(()=>mutate(roles,{action:'group',id:roleClass.id,name:'x',leaderId:responsible.id,helperId:responsible.id}));
assert.throws(()=>mutate(roles,{action:'group',id:roleClass.id,name:'x',leaderId:responsible.id,helperId:'missing'}));
assert.throws(()=>mutate(roles,{action:'group',id:roles.groups[0].id,name:'x',leaderId:helper.id}));
assert.throws(()=>mutate(roles,{action:'group',id:roles.groups[0].id,name:'x',leaderId:other.id,helperId:helper.id}));
assert.throws(()=>mutate(roles,{action:'group',id:roleClass.id,name:'x',leaderId:responsible.id,helperId:helper.id},roleClass));
mutate(roles,{action:'group',id:roleClass.id,name:roleClass.name,leaderId:helper.id,helperId:responsible.id});
assert.equal(roleClass.leaderId,helper.id);assert.equal(roleClass.helperId,responsible.id);
mutate(roles,{action:'renameStudent',id:responsible.id,name:'أحمد جديد'});assert.equal(roles.students.find(p=>p.id===roleClass.helperId)!.name,'أحمد جديد');
mutate(roles,{action:'deleteStudent',id:responsible.id});assert.equal(roleClass.helperId,undefined);assert.equal(roleClass.leaderId,helper.id);
mutate(roles,{action:'group',id:roleClass.id,name:roleClass.name,leaderId:'',helperId:''});assert.equal(roleClass.leaderId,undefined);assert.equal(roleClass.helperId,undefined);
mutate(roles,{action:'group',id:roleClass.id,name:roleClass.name,leaderId:'',helperId:other.id});assert.equal(roleClass.helperId,other.id);
normalizeLeaders(roles);assert.equal(roleClass.helperId,other.id);
console.log('Class role checks passed: existing pupils only, separate roles, duplicate-role rejection, pinning, swaps, rename/deletion cleanup and preserved history.');
