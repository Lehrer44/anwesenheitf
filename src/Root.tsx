import {useEffect,useState} from 'react';
import App from './App';
import SchoolPortal from './SchoolPortal';
// Switching between the class selection and a class happens in place, without reloading the page.
export default function Root(){
 const [hash,setHash]=useState(location.hash);
 useEffect(()=>{const change=()=>{setHash(location.hash);window.scrollTo(0,0);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 const params=new URLSearchParams(hash.slice(1));
 // A school link without a chosen class shows the class selection first.
 if(params.get('school')&&!params.get('group'))return <SchoolPortal key={hash}/>;
 return <App key={params.get('group')||'admin'}/>;
}
