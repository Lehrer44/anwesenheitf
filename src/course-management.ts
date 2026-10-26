export type CourseChoice={id:string,title:string};
export type CourseEdit={id?:string,title:string,groupCount?:number};
export function courseChanges(original:CourseChoice[],rows:CourseEdit[]){
 if(!Array.isArray(original)||!Array.isArray(rows))throw Error('Ungültige Listen.');
 const known=new Map(original.map(c=>[c.id,c]));
 if(known.size!==original.length)throw Error('Doppelte Listen.');
 const retained=new Set<string>(),renamed:{id:string,title:string,previousTitle:string}[]=[],added:{title:string,groupCount:number}[]=[];
 for(const row of rows){
  if(!row||typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>100)throw Error('Bitte einen Listennamen mit 1 bis 100 Zeichen eingeben.');
  const title=row.title.trim();
  if(row.id!==undefined){const previous=known.get(row.id);if(!previous||retained.has(row.id))throw Error('Ungültige oder doppelte Liste.');retained.add(row.id);if(title!==previous.title)renamed.push({id:row.id,title,previousTitle:previous.title});}
  else{const groupCount=row.groupCount;if(!Number.isInteger(groupCount)||groupCount!<0||groupCount!>30)throw Error('Bitte eine Klassenanzahl von 0 bis 30 wählen.');added.push({title,groupCount:groupCount!});}
 }
 return {renamed,added,deleted:original.filter(c=>!retained.has(c.id))};
}
