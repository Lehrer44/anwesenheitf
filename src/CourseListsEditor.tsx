import {useEffect,useRef,useState} from 'react';
import {Plus,Trash2,X} from 'lucide-react';
import type {CourseChoice,CourseEdit} from './course-management';

export default function CourseListsEditor({courses,busy,error,onClose,onSave}:{courses:CourseChoice[],busy:boolean,error:string,onClose:()=>void,onSave:(original:CourseChoice[],rows:CourseEdit[])=>Promise<boolean>}){
 const [original]=useState(()=>structuredClone(courses));
 const [rows,setRows]=useState(()=>courses.map(c=>({...c,key:c.id,count:''})));
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 const changed=rows.length!==original.length||rows.some((r,i)=>r.id!==original[i]?.id||r.title!==original[i]?.title);
 function close(){if(!busy&&(!changed||confirm('Ungespeicherte Änderungen verwerfen?')))onClose();}
 useEffect(()=>{(panel.current?.querySelector<HTMLInputElement>('input')||panel.current)?.focus();return()=>{if(opener.current?.isConnected)opener.current.focus();};},[]);
 useEffect(()=>{if(!changed)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[changed]);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} tabIndex={-1} className="modal course-lists-editor" role="dialog" aria-modal="true" aria-labelledby="course-lists-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><button className="close" aria-label="Dialog schließen" disabled={busy} onClick={close}><X/></button><h2 id="course-lists-title">Bearbeiten</h2>
 <form onSubmit={e=>{e.preventDefault();onSave(original,rows.map(r=>({...r,id:r.id||undefined,groupCount:r.id?undefined:Number(r.count)})));}}><div className="course-list-rows">{rows.map((row,i)=><div className="course-list-row" key={row.key}>
  <label>Name<input required maxLength={100} aria-label={`Listenname ${i+1}`} value={row.title} disabled={busy} onChange={e=>setRows(rows=>rows.map(r=>r.key===row.key?{...r,title:e.target.value}:r))}/></label>
  <button type="button" className="editor-delete" aria-label={`${row.title||'Neue Liste'} löschen`} disabled={busy} onClick={()=>{if(confirm('Wirklich löschen? Alles geht verloren.'))setRows(rows=>rows.filter(r=>r.key!==row.key));}}><Trash2 size={18}/></button>
  {!row.id&&<label className="new-list-count">Anzahl der Klassen<input type="number" required min={0} max={30} step={1} placeholder="Anzahl" value={row.count} disabled={busy} onChange={e=>setRows(rows=>rows.map(r=>r.key===row.key?{...r,count:e.target.value}:r))}/></label>}
 </div>)}</div>
 <button type="button" className="btn add-course-list" disabled={busy} onClick={()=>setRows(rows=>[...rows,{id:'',key:crypto.randomUUID(),title:'',count:''}])}><Plus size={17}/>Liste hinzufügen</button>
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="submit" className="btn primary" disabled={busy||!changed}>{busy?'Wird gespeichert …':'Speichern'}</button></div></form>
 </section></div>;
}
