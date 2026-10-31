import assert from 'node:assert/strict';
import {initial,mutate,groupView,attendanceDraft,attendanceCounts,orderedRoster,isTeacher,syncFutureSessions,syncReportingTeachers,needsTeacherSync,teacherRoster} from '../src/model.ts';
import {documentsFor,groupState,mergeLessons,tokenHash,type Channel,type Lesson} from '../src/firebase-data.ts';
import {Timestamp} from 'firebase/firestore';

const s=initial(2),[a,b]=s.groups;
mutate(s,{action:'addStudents',names:'Anna\nBen',group:a.id});
mutate(s,{action:'addStudents',names:'Clara',group:b.id});
// Existing lessons predate teacher support; backfill only reportable dates.
for(const date of ['2000-01-01','2000-01-08','2000-01-15','2099-01-01'])mutate(s,{action:'session',date});
mutate(s,{action:'group',id:a.id,name:a.name,l1:'Teacher A',l2:'Teacher B'});
mutate(s,{action:'group',id:b.id,name:b.name,l1:'Teacher A'});
const oldest=structuredClone(s.sessions[0]),pupils=structuredClone(s.students),day=s.sessions[2];
day.marks[s.students[0].id]='anwesend';day.reports[a.id]='sent';
assert.equal(needsTeacherSync(s),true);syncReportingTeachers(s);
assert.equal(needsTeacherSync(s),false);assert.deepEqual(s.sessions[0],oldest);assert.deepEqual(s.students,pupils);
assert.equal(day.reports[a.id],undefined);assert.equal(day.marks[s.students[0].id],'anwesend');
assert.equal(day.roster.filter(isTeacher).length,3);
const stable=structuredClone(s);syncReportingTeachers(s);assert.deepEqual(s,stable);
// Map key order returned by Firestore must not trigger another migration.
for(const d of s.sessions)d.roster=d.roster.map(p=>Object.fromEntries(Object.entries(p).reverse()) as typeof p);
assert.equal(needsTeacherSync(s),false);

const docs=await documentsFor(s,'teacher-course','owner',0),hash=await tokenHash(a.token!),otherHash=await tokenHash(b.token!);
const lesson=docs.get('channels/'+hash+'/lessons/'+day.date) as Lesson;
const view=groupState(docs.get('channels/'+hash) as Channel,[lesson]);
const rows=orderedRoster(view,view.sessions[0].roster);
assert.deepEqual(rows.map(p=>p.teacherRole||p.name),['L1','L2','Anna','Ben']);
assert.equal(view.students.length,2);assert.equal(docs.get('courses/teacher-course/private/config').students.length,3);
const draft=attendanceDraft(view.sessions[0]),teachers=rows.filter(isTeacher);
assert.equal(draft[teachers[0].id],'abwesend');assert.notEqual(teachers[0].id,teachers[0].teacherId);
const incomplete={...draft};delete incomplete[teachers[1].id];
assert.throws(()=>mutate(view,{action:'submit',date:day.date,marks:incomplete},view.groups[0]));
assert.throws(()=>mutate(view,{action:'submit',date:day.date,marks:{...draft,[teachers[0].id]:'entschuldigt'}},view.groups[0]));
const foreign=(docs.get('channels/'+otherHash+'/lessons/'+day.date) as Lesson).roster.find(isTeacher)!;
assert.throws(()=>mutate(view,{action:'submit',date:day.date,marks:{...draft,[foreign.id]:'anwesend'}},view.groups[0]));
draft[teachers[0].id]='anwesend';
mutate(view,{action:'submit',date:day.date,marks:draft},view.groups[0]);
const submitted={...lesson,marks:view.sessions[0].marks,reportedAt:Timestamp.fromMillis(12345)};
const merged=mergeLessons(s,[submitted]);
assert.equal(merged.sessions[2].marks[teachers[0].id],'anwesend');
assert.deepEqual(attendanceCounts(merged,merged.sessions[2]),{students:{present:1,total:3},teachers:{present:1,total:2}});
merged.sessions[2].marks[foreign.id]='anwesend';
assert.equal(attendanceCounts(merged,merged.sessions[2]).teachers.present,1);
merged.sessions[2].cancelled='Ausfall';assert.equal(attendanceCounts(merged,merged.sessions[2]).teachers.present,0);
const beforeReset=structuredClone(view.students);mutate(view,{action:'resetSession',date:day.date});assert.deepEqual(view.sessions[0].marks,{});assert.deepEqual(view.students,beforeReset);

// Changed assignments invalidate a stale draft and remove only departing teacher marks.
const past=structuredClone(s.sessions[0]);day.marks[teachers[0].id]='anwesend';day.marks[teachers[1].id]='abwesend';day.reports[a.id]='sent';
mutate(s,{action:'group',id:a.id,name:a.name,l1:'Teacher C',l2:''});syncReportingTeachers(s);
assert.equal(day.reports[a.id],undefined);assert.equal(day.marks[teachers[0].id],undefined);assert.equal(day.marks[s.students[0].id],'anwesend');
assert.deepEqual(s.sessions[0],past);assert.deepEqual(s.students,pupils);
assert.throws(()=>mutate(s,{action:'submit',date:day.date,marks:draft},a));
assert.equal(mergeLessons(s,[submitted]).sessions[2].marks[teachers[0].id],undefined);
syncFutureSessions(s,'2099-01-01');assert.equal(s.sessions[3].roster.filter(isTeacher).length,2);
assert.deepEqual(groupView(s,a).sessions[2].roster.filter(isTeacher).map(p=>p.name),['Teacher C']);

// A class with only teachers can still submit, and teachers never affect pupil numbering.
const only=initial(1);mutate(only,{action:'group',id:only.groups[0].id,name:'Teachers',l2:'Teacher'});
mutate(only,{action:'session',date:'2099-02-01'});assert.equal(only.students.length,0);
assert.deepEqual(only.sessions[0].roster.map(p=>p.teacherRole),['L2']);
mutate(only,{action:'submit',date:'2099-02-01',marks:attendanceDraft(only.sessions[0])},only.groups[0]);
assert.deepEqual(attendanceCounts(only,only.sessions[0]),{students:{present:0,total:0},teachers:{present:0,total:1}});
assert.equal(teacherRoster(only).length,1);
console.log('Teacher attendance checks passed: migration, ordering, separate numbering, scoped submissions, persistence, unique counts, stale assignments, reset and teacher-only classes.');
