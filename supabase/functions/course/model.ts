export type Student={id:string,name:string,group:string,archived?:boolean};
export type Group={id:string,name:string,leader:string,token?:string};
export type Status='anwesend'|'abwesend'|'entschuldigt';
export type Session={date:string,cancelled:string,roster:Student[],marks:Record<string,Status>,reports:Record<string,string>};
export type State={demo?:boolean,title:string,students:Student[],groups:Group[],sessions:Session[]};
export function initial():State{return {title:'Mein Wochenkurs',students:[],groups:Array.from({length:5},(_,i)=>({id:crypto.randomUUID(),name:`Gruppe ${i+1}`,leader:'',token:crypto.randomUUID()+crypto.randomUUID()})),sessions:[]};}
export function mutate(s:State,b:any,group?:Group):void {
 const find=()=>{const d=s.sessions.find(x=>x.date===b.date);if(!d)throw Error('Termin nicht gefunden.');return d;};
 if(group){
  if(b.action!=='submit')throw Error('Nur die eigene Gruppenmeldung ist erlaubt.');
  const d=find();if(d.cancelled)throw Error('Dieser Unterricht fällt aus.');
  const ids=d.roster.filter(x=>x.group===group.id).map(x=>x.id);
  if(!ids.length)throw Error('Für diese Gruppe sind keine Schüler zugeteilt.');
  if(!b.marks||Object.keys(b.marks).length!==ids.length||ids.some(id=>!['anwesend','abwesend','entschuldigt'].includes(b.marks[id])))throw Error('Bitte für jeden Schüler einen Status wählen.');
  ids.forEach(id=>d.marks[id]=b.marks[id]);d.reports[group.id]=new Date().toISOString();return;
 }
 switch(b.action){
 case 'title':s.title=String(b.title||'').trim().slice(0,100)||'Mein Wochenkurs';break;
 case 'addStudents':{
  if(s.demo)throw Error('Bitte zuerst die Beispieldaten entfernen, bevor du echte Namen hinzufügst.');
  const names=String(b.names||'').split('\n').map(x=>x.trim()).filter(Boolean);
  if(names.length>2000||s.students.length+names.length>5000||names.some(x=>x.length>150))throw Error('Maximal 2.000 neue Namen, jeweils bis 150 Zeichen.');
  if(!names.length)throw Error('Bitte mindestens einen Namen eingeben.');
  names.forEach(name=>s.students.push({id:crypto.randomUUID(),name,group:s.groups.some(g=>g.id===b.group)?b.group:''}));break;}
 case 'demo':{
  if(s.students.length||s.sessions.length)throw Error('Beispieldaten sind nur in einem leeren Kurs möglich.');
  s.demo=true;for(let i=0;i<100;i++)s.students.push({id:crypto.randomUUID(),name:`Beispielschüler ${String(i+1).padStart(3,'0')}`,group:s.groups[i%s.groups.length].id});break;}
 case 'clearDemo':{if(!s.demo)throw Error('Dieser Kurs enthält keine Beispieldaten.');s.students=[];s.sessions=[];s.demo=false;break;}
 case 'assign':{const p=s.students.find(x=>x.id===b.id);if(!p)throw Error('Schüler nicht gefunden.');if(b.group&&!s.groups.some(g=>g.id===b.group))throw Error('Gruppe nicht gefunden.');p.group=b.group||'';break;}
 case 'renameStudent':{const p=s.students.find(x=>x.id===b.id);const name=String(b.name||'').trim();if(!p||!name||name.length>150)throw Error('Bitte einen gültigen Namen eingeben.');p.name=name;break;}
 case 'archive':{const p=s.students.find(x=>x.id===b.id);if(p)p.archived=!p.archived;break;}
 case 'distribute':{if(!s.groups.length)throw Error('Bitte zunächst Gruppen anlegen.');s.students.filter(x=>!x.archived).forEach((p,i)=>p.group=s.groups[i%s.groups.length].id);break;}
 case 'group':{
  const name=String(b.name||'').trim().slice(0,100);if(!name)throw Error('Bitte einen Gruppennamen eingeben.');
  const g=s.groups.find(x=>x.id===b.id);if(g){g.name=name;g.leader=String(b.leader||'').slice(0,100);}else {if(s.groups.length>=30)throw Error('Maximal 30 Gruppen.');s.groups.push({id:crypto.randomUUID(),name,leader:String(b.leader||'').slice(0,100),token:crypto.randomUUID()+crypto.randomUUID()});}break;}
 case 'rotate':{const g=s.groups.find(x=>x.id===b.id);if(g)g.token=crypto.randomUUID()+crypto.randomUUID();break;}
 case 'session':{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||new Date(b.date).toISOString().slice(0,10)!==b.date)throw Error('Bitte ein gültiges Datum wählen.');
  if(s.sessions.some(x=>x.date===b.date))throw Error('Dieser Termin ist bereits angelegt.');
  const roster=s.students.filter(x=>!x.archived).map(x=>({...x}));if(!roster.length)throw Error('Bitte zuerst Schüler hinzufügen.');
  s.sessions.push({date:b.date,cancelled:'',roster,marks:{},reports:{}});s.sessions.sort((a,b)=>a.date.localeCompare(b.date));break;}
 case 'cancel':{const d=find();const reason=String(b.reason||'').trim().slice(0,200);if(!reason)throw Error('Bitte einen Ausfallgrund wählen.');d.cancelled=reason;break;}
 case 'restore':find().cancelled='';break;
 case 'mark':{const d=find();if(d.cancelled)throw Error('Unterricht fällt aus.');if(!d.roster.some(p=>p.id===b.id)||!['anwesend','abwesend','entschuldigt'].includes(b.status))throw Error('Ungültiger Status.');d.marks[b.id]=b.status;break;}
 default:throw Error('Unbekannte Aktion.');
 }
}
export function groupView(s:State,g:Group):State{return {title:s.title,groups:[{id:g.id,name:g.name,leader:g.leader}],students:s.students.filter(x=>x.group===g.id&&!x.archived),sessions:s.sessions.filter(d=>d.roster.some(p=>p.group===g.id)).map(d=>{const roster=d.roster.filter(p=>p.group===g.id);return {...d,roster,marks:Object.fromEntries(roster.filter(p=>d.marks[p.id]).map(p=>[p.id,d.marks[p.id]])),reports:d.reports[g.id]?{[g.id]:d.reports[g.id]}:{}};})};}
