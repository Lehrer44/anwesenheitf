import {readFileSync} from 'node:fs';
const names=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'];
const values=names.map(name=>process.env[name]);
const committed=JSON.parse(readFileSync(new URL('../src/firebase-config.json',import.meta.url),'utf8'));
const config=values.some(Boolean)?{apiKey:values[0],authDomain:values[1],projectId:values[2],appId:values[3]}:committed;
if(Object.values(config).some(value=>typeof value!=='string'||!value.trim()||value.includes('YOUR_'))
 || !/^AIza[A-Za-z0-9_-]+$/.test(config.apiKey||'') || !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(config.appId||'')){
 console.error('Ungültige Firebase-Webkonfiguration. Überschreibungen benötigen alle vier öffentlichen VITE_FIREBASE_* Variablen.');process.exitCode=1;
}else if(config.projectId!=='anwesenheitf'||config.authDomain!=='anwesenheitf.firebaseapp.com'||config.appId!=='1:963220996431:web:84c8addb3bc79b07e8053a'){
 console.error('Diese Installation darf ausschließlich das eigene Firebase-Projekt anwesenheitf verwenden.');process.exitCode=1;
}else console.log('Öffentliche Firebase-Webkonfiguration geprüft: '+config.projectId);
