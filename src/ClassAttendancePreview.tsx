import {useEffect,useRef} from 'react';
import {displayClassName,isTeacher,orderedRoster,type State,type Session} from './model';

export default function ClassAttendancePreview({state,session,groupId,onClose}:{state:State,session:Session,groupId:string,onClose:()=>void}){
 const panel=useRef<HTMLElement>(null),opener=useRef(document.activeElement as HTMLElement|null);
 const pupils=orderedRoster(state,session.roster).filter(p=>p.group===groupId);
 const name=displayClassName(state.groups.find(g=>g.id===groupId)?.name||'');
 useEffect(()=>{
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  panel.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=overflow;opener.current?.focus();};
 },[]);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section ref={panel} tabIndex={-1} className="modal class-attendance-preview" role="dialog" aria-modal="true" aria-labelledby="class-preview-title" onKeyDown={e=>{
   if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();e.stopPropagation();onClose();}
   if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();}
  }}>
   <h2 id="class-preview-title" dir="auto">{name}</h2>
   <div className="preview-roster"><table className="preview-table"><thead><tr><th scope="col">Status</th><th scope="col">Name</th><th scope="col">Nr.</th></tr></thead>
    <tbody>{pupils.map((p,i)=><tr className={isTeacher(p)?'teacher-row':undefined} key={p.id}>
     <td><span className={'cellstatus '+(session.marks[p.id]||'offen')}>{session.marks[p.id]||'Nicht gemeldet'}</span></td>
     <td className="preview-name" dir="auto">{p.name}</td><td className="preview-number">{isTeacher(p)?p.teacherRole:pupils.slice(0,i+1).filter(x=>!isTeacher(x)).length}</td>
    </tr>)}</tbody>
   </table></div>
   <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Schließen</button></div>
  </section>
 </div>;
}
