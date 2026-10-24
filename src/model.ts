export type Student={id:string,name:string,group:string,archived?:boolean};
export type Group={id:string,name:string,leader:string,leaderId?:string,leaderNeedsSelection?:boolean,token?:string};
export type Status='anwesend'|'abwesend'|'entschuldigt';
export type Session={date:string,cancelled:string,roster:Student[],marks:Record<string,Status>,reports:Record<string,string>};
export type State={demo?:boolean,title:string,students:Student[],groups:Group[],sessions:Session[]};
// Defaults are local form values; a class must explicitly submit before anything is saved.
export function attendanceDraft(session?:Session):Record<string,Status>{
 if(!session||session.cancelled)return {};
 return Object.fromEntries(session.roster.map(p=>[p.id,session.marks[p.id]||'abwesend']));
}
export const displayClassName=(name:string)=>name.replace(/^Gruppe(?=\s|$)/,'Klasse');
function checkedGroupCount(count:number){if(!Number.isInteger(count)||count<0||count>30)throw Error('Bitte eine ganze Klassenanzahl von 0 bis 30 wählen.');return count;}
const newGroup=(index:number):Group=>({id:crypto.randomUUID(),name:`Klasse ${index+1}`,leader:'',token:crypto.randomUUID()+crypto.randomUUID()});
export function initial(groupCount=0):State{return {title:'Mein Wochenkurs',students:[],groups:Array.from({length:checkedGroupCount(groupCount)},(_,i)=>newGroup(i)),sessions:[]};}
const nameKey=(name:string)=>name.trim().normalize('NFKC').toLocaleLowerCase('de');
function chooseLeader(s:State,g:Group,name:string,id?:string){
 name=name.trim().slice(0,150);
 if(!name&&!id){g.leader='';delete g.leaderId;delete g.leaderNeedsSelection;return;}
 let p=id?s.students.find(p=>p.id===id):undefined;
 if(id&&!p)throw Error('Der ausgewählte Schüler wurde nicht gefunden.');
 if(!p){const matches=s.students.filter(p=>nameKey(p.name)===nameKey(name));if(matches.length>1)throw Error('Dieser Name kommt mehrfach vor. Bitte den Klassenführer über die Schülerauswahl eindeutig auswählen.');p=matches[0];}
 if(p&&s.groups.some(other=>other.id!==g.id&&other.leaderId===p!.id))throw Error('Dieser Schüler führt bereits eine andere Klasse. Bitte dort zuerst den Klassenführer ändern.');
 if(!p){if(s.students.length>=5000)throw Error('Maximal 5.000 Schüler.');p={id:crypto.randomUUID(),name,group:g.id};s.students.push(p);}
 p.group=g.id;p.archived=false;g.leader=p.name;g.leaderId=p.id;delete g.leaderNeedsSelection;
}
// Upgrade legacy name-only leaders without guessing between duplicate names.
// Historical lesson snapshots remain intact.
export function normalizeLeaders(s:State){
 for(const g of s.groups){
  if(!g.leader.trim()&&!g.leaderId){delete g.leaderNeedsSelection;continue;}
  const linked=g.leaderId?s.students.find(p=>p.id===g.leaderId):undefined;
  const matches=linked?[linked]:s.students.filter(p=>nameKey(p.name)===nameKey(g.leader));
  if(matches.length>1||matches.length===1&&s.groups.some(other=>other.id!==g.id&&other.leaderId===matches[0].id)){g.leaderNeedsSelection=true;delete g.leaderId;continue;}
  chooseLeader(s,g,linked?.name||g.leader,matches[0]?.id);
 }
}
export const courseToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
export function nextSession(s:State,today=courseToday()){const dates=s.sessions.map(d=>d.date).sort();return dates.find(d=>d>=today)||dates.at(-1)||'';}
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
  if(!b.marks||Object.keys(b.marks).length!==ids.length||ids.some(id=>!['anwesend','abwesend','entschuldigt'].includes(b.marks[id])))throw Error('Bitte für jeden Schüler einen Status wählen.');
  ids.forEach(id=>d.marks[id]=b.marks[id]);d.reports[group.id]=new Date().toISOString();return;
 }
 switch(b.action){
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
 case 'assign':{const p=s.students.find(x=>x.id===b.id);if(!p)throw Error('Schüler nicht gefunden.');if(b.group&&!s.groups.some(g=>g.id===b.group))throw Error('Klasse nicht gefunden.');const led=s.groups.find(g=>g.leaderId===p.id);if(led&&b.group!==led.id)throw Error('Ein Klassenführer bleibt Schüler seiner eigenen Klasse. Bitte zuerst den Klassenführer ändern.');p.group=b.group||'';break;}
 case 'reorder':{
  const p=s.students.find(p=>p.id===b.id);if(!p||![-1,1].includes(b.direction))throw Error('Ungültige Reihenfolge.');
  const peers=s.students.filter(x=>x.group===p.group);const target=peers[peers.indexOf(p)+b.direction];if(!target)throw Error('Der Schüler steht bereits am Rand seiner Klasse.');
  const a=s.students.indexOf(p),z=s.students.indexOf(target);[s.students[a],s.students[z]]=[s.students[z],s.students[a]];break;}
 case 'renameStudent':{const p=s.students.find(x=>x.id===b.id);const name=String(b.name||'').trim();if(!p||!name||name.length>150)throw Error('Bitte einen gültigen Namen eingeben.');p.name=name;s.groups.filter(g=>g.leaderId===p.id).forEach(g=>g.leader=name);break;}
 case 'archive':{const p=s.students.find(x=>x.id===b.id);if(p){if(!p.archived&&s.groups.some(g=>g.leaderId===p.id))throw Error('Bitte zuerst einen anderen Klassenführer festlegen, bevor du diesen Schüler archivierst.');p.archived=!p.archived;}break;}
 case 'deleteStudent':{
  if(!s.students.some(p=>p.id===b.id))throw Error('Schüler nicht gefunden.');
  s.students=s.students.filter(p=>p.id!==b.id);
  for(const g of s.groups){if(g.leaderId===b.id){g.leader='';delete g.leaderId;delete g.leaderNeedsSelection;}}
  for(const d of s.sessions){const removed=d.roster.find(p=>p.id===b.id);d.roster=d.roster.filter(p=>p.id!==b.id);delete d.marks[b.id];if(removed&&!d.roster.some(p=>p.group===removed.group))delete d.reports[removed.group];}
  break;}
 case 'distribute':{
  if(!s.groups.length)throw Error('Bitte zunächst Klassen anlegen.');
  const pinned=new Map(s.groups.filter(g=>g.leaderId).map(g=>[g.leaderId!,g.id]));
  const counts=new Map(s.groups.map(g=>[g.id,0]));
  const active=s.students.filter(p=>!p.archived);
  active.filter(p=>pinned.has(p.id)).forEach(p=>{p.group=pinned.get(p.id)!;counts.set(p.group,counts.get(p.group)!+1);});
  for(const p of active.filter(p=>!pinned.has(p.id))){const g=s.groups.reduce((a,b)=>counts.get(a.id)!<=counts.get(b.id)!?a:b);p.group=g.id;counts.set(g.id,counts.get(g.id)!+1);}
  break;}
 case 'deleteGroup':{
  if(!s.groups.some(g=>g.id===b.id))throw Error('Klasse nicht gefunden.');
  s.groups=s.groups.filter(g=>g.id!==b.id);
  for(const p of s.students)if(p.group===b.id)p.group='';
  break;}
 case 'groupCount':{
  const count=checkedGroupCount(b.count),removed=s.groups.slice(count),removedIds=new Set(removed.map(g=>g.id));
  if(removed.some(g=>g.leader||g.leaderId)||s.students.some(p=>removedIds.has(p.group))||s.sessions.some(d=>d.roster.some(p=>removedIds.has(p.group))||Object.keys(d.reports).some(id=>removedIds.has(id))))throw Error('Die letzten Klassen enthalten noch Schüler, Klassenführer oder frühere Termine. Diese Klassen bleiben erhalten. Nur vollständig unbenutzte Klassen können entfernt werden.');
  s.groups=s.groups.slice(0,count);while(s.groups.length<count)s.groups.push(newGroup(s.groups.length));break;
 }
 case 'group':{
  const name=String(b.name||'').trim().slice(0,100);if(!name)throw Error('Bitte einen Klassennamen eingeben.');
  let g=s.groups.find(x=>x.id===b.id);const isNew=!g;
  if(!g){if(s.groups.length>=30)throw Error('Maximal 30 Klassen.');g={id:crypto.randomUUID(),name,leader:'',token:crypto.randomUUID()+crypto.randomUUID()};}
  chooseLeader(s,g,String(b.leader||''),b.leaderId||undefined);g.name=name;if(isNew)s.groups.push(g);break;}
 case 'rotate':{const g=s.groups.find(x=>x.id===b.id);if(g)g.token=crypto.randomUUID()+crypto.randomUUID();break;}
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
export function groupView(s:State,g:Group):State{return {title:s.title,groups:[{id:g.id,name:displayClassName(g.name),leader:g.leader,leaderId:g.leaderId}],students:s.students.filter(x=>x.group===g.id&&!x.archived),sessions:s.sessions.filter(d=>d.roster.some(p=>p.group===g.id)).map(d=>{const roster=orderedRoster(s,d.roster.filter(p=>p.group===g.id));return {...d,roster,marks:Object.fromEntries(roster.filter(p=>d.marks[p.id]).map(p=>[p.id,d.marks[p.id]])),reports:d.reports[g.id]?{[g.id]:d.reports[g.id]}:{}};})};}

