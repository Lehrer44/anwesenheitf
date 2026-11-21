import assert from 'node:assert/strict';
import {initial,mutate,groupView,attendanceDraft,attendanceCounts,isTeacher,normalizeLeaders,syncReportingTeachers,needsTeacherSync,registeredTeachers,teacherRoster,teacherRowId,type State} from '../src/model.ts';
import {documentsFor,mergeStaffDays,tokenHash,type Channel,type Portal,type Staff,type StaffDay} from '../src/firebase-data.ts';

// A course from the previous version: per-class teacher rows, no central list and no school link.
const s=initial(2),[a,b]=s.groups;delete s.teachers;delete s.school;
mutate(s,{action:'addStudents',names:'Anna\nBen',group:a.id});
mutate(s,{action:'addStudents',names:'Clara',group:b.id});
for(const date of ['2000-01-01','2000-01-08','2000-01-15','2099-01-01'])mutate(s,{action:'session',date});
mutate(s,{action:'group',id:a.id,name:a.name,l1:'Teacher A',l2:'Teacher B'});
mutate(s,{action:'group',id:b.id,name:b.name,l1:'Teacher A'});
const [ta,tb]=[a.lehrer!.l1!,a.lehrer!.l2!];
const legacy=s.sessions[2];
legacy.roster.push({id:'teacher-'+a.id+'-'+ta.id,name:ta.name,group:a.id,teacherId:ta.id,teacherRole:'L1'},{id:'teacher-'+b.id+'-'+ta.id,name:ta.name,group:b.id,teacherId:ta.id,teacherRole:'L1'});
legacy.marks['teacher-'+a.id+'-'+ta.id]='anwesend';legacy.marks[s.students[0].id]='anwesend';legacy.reports[a.id]='sent';
const oldest=structuredClone(s.sessions[0]),pupils=structuredClone(s.students);
assert.equal(needsTeacherSync(s),true);
normalizeLeaders(s);syncReportingTeachers(s,'2000-01-15');
// One central row per teacher, presence carried over, class reports and old history untouched.
assert.deepEqual(registeredTeachers(s).map(t=>t.name),['Teacher A','Teacher B']);assert.ok(s.school?.portal&&s.school.staff);
assert.deepEqual(legacy.roster.filter(isTeacher).map(p=>p.id),[teacherRowId(ta.id),teacherRowId(tb.id)]);
assert.equal(legacy.marks[teacherRowId(ta.id)],'anwesend');assert.equal(legacy.marks['teacher-'+a.id+'-'+ta.id],undefined);
assert.equal(legacy.reports[a.id],'sent');assert.equal(legacy.marks[s.students[0].id],'anwesend');
assert.deepEqual(s.sessions[0],oldest);assert.deepEqual(s.students,pupils);
assert.equal(needsTeacherSync(s),false);
const stable=structuredClone(s);syncReportingTeachers(s,'2000-01-15');assert.deepEqual(s,stable);
assert.deepEqual(attendanceCounts(s,legacy).teachers,{present:1,total:2});

// Class links list pupils only; every class sees the same central teacher list.
assert.ok(groupView(s,a).sessions.every(d=>!d.roster.some(isTeacher)));
const docs=await documentsFor(s,'teacher-course','owner',0),staffHash=await tokenHash(s.school!.staff),portalHash=await tokenHash(s.school!.portal);
const staff=docs.get('staff/'+staffHash) as Staff,day=docs.get('staff/'+staffHash+'/days/'+legacy.date) as StaffDay,portal=docs.get('portals/'+portalHash) as Portal;
assert.deepEqual(staff.teachers,[{id:ta.id,name:'Teacher A'},{id:tb.id,name:'Teacher B'}]);
assert.deepEqual(staff.lehrer,{[a.id]:[ta.id,tb.id],[b.id]:[ta.id,'']});
assert.deepEqual(day.teacherIds,[teacherRowId(ta.id),teacherRowId(tb.id)]);assert.deepEqual(day.marks,{[teacherRowId(ta.id)]:'anwesend'});
for(const g of [a,b])assert.equal((docs.get('channels/'+await tokenHash(g.token!)) as Channel).staff,staffHash);
assert.deepEqual(portal.classes.map(c=>c.token),[a.token,b.token]);
assert.ok(!JSON.stringify(docs.get('staff/'+staffHash)).includes(a.token!));
// Any teacher may mark any teacher; marks for unknown rows are ignored.
const merged=mergeStaffDays(s,[{...day,marks:{[teacherRowId(tb.id)]:'anwesend'}},{...day,date:'1999-01-01',marks:{}}]);
assert.equal(merged.sessions[2].marks[teacherRowId(tb.id)],'anwesend');assert.equal(merged.sessions[2].marks[teacherRowId(ta.id)],undefined);
assert.deepEqual(mergeStaffDays(s,[{...day,teacherIds:[...day.teacherIds,s.students[0].id],marks:{[s.students[0].id]:'abwesend'}}]).sessions[2].marks[s.students[0].id],'anwesend');

