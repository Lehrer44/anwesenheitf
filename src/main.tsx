import {createRoot} from 'react-dom/client';
import App from './App';
import SchoolPortal from './SchoolPortal';
import './style.css';
// A school link without a chosen class shows the class selection first.
const params=new URLSearchParams(location.hash.slice(1));
createRoot(document.getElementById('root')!).render(params.get('school')&&!params.get('group')?<SchoolPortal/>:<App/>);
