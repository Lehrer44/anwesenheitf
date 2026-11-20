import {isDate} from './calendar.ts';
// One class book entry per class and day. The date is also the document ID.
export const subjects=[
 {key:'quran',label:'Qur’an'},
 {key:'bildung',label:'Islamische Bildung'},
 {key:'arabisch',label:'Arabisch'},
] as const;
export type SubjectKey=typeof subjects[number]['key'];
export type ClassBookEntry={date:string,quran:string,bildung:string,arabisch:string,updatedAt:string|null};
export type ClassBookInput=Pick<ClassBookEntry,'date'|SubjectKey>;
export const maxEntryText=2000;
const clean=(value:unknown)=>typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
// Validate a complete entry before saving; Firestore rules enforce the same limits.
export function classBookEntry(input:Partial<ClassBookInput>,today:string):ClassBookInput{
 const date=String(input.date||'');
 if(!isDate(date))throw Error('Bitte ein gültiges Datum wählen.');
 if(date>today)throw Error('Einträge sind nur für heute oder vergangene Tage möglich.');
 const entry={date,quran:clean(input.quran),bildung:clean(input.bildung),arabisch:clean(input.arabisch)};
 if(subjects.some(s=>entry[s.key].length>maxEntryText))throw Error(`Bitte höchstens ${maxEntryText.toLocaleString('de-DE')} Zeichen pro Fach eingeben.`);
 if(subjects.every(s=>!entry[s.key]))throw Error('Bitte mindestens ein Fach ausfüllen.');
 return entry;
}
export const sortedEntries=(entries:ClassBookEntry[])=>[...entries].sort((a,b)=>b.date.localeCompare(a.date));
const weekdays=['So','Mo','Di','Mi','Do','Fr','Sa'];
// "Do 19.11.2026", independent of the device time zone.
export function weekdayDate(date:string){
 const d=new Date(date+'T12:00:00Z');
 return weekdays[d.getUTCDay()]+' '+d.toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
}
