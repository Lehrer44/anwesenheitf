import {useState} from 'react';
import {BookOpen,ShieldCheck} from 'lucide-react';
import {login,signup,configured} from './api';
export default function Login({onLogin}:{onLogin:()=>void}) {
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[create,setCreate]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(e:React.FormEvent) {
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try {
   if(create) {
    if(await signup(email,password))onLogin();
    else setMessage('Bitte bestätige deine E-Mail-Adresse und melde dich anschließend an.');
   } else {await login(email,password);onLogin();}
  } catch(e) {setError((e as Error).message);}
  finally {setBusy(false);}
 }
 return <div className="login-page"><section className="login-card">
  <div className="brand"><span className="brandmark"><BookOpen size={22}/></span>Kursblick<span className="branddot">.</span></div>
  <div className="eyebrow">DEINE KURSVERWALTUNG</div><h1>{create?'Konto erstellen':'Willkommen zurück.'}</h1>
  <p>Melde dich als Kursleitung an. Gruppenführer öffnen direkt ihren eigenen Gruppenlink.</p>
  {!configured()?<div className="alert error">Diese Version ist für Supabase vorbereitet. Das neue Datenbankprojekt muss noch verbunden werden.</div>:<form onSubmit={submit}>
   <label>E-Mail-Adresse<input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
   <label>Passwort<input autoComplete={create?'new-password':'current-password'} type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
   {error&&<div role="alert" className="alert error">{error}</div>}{message&&<div role="status" className="alert success">{message}</div>}
   <button disabled={busy} className="btn primary">{busy?'Bitte warten …':create?'Konto erstellen':'Anmelden'}</button>
   <button type="button" className="textbutton" disabled={busy} onClick={()=>{setCreate(!create);setError('');setMessage('');}}>{create?'Bereits ein Konto? Anmelden':'Noch kein Konto? Registrieren'}</button>
  </form>}
  <div className="login-note"><ShieldCheck size={16}/>Deine Daten liegen im verbundenen Supabase-Projekt.</div>
 </section></div>;
}
