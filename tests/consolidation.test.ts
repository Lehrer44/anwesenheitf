import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {initial,mutate,syncFutureSessions,nextSession,groupView,groupedStudents} from '../src/model.ts';
import {makeXlsx} from '../src/export.ts';
const s=initial(7),g=s.groups[0];
mutate(s,{action:'addStudents',names:'Leiter\nAnna\nBen',group:g.id});
mutate(s,{action:'group',id:g.id,name:'Gruppe Grün',leaderId:s.students[0].id});
for(const date of ['2026-10-13','2026-10-14','2026-10-21','2026-10-28'])mutate(s,{action:'session',date});
const past=structuredClone(s.sessions[0]);
s.sessions[2].marks[s.students[0].id]='anwesend';s.sessions[2].reports[g.id]='submitted';
mutate(s,{action:'addStudents',names:'Clara',group:g.id});syncFutureSessions(s,'2026-10-14');
assert.deepEqual(s.sessions[0],past);assert.equal(s.sessions[2].roster.length,4);assert.equal(s.sessions[2].marks[s.students[0].id],'anwesend');assert.equal(s.sessions[2].reports[g.id],undefined);
assert.equal(nextSession(s,'2026-10-14'),'2026-10-14');assert.equal(nextSession(s,'2026-10-15'),'2026-10-21');assert.equal(nextSession(s,'2026-11-01'),'2026-10-28');assert.equal(nextSession(initial(7)),'');
const ben=s.students[2];mutate(s,{action:'reorder',id:ben.id,direction:-1});syncFutureSessions(s,'2026-10-14');
assert.equal(groupedStudents(s)[0].students[1].id,ben.id);assert.equal(groupView(s,g).sessions[0].roster[1].id,ben.id);
assert.throws(()=>mutate(s,{action:'reorder',id:ben.id,direction:1},g));assert.throws(()=>mutate(s,{action:'reorder',id:s.students[0].id,direction:-1}));
const other=s.groups[1];mutate(s,{action:'assign',id:ben.id,group:other.id});syncFutureSessions(s,'2026-10-14');assert.ok(groupView(s,other).sessions[2].roster.some(p=>p.id===ben.id));assert.ok(!groupView(s,g).sessions[2].roster.some(p=>p.id===ben.id));
s.sessions[2].marks[s.students[1].id]='abwesend';s.sessions[2].marks[s.students[2].id]='entschuldigt';
writeFileSync('test-formatted-export.xlsx',makeXlsx(s));
console.log('Consolidation checks passed: future enrollment, past preservation, invalidated reports, next date, shared order, admin-only reorder.');

const resetDate='2026-10-21',otherDays=structuredClone(s.sessions.filter(d=>d.date!==resetDate));
const reset=s.sessions.find(d=>d.date===resetDate)!;reset.cancelled='Eigener Ausfallgrund';reset.reports[g.id]='sent';
assert.throws(()=>mutate(s,{action:'resetSession',date:resetDate},g));
mutate(s,{action:'resetSession',date:resetDate});assert.deepEqual(reset.marks,{});assert.deepEqual(reset.reports,{});assert.equal(reset.cancelled,'');assert.ok(reset.roster.length>0);assert.deepEqual(s.sessions.filter(d=>d.date!==resetDate),otherDays);
mutate(s,{action:'cancel',date:resetDate,reason:'  Eigener Grund  '});assert.equal(reset.cancelled,'Eigener Grund');assert.throws(()=>mutate(s,{action:'cancel',date:resetDate,reason:'   '}));
console.log('Day reset checks passed: admin only, clears marks/reports/reason, retains lesson and roster, leaves other dates unchanged.');


// A deleted date is removed from owner/group views and can be recreated empty.
const deletion=initial(2),classA=deletion.groups[0];
mutate(deletion,{action:'addStudents',names:'أحمد\nمحمد',group:classA.id});
for(const date of ['2026-01-01','2026-01-08','2026-01-15'])mutate(deletion,{action:'session',date});
mutate(deletion,{action:'submit',date:'2026-01-08',marks:Object.fromEntries(deletion.students.map(p=>[p.id,'anwesend']))},classA);
mutate(deletion,{action:'cancel',date:'2026-01-08',reason:'Ausfall'});
const retained=structuredClone(deletion.sessions.filter(d=>d.date!=='2026-01-08')),pupilsBefore=structuredClone(deletion.students),classesBefore=structuredClone(deletion.groups);
assert.throws(()=>mutate(deletion,{action:'deleteSession',date:'2026-01-08'},classA));
mutate(deletion,{action:'deleteSession',date:'2026-01-08'});
assert.deepEqual(deletion.sessions,retained);assert.deepEqual(deletion.students,pupilsBefore);assert.deepEqual(deletion.groups,classesBefore);
assert.ok(!groupView(deletion,classA).sessions.some(d=>d.date==='2026-01-08'));
assert.throws(()=>mutate(deletion,{action:'deleteSession',date:'missing'}),/Termin nicht gefunden/);
mutate(deletion,{action:'session',date:'2026-01-08'});assert.deepEqual(deletion.sessions.map(d=>d.date),['2026-01-01','2026-01-08','2026-01-15']);
assert.deepEqual(deletion.sessions[1].marks,{});assert.deepEqual(deletion.sessions[1].reports,{});assert.equal(deletion.sessions[1].cancelled,'');
for(const date of deletion.sessions.map(d=>d.date))mutate(deletion,{action:'deleteSession',date});assert.equal(deletion.sessions.length,0);
console.log('Lesson deletion checks passed: owner only, other dates/pupils/classes preserved, group date removed, recreation starts empty.');
