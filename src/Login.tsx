import {useEffect,useState} from 'react';
import {BookOpen,ShieldCheck} from 'lucide-react';
import {login,signup,resetPassword,configured,pendingAccount,resendVerification,checkVerification,verificationCooldown,logout} from './api';
import {authErrorMessage,type AccountResult} from './account-auth';

export default function Login({onLogin}:{onLogin:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[create,setCreate]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [pending,setPending]=useState(pendingAccount),[remaining,setRemaining]=useState(verificationCooldown);
 useEffect(()=>{if(!pending)return;const timer=window.setInterval(()=>setRemaining(verificationCooldown()),1000);return()=>clearInterval(timer);},[pending?.uid]);
 function accept(result:AccountResult){
  setPassword('');setRemaining(verificationCooldown());
  if(result.ready){setPending(null);onLogin();return;}
  setPending(pendingAccount());
  setMessage(result.warning?'':result.verificationSent?'Die Bestätigungsmail wurde angefordert. Öffne den Link in der E-Mail und klicke anschließend auf „Bestätigung prüfen“.':'Dein Konto ist bereits angelegt. Bestätige deine E-Mail-Adresse oder fordere die Bestätigungsmail erneut an.');
  if(result.warning)setError(result.warning);
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{accept(await (create?signup(email,password):login(email,password)));}catch(e){setPending(pendingAccount());setError(authErrorMessage(e));}finally{setBusy(false);}
 }
 async function resend(){setBusy(true);setError('');setMessage('');try{accept(await resendVerification());}catch(e){setError(authErrorMessage(e));}finally{setRemaining(verificationCooldown());setBusy(false);}}
 async function check(){setBusy(true);setError('');setMessage('');try{if(await checkVerification()){setPending(null);onLogin();}else setMessage('Die Adresse ist noch nicht bestätigt. Öffne zuerst den Link aus der E-Mail und prüfe danach erneut.');}catch(e){setError(authErrorMessage(e));}finally{setBusy(false);}}
 async function changeAccount(){setBusy(true);try{await logout();setPending(null);setEmail('');setPassword('');setCreate(false);setError('');setMessage('');}catch(e){setError(authErrorMessage(e));}finally{setBusy(false);}}
 return <div className="login-page"><section className="login-card">
 <div className="brand"><span className="brandmark"><BookOpen size={22}/></span>Kursblick<span className="branddot">.</span></div>
 <div className="eyebrow">DEINE KURSVERWALTUNG</div><h1>{pending?'E-Mail bestätigen':create?'Konto erstellen':'Willkommen zurück.'}</h1>
 {!configured()?<div className="alert error">Firebase ist noch nicht eingerichtet.</div>:pending?<div className="verification-panel">
  <p>Dein Konto ist angelegt. Die Bestätigung steht noch aus:</p><strong className="verification-email" dir="auto">{pending.email}</strong>
  {error&&<div role="alert" className="alert error">{error}</div>}{message&&<div role="status" className="alert success">{message}</div>}
  <button type="button" className="btn primary" disabled={busy} onClick={check}>{busy?'Bitte warten …':'Bestätigung prüfen'}</button>
  <button type="button" className="btn" disabled={busy||remaining>0} onClick={resend}>{remaining>0?`Erneut senden (${remaining}s)`:'Bestätigungsmail erneut senden'}</button>
  <details className="verification-help"><summary>Keine E-Mail erhalten?</summary><p>Prüfe Junk-E-Mail, blockierte Absender und die Schreibweise deiner Adresse. Bei Outlook kannst du den Absender als sicheren Absender eintragen und die Mail danach erneut anfordern.</p><p><a href="https://support.microsoft.com/en-us/outlook/filter-junk-email-and-spam-in-outlook" target="_blank" rel="noreferrer">Outlook: sichere Absender verwalten</a></p><p>Kommt weiterhin keine Mail an, muss die Administration den Mailversand prüfen. Eine erneute Registrierung ist nicht nötig.</p></details>
  <button type="button" className="textbutton" disabled={busy} onClick={changeAccount}>Mit anderem Konto anmelden</button>
 </div>:<><p>{create?'Erstelle ein Konto und bestätige anschließend deine E-Mail-Adresse.':'Melde dich mit deinem bestehenden Konto an. Klassenführer öffnen ihren Klassenlink.'}</p><form onSubmit={submit}>
  <label>E-Mail-Adresse<input autoComplete="email" type="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} required/></label>
  <label>Passwort<input autoComplete={create?'new-password':'current-password'} type="password" disabled={busy} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
  {error&&<div role="alert" className="alert error">{error}</div>}{message&&<div role="status" className="alert success">{message}</div>}
  <button disabled={busy} className="btn primary">{busy?'Bitte warten …':create?'Konto erstellen':'Anmelden'}</button>
  <button type="button" className="textbutton" disabled={busy} onClick={()=>{setCreate(!create);setError('');setMessage('');}}>{create?'Bereits ein Konto? Anmelden':'Noch kein Konto? Registrieren'}</button>
  {!create&&<button type="button" className="textbutton" disabled={busy} onClick={async()=>{setBusy(true);setError('');setMessage('');try{await resetPassword(email);setMessage('Falls ein Konto zu dieser Adresse besteht, wurde eine E-Mail zum Zurücksetzen angefordert.');}catch(e){setError(authErrorMessage(e));}finally{setBusy(false);}}}>Passwort vergessen?</button>}
 </form></>}
 <div className="login-note"><ShieldCheck size={16}/>Deine Daten liegen im verbundenen Firebase-Projekt.</div>
 </section></div>;
}
