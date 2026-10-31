import assert from 'node:assert/strict';
import {initial,mutate,normalizeLeaders,groupView,registeredTeachers,attendanceCounts,attendanceDraft,syncReportingTeachers} from '../src/model.ts';
import {courseChanges} from '../src/course-management.ts';
import {isDate,monthDays,shiftMonth} from '../src/calendar.ts';

{
 assert.equal(isDate('2028-02-29'),true);for(const d of ['2026-02-29','2026-99-99','2026-04-31','2026-1-01','not-a-date',null,42])assert.equal(isDate(d),false);
 assert.equal(monthDays('2028-02').filter(Boolean).length,29);assert.equal(monthDays('2026-02').filter(Boolean).length,28);assert.equal(monthDays('2026-02').findIndex(Boolean),6);assert.deepEqual(monthDays('invalid'),[]);assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2027-01',-1),'2026-12');
 const state=initial(1);mutate(state,{action:'addStudents',names:'Anna\nBen',group:state.groups[0].id});
 mutate(state,{action:'session',date:'2026-01-01'});state.sessions[0].marks[state.students[0].id]='anwesend';state.sessions[0].reports[state.groups[0].id]='sent';const preserved=structuredClone(state.sessions[0]);
 const dates=Array.from({length:30},(_,i)=>{const d=new Date('2026-10-01T12:00:00Z');d.setUTCDate(d.getUTCDate()+i*7);return d.toISOString().slice(0,10);});
 const unchanged=structuredClone(state);
 for(const selected of [[],['bad'],['2026-99-99'],['2026-02-30'],[dates[0],dates[0]],[dates[0],'2026-01-01']]){assert.throws(()=>mutate(state,{action:'sessions',dates:selected}));assert.deepEqual(state,unchanged);}
 assert.throws(()=>mutate(state,{action:'sessions',dates},state.groups[0]));assert.throws(()=>mutate(initial(1),{action:'sessions',dates}));
 mutate(state,{action:'sessions',dates:[...dates].reverse()});assert.equal(state.sessions.length,31);assert.deepEqual(state.sessions.map(d=>d.date),['2026-01-01',...dates]);assert.deepEqual(state.sessions[0],preserved);assert.notEqual(state.sessions[1].roster,state.sessions[2].roster);assert.notEqual(state.sessions[1].roster[0],state.sessions[2].roster[0]);
 const full=structuredClone(state);assert.throws(()=>mutate(state,{action:'deleteSessions',dates:[dates[0],'2000-01-01']}));assert.deepEqual(state,full);assert.throws(()=>mutate(state,{action:'deleteSessions',dates},state.groups[0]));
 mutate(state,{action:'deleteSessions',dates:dates.filter((_,i)=>i%2===0)});assert.deepEqual(state.sessions.map(d=>d.date),['2026-01-01',...dates.filter((_,i)=>i%2!==0)]);assert.deepEqual(state.sessions[0],preserved);
 mutate(state,{action:'deleteSessions',dates:state.sessions.map(d=>d.date)});assert.deepEqual(state.sessions,[]);assert.equal(state.students.length,2);assert.equal(state.groups.length,1);
 const limit=structuredClone(unchanged);limit.sessions=Array.from({length:1000},()=>structuredClone(preserved));assert.throws(()=>mutate(limit,{action:'sessions',dates:[dates[0]]}),/1.000/);assert.equal(limit.sessions.length,1000);
 console.log('Multiple-date checks passed: leap years, month/year changes, 30 weekly dates, atomic validation, independent rosters, existing marks preserved, partial/all deletion, stale selection and class-link rejection.');
}

{
 const original=[{id:'one',title:'Erste'},{id:'two',title:'Zweite'}];
 assert.deepEqual(courseChanges(original,[{id:'one',title:' Neu '},{title:'Dritte',groupCount:0}]),{renamed:[{id:'one',title:'Neu',previousTitle:'Erste'}],deleted:[original[1]],added:[{title:'Dritte',groupCount:0}]});
 assert.deepEqual(courseChanges(original,original),{renamed:[],deleted:[],added:[]});
 assert.deepEqual(courseChanges(original,[]).deleted,original);
 for(const rows of [[{id:'unknown',title:'Fremd'}],[original[0],original[0]],[{title:' ',groupCount:0}],[{title:'x'.repeat(101),groupCount:0}],[{title:'Neu',groupCount:31}],[{title:'Neu',groupCount:1.5}],[{title:'Neu'}]])assert.throws(()=>courseChanges(original,rows));
 console.log('Course list planning checks passed: rename, staged deletion, additions, unchanged lists, duplicate/foreign IDs and validation.');
}

