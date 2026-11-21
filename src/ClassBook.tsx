import {useEffect,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {BookOpenText,CalendarDays,ChevronDown,ChevronLeft,ChevronRight,MessageSquareText,Pencil,Trash2,X} from 'lucide-react';
import {monthDays,shiftMonth,displayDate} from './calendar';
import {courseToday} from './model';
import {maxEntryText,sortedEntries,subjects,weekdayDate,type ClassBookEntry,type ClassBookInput,type SubjectKey} from './classbook';

// Qur'an on a reading stand (rahle); lucide has no fitting symbol.
function QuranIcon(){return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5.5c3-1.2 6-.9 9 1 3-1.9 6-2.2 9-1v6c-3-1.2-6-.9-9 1-3-1.9-6-2.2-9-1z"/><path d="M12 6.5v6"/><path d="M6 14l12 7M18 14L6 21"/></svg>;}
export function SubjectIcon({subject}:{subject:SubjectKey}){
 return <span className={'subject-icon '+subject} aria-hidden="true">{subject==='quran'?<QuranIcon/>:subject==='bildung'?<BookOpenText size={20}/>:subject==='bemerkungen'?<MessageSquareText size={20}/>:<span lang="ar">ب</span>}</span>;
}
// Shared modal behavior: focus on open, restore on close, Escape and a simple focus trap.
function Dialog({className,labelledBy,onClose,children}:{className:string,labelledBy:string,onClose:()=>void,children:ReactNode}){
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 useEffect(()=>{
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=overflow;if(opener.current?.isConnected)opener.current.focus();};
 },[]);
 function keys(e:KeyboardEvent<HTMLElement>){
  if(e.key==='Escape'){e.stopPropagation();onClose();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} tabIndex={-1} className={'modal classbook-modal '+className} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onKeyDown={keys}>{children}</section></div>;
}
const empty={quran:'',bildung:'',arabisch:'',bemerkungen:''};
const fieldsOf=(entry?:ClassBookEntry)=>entry?{quran:entry.quran,bildung:entry.bildung,arabisch:entry.arabisch,bemerkungen:entry.bemerkungen}:empty;

export function ClassBookEditor({entries,initialDate,busy,error,onClose,onSave,onDelete}:{entries:ClassBookEntry[],initialDate?:string,busy:boolean,error:string,onClose:()=>void,onSave:(entry:ClassBookInput,expected:string|null)=>Promise<boolean>,onDelete:(date:string,expected:string|null)=>Promise<boolean>}){
 const today=courseToday(),[date,setDate]=useState(initialDate||today);
 // base is the saved entry the form started from; its timestamp detects concurrent edits.
 const [base,setBase]=useState(()=>entries.find(e=>e.date===(initialDate||today))||null);
 const [fields,setFields]=useState(()=>fieldsOf(base||undefined)),[picker,setPicker]=useState(false),[month,setMonth]=useState(date.slice(0,7));
 const saved=new Set(entries.map(e=>e.date)),original=fieldsOf(base||undefined);
 const dirty=subjects.some(s=>fields[s.key]!==original[s.key]),filled=subjects.some(s=>fields[s.key].trim());
 function close(){if(!busy&&(!dirty||confirm('Ungespeicherten Eintrag verwerfen?')))onClose();}
 useEffect(()=>{if(!dirty)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty]);
 function choose(day:string){
  const next=entries.find(e=>e.date===day)||null;
  if(next&&dirty&&!confirm(`Für ${weekdayDate(day)} gibt es bereits einen Eintrag. Ungespeicherte Eingaben verwerfen und diesen Eintrag öffnen?`))return;
  // Typed text moves to an empty day; an untouched saved entry is replaced by the new day's content.
  if(next||!dirty)setFields(fieldsOf(next||undefined));
  setBase(next);setDate(day);setPicker(false);
 }
 return <Dialog className="classbook-editor" labelledBy="classbook-editor-title" onClose={close}>
  <button className="close" aria-label="Dialog schließen" disabled={busy} onClick={close}><X/></button>
  <h2 id="classbook-editor-title">Klassenbuch-Eintrag</h2>
  <form onSubmit={e=>{e.preventDefault();if(!busy&&filled)void onSave({date,...fields},base?.updatedAt??null);}}>
   <div className="classbook-field"><span className="classbook-label" id="classbook-date-label">Datum</span>
    <div className="classbook-date"><button type="button" className="classbook-date-value" aria-labelledby="classbook-date-label classbook-date-text" aria-expanded={picker} disabled={busy} onClick={()=>{setMonth(date.slice(0,7));setPicker(!picker);}}><span id="classbook-date-text">{date===today?'Heute, ':''}{weekdayDate(date)}</span></button><button type="button" className="btn classbook-calendar-button" aria-label="Anderes Datum wählen" title="Anderes Datum wählen" aria-expanded={picker} disabled={busy} onClick={()=>{setMonth(date.slice(0,7));setPicker(!picker);}}><CalendarDays size={20}/></button></div>
    {picker&&<div className="classbook-picker">
     <div className="calendar-toolbar"><button type="button" className="btn" aria-label="Vorheriger Monat" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={18}/></button><strong className="classbook-month">{new Date(month+'-01T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'UTC',month:'long',year:'numeric'})}</strong><button type="button" className="btn" aria-label="Nächster Monat" disabled={month==='9999-12'} onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={18}/></button></div>
     <div className="multi-calendar" role="group" aria-label="Datum wählen">
      {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=><span className="weekday" key={d} aria-hidden="true">{d}</span>)}
      {monthDays(month).map((day,i)=>day?<button key={day} type="button" aria-label={displayDate(day)+(saved.has(day)?' · Eintrag vorhanden':'')} aria-pressed={day===date} className={'calendar-day'+(day===date?' selected':'')+(saved.has(day)?' has-entry':'')+(day===today?' today':'')} onClick={()=>choose(day)}>{Number(day.slice(-2))}</button>:<span key={'blank'+i} aria-hidden="true"/>)}
     </div>
     <p className="calendar-legend">Tage mit Punkt haben bereits einen Eintrag.</p>
    </div>}
   </div>
   {base&&<p className="classbook-existing">Für diesen Tag gibt es bereits einen Eintrag. Speichern ersetzt ihn.</p>}
   {subjects.map(s=><div className="classbook-field" key={s.key}><label className="classbook-label" htmlFor={'classbook-'+s.key}><SubjectIcon subject={s.key}/>{s.label}</label><textarea id={'classbook-'+s.key} dir="auto" rows={3} maxLength={maxEntryText} disabled={busy} value={fields[s.key]} onChange={e=>setFields({...fields,[s.key]:e.target.value})}/></div>)}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="modal-actions">{base&&<button type="button" className="btn danger classbook-delete" disabled={busy} onClick={()=>{if(confirm(`Den Klassenbuch-Eintrag vom ${weekdayDate(date)} löschen?`))void onDelete(date,base.updatedAt);}}><Trash2 size={16}/>Löschen</button>}<button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="submit" className="btn primary" disabled={busy||!filled||(!!base&&!dirty)}>{busy?'Wird gespeichert …':base?'Speichern':'Hinzufügen'}</button></div>
   {!filled&&<p className="hint">Mindestens ein Feld ausfüllen.</p>}
  </form>
 </Dialog>;
}

export function ClassBookList({entries,className,loading,error,onClose,onEdit}:{entries:ClassBookEntry[],className:string,loading:boolean,error:string,onClose:()=>void,onEdit?:(date:string)=>void}){
 const [open,setOpen]=useState<Set<string>>(new Set()),rows=sortedEntries(entries);
 const toggle=(date:string)=>setOpen(old=>{const next=new Set(old);if(next.has(date))next.delete(date);else next.add(date);return next;});
 return <Dialog className="classbook-list" labelledBy="classbook-list-title" onClose={onClose}>
  <button className="close" aria-label="Dialog schließen" onClick={onClose}><X/></button>
  <h2 id="classbook-list-title">Klassenbuch</h2>
  <p className="classbook-subtitle" dir="auto">{className}{rows.length>0&&` · ${rows.length} ${rows.length===1?'Eintrag':'Einträge'}`}</p>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {loading?<p className="classbook-empty">Klassenbuch wird geladen …</p>:!rows.length?<p className="classbook-empty">Noch keine Einträge.</p>:
  <ul className="classbook-entries">{rows.map(entry=>{const expanded=open.has(entry.date),filled=subjects.filter(s=>entry[s.key]);return <li key={entry.date} className={expanded?'expanded':undefined}>
   <button type="button" className="classbook-row" aria-expanded={expanded} aria-controls={'classbook-'+entry.date} onClick={()=>toggle(entry.date)}><strong>{weekdayDate(entry.date)}</strong>{!expanded&&<span className="classbook-row-subjects" aria-label={filled.map(s=>s.label).join(', ')}>{filled.map(s=><SubjectIcon key={s.key} subject={s.key}/>)}</span>}<ChevronDown className="classbook-chevron" size={20}/></button>
   {expanded&&<div className="classbook-detail" id={'classbook-'+entry.date}>{filled.map(s=><div className="classbook-subject" key={s.key}><span className="classbook-subject-name"><SubjectIcon subject={s.key}/>{s.label}</span><p dir="auto">{entry[s.key]}</p></div>)}{onEdit&&<button type="button" className="textbutton classbook-edit" onClick={()=>onEdit(entry.date)}><Pencil size={14}/>Bearbeiten</button>}</div>}
  </li>;})}</ul>}
  <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Schließen</button></div>
 </Dialog>;
}
