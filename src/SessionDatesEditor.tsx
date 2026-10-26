import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,X} from 'lucide-react';
import {monthDays,shiftMonth,displayDate} from './calendar';
import {courseToday,type Session} from './model';

export default function SessionDatesEditor({mode,sessions,initialDate,busy,error,onClose,onSave}:{mode:'add'|'delete',sessions:Session[],initialDate?:string,busy:boolean,error:string,onClose:()=>void,onSave:(dates:string[])=>Promise<boolean>}){
 const today=courseToday(),deleting=mode==='delete',existing=new Set(sessions.map(d=>d.date));
 const [month,setMonth]=useState(()=>(initialDate||(deleting?(sessions.find(d=>d.date>=today)?.date||sessions.at(-1)?.date):today)||today).slice(0,7));
 const [selected,setSelected]=useState<Set<string>>(()=>new Set(initialDate&&deleting?[initialDate]:[]));
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null),dates=[...selected].sort();
 const title=deleting?'Termine löschen':'Termin anlegen';
 function close(){if(!busy&&(!selected.size||confirm('Terminauswahl verwerfen?')))onClose();}
 useEffect(()=>{panel.current?.focus();return()=>{if(opener.current?.isConnected)opener.current.focus();};},[]);
 useEffect(()=>{if(!selected.size)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[selected.size]);
 function toggle(date:string){setSelected(old=>{const next=new Set(old);if(next.has(date))next.delete(date);else next.add(date);return next;});}
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} tabIndex={-1} className="modal session-dates-editor" role="dialog" aria-modal="true" aria-labelledby="session-dates-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><button className="close" aria-label="Dialog schließen" disabled={busy} onClick={close}><X/></button><h2 id="session-dates-title">{title}</h2>
 <form onSubmit={e=>{e.preventDefault();if(!dates.length||busy)return;if(!deleting||confirm(`${dates.length} ausgewählte Termine endgültig löschen? Alle Anwesenheitseinträge und Klassenmeldungen dieser Termine gehen verloren. Das lässt sich nicht rückgängig machen.`))onSave(dates);}}>
 <p className="calendar-hint">{deleting?'Termine im Kalender auswählen. Exportiere bei Bedarf zuerst die Excel-Datei.':'Mehrere Tage anklicken. Die Auswahl bleibt beim Monatswechsel erhalten.'}</p>
 <div className="calendar-toolbar"><button type="button" className="btn" aria-label="Vorheriger Monat" disabled={busy||month==='0000-01'} onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={18}/></button><label>Monat<input aria-label="Monat" type="month" min="0000-01" max="9999-12" value={month} disabled={busy} onChange={e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))setMonth(e.target.value);}}/></label><button type="button" className="btn" aria-label="Nächster Monat" disabled={busy||month==='9999-12'} onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={18}/></button></div>
 <div className="multi-calendar" role="group" aria-label="Kalender zur Terminauswahl">
 {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=><span className="weekday" key={d} aria-hidden="true">{d}</span>)}
 {monthDays(month).map((date,i)=>date?<button key={date} type="button" aria-label={displayDate(date)+(existing.has(date)?' · Bereits angelegt':'')} aria-pressed={selected.has(date)} disabled={busy||(deleting?!existing.has(date):existing.has(date))} title={existing.has(date)?'Bereits angelegt':undefined} className={'calendar-day'+(selected.has(date)?' selected':'')+(existing.has(date)?' existing':'')+(date===today?' today':'')} onClick={()=>toggle(date)}>{Number(date.slice(-2))}</button>:<span key={'blank'+i} aria-hidden="true"/>)}
 </div>
 {deleting?<div className="calendar-shortcuts"><button type="button" className="textbutton" disabled={busy||!sessions.some(d=>d.date<today)} onClick={()=>setSelected(new Set(sessions.filter(d=>d.date<today).map(d=>d.date)))}>Vergangene auswählen</button><button type="button" className="textbutton" disabled={busy||!sessions.length} onClick={()=>setSelected(new Set(sessions.map(d=>d.date)))}>Alle auswählen</button></div>:<p className="calendar-legend">Markierte graue Tage sind bereits angelegt.</p>}
 <div className="calendar-selection"><strong role="status">{dates.length} {dates.length===1?'Termin ausgewählt':'Termine ausgewählt'}</strong><button type="button" className="textbutton" disabled={busy||!dates.length} onClick={()=>setSelected(new Set())}>Auswahl leeren</button></div>
 {!!dates.length&&<ul className="selected-dates" aria-label="Ausgewählte Termine">{dates.map(date=><li key={date}><span>{displayDate(date)}</span><button type="button" disabled={busy} aria-label={`${displayDate(date)} abwählen`} onClick={()=>toggle(date)}><X size={14}/></button></li>)}</ul>}
 {deleting&&!sessions.length&&<p className="hint">Keine Termine vorhanden.</p>}
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="submit" className={'btn '+(deleting?'danger':'primary')} disabled={busy||!dates.length}>{busy?'Wird gespeichert …':deleting?'Ausgewählte löschen':'Speichern'}</button></div>
 </form></section></div>;
}