// Class reports ignore teacher entries in a draft but reject foreign ones.
const view=groupView(s,a),viewDay=view.sessions[2];
mutate(view,{action:'submit',date:viewDay.date,marks:{...attendanceDraft(viewDay),[teacherRowId(ta.id)]:'abwesend'}},view.groups[0]);
assert.equal(viewDay.marks[teacherRowId(ta.id)],undefined);
assert.throws(()=>mutate(view,{action:'submit',date:viewDay.date,marks:{...attendanceDraft(viewDay),[s.students[2].id]:'anwesend'}},view.groups[0]));
assert.throws(()=>mutate(view,{action:'submitTeachers',date:viewDay.date,marks:{}},view.groups[0]));

// The central list: add, rename (also in L1/L2), remove (clears the assignment), stale and duplicate drafts.
const edit=(state:State,teachers:{id?:string,name:string}[])=>mutate(state,{action:'editTeachers',original:structuredClone(registeredTeachers(state)),teachers});
edit(s,[{id:ta.id,name:'Teacher A2'},{id:tb.id,name:'Teacher B'},{name:'Substitute'}]);
assert.equal(a.lehrer!.l1!.name,'Teacher A2');assert.equal(b.lehrer!.l1!.name,'Teacher A2');assert.equal(registeredTeachers(s).length,3);
syncReportingTeachers(s,'2000-01-15');assert.equal(s.sessions[3].roster.filter(isTeacher).length,3);
assert.ok(s.sessions[3].roster.some(p=>p.name==='Substitute'&&p.group===''));
edit(s,[{id:tb.id,name:'Teacher B'},...registeredTeachers(s).filter(t=>t.name==='Substitute')]);
assert.equal(a.lehrer!.l1,null);assert.equal(a.lehrer!.l2!.id,tb.id);assert.equal(b.lehrer!.l1,null);
syncReportingTeachers(s,'2000-01-15');assert.equal(legacy.marks[teacherRowId(ta.id)],undefined);assert.deepEqual(s.sessions[0],oldest);
const current=structuredClone(s);
assert.throws(()=>mutate(s,{action:'editTeachers',original:[],teachers:[]}),/zwischenzeitlich/);
for(const teachers of [[{name:'X'},{name:' x '}],[{name:''}],[{name:'y'.repeat(151)}],[{id:'unknown',name:'Z'}]])assert.throws(()=>edit(s,teachers));
assert.deepEqual(s,current);
// Assigning a new name in the class dialog adds it to the central list.
mutate(s,{action:'group',id:b.id,name:b.name,l1:'New Teacher'});assert.ok(registeredTeachers(s).some(t=>t.name==='New Teacher'));
assert.equal(teacherRoster(s).length,3);

// The school link can be renewed; a class with only teachers has nothing to report as a class.
const old=s.school!.portal;mutate(s,{action:'rotateSchool'});assert.notEqual(s.school!.portal,old);
const only=initial(1);mutate(only,{action:'group',id:only.groups[0].id,name:'Teachers',l2:'Teacher'});mutate(only,{action:'session',date:'2099-02-01'});
assert.throws(()=>mutate(only,{action:'submit',date:'2099-02-01',marks:{}},only.groups[0]),/keine Schüler/);
assert.deepEqual(attendanceCounts(only,only.sessions[0]),{students:{present:0,total:0},teachers:{present:0,total:1}});
console.log('Teacher attendance checks passed: migration to a central list, carried presence, pupil-only class reports, shared teacher days, school link, list editing and teacher-only classes.');
