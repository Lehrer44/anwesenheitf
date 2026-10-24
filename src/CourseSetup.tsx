import {useState} from 'react';
import {X} from 'lucide-react';

type Props={initialTitle?:string,initialCount?:number,busy:boolean,onClose:()=>void,onSubmit:(title:string,count:number)=>Promise<void>};
export default function CourseSetup({initialTitle='',initialCount,busy,onClose,onSubmit}:Props){
 const [title,setTitle]=useState(initialTitle),[count,setCount]=useState(initialCount===undefined?'':String(initialCount)),[error,setError]=useState('');
 return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="course-setup-title">
  <button className="close" disabled={busy} onClick={onClose} aria-label="Dialog schließen"><X/></button>
  <div className="eyebrow">KURSBLICK</div><h2 id="course-setup-title">Neue Liste anlegen</h2>
  <form onSubmit={async e=>{e.preventDefault();const value=Number(count);if(!count.trim()||!Number.isInteger(value)||value<0||value>30){setError('Bitte eine ganze Klassenanzahl von 0 bis 30 wählen.');return;}setError('');try{await onSubmit(title,value);}catch(e){setError((e as Error).message);}}}>
   <label>Listenname<input autoFocus required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>Anzahl der Klassen<input required type="number" min={0} max={30} step={1} value={count} onChange={e=>setCount(e.target.value)} placeholder="Anzahl eingeben"/></label>
   <p className="hint">Du wählst die Anzahl für diese Liste selbst. Mit 0 legst du die Klassen später einzeln an.</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy} type="submit">{busy?'Wird gespeichert …':'Liste anlegen'}</button></div>
  </form>
 </section></div>;
}
