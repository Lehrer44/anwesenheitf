import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';

// This configuration identifies the project. It contains no Admin SDK credentials.
const options = {
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
 authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
 projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
 appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};
export const configured = () => Object.values(options).every(v => !!v && !v.includes('YOUR_'));
const app = configured() ? initializeApp(options) : null;
export const auth = app ? getAuth(app) : null;
// Memory cache only: course data must not linger in IndexedDB on shared computers.
export const db = app ? getFirestore(app) : null;
