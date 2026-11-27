import {initializeApp} from 'firebase/app';
import {connectAuthEmulator,getAuth} from 'firebase/auth';
import {connectFirestoreEmulator,getFirestore} from 'firebase/firestore';
import projectOptions from './firebase-config.json';

// This configuration identifies the project. It contains no Admin SDK credentials.
const environmentOptions = {
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
 authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
 projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
 appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};
// Overrides must provide the complete configuration, never a mixture of projects.
const options = Object.values(environmentOptions).some(Boolean) ? environmentOptions : projectOptions;
export const configured = () => Object.values(options).every(v => typeof v==='string' && !!v.trim() && !v.includes('YOUR_'));
const app = configured() ? initializeApp(options) : null;
export const auth = app ? getAuth(app) : null;
// Memory cache only: course data must not linger in IndexedDB on shared computers.
export const db = app ? getFirestore(app) : null;
// Local development only (npm run dev:emulator): never set for the GitHub Pages build.
if(auth&&db&&import.meta.env.VITE_FIREBASE_EMULATORS==='1'){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
