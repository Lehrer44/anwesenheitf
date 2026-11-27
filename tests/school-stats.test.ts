import assert from 'node:assert/strict';
import {schoolStats} from '../src/school-stats.ts';
const pupil=(id:string)=>({id,name:id,group:'g'});
const lesson=(date:string,ids:string[],present:string[],reported=true,cancelled='')=>({date,cancelled,roster:ids.map(pupil),marks:Object.fromEntries(ids.map(id=>[id,present.includes(id)?'anwesend' as const:'abwesend' as const])),reportedAt:reported?{} as any:null});
const day=(date:string,marks:Record<string,'anwesend'|'abwesend'>,cancelled='')=>({ownerUid:'o',courseId:'c',date,cancelled,teacherIds:Object.keys(marks),marks});
const lessons={
 a:[lesson('2026-11-26',['a1','a2','a3'],['a1','a2']),lesson('2026-11-24',['a1','a2','a3'],['a1']),lesson('2026-11-21',['a1','a2','a3'],[],false,'Ferien')],
 b:[lesson('2026-11-26',['b1','b2'],[],false),lesson('2026-11-24',['b1','b2'],['b1','b2'])],
 c:[lesson('2026-11-28',['c1'],['c1'])],
};
const staff=[day('2026-11-26',{'teacher-x':'anwesend','teacher-y':'abwesend'}),day('2026-11-24',{'teacher-g1-00000000-0000-0000-0000-000000000001':'anwesend','teacher-g2-00000000-0000-0000-0000-000000000001':'anwesend','teacher-y':'anwesend'}),day('2026-11-28',{'teacher-x':'anwesend'})];
const s=schoolStats(lessons,staff,'2026-11-27');
// The current lesson is the latest up to today; future lessons are ignored.
assert.equal(s.current,'2026-11-26');
assert.deepEqual(s.classes,{a:{reported:true,present:2,total:3},b:{reported:false,present:0,total:2},c:{reported:false,present:0,total:0}});
assert.deepEqual(s.days.map(d=>d.date),['2026-11-26','2026-11-24','2026-11-21']);
assert.deepEqual(s.days[0],{date:'2026-11-26',cancelled:false,pupils:2,pupilTotal:5,teachers:1});
// A teacher counted in two classes on an older lesson still counts once.
assert.deepEqual(s.days[1],{date:'2026-11-24',cancelled:false,pupils:3,pupilTotal:5,teachers:2});
assert.equal(s.days[2].cancelled,true);assert.equal(s.days[2].pupils,0);
// On the next lesson day, the check marks start empty again.
const next=schoolStats({...lessons,a:[lesson('2026-11-28',['a1'],[],false),...lessons.a]},staff,'2026-11-28');
assert.equal(next.current,'2026-11-28');assert.equal(next.classes.a.reported,false);assert.equal(next.classes.c.reported,true);
assert.equal(schoolStats({a:[]},[],'2026-11-27').current,'');
assert.equal(schoolStats(Object.fromEntries(Array.from({length:3},(_,i)=>[String(i),Array.from({length:8},(_,k)=>lesson(`2026-10-${String(k+1).padStart(2,'0')}`,['p'],['p']))])),[],'2026-11-27').days.length,5);
console.log('School overview checks passed: current lesson, class check marks, new lesson day, last five days, cancellations and teachers counted once.');
