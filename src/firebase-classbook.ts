import {collection,doc,getDocs,onSnapshot,query,runTransaction,serverTimestamp,where,type Firestore,type Unsubscribe,type Timestamp} from 'firebase/firestore';
import {tokenHash,type Channel,type Documents} from './firebase-data.ts';
import {classBookEntry,type ClassBookEntry,type ClassBookInput} from './classbook.ts';
import {courseToday} from './model.ts';
import {isDate} from './calendar.ts';
// channels/{hash}/classbook/{date}: written by the class link, readable by the course owner.
// Like lessons, entries move with the class when its link is renewed.
export type ClassBookDoc={ownerUid:string,courseId:string,groupId:string,date:string,quran:string,bildung:string,arabisch:string,updatedAt:Timestamp};
const invalidLink='Dieser Klassenlink ist ungültig oder wurde erneuert.';
const stale='Der Eintrag wurde zwischenzeitlich geändert. Bitte das Klassenbuch erneut öffnen und prüfen.';
// Firestore reports a renewed or removed link only as a missing permission.
const readable=(e:unknown)=>(e as {code?:string}).code==='permission-denied'?Error(invalidLink):e as Error;
const stamp=(value:ClassBookDoc['updatedAt']|null|undefined)=>value?value.toDate().toISOString():null;
export const toEntry=(d:ClassBookDoc):ClassBookEntry=>({date:d.date,quran:d.quran,bildung:d.bildung,arabisch:d.arabisch,updatedAt:stamp(d.updatedAt)});
// Owners filter by ownerUid so the rules can authorize the query without reading the channel.
export function watchClassBook(db:Firestore,hash:string,ownerUid:string|null,onChange:(entries:ClassBookEntry[])=>void,onError:(error:Error)=>void):Unsubscribe{
 const ref=collection(db,'channels',hash,'classbook');
 return onSnapshot(ownerUid?query(ref,where('ownerUid','==',ownerUid)):ref,snap=>onChange(snap.docs.map(d=>toEntry(d.data() as ClassBookDoc))),e=>onError(readable(e)));
}
// expected is the updatedAt the form was opened with (null: no entry existed yet).
export async function writeClassBookEntry(db:Firestore,hash:string,input:ClassBookInput|{date:string,delete:true},expected:string|null,today=courseToday()){
 if(!isDate(input.date))throw Error('Bitte ein gültiges Datum wählen.');
 const entry='delete' in input?null:classBookEntry(input,today);
 await runTransaction(db,async tx=>{
  const channel=await tx.get(doc(db,'channels',hash));
  if(!channel.exists()||!channel.data().active)throw Error(invalidLink);
  const {ownerUid,courseId,groupId}=channel.data() as Channel,ref=doc(db,'channels',hash,'classbook',input.date),current=await tx.get(ref);
  if((current.exists()?stamp((current.data() as ClassBookDoc).updatedAt):null)!==expected)throw Error(stale);
  if(!entry){if(current.exists())tx.delete(ref);return;}
  tx.set(ref,{ownerUid,courseId,groupId,...entry,updatedAt:serverTimestamp()});
 }).catch(e=>{throw readable(e);});
}
// Load every class book entry of the given class links for an owner transaction.
export async function loadClassBooks(db:Firestore,tokens:string[],ownerUid:string):Promise<Documents>{
 const out:Documents=new Map();
 await Promise.all(tokens.map(async token=>{
  const hash=await tokenHash(token),result=await getDocs(query(collection(db,'channels',hash,'classbook'),where('ownerUid','==',ownerUid)));
  result.forEach(d=>out.set(d.ref.path,d.data()));
 }));
 return out;
}
// Entries of a renewed link follow the class to its new channel; entries of removed classes are deleted.
export function carryClassBooks(books:Documents,after:Documents,allowRemoval:boolean){
 const channels=new Map([...after].filter(([p])=>/^channels\/[^/]+$/.test(p)).map(([p,v])=>[v.groupId as string,p]));
 for(const [path,value] of books){
  const target=channels.get(value.groupId);
  if(!target){if(!allowRemoval)throw Error('Diese Klasse hat Klassenbuch-Einträge und kann nicht automatisch entfernt werden. Bitte die Klasse unter „Links“ gezielt löschen.');continue;}
  after.set(target+'/classbook/'+value.date,value);
 }
}
