import {doc,runTransaction,type Firestore} from 'firebase/firestore';
import {initial} from './model.ts';
import {documentsFor,changesBetween,type Documents} from './firebase-data.ts';
import {ownerRead} from './firebase-repository.ts';
import {courseChanges,type CourseChoice,type CourseEdit} from './course-management.ts';

export async function saveCourseLists(db:Firestore,uid:string,original:CourseChoice[],rows:CourseEdit[]){
 const plan=courseChanges(original,rows),created=await Promise.all(plan.added.map(async c=>{
  const id=crypto.randomUUID(),state=initial(c.groupCount);state.title=c.title;return {id,docs:await documentsFor(state,id,uid,0)};
 }));
 const affected=[...plan.renamed.map(c=>({id:c.id,title:c.previousTitle})),...plan.deleted];
 for(let attempt=0;attempt<4;attempt++){
  const loaded=await Promise.all(affected.map(async c=>{const value=await ownerRead(db,c.id);if(value.meta.title!==c.title)throw Error('Die Listen wurden zwischenzeitlich geändert. Bitte den Dialog schließen und erneut öffnen.');return {id:c.id,...value};}));
  try{
   await runTransaction(db,async tx=>{
    // Missing course roots are deliberately unreadable; create rules reject ID collisions.
    const paths=[...new Set(loaded.flatMap(c=>[...c.docs.keys()]))];
    const snapshots=await Promise.all(paths.map(path=>tx.get(doc(db,path))));
    const before:Documents=new Map();snapshots.forEach(s=>{if(s.exists())before.set(s.ref.path,s.data());});
    for(const c of loaded)if(before.get('courses/'+c.id)?.version!==c.meta.version)throw Error('COURSE_CHANGED');
    const after:Documents=new Map(before);
    for(const c of loaded){
     if(plan.deleted.some(d=>d.id===c.id)){for(const path of c.docs.keys())after.delete(path);}
     else{const title=plan.renamed.find(r=>r.id===c.id)!.title,path='courses/'+c.id;after.set(path,{...before.get(path),title,version:c.meta.version+1});for(const channel of c.docs.keys())if(channel.startsWith('channels/')&&channel.split('/').length===2)after.set(channel,{...before.get(channel),title});}
    }
    for(const c of created)for(const [path,value] of c.docs)after.set(path,value);
    const changes=changesBetween(before,after);
    for(const path of changes.deletes)tx.delete(doc(db,path));
    for(const [path,value] of changes.sets)tx.set(doc(db,path),value);
   });
   return created.map(c=>c.id);
  }catch(e){if((e as Error).message==='COURSE_CHANGED')continue;throw e;}
 }
 throw Error('Gleichzeitige Änderung. Bitte erneut versuchen.');
}
