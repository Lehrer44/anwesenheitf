import {useEffect,useRef,useState} from 'react';
import {Check,Send,X} from 'lucide-react';
import {attendanceDraft,type Session,type Status,type Student} from './model';

const statuses:Status[]=['anwesend','abwesend'];
// Teachers report themselves here, separately from the pupil list; unreported teachers default to absent.
export default function TeacherAttendance({session,teachers,dateLabel,busy,error,onClose,onSave}:{session:Session,teachers:Student[],dateLabel:string,busy:boolean,error:string,onClose:()=>void,onSave:(marks:Record<string,Status>)=>Promise<boolean>}){
 const saved=attendanceDraft(session),[draft,setDraft]=useState<Record<string,Status>>(()=>Object.fromEntries(teachers.map(p=>[p.id,saved[p.id]||'abwesend'])));
 const dirty=teachers.some(p=>draft[p.id]!==(saved[p.id]||'abwesend'))||teachers.some(p=>!session.marks[p.id]);
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 function close(){if(!busy&&(!teachers.some(p=>draft[p.id]!==(saved[p.id]||'abwesend'))||confirm('Ungesendete Lehrer-Anwesenheit verwerfen?')))onClose();}
 useEffect(()=>{
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=overflow;if(opener.current?.isConnected)opener.current.focus();};
 },[]);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} tabIndex={-1} className="modal classbook-modal teacher-attendance" role="dialog" aria-modal="true" aria-labelledby="teacher-attendance-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <button className="close" aria-label="Dialog schließen" disabled={busy} onClick={close}><X/></button>
  <h2 id="teacher-attendance-title">Lehrer</h2>
  <p className="classbook-subtitle">{dateLabel} · Bitte selbst als anwesend markieren.</p>
  <div className="group-panel teacher-list"><div className="checklist">{teachers.map(p=><div className="checkrow teacher-row" key={p.id}><div className="studentname"><span className="avatar">{p.teacherRole}</span><strong className="student-label" dir="auto">{p.name}</strong></div><div className="status-buttons">{statuses.map(v=><button key={v} type="button" disabled={busy} title={v} aria-label={`${p.name}: ${v}`} aria-pressed={draft[p.id]===v} className={'status-btn '+v+(draft[p.id]===v?' chosen':'')} onClick={()=>setDraft({...draft,[p.id]:v})}><span className="status-symbol" aria-hidden="true">{v==='anwesend'?<Check size={19}/>:<X size={19}/>}</span><span className="status-text">{v}</span></button>)}</div></div>)}</div></div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="button" className="btn primary" disabled={busy||!dirty} onClick={()=>void onSave(draft)}><Send size={17}/>{busy?'Wird gesendet …':'Anwesenheit senden'}</button></div>
  {teachers.some(p=>!session.marks[p.id])&&<p className="hint">Voreinstellung: abwesend. Bitte prüfen und senden.</p>}
 </section></div>;
}
