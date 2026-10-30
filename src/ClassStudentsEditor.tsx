import {useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowDown,Trash2,X} from 'lucide-react';
import {displayClassName,groupedStudents,type State,type Student} from './model';

export default function ClassStudentsEditor({state,groupId,busy,error,onClose,onSave}:{state:State,groupId:string,busy:boolean,error:string,onClose:()=>void,onSave:(original:Student[],students:Student[])=>Promise<boolean>}){
 const [original]=useState(()=>structuredClone(groupedStudents(state).find(g=>g.id===groupId)?.students||[]));
 const [students,setStudents]=useState(()=>structuredClone(original));
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 const changed=JSON.stringify(original)!==JSON.stringify(students);
 const className=displayClassName(state.groups.find(g=>g.id===groupId)?.name||'Ohne Klasse');
 function close(){if(!busy&&(!changed||confirm('Ungespeicherte Änderungen verwerfen?')))onClose();}
 useEffect(()=>{panel.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>opener.current?.focus();},[]);
 useEffect(()=>{if(!changed)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[changed]);
 function update(id:string,change:Partial<Student>){setStudents(rows=>rows.map(p=>p.id===id?{...p,...change}:p));}
 function reorder(index:number,direction:number){setStudents(rows=>{const next=[...rows];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});}
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={panel} className="modal class-students-editor" role="dialog" aria-modal="true" aria-labelledby="class-editor-title" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();close();}
  if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><button className="close" disabled={busy} onClick={close} aria-label="Dialog schließen"><X/></button><h2 id="class-editor-title">Bearbeiten</h2><h3 className="editor-class-name" dir="auto">{className}</h3>
 <form onSubmit={e=>{e.preventDefault();onSave(original,students);}}><div className="class-student-rows">{students.map((p,i)=>{
  return <div className="class-student-row" key={p.id}>
   <div className="editor-order">{([-1,1] as const).map(direction=><button type="button" key={direction} disabled={busy||i+direction<0||i+direction>=students.length} aria-label={`${p.name} ${direction===-1?'nach oben':'nach unten'}`} onClick={()=>reorder(i,direction)}>{direction===-1?<ArrowUp size={16}/>:<ArrowDown size={16}/>}</button>)}</div>
   <select aria-label={`Klasse für ${p.name}`} value={p.group} disabled={busy} onChange={e=>update(p.id,{group:e.target.value})}><option value="">Ohne Klasse</option>{state.groups.map(g=><option key={g.id} value={g.id}>{displayClassName(g.name)}</option>)}</select>
   <button className="editor-delete" type="button" disabled={busy} aria-label={`${p.name} löschen`} onClick={()=>{if(confirm(`${p.name} dauerhaft aus der Schülerliste und allen Unterrichtsterminen löschen? Sämtliche Anwesenheitseinträge werden entfernt. Die Löschung erfolgt mit „Speichern“ und lässt sich danach nicht rückgängig machen.`))setStudents(rows=>rows.filter(x=>x.id!==p.id));}}><Trash2 size={17}/></button>
   <input aria-label={`Name von Schüler ${i+1}`} dir="auto" required maxLength={150} disabled={busy} className="student-label" value={p.name} onChange={e=>update(p.id,{name:e.target.value})}/>
  </div>;
 })}</div>{!students.length&&<p className="editor-empty">Keine Schüler in dieser Klasse.</p>}
 <p className="hint">Änderungen werden mit „Speichern“ übernommen.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Schließen</button><button type="submit" className="btn primary" disabled={busy||!changed}>{busy?'Wird gespeichert …':'Speichern'}</button></div></form>
 </section></div>;
}
