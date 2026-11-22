import {attendanceCounts,courseToday,registeredTeachers,type Session,type State} from './model.ts';
const enc=new TextEncoder();
const xml=(x:string)=>x.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function crc(data:Uint8Array){let c=0xffffffff;for(const x of data){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(files:Record<string,string>){const chunks:Uint8Array[]=[];const central:Uint8Array[]=[];let off=0;for(const [name,content]of Object.entries(files)){const n=enc.encode(name),d=enc.encode(content),sum=crc(d);const h=new Uint8Array(30+n.length);const v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);h.set(n,30);chunks.push(h,d);const c=new Uint8Array(46+n.length);const w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,sum,true);w.setUint32(20,d.length,true);w.setUint32(24,d.length,true);w.setUint16(28,n.length,true);w.setUint32(42,off,true);c.set(n,46);central.push(c);off+=h.length+d.length;}const size=central.reduce((a,c)=>a+c.length,0);const end=new Uint8Array(22);const e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,off,true);const out=new Uint8Array(off+size+22);let p=0;for(const c of [...chunks,...central,end]){out.set(c,p);p+=c.length;}return out;}
// Word export after the school's template: Arabic, right to left, columns
// day | date | pupils present (bold) | teachers present, header "teachers <total>".
const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export const exportRows=36; // rows per table on one A4 page, as in the template
const widths=[1047,1744,1134,1276],gap=446;
const border='<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:start w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:end w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>';
function run(text:string,bold:boolean,size=22){
 const rpr=`<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${bold?'<w:b/><w:bCs/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rtl/></w:rPr>`;
 return text?`<w:r>${rpr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`:'';
}
const paragraph=(text:string,bold=false,size=22)=>`<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${run(text,bold,size)}</w:p>`;
function cell(width:number,text:string,{fill='',bold=false,lines=true}:{fill?:string,bold?:boolean,lines?:boolean}={}){
 return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${lines?border:''}${fill?`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`:''}<w:vAlign w:val="center"/></w:tcPr>${paragraph(text,bold)}</w:tc>`;
}
export type ExportRow={day:string,date:string,pupils:string,teachers:string};
// Counts only for lessons that have taken place; future dates stay empty like in the template.
export function exportRowsFor(s:State,from='',to='',today=courseToday()):ExportRow[]{
 return [...s.sessions].sort((a,b)=>a.date.localeCompare(b.date)).filter(d=>(!from||d.date>=from)&&(!to||d.date<=to)).map((d:Session)=>{
  const [y,m,dd]=d.date.split('-'),c=attendanceCounts(s,d),done=d.date<=today;
  return {day:days[new Date(d.date+'T12:00:00Z').getUTCDay()],date:`${dd}.${m}.${y}`,pupils:d.cancelled?'ملغى':done?String(c.students.present):'',teachers:d.cancelled||!done?'':String(c.teachers.present)};
 });
}
const sideCells=(row:ExportRow|undefined,index:number)=>{
 if(!row)return widths.map(w=>cell(w,'',{lines:false})).join('');
 const fill=index%2?'F2F2F2':'FFFFFF';
 return cell(widths[0],row.day,{fill})+cell(widths[1],row.date,{fill})+cell(widths[2],row.pupils,{fill,bold:true})+cell(widths[3],row.teachers,{fill});
};
// One page: a single table, or two tables side by side (earlier dates on the right).
function pageTable(right:ExportRow[],left:ExportRow[]|null,teacherTotal:number){
 const head=()=>cell(widths[0],'اليوم',{fill:'D9D9D9',bold:true})+cell(widths[1],'التاريخ',{fill:'D9D9D9',bold:true})+cell(widths[2],'الطلاب',{fill:'D9D9D9',bold:true})+cell(widths[3],'المدرسون '+teacherTotal,{fill:'D9D9D9',bold:true});
 const spacer=()=>cell(gap,'',{lines:false}),grid=left?[...widths,gap,...widths]:widths,total=grid.reduce((a,b)=>a+b,0);
 const rows=[`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="485" w:hRule="atLeast"/><w:tblHeader/></w:trPr>${head()}${left?spacer()+head():''}</w:tr>`];
 for(let i=0;i<right.length;i++)rows.push(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="371" w:hRule="atLeast"/></w:trPr>${sideCells(right[i],i)}${left?spacer()+sideCells(left[i],i):''}</w:tr>`);
 return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:start w:w="108" w:type="dxa"/><w:end w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}
// Up to 36 dates: one table. More: pages of up to 72 dates, split evenly between two tables.
export function exportPages(rows:ExportRow[]):[ExportRow[],ExportRow[]|null][]{
 if(rows.length<=exportRows)return [[rows,null]];
 const pages:[ExportRow[],ExportRow[]|null][]=[];
 for(let i=0;i<rows.length;i+=exportRows*2){const chunk=rows.slice(i,i+exportRows*2),half=Math.ceil(chunk.length/2);pages.push([chunk.slice(0,half),chunk.slice(half)]);}
 return pages;
}
export function makeDocx(s:State,from='',to='',today=courseToday()){
 const rows=exportRowsFor(s,from,to,today),teachers=registeredTeachers(s).length,title='جدول حضور الطلاب والمدرسين';
 const pages=exportPages(rows).map(([right,left],i)=>`${i?'<w:p><w:r><w:br w:type="page"/></w:r></w:p>':''}<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="0" w:after="120"/></w:pPr>${run(title,true,32)}</w:p>${pageTable(right,left,teachers)}`).join('');
 const empty=rows.length?'':paragraph('لا توجد مواعيد في هذه الفترة.');
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pages}${empty}<w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="397" w:right="851" w:bottom="567" w:left="851" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>';
 return zip({
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'word/document.xml':document,'word/styles.xml':styles,
 });
}
