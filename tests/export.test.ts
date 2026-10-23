import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {initial,mutate} from '../src/model.ts';
import {makeXlsx} from '../src/export.ts';
function entries(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files:Record<string,string>={};let i=0;const decoder=new TextDecoder();while(view.getUint32(i,true)===0x04034b50){const size=view.getUint32(i+18,true),names=view.getUint16(i+26,true),extra=view.getUint16(i+28,true);const path=decoder.decode(bytes.subarray(i+30,i+30+names)),start=i+30+names+extra;files[path]=decoder.decode(bytes.subarray(start,start+size));i=start+size;}return files;}
const s=initial(7);mutate(s,{action:'addStudents',names:'Anna\nBen\nClara',group:s.groups[0].id});mutate(s,{action:'assign',id:s.students[2].id,group:s.groups[1].id});
for(const date of ['2026-10-01','2026-10-08'])mutate(s,{action:'session',date});
for(const [i,status]of ['anwesend','abwesend','entschuldigt'].entries())mutate(s,{action:'mark',date:'2026-10-08',id:s.students[i].id,status});
const bytes=makeXlsx(s,'2026-10-08','2026-10-08',{absent:'A & <fehlt>',excused:'=E'}),files=entries(bytes),sheet=files['xl/worksheets/sheet1.xml'];
assert.ok(sheet.includes('topLeftCell="C2"'));assert.ok(sheet.includes('A &amp; &lt;fehlt&gt;'));assert.ok(sheet.includes('=E'));assert.ok(!sheet.includes('<f>'));assert.ok(sheet.includes('r="C3" s="0" t="inlineStr"><is><t xml:space="preserve"></t>'));
assert.ok(sheet.includes('r="A3" s="7" ><v>1</v>'));assert.ok(sheet.includes('r="A4" s="7" ><v>2</v>'));assert.ok(sheet.includes('r="A6" s="10" ><v>3</v>'));assert.ok(!sheet.includes('r="D1"'));
assert.ok(files['xl/styles.xml'].includes('horizontal="center"'));assert.ok(!entries(makeXlsx(s,'','',{absent:'',excused:''}))['xl/worksheets/sheet1.xml'].includes('<t xml:space="preserve">abwesend</t>'));
writeFileSync('test-formatted-export.xlsx',bytes);
console.log('Export checks passed: custom literal labels, XML escaping, blank presence, continuous numbering across groups, date filtering, centered header style.');

