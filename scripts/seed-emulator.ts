// Fills the local Firebase emulators with a realistic demo school (npm run emulators, then npm run seed:emulator).
// Never touches the real project: it only talks to 127.0.0.1 and the demo-kursblick project.
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,serverTimestamp,Timestamp,type Firestore} from 'firebase/firestore';
import {initial,mutate,syncReportingTeachers,teacherRowId,courseToday} from '../src/model.ts';
import {documentsFor,tokenHash} from '../src/firebase-data.ts';

const project='demo-kursblick',auth='http://127.0.0.1:9099',email='admin@example.test',password='testtest';
async function owner(){
 const base=auth+'/identitytoolkit.googleapis.com/v1';
 let r=await fetch(base+'/accounts:signUp?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 if(!r.ok)r=await fetch(base+'/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const {localId}=await r.json() as {localId:string};
 await fetch(base+`/projects/${project}/accounts:update`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({localId,emailVerified:true})});
 return localId;
}
const first=['محمد','أحمد','علي','عمر','يوسف','حسين','ليلى','سارة','مريم','فاطمة','زينب','آمنة','براق','ريم','إلين','أرمان','آلاء','بديعة'];
const last=['صوان','ناصر','درويش','تركمان','جمعة','فخرو','حسين','عتريس','ناسيل','آكديمير','ستشكين'];
const uid=await owner(),today=courseToday(),s=initial(4);s.title='Wochenendschule';
s.groups.forEach((g,i)=>g.name='Klasse '+(i+1));
const sizes=[37,24,18,0];
for(const [i,g] of s.groups.entries())if(sizes[i])mutate(s,{action:'addStudents',names:Array.from({length:sizes[i]},(_,k)=>`${first[(k*7+i)%first.length]} ${last[(k*3+i)%last.length]}`).join('\n'),group:g.id});
const teachers=[['محمد صوان','حسين ناصر'],['Sara Klein','Omar Haddad'],['أحمد علي',''],['Layla Hassan','']];
for(const [i,g] of s.groups.entries())mutate(s,{action:'group',id:g.id,name:g.name,l1:teachers[i][0],l2:teachers[i][1]});
mutate(s,{action:'editTeachers',original:structuredClone(s.teachers),teachers:[...s.teachers!,{name:'Fatima Yilmaz'},{name:'Yusuf Demir'}]});
// Tuesdays, Thursdays and Saturdays from six weeks ago until four weeks ahead.
const dates:string[]=[];for(let d=new Date(today+'T12:00:00Z'),i=-42;i<=28;i++){const x=new Date(d);x.setUTCDate(x.getUTCDate()+i);if([2,4,6].includes(x.getUTCDay()))dates.push(x.toISOString().slice(0,10));}
mutate(s,{action:'sessions',dates});syncReportingTeachers(s,dates[0]);
const past=s.sessions.filter(d=>d.date<today),groups=s.groups.filter((_,i)=>sizes[i]);
for(const [n,d] of past.entries()){
 if(n===4){d.cancelled='Ferien';continue;}
 for(const g of groups){const pupils=d.roster.filter(p=>p.group===g.id&&!p.teacherId);pupils.forEach((p,k)=>d.marks[p.id]=(k*5+n*3)%7<5?'anwesend':'abwesend');d.reports[g.id]=new Date(d.date+'T10:00:00Z').toISOString();}
 s.teachers!.forEach((t,k)=>{if((k+n)%4)d.marks[teacherRowId(t.id)]='anwesend';else if(k%2)d.marks[teacherRowId(t.id)]='abwesend';});
}
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore() as unknown as Firestore;
 for(const [path,value] of await documentsFor(s,'demo-course',uid,0))await setDoc(doc(db,path),value);
 // A few class book entries for the first class.
 const hash=await tokenHash(s.groups[0].token!);
 for(const d of past.slice(-3))await setDoc(doc(db,'channels',hash,'classbook',d.date),{ownerUid:uid,courseId:'demo-course',groupId:s.groups[0].id,date:d.date,quran:'Sure 114\nVers 1–6',bildung:'Band 1, Seite 10',arabisch:'حروف: أ ب ت',bemerkungen:'',updatedAt:Timestamp.fromDate(new Date(d.date+'T11:00:00Z'))});
});
await env.cleanup();
const site='http://localhost:5173/anwesenheitf/';
console.log(`Verwaltung: ${site}  (${email} / ${password})`);
console.log(`Schul-Link: ${site}#course=demo-course&school=${s.school!.portal}`);
console.log(`Klasse 1:   ${site}#course=demo-course&group=${s.groups[0].token}&school=${s.school!.portal}`);
void serverTimestamp;
