import assert from 'node:assert/strict';
import {teacherHistory,sentTeacherDays} from '../src/teacher-history.ts';
const t=(id:string,name:string)=>({id,name}),row=(id:string)=>'teacher-'+id;
const day=(date:string,teacherIds:string[],marks:Record<string,'anwesend'|'abwesend'>,cancelled='')=>({ownerUid:'o',courseId:'c',date,cancelled,teacherIds:teacherIds.map(row),marks:Object.fromEntries(Object.entries(marks).map(([k,v])=>[row(k),v]))});
const staff={teachers:[t('z','Zeynep'),t('a','Ali'),t('l2','Lina'),t('l1','Musa')],lehrer:{g:['l1','l2']},days:[
 day('2026-11-01',['z','a','l1','l2'],{a:'anwesend',l1:'anwesend'}),
 day('2026-11-03',['z','a','l1','l2'],{}),                      // nothing sent: hidden
 day('2026-11-05',['z','a','l1','l2'],{a:'anwesend'},'Ferien'), // cancelled: hidden
 day('2026-11-08',['a','l1','l2','z'],{z:'anwesend',l2:'abwesend'}),
 day('2026-11-10',['a','l1'],{a:'abwesend'}),                   // Zeynep and Lina not yet listed
 day('2026-11-30',['z','a','l1','l2'],{a:'anwesend'}),          // future: hidden
]};
assert.deepEqual(sentTeacherDays(staff.days,'2026-11-23').map(d=>d.date),['2026-11-10','2026-11-08','2026-11-01']);
const h=teacherHistory(staff,'g','2026-11-23');
// Newest first; the class's L1/L2 lead, then everyone alphabetically.
assert.deepEqual(h.dates,['2026-11-10','2026-11-08','2026-11-01']);
assert.deepEqual(h.rows.map(r=>[r.name,r.role]),[['Musa','L1'],['Lina','L2'],['Ali',''],['Zeynep','']]);
const by=Object.fromEntries(h.rows.map(r=>[r.name,r]));
assert.deepEqual(by.Ali.cells,{'2026-11-10':'abwesend','2026-11-08':'abwesend','2026-11-01':'anwesend'});assert.equal(`${by.Ali.present}/${by.Ali.total}`,'1/3');
assert.deepEqual(by.Zeynep.cells,{'2026-11-10':null,'2026-11-08':'anwesend','2026-11-01':'abwesend'});assert.equal(`${by.Zeynep.present}/${by.Zeynep.total}`,'1/2');
assert.equal(`${by.Musa.present}/${by.Musa.total}`,'1/3');assert.equal(by.Lina.cells['2026-11-10'],null);
// Another class sees the same history with its own L1/L2 first; today's sent report is included.
assert.deepEqual(teacherHistory(staff,'other','2026-11-23').rows.map(r=>r.name),['Ali','Lina','Musa','Zeynep']);
assert.equal(teacherHistory(staff,'g','2026-11-30').dates[0],'2026-11-30');
assert.deepEqual(teacherHistory({...staff,days:[]},'g','2026-11-23').dates,[]);
console.log('Teacher history checks passed: only sent past lessons, newest first, own L1/L2 first, unmarked counts as absent, unlisted teachers and totals.');
