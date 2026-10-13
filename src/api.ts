import {projectUrl,publicKey} from './config';
const url=(import.meta.env.VITE_SUPABASE_URL as string)||projectUrl;
const key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string)||publicKey;
const storageKey='kursblick.supabase.session';
type Session={access_token:string,refresh_token:string,expires_at:number,user:{id:string,email?:string}};
let refreshPending:Promise<Session|null>|null=null;
export function configured(){return !!url&&!!key&&!url.includes('YOUR_PROJECT');}
export function session():Session|null{try{return JSON.parse(localStorage.getItem(storageKey)||'null');}catch{return null;}}
function save(s:any){const out={...s,expires_at:Date.now()/1000+s.expires_in};localStorage.setItem(storageKey,JSON.stringify(out));return out as Session;}
async function auth(path:string,body:any){const r=await fetch(url+'/auth/v1/'+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)});const d:any=await r.json();if(!r.ok)throw Error(d.msg||d.error_description||d.message||'Anmeldung fehlgeschlagen.');return d;}
export async function login(email:string,password:string){save(await auth('token?grant_type=password',{email,password}));}
export async function signup(email:string,password:string){const d=await auth('signup',{email,password});if(d.access_token){save(d);return true;}return false;}
export async function logout(){const s=session();if(s)await fetch(url+'/auth/v1/logout',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token}}).catch(()=>{});localStorage.removeItem(storageKey);}
async function activeSession(){let s=session();if(s&&s.expires_at<Date.now()/1000+60){if(!refreshPending)refreshPending=auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token}).then(save).catch(()=>{localStorage.removeItem(storageKey);return null;}).finally(()=>{refreshPending=null;});s=await refreshPending;}return s;}
export async function courseRequest(body:any,access:{course:string,token:string}){
 if(!configured())throw Error('Supabase ist noch nicht eingerichtet.');
 const s=access.token?null:await activeSession();
 if(!access.token&&!s)throw Error('Bitte anmelden.');
 const r=await fetch(url+'/functions/v1/course'+(access.token?'?course='+encodeURIComponent(access.course):''),{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json',...(s?{Authorization:'Bearer '+s.access_token}:{}),...(access.token?{'x-group-token':access.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Verbindung fehlgeschlagen.');return d;
}
