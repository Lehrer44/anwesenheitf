import {useEffect,useState} from 'react';
import {BookOpen,ChevronRight,Users} from 'lucide-react';
import {ready,watchPortal,type Access} from './api';
import type {Portal} from './firebase-data';

// Class link of the chosen class; the school token stays in the URL for "Andere Klasse".
export const classHash=(course:string,token:string,school:string)=>'#course='+encodeURIComponent(course)+'&group='+encodeURIComponent(token)+'&school='+encodeURIComponent(school);
export const schoolHash=(course:string,school:string,choose=false)=>'#course='+encodeURIComponent(course)+'&school='+encodeURIComponent(school)+(choose?'&choose=1':'');
const rememberKey=(course:string)=>'kursblick.school.'+course;
function remembered(course:string){try{return localStorage.getItem(rememberKey(course))||'';}catch{return '';}}
function open(course:string,school:string,id:string,token:string){
 try{localStorage.setItem(rememberKey(course),id);}catch{/* optional convenience */}
 location.hash=classHash(course,token,school);location.reload();
}
export default function SchoolPortal(){
 const params=new URLSearchParams(location.hash.slice(1)),access:Access={course:params.get('course')||'',token:'',school:params.get('school')||''};
 const choose=params.get('choose')==='1',[portal,setPortal]=useState<Portal|null>(null),[err,setErr]=useState('');
 useEffect(()=>{
  let stop=()=>{},gone=false;
  ready().then(()=>watchPortal(access,next=>{
   if(gone)return;setPortal(next);setErr('');
   // Returning teachers land directly in their last class unless they asked to choose.
   const last=next.classes.find(c=>c.id===remembered(access.course));
   if(last&&!choose)open(access.course,access.school!,last.id,last.token);
  },e=>{if(!gone)setErr(e.message);})).then(s=>{if(gone)s();else stop=s;}).catch(e=>{if(!gone)setErr((e as Error).message);});
  return()=>{gone=true;stop();};
 },[]);
 const last=remembered(access.course);
 return <div className="app group-mode"><div className="main"><main className="content school-portal">
  {err?<div className="alert error" role="alert">{err}</div>:!portal?<div className="loading"><BookOpen size={32}/><p>Klassen werden geladen …</p></div>:<section className="panel">
   <div className="panelhead"><div><h1 className="school-title" dir="auto">{portal.title}</h1><p>Bitte deine Klasse wählen.</p></div></div>
   {!portal.classes.length?<div className="empty"><p>Noch keine Klassen angelegt.</p></div>:<div className="school-classes">{portal.classes.map(c=><button type="button" key={c.id} className="school-class" onClick={()=>open(access.course,access.school!,c.id,c.token)}><span className="mini-icon"><Users size={18}/></span><strong dir="auto">{c.name}</strong>{c.id===last&&<small>Zuletzt geöffnet</small>}<ChevronRight size={18}/></button>)}</div>}
  </section>}
 </main></div></div>;
}
