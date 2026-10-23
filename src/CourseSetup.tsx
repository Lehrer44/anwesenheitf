import {useState} from 'react';
import {X} from 'lucide-react';

type Props={mode:'create'|'groups',initialTitle?:string,initialCount?:number,busy:boolean,onClose:()=>void,onSubmit:(title:string,count:number)=>Promise<void>};
export default function CourseSetup({mode,initialTitle='',initialCount,busy,onClose,onSubmit}:Props){
 const [title,setTitle]=useState(initialTitle),[count,setCount]=useState(initialCount===undefined?'':String(initialCount)),[error,setError]=useState('');
 return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="course-setup-title">
  <button className="close" disabled={busy} onClick={onClose} aria-label="Dialog schließen"><X/></button>
  <div className="eyebrow">KURSBLICK</div><h2 id="course-setup-title">{mode==='create'?'Neuen Kurs anlegen':'Gruppenanzahl ändern'}</h2>
  <form onSubmit={async e=>{e.preventDefault();const value=Number(count);if(!count.trim()||!Number.isInteger(value)||value<0||value>30){setError('Bitte eine ganze Gruppenanzahl von 0 bis 30 wählen.');return;}setError('');try{await onSubmit(title,value);}catch(e){setError((e as Error).message);}}}>
   {mode==='create'&&<label>Kursname<input autoFocus required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>}
   <label>Anzahl der Gruppen<input autoFocus={mode==='groups'} required type="number" min={0} max={30} step={1} value={count} onChange={e=>setCount(e.target.value)} placeholder="Anzahl eingeben"/></label>
   <p className="hint">Du wählst die Anzahl für diesen Kurs selbst. Mit 0 legst du die Gruppen später einzeln an.</p>
   {mode==='groups'&&<p className="hint">Beim Verkleinern werden nur vollständig unbenutzte Gruppen am Ende der Liste entfernt. Gruppen mit Schülern oder früheren Terminen bleiben erhalten.</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy} type="submit">{busy?'Wird gespeichert …':mode==='create'?'Kurs anlegen':'Speichern'}</button></div>
  </form>
 </section></div>;
}
