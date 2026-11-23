import {teacherRowId,type Status} from './model.ts';
import type {Staff,StaffDay} from './firebase-data.ts';
// Read-only teacher history: only past lessons whose teacher attendance was actually sent.
export type HistoryCell='anwesend'|'abwesend'|null;
export type HistoryRow={id:string,name:string,role:''|'L1'|'L2',cells:Record<string,HistoryCell>,present:number,total:number};
export function sentTeacherDays(days:StaffDay[],today:string){
 return days.filter(d=>d.date<=today&&!d.cancelled&&Object.keys(d.marks).length>0).sort((a,b)=>b.date.localeCompare(a.date));
}
// Rows like the teacher dialog: the class's L1/L2 first, then everyone alphabetically.
// Unmarked teachers on a sent day count as absent; a teacher not yet listed that day has no entry.
export function teacherHistory(staff:Pick<Staff,'teachers'|'lehrer'>&{days:StaffDay[]},groupId:string,today:string){
 const days=sentTeacherDays(staff.days,today),[l1,l2]=staff.lehrer[groupId]||[];
 const rows:HistoryRow[]=staff.teachers.map(t=>{
  const row=teacherRowId(t.id),cells:Record<string,HistoryCell>={};let present=0,total=0;
  for(const d of days){
   if(!d.teacherIds.includes(row)){cells[d.date]=null;continue;}
   const status:Status=d.marks[row]==='anwesend'?'anwesend':'abwesend';
   cells[d.date]=status;total++;if(status==='anwesend')present++;
  }
  const role:HistoryRow['role']=t.id===l1?'L1':t.id===l2?'L2':'';
  return {id:t.id,name:t.name,role,cells,present,total};
 }).sort((a,b)=>(a.role||'Z').localeCompare(b.role||'Z')||a.name.localeCompare(b.name,'de'));
 return {dates:days.map(d=>d.date),rows};
}
