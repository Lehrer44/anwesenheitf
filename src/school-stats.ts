import type {Lesson,StaffDay} from './firebase-data.ts';
// Shared school overview for every teacher: today's class check marks and the last lesson days.
export type DayStats={date:string,cancelled:boolean,pupils:number,pupilTotal:number,teachers:number};
export type ClassStatus={reported:boolean,present:number,total:number};
type LessonLike=Pick<Lesson,'date'|'cancelled'|'roster'|'marks'|'reportedAt'>;
const pupilRows=(l:LessonLike)=>l.roster.filter(p=>!p.teacherId);
// Older lessons carry per-class teacher rows ("teacher-<class>-<id>"); a teacher still counts once.
const teacherKey=(row:string)=>row.slice(-36);
export function schoolStats(lessons:Record<string,LessonLike[]>,staffDays:StaffDay[],today:string,limit=5){
 const past=Object.fromEntries(Object.entries(lessons).map(([id,list])=>[id,list.filter(l=>l.date<=today)]));
 const staff=new Map(staffDays.filter(d=>d.date<=today).map(d=>[d.date,d]));
 const dates=[...new Set([...Object.values(past).flat().map(l=>l.date),...staff.keys()])].sort().reverse();
 // The current lesson is the latest one up to today; a new lesson day starts without check marks.
 const current=dates[0]||'';
 const classes:Record<string,ClassStatus>={};
 for(const [id,list] of Object.entries(past)){
  const l=list.find(x=>x.date===current);
  classes[id]={reported:!!l&&!l.cancelled&&!!l.reportedAt,present:l?pupilRows(l).filter(p=>l.marks[p.id]==='anwesend').length:0,total:l?pupilRows(l).length:0};
 }
 const days:DayStats[]=dates.slice(0,limit).map(date=>{
  const ls=Object.values(past).flat().filter(l=>l.date===date),s=staff.get(date);
  const cancelled=ls.some(l=>!!l.cancelled)||!!s?.cancelled;
  const pupils=ls.reduce((n,l)=>n+pupilRows(l).filter(p=>l.marks[p.id]==='anwesend').length,0);
  const teachers=new Set(Object.entries(s?.marks||{}).filter(([,v])=>v==='anwesend').map(([k])=>teacherKey(k))).size;
  return {date,cancelled,pupils:cancelled?0:pupils,pupilTotal:ls.reduce((n,l)=>n+pupilRows(l).length,0),teachers:cancelled?0:teachers};
 });
 return {current,classes,days};
}
