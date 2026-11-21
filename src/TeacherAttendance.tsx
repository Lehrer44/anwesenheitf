import {useEffect,useRef,useState} from 'react';
import {Check,Search,Send,X} from 'lucide-react';
import {teacherRowId,type Status} from './model';
import type {StaffView} from './api';

const statuses:Status[]=['anwesend','abwesend'];
// The central teacher list: every teacher appears in every class, so substitutes find their name.
// Anyone may mark anyone; unmarked teachers count as absent.
export default function TeacherAttendance({staff,date,groupId,dateLabel,busy,error,onClose,onSave}:{staff:StaffView,date:string,groupId:string,dateLabel:string,busy:boolean,error:string,onClose:()=>void,onSave:(changes:Record<string,Status>)=>Promise<boolean>}){
 const day=staff.days.find(d=>d.date===date),[l1,l2]=staff.lehrer[groupId]||[];
 const role=(id:string)=>id===l1?'L1':id===l2?'L2':'';
 // Own class teachers first, then everyone alphabetically.
 const rows=[...staff.teachers].map(t=>({...t,row:teacherRowId(t.id),role:role(t.id)})).filter(t=>day?.teacherIds.includes(t.row))
  .sort((a,b)=>(a.role||'Z').localeCompare(b.role||'Z')||a.name.localeCompare(b.name,'de'));
 const savedStatus=(row:string):Status=>day?.marks[row]==='anwesend'?'anwesend':'abwesend';
 const [opened]=useState(()=>Object.fromEntries(rows.map(t=>[t.row,savedStatus(t.row)])));
 const [draft,setDraft]=useState<Record<string,Status>>(opened),[search,setSearch]=useState('');
 const changes=Object.fromEntries(Object.entries(draft).filter(([row,status])=>status!==opened[row]));
 const dirty=Object.keys(changes).length>0,present=rows.filter(t=>(draft[t.row]||savedStatus(t.row))==='anwesend').length;
 const shown=rows.filter(t=>t.name.toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')));
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 function close(){if(!busy&&(!dirty||confirm('Ungesendete Lehrer-Anwesenheit verwerfen?')))onClose();}
 useEffect(()=>{
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=overflow;if(opener.current?.isConnected)opener.current.focus();};
 },[]);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} tabIndex={-1} className="modal classbook-modal teacher-attendance" role="dialog" aria-modal="true" aria-labelledby="teacher-attendance-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <button className="close" aria-label="Dialog schließen" disabled={busy} onClick={close}><X/></button>
  <h2 id="teacher-attendance-title">Lehrer</h2>
  <p className="classbook-subtitle">{dateLabel} · {present} von {rows.length} anwesend</p>
  {!day||!rows.length?<p className="classbook-empty">{day?'Es sind noch keine Lehrer eingetragen. Die Kursleitung pflegt die Lehrerliste.':'Für diesen Termin ist die Lehrerliste noch nicht bereit.'}</p>:<>
   {rows.length>8&&<label className="search teacher-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Namen suchen …" aria-label="Lehrer suchen"/></label>}
   <div className="group-panel teacher-list"><div className="checklist">{shown.map(t=><div className={'checkrow'+(t.role?' teacher-row':'')} key={t.row}><div className="studentname">{t.role&&<span className="avatar">{t.role}</span>}<strong className="student-label" dir="auto">{t.name}</strong></div><div className="status-buttons">{statuses.map(v=><button key={v} type="button" disabled={busy} title={v} aria-label={`${t.name}: ${v}`} aria-pressed={draft[t.row]===v} className={'status-btn '+v+(draft[t.row]===v?' chosen':'')} onClick={()=>setDraft({...draft,[t.row]:v})}><span className="status-symbol" aria-hidden="true">{v==='anwesend'?<Check size={19}/>:<X size={19}/>}</span><span className="status-text">{v}</span></button>)}</div></div>)}
    {!shown.length&&<p className="classbook-empty">Kein Name gefunden.</p>}</div></div>
  </>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="button" className="btn primary" disabled={busy||!dirty} onClick={()=>void onSave(changes)}><Send size={17}/>{busy?'Wird gesendet …':'Anwesenheit senden'}</button></div>
  <p className="hint">Voreinstellung: abwesend. Jeder kann jeden Lehrer markieren; die Liste gilt für alle Klassen.</p>
 </section></div>;
}
