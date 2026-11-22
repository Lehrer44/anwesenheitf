import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {initial,mutate,teacherRowId,syncReportingTeachers} from '../src/model.ts';
import {makeDocx,exportRowsFor,exportPages,exportRows} from '../src/export.ts';
function entries(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files:Record<string,string>={};let i=0;const decoder=new TextDecoder();while(view.getUint32(i,true)===0x04034b50){const size=view.getUint32(i+18,true),names=view.getUint16(i+26,true),extra=view.getUint16(i+28,true);const path=decoder.decode(bytes.subarray(i+30,i+30+names)),start=i+30+names+extra;files[path]=decoder.decode(bytes.subarray(start,start+size));i=start+size;}return files;}
const s=initial(2);mutate(s,{action:'addStudents',names:'Anna\nBen',group:s.groups[0].id});mutate(s,{action:'addStudents',names:'Clara',group:s.groups[1].id});
mutate(s,{action:'group',id:s.groups[0].id,name:'Klasse 1',l1:'Lehrer A',l2:'Lehrer B'});mutate(s,{action:'group',id:s.groups[1].id,name:'Klasse 2',l1:'Lehrer A'});
for(const date of ['2026-11-11','2026-11-13','2026-11-15','2026-12-01'])mutate(s,{action:'session',date});
syncReportingTeachers(s,'2026-11-01');
const [d1,d2,d3]=s.sessions,[a,b]=s.teachers!;
for(const p of s.students)d1.marks[p.id]='anwesend';d1.marks[s.students[1].id]='abwesend';d1.marks[teacherRowId(a.id)]='anwesend';d1.marks[teacherRowId(b.id)]='anwesend';
d2.cancelled='Ferien';
const rows=exportRowsFor(s,'','','2026-11-20');
// 11.11.2026 is a Wednesday ("الأربعاء"); counts only for past lessons, cancelled lessons marked.
assert.deepEqual(rows[0],{day:'الأربعاء',date:'11.11.2026',pupils:'2',teachers:'2'});
assert.deepEqual(rows[1],{day:'الجمعة',date:'13.11.2026',pupils:'ملغى',teachers:''});
assert.deepEqual(rows[2],{day:'الأحد',date:'15.11.2026',pupils:'0',teachers:'0'});
assert.deepEqual(rows[3],{day:'الثلاثاء',date:'01.12.2026',pupils:'',teachers:''});
assert.deepEqual(exportRowsFor(s,'2026-11-12','2026-11-15','2026-11-20').map(r=>r.date),['13.11.2026','15.11.2026']);
// Up to 36 dates one table; more dates are split evenly into two tables, at most 72 per page.
const n=(k:number)=>Array.from({length:k},(_,i)=>({day:'',date:String(i),pupils:'',teachers:''}));
assert.equal(exportRows,36);
assert.deepEqual(exportPages(n(36)).map(([r,l])=>[r.length,l?.length??null]),[[36,null]]);
assert.deepEqual(exportPages(n(37)).map(([r,l])=>[r.length,l?.length??null]),[[19,18]]);
assert.deepEqual(exportPages(n(72)).map(([r,l])=>[r.length,l?.length??null]),[[36,36]]);
assert.deepEqual(exportPages(n(100)).map(([r,l])=>[r.length,l?.length??null]),[[36,36],[14,14]]);
assert.deepEqual(exportPages(n(100))[0][0].map(r=>r.date).slice(0,2),['0','1']);assert.equal(exportPages(n(100))[0][1]![0].date,'36');
// The document is right-to-left Arabic with the template's header and gray stripes.
const doc=entries(makeDocx(s,'','','2026-11-20'))['word/document.xml'];
for(const text of ['جدول حضور الطلاب والمدرسين','اليوم','التاريخ','الطلاب','المدرسون 2','<w:bidiVisual/>','w:fill="D9D9D9"','w:fill="F2F2F2"','11.11.2026','ملغى','w:w="11906"'])assert.ok(doc.includes(text),text);
assert.equal((doc.match(/<w:tbl>/g)||[]).length,1);assert.ok(!doc.includes('w:type="page"'));
const many=structuredClone(s);many.sessions=[];for(let i=0;i<80;i++){const d=new Date(Date.UTC(2026,0,1+i*2));mutate(many,{action:'session',date:d.toISOString().slice(0,10)});}
const big=makeDocx(many,'','','2026-03-01'),bigDoc=entries(big)['word/document.xml'];
assert.equal((bigDoc.match(/<w:tbl>/g)||[]).length,2);assert.equal((bigDoc.match(/w:type="page"/g)||[]).length,1);assert.equal((bigDoc.match(/<w:gridCol w:w="446"\/>/g)||[]).length,2);
assert.ok(entries(big)['[Content_Types].xml'].includes('wordprocessingml.document.main+xml'));
writeFileSync('test-formatted-export.docx',big);
console.log('Export checks passed: Arabic Word layout, weekday names, counts for past lessons only, cancellations, date filtering, one or two tables per page and page breaks.');