// The class editor saves all changes atomically and rejects stale drafts.
{
 const state=initial(2),[a,b]=state.groups;
 mutate(state,{action:'addStudents',names:'Leitung\nHelfer\nAnna\nBen',group:a.id});
 mutate(state,{action:'addStudents',names:'Andere Klasse',group:b.id});
 const [leader,helper,anna,ben]=state.students;
 mutate(state,{action:'group',id:a.id,name:a.name,l1:'Frau Lehrerin',l2:'Herr Lehrer'});
 mutate(state,{action:'session',date:'2026-01-01'});state.sessions[0].marks[ben.id]='anwesend';
 const original=structuredClone(state.students.filter(p=>p.group===a.id));
 const draft=[{...anna,name:'Anna Neu',group:b.id},{...helper,name:'Helfer Neu'},{...leader,name:'Leitung Neu'}];
 const body={action:'editClassStudents',group:a.id,original,students:draft};
 assert.throws(()=>mutate(state,body,a));
 const unchanged=structuredClone(state);
 for(const students of [[...draft,{...draft[0]}],[{...draft[0],name:' '}],[{...draft[0],group:'unknown'}],[{...draft[0],id:'missing'}]]){
  assert.throws(()=>mutate(state,{...body,students}));assert.deepEqual(state,unchanged);
 }
 mutate(state,body);
 assert.deepEqual(state.students.map(p=>p.id),[anna.id,helper.id,leader.id,unchanged.students[4].id]);
 assert.equal(state.students[0].group,b.id);assert.equal(state.groups[0].lehrer?.l1?.name,'Frau Lehrerin');assert.equal(state.groups[0].lehrer?.l2?.name,'Herr Lehrer');
 assert.equal(state.sessions[0].roster.find(p=>p.id===anna.id)?.name,'Anna');
 assert.ok(!state.sessions[0].roster.some(p=>p.id===ben.id));assert.equal(state.sessions[0].marks[ben.id],undefined);
 const after=structuredClone(state);assert.throws(()=>mutate(state,body),/zwischenzeitlich/);assert.deepEqual(state,after);
 const remaining=structuredClone(state.students.filter(p=>p.group===a.id));
 mutate(state,{action:'editClassStudents',group:a.id,original:remaining,students:[]});
 assert.ok(!state.students.some(p=>p.group===a.id));assert.equal(state.groups[0].leaderId,undefined);assert.equal(state.groups[0].helperId,undefined);
 const unassigned=initial();mutate(unassigned,{action:'addStudents',names:'Ohne Klasse'});
 mutate(unassigned,{action:'editClassStudents',group:'',original:structuredClone(unassigned.students),students:[{...unassigned.students[0],name:'Neuer Name'}]});assert.equal(unassigned.students[0].name,'Neuer Name');
 const stale=initial(1);mutate(stale,{action:'addStudents',names:'A',group:stale.groups[0].id});const old=structuredClone(stale.students);mutate(stale,{action:'addStudents',names:'B',group:stale.groups[0].id});assert.throws(()=>mutate(stale,{action:'editClassStudents',group:stale.groups[0].id,original:old,students:old}),/zwischenzeitlich/);
 console.log('Class editor checks passed: atomic rename/move/reorder/delete, independent teachers, stale drafts, empty classes, unassigned pupils and preserved history.');
}

