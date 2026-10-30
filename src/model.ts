import {sessionDates} from './calendar.ts';
export type Student={id:string,name:string,group:string,archived?:boolean};
export type Teacher={id:string,name:string};
export type Group={id:string,name:string,leader:string,leaderId?:string,helperId?:string,leaderNeedsSelection?:boolean,token?:string,lehrer?:{l1:Teacher|null,l2:Teacher|null}};
export type Status='anwesend'|'abwesend'|'entschuldigt';
export type Session={date:string,cancelled:string,roster:Student[],marks:Record<string,Status>,reports:Record<string,string>};
export type State={demo?:boolean,title:string,students:Student[],groups:Group[],sessions:Session[]};
// Defaults are local form values; a class must explicitly submit before anything is saved.
export function attendanceDraft(session?:Session):Record<string,Status>{
 if(!session||session.cancelled)return {};
 return Object.fromEntries(session.roster.map(p=>[p.id,session.marks[p.id]==='anwesend'?'anwesend':'abwesend']));
}
export const displayClassName=(name:string)=>name.replace(/^Gruppe(?=\s|$)/,'Klasse');
function checkedGroupCount(count:number){if(!Number.isInteger(count)||count<0||count>30)throw Error('Bitte eine ganze Klassenanzahl von 0 bis 30 wählen.');return count;}
const newGroup=(index:number):Group=>({id:crypto.randomUUID(),name:`Klasse ${index+1}`,leader:'',token:crypto.randomUUID()+crypto.randomUUID()});
export function initial(groupCount=0):State{return {title:'Mein Wochenkurs',students:[],groups:Array.from({length:checkedGroupCount(groupCount)},(_,i)=>newGroup(i)),sessions:[]};}
const nameKey=(name:string)=>name.trim().normalize('NFKC').toLocaleLowerCase('de');
// Retire student roles without converting pupils into teachers or changing history.
export function normalizeLeaders(s:State){
 for(const g of s.groups){g.leader='';delete g.leaderId;delete g.helperId;delete g.leaderNeedsSelection;}
}
export function registeredTeachers(s:State):Teacher[]{
 return [...new Map(s.groups.flatMap(g=>[g.lehrer?.l1,g.lehrer?.l2]).filter((t):t is Teacher=>!!t).map(t=>[t.id,t])).values()];
}
export function attendanceCounts(s:State,session?:Session){
 const roster=session?.roster||s.students.filter(p=>!p.archived);
 return {students:{present:session&&!session.cancelled?roster.filter(p=>session.marks[p.id]==='anwesend').length:0,total:roster.length},teachers:{present:0,total:registeredTeachers(s).length}};
}
export const courseToday=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(now);
export function nextSession(s:State,today=courseToday()){const dates=s.sessions.map(d=>d.date).sort();return dates.find(d=>d>=today)||dates.at(-1)||'';}
export function classSessionChoices(s:Pick<State,'sessions'>,today=courseToday()){
 const sorted=[...s.sessions].sort((a,b)=>a.date.localeCompare(b.date));
 return [...sorted.filter(d=>d.date<=today).slice(-2),...sorted.filter(d=>d.date>today).slice(0,1)];
}
export function classSessionDate(s:Pick<State,'sessions'>,current='',today=courseToday(),keepCurrent=false){
 const choices=classSessionChoices(s,today);
 if(keepCurrent&&choices.some(d=>d.date===current))return current;
 return choices.filter(d=>d.date<=today).at(-1)?.date||'';
}
export function groupedStudents(s:State){return [...s.groups.map(g=>({id:g.id,name:displayClassName(g.name),students:s.students.filter(p=>p.group===g.id)})),{id:'',name:'Ohne Klasse',students:s.students.filter(p=>!s.groups.some(g=>g.id===p.group))}];}
export function orderedRoster(s:State,roster:Student[]){const ranks=new Map(s.students.map((p,i)=>[p.id,i]));return [...roster].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));}
// Keep today's and future lessons in step with enrollment. Past snapshots are immutable.
export function syncFutureSessions(s:State,today=courseToday()){
 const active=s.students.filter(p=>!p.archived);
 for(const d of s.sessions.filter(d=>d.date>=today)){
  const old=new Map(d.roster.map(p=>[p.id,p]));const current=new Map(active.map(p=>[p.id,p]));
  for(const g of s.groups){const before=d.roster.filter(p=>p.group===g.id).map(p=>p.id).sort().join(',');const after=active.filter(p=>p.group===g.id).map(p=>p.id).sort().join(',');if(before!==after)delete d.reports[g.id];}
  for(const id of Object.keys(d.marks)){if(!current.has(id)||old.get(id)?.group!==current.get(id)?.group)delete d.marks[id];}
  d.roster=active.map(p=>({...p}));
 }
}
export function mutate(s:State,b:any,group?:Group):void {
 const find=()=>{const d=s.sessions.find(x=>x.date===b.date);if(!d)throw Error('Termin nicht gefunden.');return d;};
 if(group){
  if(b.action!=='submit')throw Error('Nur die eigene Klassenmeldung ist erlaubt.');
  const d=find();if(d.cancelled)throw Error('Dieser Unterricht fällt aus.');
  const ids=d.roster.filter(x=>x.group===group.id).map(x=>x.id);
  if(!ids.length)throw Error('Für diese Klasse sind keine Schüler zugeteilt.');
  if(!b.marks||Object.keys(b.marks).length!==ids.length||ids.some(id=>!['anwesend','abwesend'].includes(b.marks[id])))throw Error('Bitte für jeden Schüler einen Status wählen.');
  ids.forEach(id=>d.marks[id]=b.marks[id]);d.reports[group.id]=new Date().toISOString();return;
 }
 switch(b.action){
 case 'editClassStudents':{
  // A stale editor must not overwrite another person's student changes.
  const current=groupedStudents(s).find(g=>g.id===b.group);
  if(!current||!Array.isArray(b.original)||!Array.isArray(b.students)||b.students.length>b.original.length)throw Error('Ungültige Klassenbearbeitung.');
  const sameStudent=(a:Student,z:Student)=>a&&z&&a.id===z.id&&a.name===z.name&&a.group===z.group&&!!a.archived===!!z.archived;
  if(current.students.length!==b.original.length||current.students.some((p,i)=>!sameStudent(p,b.original[i])))throw Error('Die Schülerliste wurde zwischenzeitlich geändert. Bitte den Dialog schließen und erneut öffnen.');
  const ids=new Set<string>();
  for(const p of b.students){if(!p||typeof p.id!=='string'||ids.has(p.id)||!current.students.some(x=>x.id===p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>150||typeof p.group!=='string'||p.group&&!s.groups.some(g=>g.id===p.group))throw Error('Bitte gültige Schülernamen und Klassen wählen.');ids.add(p.id);}
  // Validate and apply the whole edit on a copy; failures leave the original intact.
  const edited=structuredClone(s);
  for(const p of current.students)if(!ids.has(p.id))mutate(edited,{action:'deleteStudent',id:p.id});
  for(const p of b.students){mutate(edited,{action:'renameStudent',id:p.id,name:p.name});mutate(edited,{action:'assign',id:p.id,group:p.group});}
  const ordered=b.students.map((p:Student)=>edited.students.find(x=>x.id===p.id)!);let index=0;
  edited.students=edited.students.map(p=>ids.has(p.id)?ordered[index++]:p);
  Object.assign(s,edited);break;}
 case 'title':{
  const title=String(b.title||'').trim();
  if(!title||title.length>100)throw Error('Bitte einen Kursnamen mit 1 bis 100 Zeichen eingeben.');
  s.title=title;break;}
 case 'addStudents':{
  if(s.demo)throw Error('Bitte zuerst die Beispieldaten entfernen, bevor du echte Namen hinzufügst.');
  const names=String(b.names||'').split('\n').map(x=>x.trim()).filter(Boolean);
  if(names.length>2000||s.students.length+names.length>5000||names.some(x=>x.length>150))throw Error('Maximal 2.000 neue Namen, jeweils bis 150 Zeichen.');
  if(!names.length)throw Error('Bitte mindestens einen Namen eingeben.');
  names.forEach(name=>s.students.push({id:crypto.randomUUID(),name,group:s.groups.some(g=>g.id===b.group)?b.group:''}));break;}
 case 'demo':{
  if(!s.groups.length)throw Error('Bitte zunächst mindestens eine Klasse anlegen.');
  if(s.students.length||s.sessions.length)throw Error('Beispieldaten sind nur in einem leeren Kurs möglich.');
  s.demo=true;for(let i=0;i<100;i++)s.students.push({id:crypto.randomUUID(),name:`Beispielschüler ${String(i+1).padStart(3,'0')}`,group:s.groups[i%s.groups.length].id});break;}
 case 'clearDemo':{if(!s.demo)throw Error('Dieser Kurs enthält keine Beispieldaten.');s.students=[];s.sessions=[];s.demo=false;break;}
 case 'assign':{const p=s.students.find(x=>x.id===b.id);if(!p)throw Error('Schüler nicht gefunden.');if(b.group&&!s.groups.some(g=>g.id===b.group))throw Error('Klasse nicht gefunden.');p.group=b.group||'';break;}
 case 'reorder':{
  const p=s.students.find(p=>p.id===b.id);if(!p||![-1,1].includes(b.direction))throw Error('Ungültige Reihenfolge.');
  const peers=s.students.filter(x=>x.group===p.group);const target=peers[peers.indexOf(p)+b.direction];if(!target)throw Error('Der Schüler steht bereits am Rand seiner Klasse.');
  const a=s.students.indexOf(p),z=s.students.indexOf(target);[s.students[a],s.students[z]]=[s.students[z],s.students[a]];break;}
 case 'renameStudent':{const p=s.students.find(x=>x.id===b.id);const name=String(b.name||'').trim();if(!p||!name||name.length>150)throw Error('Bitte einen gültigen Namen eingeben.');p.name=name;break;}
 case 'archive':{const p=s.students.find(x=>x.id===b.id);if(p){p.archived=!p.archived;}break;}
 case 'deleteStudent':{
  if(!s.students.some(p=>p.id===b.id))throw Error('Schüler nicht gefunden.');
  s.students=s.students.filter(p=>p.id!==b.id);
  for(const g of s.groups){if(g.helperId===b.id)delete g.helperId;if(g.leaderId===b.id){g.leader='';delete g.leaderId;delete g.leaderNeedsSelection;}}
  for(const d of s.sessions){const removed=d.roster.find(p=>p.id===b.id);d.roster=d.roster.filter(p=>p.id!==b.id);delete d.marks[b.id];if(removed&&!d.roster.some(p=>p.group===removed.group))delete d.reports[removed.group];}
  break;}
 case 'distribute':{
  if(!s.groups.length)throw Error('Bitte zunächst Klassen anlegen.');
  const counts=new Map(s.groups.map(g=>[g.id,0]));
  for(const p of s.students.filter(p=>!p.archived)){const g=s.groups.reduce((a,b)=>counts.get(a.id)!<=counts.get(b.id)!?a:b);p.group=g.id;counts.set(g.id,counts.get(g.id)!+1);}
  break;}
 case 'deleteGroup':{
  if(!s.groups.some(g=>g.id===b.id))throw Error('Klasse nicht gefunden.');
  s.groups=s.groups.filter(g=>g.id!==b.id);
  for(const p of s.students)if(p.group===b.id)p.group='';
  break;}
 case 'groupCount':{
  const count=checkedGroupCount(b.count),removed=s.groups.slice(count),removedIds=new Set(removed.map(g=>g.id));
  if(removed.some(g=>g.lehrer?.l1||g.lehrer?.l2)||s.students.some(p=>removedIds.has(p.group))||s.sessions.some(d=>d.roster.some(p=>removedIds.has(p.group))||Object.keys(d.reports).some(id=>removedIds.has(id))))throw Error('Die letzten Klassen enthalten noch Schüler, Lehrer oder frühere Termine. Diese Klassen bleiben erhalten. Nur vollständig unbenutzte Klassen können entfernt werden.');
  s.groups=s.groups.slice(0,count);while(s.groups.length<count)s.groups.push(newGroup(s.groups.length));break;
 }
 case 'group':{
  const name=String(b.name||'').trim().slice(0,100);if(!name)throw Error('Bitte einen Klassennamen eingeben.');
  let g=s.groups.find(x=>x.id===b.id);const isNew=!g;
  if(!g){if(s.groups.length>=30)throw Error('Maximal 30 Klassen.');g={id:crypto.randomUUID(),name,leader:'',token:crypto.randomUUID()+crypto.randomUUID()};}
  const names=[b.l1===undefined?g.lehrer?.l1?.name||'':b.l1,b.l2===undefined?g.lehrer?.l2?.name||'':b.l2];
  if(names.some(n=>typeof n!=='string'||n.trim().length>150))throw Error('Bitte Lehrernamen mit höchstens 150 Zeichen eingeben.');
  const [l1,l2]=names.map(n=>n.trim());
  if(l1&&l2&&nameKey(l1)===nameKey(l2))throw Error('L1 und L2 müssen unterschiedliche Lehrer sein.');
  const teachers=registeredTeachers(s);
  const teacher=(name:string):Teacher|null=>name?teachers.find(t=>nameKey(t.name)===nameKey(name))||{id:crypto.randomUUID(),name}:null;
  g.lehrer={l1:teacher(l1),l2:teacher(l2)};
  g.leader='';delete g.leaderId;delete g.helperId;delete g.leaderNeedsSelection;
  g.name=name;if(isNew)s.groups.push(g);break;}
 case 'rotate':{const g=s.groups.find(x=>x.id===b.id);if(g)g.token=crypto.randomUUID()+crypto.randomUUID();break;}
 case 'sessions':{
  const dates=sessionDates(b.dates);
  if(s.sessions.length+dates.length>1000)throw Error('Maximal 1.000 Termine pro Liste.');
  if(dates.some(date=>s.sessions.some(d=>d.date===date)))throw Error('Ein ausgewählter Termin ist bereits angelegt. Bitte die Auswahl prüfen.');
  const roster=s.students.filter(p=>!p.archived);if(!roster.length)throw Error('Bitte zuerst Schüler hinzufügen.');
  const additions=dates.map(date=>({date,cancelled:'',roster:roster.map(p=>({...p})),marks:{},reports:{}}));
  s.sessions=[...s.sessions,...additions].sort((a,b)=>a.date.localeCompare(b.date));break;}
 case 'deleteSessions':{
  const dates=new Set(sessionDates(b.dates));
  if([...dates].some(date=>!s.sessions.some(d=>d.date===date)))throw Error('Ein ausgewählter Termin ist nicht mehr vorhanden. Bitte die Auswahl prüfen.');
  s.sessions=s.sessions.filter(d=>!dates.has(d.date));break;}
 case 'session':{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||new Date(b.date).toISOString().slice(0,10)!==b.date)throw Error('Bitte ein gültiges Datum wählen.');
  if(s.sessions.some(x=>x.date===b.date))throw Error('Dieser Termin ist bereits angelegt.');
  const roster=s.students.filter(x=>!x.archived).map(x=>({...x}));if(!roster.length)throw Error('Bitte zuerst Schüler hinzufügen.');
  s.sessions.push({date:b.date,cancelled:'',roster,marks:{},reports:{}});s.sessions.sort((a,b)=>a.date.localeCompare(b.date));break;}
 case 'cancel':{const d=find();const reason=String(b.reason||'').trim().slice(0,200);if(!reason)throw Error('Bitte einen Ausfallgrund wählen.');d.cancelled=reason;break;}
 case 'restore':find().cancelled='';break;
 case 'deleteSession':{find();s.sessions=s.sessions.filter(d=>d.date!==b.date);break;}
 case 'resetSession':{const d=find();d.marks={};d.reports={};d.cancelled='';break;}
 case 'mark':{const d=find();if(d.cancelled)throw Error('Unterricht fällt aus.');const p=d.roster.find(p=>p.id===b.id);if(!p||!['','anwesend','abwesend','entschuldigt'].includes(b.status))throw Error('Ungültiger Status.');if(b.status===''){delete d.marks[b.id];delete d.reports[p.group];}else d.marks[b.id]=b.status;break;}
 default:throw Error('Unbekannte Aktion.');
 }
}
export function groupView(s:State,g:Group):State{return {title:s.title,groups:[{id:g.id,name:displayClassName(g.name),leader:g.lehrer?.l1?.name||''}],students:s.students.filter(x=>x.group===g.id&&!x.archived),sessions:s.sessions.filter(d=>d.roster.some(p=>p.group===g.id)).map(d=>{const roster=orderedRoster(s,d.roster.filter(p=>p.group===g.id));return {...d,roster,marks:Object.fromEntries(roster.filter(p=>d.marks[p.id]).map(p=>[p.id,d.marks[p.id]])),reports:d.reports[g.id]?{[g.id]:d.reports[g.id]}:{}};})};}

