import {Timestamp} from 'firebase/firestore';
import {groupView,isTeacher,registeredTeachers,displayClassName,type State,type Status,type Student} from './model.ts';

export type Course = {ownerUid:string,title:string,version:number,dates:string[]};
// staff: hash of the course's central teacher list, shared by all class links.
export type Channel = {ownerUid:string,courseId:string,groupId:string,title:string,group:State['groups'][number],students:Student[],active:boolean,staff?:string};
// staff/{hash}: teacher names and current L1/L2 per class; staff/{hash}/days/{date}: teacher marks for one lesson day.
export type Staff = {ownerUid:string,courseId:string,title:string,teachers:{id:string,name:string}[],lehrer:Record<string,string[]>,active:boolean};
export type StaffDay = {ownerUid:string,courseId:string,date:string,cancelled:string,teacherIds:string[],marks:Record<string,Status>};
// portals/{hash}: the shared school link listing every class with its class link token.
export type Portal = {ownerUid:string,courseId:string,title:string,classes:{id:string,name:string,token:string}[],active:boolean};
export type Lesson = {ownerUid:string,courseId:string,groupId:string,date:string,cancelled:string,roster:Student[],rosterIds:string[],marks:Record<string,Status>,reportedAt:Timestamp|null};
export type Documents = Map<string,any>;
export const clean = <T>(value:T):T => JSON.parse(JSON.stringify(value));
// Firestore may return map keys in a different order than the browser created them.
const canonical = (value:any):any => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
export const equal = (a:unknown,b:unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export async function tokenHash(token:string) {
 if(!/^[a-zA-Z0-9-]{64,160}$/.test(token)) throw Error('Dieser Klassenlink ist ungültig.');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function mergeLessons(state:State,lessons:Lesson[]):State {
 const result=structuredClone(state);
 for(const lesson of lessons) {
  const day=result.sessions.find(d=>d.date===lesson.date);
  if(!day)continue;
  // The authoritative current roster comes from the owner, never from submissions.
  const ids=day.roster.filter(p=>p.group===lesson.groupId).map(p=>p.id);
  if(!equal(ids,lesson.rosterIds))continue;
  for(const id of ids){delete day.marks[id];if(lesson.marks[id])day.marks[id]=lesson.marks[id];}
  delete day.reports[lesson.groupId];
  if(lesson.reportedAt)day.reports[lesson.groupId]=lesson.reportedAt.toDate().toISOString();
 }
 return result;
}
// Teacher marks come only from the central teacher list.
export function mergeStaffDays(state:State,days:StaffDay[]):State {
 const result=structuredClone(state);
 for(const day of days){
  const d=result.sessions.find(x=>x.date===day.date);if(!d)continue;
  for(const id of day.teacherIds)if(d.roster.some(p=>p.id===id&&isTeacher(p))){delete d.marks[id];if(day.marks[id])d.marks[id]=day.marks[id];}
 }
 return result;
}
export const staffPath=async(state:Pick<State,'school'>)=>state.school?'staff/'+await tokenHash(state.school.staff):'';
export const portalPath=async(state:Pick<State,'school'>)=>state.school?'portals/'+await tokenHash(state.school.portal):'';
export function groupState(channel:Channel,lessons:Lesson[]):State {
 return {title:channel.title,groups:[channel.group],students:channel.students,sessions:lessons.map(d=>({
  date:d.date,cancelled:d.cancelled,roster:d.roster,marks:d.marks,
  reports:d.reportedAt?{[channel.groupId]:d.reportedAt.toDate().toISOString()}:{},
 })).sort((a,b)=>a.date.localeCompare(b.date))};
}
export async function documentsFor(state:State,courseId:string,ownerUid:string,version:number):Promise<Documents> {
 const s=clean(state),out:Documents=new Map();
 const base='courses/'+courseId,staff=await staffPath(s),staffHash=staff.slice(6);
 out.set(base,{ownerUid,title:s.title,version,dates:s.sessions.map(d=>d.date)} satisfies Course);
 out.set(base+'/private/config',{students:s.students,groups:s.groups,demo:!!s.demo,...(s.teachers?{teachers:s.teachers}:{}),...(s.school?{school:s.school}:{})});
 if(staff){
  const teachers=registeredTeachers(s);
  out.set(staff,{ownerUid,courseId,title:s.title,teachers:teachers.map(t=>({id:t.id,name:t.name})),lehrer:Object.fromEntries(s.groups.map(g=>[g.id,[g.lehrer?.l1?.id||'',g.lehrer?.l2?.id||'']])),active:true} satisfies Staff);
  for(const d of s.sessions){
   const ids=d.roster.filter(isTeacher).map(p=>p.id);
   out.set(staff+'/days/'+d.date,{ownerUid,courseId,date:d.date,cancelled:d.cancelled,teacherIds:ids,marks:Object.fromEntries(ids.filter(id=>d.marks[id]).map(id=>[id,d.marks[id]]))} satisfies StaffDay);
  }
  out.set(await portalPath(s),{ownerUid,courseId,title:s.title,classes:s.groups.map(g=>({id:g.id,name:displayClassName(g.name),token:g.token!})),active:true} satisfies Portal);
 }
 for(const d of s.sessions)out.set(base+'/sessions/'+d.date,d);
 for(const g of s.groups) {
  const hash=await tokenHash(g.token!),view=groupView(s,g),path='channels/'+hash;
  out.set(path,{ownerUid,courseId,groupId:g.id,title:s.title,group:clean(view.groups[0]),students:view.students,active:true,...(staffHash?{staff:staffHash}:{})} satisfies Channel);
  for(const d of view.sessions)out.set(path+'/lessons/'+d.date,{
   ownerUid,courseId,groupId:g.id,date:d.date,cancelled:d.cancelled,roster:d.roster,rosterIds:d.roster.map(p=>p.id),marks:d.marks,
   reportedAt:d.reports[g.id]?Timestamp.fromDate(new Date(d.reports[g.id])):null,
  } satisfies Lesson);
 }
 return out;
}
export function changesBetween(before:Documents,after:Documents) {
 const sets=[...after].filter(([path,value])=>!equal(before.get(path),value));
 const deletes=[...before.keys()].filter(path=>!after.has(path));
 // Keep the transaction below Firestore limits and give an actionable error before writing.
 if(sets.length+deletes.length>400)throw Error('Diese Änderung betrifft zu viele Termine. Bitte die Datenübernahme in kleineren Abschnitten durchführen.');
 for(const [,value] of sets)if(new TextEncoder().encode(JSON.stringify(value)).length>850000)throw Error('Ein Termin oder die Schülerliste ist zu groß. Bitte den Kurs aufteilen.');
 return {sets,deletes};
}
