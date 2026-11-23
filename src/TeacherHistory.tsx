import {useEffect,useRef} from 'react';
import {Check,Minus,X} from 'lucide-react';
import {courseToday} from './model';
import {teacherHistory} from './teacher-history';
import type {StaffView} from './api';

const weekdays=['So','Mo','Di','Mi','Do','Fr','Sa'];
const long=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'UTC',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
// Display only: past lessons with sent teacher attendance, newest next to the names.
export default function TeacherHistory({staff,groupId,onClose}:{staff:StaffView,groupId:string,onClose:()=>void}){
 const {dates,rows}=teacherHistory(staff,groupId,courseToday());
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 useEffect(()=>{panel.current?.focus({preventScroll:true});return()=>{if(opener.current?.isConnected)opener.current.focus();};},[]);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} tabIndex={-1} className="modal classbook-modal teacher-history" role="dialog" aria-modal="true" aria-labelledby="teacher-history-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();onClose();}
  if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector<HTMLButtonElement>('.modal-actions button')?.focus();}
 }}>
  <button className="close" aria-label="Verlauf schließen" onClick={onClose}><X/></button>
  <h2 id="teacher-history-title">Verlauf</h2>
  <p className="classbook-subtitle">{dates.length} {dates.length===1?'gesendeter Termin':'gesendete Termine'} · nur Anzeige</p>
  {!dates.length||!rows.length?<p className="classbook-empty">Noch keine gesendeten Termine.</p>:
  <div className="history-wrap" dir="rtl"><table className="history-table">
   <thead><tr><th scope="col" className="history-name">Name</th><th scope="col" className="history-sum" title="Anwesend von gesendeten Terminen">∑</th>{dates.map(d=><th scope="col" key={d} title={long(d)}><span dir="ltr">{d.slice(8)}.{d.slice(5,7)}</span><small>{weekdays[new Date(d+'T12:00:00Z').getUTCDay()]}</small></th>)}</tr></thead>
   <tbody>{rows.map(r=><tr key={r.id} className={r.role?'history-own':undefined}>
    <th scope="row" className="history-name"><span dir="auto">{r.name}</span>{r.role&&<small>{r.role}</small>}</th>
    <td className="history-sum" dir="ltr">{r.present}/{r.total}</td>
    {dates.map(d=>{const c=r.cells[d];return <td key={d} className={'history-cell '+(c||'none')} title={`${r.name} · ${long(d)}: ${c||'nicht in der Liste'}`}>{c==='anwesend'?<Check size={15} aria-label="anwesend"/>:c==='abwesend'?<X size={15} aria-label="abwesend"/>:<Minus size={13} aria-label="nicht in der Liste"/>}</td>;})}
   </tr>)}</tbody>
  </table></div>}
  <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Schließen</button></div>
  <p className="hint">✓ anwesend · ✗ abwesend oder nicht gemeldet · – noch nicht in der Lehrerliste. ∑ = anwesend von gesendeten Terminen.</p>
 </section></div>;
}
