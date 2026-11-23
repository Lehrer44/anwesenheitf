import {isDate} from './calendar.ts';
// One class book entry per class and day. The date is also the document ID.
// Remarks are optional and only appear in the class book when filled in.
export const subjects=[
 {key:'quran',label:'Qur’an'},
 {key:'bildung',label:'Islamische Bildung'},
 {key:'arabisch',label:'Arabisch'},
 {key:'bemerkungen',label:'Bemerkungen'},
] as const;
export type SubjectKey=typeof subjects[number]['key'];
export type ClassBookEntry={date:string,quran:string,bildung:string,arabisch:string,bemerkungen:string,updatedAt:string|null};
export type ClassBookInput=Pick<ClassBookEntry,'date'|SubjectKey>;
export const maxEntryText=2000;
const clean=(value:unknown)=>typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
// Validate a complete entry before saving; Firestore rules enforce the same limits.
// Entries may be planned ahead, so future dates are allowed.
export function classBookEntry(input:Partial<ClassBookInput>):ClassBookInput{
 const date=String(input.date||'');
 if(!isDate(date))throw Error('Bitte ein gültiges Datum wählen.');
 const entry={date,quran:clean(input.quran),bildung:clean(input.bildung),arabisch:clean(input.arabisch),bemerkungen:clean(input.bemerkungen)};
 if(subjects.some(s=>entry[s.key].length>maxEntryText))throw Error(`Bitte höchstens ${maxEntryText.toLocaleString('de-DE')} Zeichen pro Feld eingeben.`);
 if(subjects.every(s=>!entry[s.key]))throw Error('Bitte mindestens ein Feld ausfüllen.');
 return entry;
}
// Entries belong to scheduled lessons: today's lesson, else the latest past one, else the next one.
export function defaultEntryDate(lessons:string[],today:string){
 const sorted=[...new Set(lessons)].sort();
 return sorted.includes(today)?today:sorted.filter(d=>d<today).at(-1)||sorted.find(d=>d>today)||'';
}
export const sortedEntries=(entries:ClassBookEntry[])=>[...entries].sort((a,b)=>b.date.localeCompare(a.date));
const weekdays=['So','Mo','Di','Mi','Do','Fr','Sa'];
// "Do 19.11.2026", independent of the device time zone.
export function weekdayDate(date:string){
 const d=new Date(date+'T12:00:00Z');
 return weekdays[d.getUTCDay()]+' '+d.toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
}
