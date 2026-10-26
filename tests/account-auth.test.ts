import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {initializeApp,deleteApp,type FirebaseApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,applyActionCode,signInAnonymously,type Auth} from 'firebase/auth';
import {createAccountAccess,authErrorMessage} from '../src/account-auth.ts';

const project='demo-kursblick-auth',host=process.env.FIREBASE_AUTH_EMULATOR_HOST||'127.0.0.1:9099',base='http://'+host;
let app:FirebaseApp,auth:Auth;
async function codes(){return (await (await fetch(`${base}/emulator/v1/projects/${project}/oobCodes`)).json()).oobCodes as {email:string,oobCode:string}[];}
async function claims(uid:string,value:Record<string,unknown>){const response=await fetch(base+'/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-key',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({targetProjectId:project,localId:uid,customAttributes:JSON.stringify(value)})});assert.equal(response.ok,true,await response.text());}
before(async()=>{app=initializeApp({projectId:project,apiKey:'fake-key',authDomain:'localhost'},'account-auth-tests');auth=getAuth(app);connectAuthEmulator(auth,base,{disableWarnings:true});await fetch(`${base}/emulator/v1/projects/${project}/accounts`,{method:'DELETE'});});
after(async()=>{await deleteApp(app);});

test('registration remains recoverable, sends German verification, resends and checks the actual proof',async()=>{
 let clock=100000;const access=createAccountAccess(auth,{now:()=>clock,continueUrl:'http://localhost/'}),email='new-user@example.test';
 const result=await access.signup(' '+email+' ','test-password-123');assert.equal(result.ready,false);assert.equal(result.verificationSent,true);assert.equal(auth.languageCode,'de');assert.equal(access.session(),null);assert.equal(access.pending()?.email,email);assert.equal(auth.currentUser?.emailVerified,false);assert.equal(access.cooldown(),60);
 await assert.rejects(access.resend(),{code:'auth/too-many-requests'});assert.equal(await access.check(),false);
 const uid=auth.currentUser!.uid;await access.logout();const before=(await codes()).length;
 const login=await access.login(email,'test-password-123');assert.equal(login.ready,false);assert.equal(auth.currentUser!.uid,uid);assert.equal((await codes()).length,before);
 const existing=await access.signup(email,'test-password-123');assert.equal(existing.ready,false);assert.equal(auth.currentUser!.uid,uid);assert.equal((await codes()).length,before);
 await assert.rejects(access.signup(email,'incorrect-password'),{code:'auth/email-already-in-use'});assert.equal(access.session(),null);
 clock+=61000;assert.equal((await access.resend()).verificationSent,true);const code=(await codes()).filter(c=>c.email===email).at(-1)!;await applyActionCode(auth,code.oobCode);
 assert.equal(await access.check(),true);assert.equal(access.session()?.uid,uid);assert.equal(access.pending(),null);assert.equal(auth.currentUser?.emailVerified,true);
 await access.logout();assert.equal((await access.login(email,'test-password-123')).ready,true);await access.logout();
});

test('mail transport failure retains the created account and reports it honestly',async()=>{
 const access=createAccountAccess(auth,{sendVerification:async()=>{throw Object.assign(Error('network'),{code:'auth/network-request-failed'});}});
 const result=await access.signup('mail-failure@example.test','test-password-123');assert.equal(result.ready,false);assert.equal(result.verificationSent,false);assert.match(result.warning!,/Konto wurde angelegt/);assert.match(result.warning!,/Verbindung/);assert.ok(auth.currentUser);assert.equal(access.session(),null);assert.equal(access.pending()?.email,'mail-failure@example.test');await access.logout();
});

test('unverified and anonymous users stay locked; only the existing explicit admin approval exception works',async()=>{
 const access=createAccountAccess(auth,{sendVerification:async()=>{}});await access.signup('approval@example.test','test-password-123');const uid=auth.currentUser!.uid;
 await claims(uid,{administrator:true});assert.equal(await access.check(),false);
 await claims(uid,{manualAccessApproved:true});assert.equal(await access.check(),false);
 await claims(uid,{administrator:true,manualAccessApproved:true});assert.equal(await access.check(),true);assert.equal(auth.currentUser!.emailVerified,false);
 await claims(uid,{});assert.equal(await access.check(),false);await access.logout();await signInAnonymously(auth);await access.ready();assert.equal(access.session(),null);assert.equal(access.pending(),null);await access.logout();
});

test('friendly errors cover existing accounts, invalid credentials and throttling',()=>{
 assert.match(authErrorMessage({code:'auth/email-already-in-use'}),/bereits angelegt/);assert.match(authErrorMessage({code:'auth/invalid-credential'}),/nicht korrekt/);assert.match(authErrorMessage({code:'auth/too-many-requests'}),/warten/);
});
