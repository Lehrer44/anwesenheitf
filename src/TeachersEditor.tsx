import {useEffect,useRef,useState} from 'react';
import {Plus,Trash2,X} from 'lucide-react';
import {displayClassName,registeredTeachers,type State,type Teacher} from './model';

type Row={key:string,id?:string,name:string};
// The course's central teacher list. Every class link shows all of these names.
export default function TeachersEditor({state,busy,error,onClose,onSave}:{state:State,busy:boolean,error:string,onClose:()=>void,onSave:(original:Teacher[],teachers:{id?:string,name:string}[])=>Promise<boolean>}){
 const [original]=useState(()=>structuredClone(registeredTeachers(state)));
 const [rows,setRows]=useState<Row[]>(()=>original.map(t=>({key:t.id,id:t.id,name:t.name})));
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 const changed=JSON.stringify(original.map(t=>[t.id,t.name]))!==JSON.stringify(rows.map(r=>[r.id,r.name]));
 const roles=(id?:string)=>state.groups.flatMap(g=>[g.lehrer?.l1?.id===id&&'L1 '+displayClassName(g.name),g.lehrer?.l2?.id===id&&'L2 '+displayClassName(g.name)]).filter(Boolean).join(' · ');
 function close(){if(!busy&&(!changed||confirm('Ungespeicherte Änderungen verwerfen?')))onClose();}
 useEffect(()=>{panel.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>opener.current?.focus();},[]);
 useEffect(()=>{if(!changed)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[changed]);
 function add(){const key=crypto.randomUUID();setRows(r=>[...r,{key,name:''}]);setTimeout(()=>panel.current?.querySelector<HTMLInputElement>(`[data-key="${key}"]`)?.focus());}
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} className="modal class-students-editor teachers-editor" role="dialog" aria-modal="true" aria-labelledby="teachers-editor-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><button className="close" disabled={busy} onClick={close} aria-label="Dialog schließen"><X/></button><h2 id="teachers-editor-title">Lehrer</h2>
 <form onSubmit={e=>{e.preventDefault();onSave(original,rows.map(r=>({...(r.id?{id:r.id}:{}),name:r.name})));}}>
  <p>Alle Lehrer erscheinen in jeder Klasse in der Lehrer-Anwesenheit. L1 und L2 werden unter „Bearbeiten“ der jeweiligen Klasse gewählt.</p>
  <div className="class-student-rows">{rows.map((r,i)=><div className="class-student-row teacher-edit-row" key={r.key}>
   <button className="editor-delete" type="button" disabled={busy} aria-label={`${r.name||'Lehrer'} entfernen`} onClick={()=>{if(!roles(r.id)||confirm(`${r.name} ist eingetragen als ${roles(r.id)}. Entfernen? Die Zuordnung wird aufgehoben, frühere Anwesenheiten bleiben erhalten.`))setRows(x=>x.filter(y=>y.key!==r.key));}}><Trash2 size={17}/></button>
   <div className="teacher-edit-name"><input aria-label={`Name von Lehrer ${i+1}`} data-key={r.key} dir="auto" required maxLength={150} disabled={busy} className="student-label" value={r.name} onChange={e=>setRows(x=>x.map(y=>y.key===r.key?{...y,name:e.target.value}:y))}/>{roles(r.id)&&<small dir="auto">{roles(r.id)}</small>}</div>
  </div>)}</div>
  {!rows.length&&<p className="editor-empty">Noch keine Lehrer eingetragen.</p>}
  <button type="button" className="btn teacher-add" disabled={busy||rows.length>=300} onClick={add}><Plus size={16}/>Lehrer hinzufügen</button>
  <p className="hint">Änderungen werden mit „Speichern“ übernommen.</p>
  {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="submit" className="btn primary" disabled={busy||!changed}>{busy?'Wird gespeichert …':'Speichern'}</button></div>
 </form></section></div>;
}
