import {useEffect,useState} from 'react';
import {BarChart3,BookOpen,Check,ChevronRight,Users,X} from 'lucide-react';
import {ready,watchPortal,watchSchoolOverview,type Access} from './api';
import type {Lesson,Portal,StaffDay} from './firebase-data';
import {courseToday} from './model';
import {schoolStats} from './school-stats';

// Class link of the chosen class; the school token stays in the URL for "Andere Klasse".
export const classHash=(course:string,token:string,school:string)=>'#course='+encodeURIComponent(course)+'&group='+encodeURIComponent(token)+'&school='+encodeURIComponent(school);
// sent: the class whose attendance was just sent, shown once as a confirmation.
export const schoolHash=(course:string,school:string,sent='')=>'#course='+encodeURIComponent(course)+'&school='+encodeURIComponent(school)+(sent?'&sent='+encodeURIComponent(sent):'');
const rememberKey=(course:string)=>'kursblick.school.'+course;
function remembered(course:string){try{return localStorage.getItem(rememberKey(course))||'';}catch{return '';}}
const weekdays=['So','Mo','Di','Mi','Do','Fr','Sa'];
const dayLabel=(date:string)=>{const d=new Date(date+'T12:00:00Z');return weekdays[d.getUTCDay()]+' '+d.toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});};

export default function SchoolPortal(){
 const params=new URLSearchParams(location.hash.slice(1)),access:Access={course:params.get('course')||'',token:'',school:params.get('school')||''};
 const [portal,setPortal]=useState<Portal|null>(null),[err,setErr]=useState(''),[sent,setSent]=useState(params.get('sent')||'');
 const [overview,setOverview]=useState<{lessons:Record<string,Lesson[]>,staff:StaffDay[]}|null>(null),[overviewErr,setOverviewErr]=useState('');
 useEffect(()=>{
  // The confirmation is shown once; reloading the page does not repeat it.
  if(sent)history.replaceState(null,'',location.pathname+location.search+schoolHash(access.course,access.school!));
  let stop=()=>{},gone=false;
  ready().then(()=>watchPortal(access,next=>{if(!gone){setPortal(next);setErr('');}},e=>{if(!gone)setErr(e.message);})).then(s=>{if(gone)s();else stop=s;}).catch(e=>{if(!gone)setErr((e as Error).message);});
  return()=>{gone=true;stop();};
 },[]);
 const classKey=portal?.classes.map(c=>c.id+':'+c.token).join('|')||'';
 useEffect(()=>{
  if(!portal)return;
  let stop=()=>{},gone=false;
  watchSchoolOverview(portal.classes,value=>{if(!gone){setOverview(value);setOverviewErr('');}},e=>{if(!gone)setOverviewErr(e.message);}).then(s=>{if(gone)s();else stop=s;}).catch(e=>{if(!gone)setOverviewErr((e as Error).message);});
  return()=>{gone=true;stop();};
 },[classKey]);
 function open(id:string,token:string){
  try{localStorage.setItem(rememberKey(access.course),id);}catch{/* optional convenience */}
  location.hash=classHash(access.course,token,access.school!);
 }
 const last=remembered(access.course),stats=overview?schoolStats(overview.lessons,overview.staff,courseToday()):null;
 const sentClass=portal?.classes.find(c=>c.id===sent);
 return <div className="app group-mode"><div className="main"><main className="content school-portal">
  {err?<div className="alert error" role="alert">{err}</div>:!portal?<div className="loading"><BookOpen size={32}/><p>Klassen werden geladen …</p></div>:<>
   {sentClass&&<div className="alert success" role="status"><span><Check size={16}/> Anwesenheit für <strong dir="auto">{sentClass.name}</strong> gesendet.</span><button onClick={()=>setSent('')} aria-label="Hinweis schließen"><X size={16}/></button></div>}
   <div className="school-layout">
    <section className="panel school-classes-panel" aria-labelledby="school-title">
     <div className="panelhead"><div><h1 id="school-title" className="school-title" dir="auto">{portal.title}</h1><p>{stats?.current?`Aktueller Termin: ${dayLabel(stats.current)}`:'Bitte deine Klasse wählen.'}</p></div></div>
     {!portal.classes.length?<div className="empty"><p>Noch keine Klassen angelegt.</p></div>:<div className="school-classes">{portal.classes.map(c=>{const st=stats?.classes[c.id];return <button type="button" key={c.id} className={'school-class'+(st?.reported?' reported':'')} onClick={()=>open(c.id,c.token)}>
      <span className="mini-icon" aria-hidden="true">{st?.reported?<Check size={18}/>:<Users size={18}/>}</span>
      <span className="school-class-name"><strong dir="auto">{c.name}</strong>{c.id===last&&<small>Zuletzt geöffnet</small>}</span>
      {st?.reported?<span className="school-class-count" aria-label={`Gesendet: ${st.present} von ${st.total} anwesend`}>{st.present}/{st.total}</span>:st&&st.total>0?<span className="school-class-open">offen</span>:null}
      <ChevronRight size={18}/>
     </button>;})}</div>}
    </section>
    <section className="panel school-stats" aria-labelledby="school-stats-title">
     <div className="panelhead"><h2 id="school-stats-title"><BarChart3 size={18}/>Statistik</h2><small>Letzte 5 Termine</small></div>
     {overviewErr?<p className="classbook-empty">{overviewErr}</p>:!stats?<p className="classbook-empty">Wird geladen …</p>:!stats.days.length?<p className="classbook-empty">Noch keine Termine.</p>:
     <table className="stats-table"><thead><tr><th scope="col">Datum</th><th scope="col">Lehrer</th><th scope="col">Schüler</th></tr></thead>
      <tbody>{stats.days.map(d=><tr key={d.date} className={d.date===stats.current?'current':undefined}><th scope="row">{dayLabel(d.date)}</th>{d.cancelled?<td colSpan={2} className="stats-cancelled">Ausfall</td>:<><td>{d.teachers}</td><td>{d.pupils}<small>/{d.pupilTotal}</small></td></>}</tr>)}</tbody>
     </table>}
    </section>
   </div>
  </>}
 </main></div></div>;
}
