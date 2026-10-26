export function isDate(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function sessionDates(value:unknown):string[]{
 if(!Array.isArray(value)||!value.length||value.length>1000||value.some(d=>!isDate(d))||new Set(value).size!==value.length)throw Error('Bitte unterschiedliche, gültige Termine auswählen (maximal 1.000).');
 return [...value].sort();
}
export function monthDays(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
 const first=new Date(month+'-01T12:00:00Z'),end=new Date(first);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 return [...Array<null>((first.getUTCDay()+6)%7).fill(null),...Array.from({length:end.getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
}
export function shiftMonth(month:string,direction:number){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+direction);return d.toISOString().slice(0,7);}
export const displayDate=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