// Teachers are separate records; legacy student roles are never promoted.
const s=initial(2),[g,other]=s.groups;
mutate(s,{action:'addStudents',names:'Anna\nBen\nClara',group:g.id});
const [anna,ben,clara]=s.students;
mutate(s,{action:'session',date:'2026-10-13'});
const history=structuredClone(s.sessions),pupils=structuredClone(s.students),token=g.token;
g.leader='Anna';g.leaderId=anna.id;g.helperId=ben.id;
normalizeLeaders(s);
assert.equal(registeredTeachers(s).length,0);assert.equal(g.leader,'');assert.equal(g.leaderId,undefined);assert.equal(g.helperId,undefined);
assert.deepEqual(s.students,pupils);assert.deepEqual(s.sessions,history);
const normalized=structuredClone(s);normalizeLeaders(s);assert.deepEqual(s,normalized);
mutate(s,{action:'group',id:g.id,name:'Klasse Neu',l1:'  Frau Lehrerin  ',l2:'Herr Lehrer'});
assert.equal(g.name,'Klasse Neu');assert.equal(g.lehrer?.l1?.name,'Frau Lehrerin');assert.equal(g.lehrer?.l2?.name,'Herr Lehrer');assert.notEqual(g.lehrer?.l1?.id,anna.id);
assert.equal(g.token,token);assert.deepEqual(s.students,pupils);assert.deepEqual(s.sessions,history);
const teacherId=g.lehrer!.l1!.id;
mutate(s,{action:'group',id:g.id,name:g.name,l1:'Frau Lehrerin',l2:'Herr Lehrer'});assert.equal(g.lehrer!.l1!.id,teacherId);
mutate(s,{action:'group',id:other.id,name:other.name,l1:'frau lehrerin'});assert.equal(other.lehrer!.l1!.id,teacherId);assert.equal(registeredTeachers(s).length,2);
const beforeInvalid=structuredClone(s);
for(const fields of [{l1:'x'.repeat(151)},{l2:42},{l1:'Anna',l2:' anna '},{l1:null}]){assert.throws(()=>mutate(s,{action:'group',id:g.id,name:g.name,...fields}));assert.deepEqual(s,beforeInvalid);}
assert.throws(()=>mutate(s,{action:'group',id:g.id,name:g.name,l1:'Forbidden'},g));
assert.throws(()=>mutate(s,{action:'groupCount',count:1}));
mutate(s,{action:'renameStudent',id:anna.id,name:'Anna Neu'});assert.equal(g.lehrer!.l1!.name,'Frau Lehrerin');assert.deepEqual(s.sessions,history);
mutate(s,{action:'assign',id:anna.id,group:other.id});mutate(s,{action:'archive',id:anna.id});assert.equal(anna.archived,true);
mutate(s,{action:'distribute'});assert.equal(registeredTeachers(s).length,2);
mutate(s,{action:'group',id:g.id,name:g.name,l1:'',l2:''});assert.equal(registeredTeachers(s).length,1);assert.equal(other.lehrer!.l1!.id,teacherId);
mutate(s,{action:'deleteGroup',id:other.id});assert.equal(registeredTeachers(s).length,0);

// Counts include only the selected roster's present students, never stale marks.
const day=s.sessions[0];day.marks={[anna.id]:'anwesend',[ben.id]:'abwesend',[clara.id]:'entschuldigt',removed:'anwesend'};
assert.deepEqual(attendanceCounts(s,day),{students:{present:1,total:3},teachers:{present:0,total:0}});
mutate(s,{action:'group',id:g.id,name:g.name,l1:'Lehrer A',l2:'Lehrer B'});syncReportingTeachers(s);assert.deepEqual(attendanceCounts(s,day).teachers,{present:0,total:2});
assert.equal(attendanceCounts(s).students.total,2);assert.equal(attendanceCounts(s).students.present,0);
day.cancelled='Ausfall';assert.equal(attendanceCounts(s,day).students.present,0);day.cancelled='';
const saved=structuredClone(day);assert.equal(attendanceDraft(day)[clara.id],'abwesend');assert.deepEqual(day,saved);
assert.throws(()=>mutate(s,{action:'submit',date:day.date,marks:{[anna.id]:'anwesend',[ben.id]:'abwesend',[clara.id]:'entschuldigt'}},g));
mutate(s,{action:'submit',date:day.date,marks:attendanceDraft(day)},g);assert.equal(day.marks[clara.id],'abwesend');
mutate(s,{action:'mark',date:day.date,id:anna.id,status:''});assert.equal(day.marks[anna.id],undefined);assert.equal(day.reports[g.id],undefined);
assert.throws(()=>mutate(s,{action:'deleteStudent',id:ben.id},g));
const stale=attendanceDraft(day);mutate(s,{action:'deleteStudent',id:ben.id});assert.throws(()=>mutate(s,{action:'submit',date:day.date,marks:stale},g));
mutate(s,{action:'submit',date:day.date,marks:attendanceDraft(day)},g);assert.equal(day.marks[ben.id],undefined);
assert.equal(registeredTeachers(s).length,2);assert.equal(groupView(s,g).groups[0].leader,'Lehrer A');
console.log('Teacher and attendance checks passed: independent records, legacy cleanup, stable/shared IDs, validation, history, counts, two-status submissions and stale drafts.');
