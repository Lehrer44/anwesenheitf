import assert from 'node:assert/strict';
import {classBookEntry,sortedEntries,weekdayDate,maxEntryText} from '../src/classbook.ts';
import {carryClassBooks} from '../src/firebase-classbook.ts';
const today='2026-11-19';
// Multiline text keeps its inner line breaks; surrounding blanks and Windows line endings are normalized.
assert.deepEqual(classBookEntry({date:today,quran:'  Sure 114\r\nVers 1–6 ',bildung:'',arabisch:'أ و ب'},today),{date:today,quran:'Sure 114\nVers 1–6',bildung:'',arabisch:'أ و ب'});
assert.throws(()=>classBookEntry({date:today,quran:' ',bildung:'\n',arabisch:''},today),/mindestens ein Fach/);
assert.throws(()=>classBookEntry({date:'2026-11-20',quran:'x'},today),/heute oder vergangene/);
for(const date of ['2026-02-30','19.11.2026','',undefined])assert.throws(()=>classBookEntry({date,quran:'x'} as any,today),/gültiges Datum/);
assert.throws(()=>classBookEntry({date:today,arabisch:'x'.repeat(maxEntryText+1)},today),/höchstens/);
assert.equal(classBookEntry({date:today,bildung:'x'.repeat(maxEntryText)},today).bildung.length,maxEntryText);
assert.equal(classBookEntry({date:'2024-02-29',quran:'x'},today).date,'2024-02-29');
const entry=(date:string)=>({date,quran:'x',bildung:'',arabisch:'',updatedAt:null});
assert.deepEqual(sortedEntries([entry('2026-11-07'),entry('2026-11-19'),entry('2026-11-14')]).map(e=>e.date),['2026-11-19','2026-11-14','2026-11-07']);
assert.equal(weekdayDate('2026-11-19'),'Do 19.11.2026');assert.equal(weekdayDate('2026-11-14'),'Sa 14.11.2026');assert.equal(weekdayDate('2026-03-29'),'So 29.03.2026');
// Renewed links carry entries to the class's new channel; deleted classes drop them only when explicitly allowed.
const books=new Map([['channels/old/classbook/2026-11-19',{groupId:'g1',date:'2026-11-19',quran:'x'}],['channels/gone/classbook/2026-11-18',{groupId:'g2',date:'2026-11-18',quran:'y'}]]);
const after=new Map<string,any>([['channels/new',{groupId:'g1'}],['channels/new/lessons/2026-11-19',{groupId:'g1'}]]);
assert.throws(()=>carryClassBooks(books,new Map(after),false),/Klassenbuch-Einträge/);
carryClassBooks(books,after,true);
assert.deepEqual(after.get('channels/new/classbook/2026-11-19'),books.get('channels/old/classbook/2026-11-19'));
assert.equal([...after.keys()].filter(p=>p.includes('/classbook/')).length,1);
console.log('Class book checks passed: validation, multiline text, dates, sorting, weekday labels and entries following renewed links.');
