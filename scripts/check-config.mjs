const names=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'];
if(names.some(name=>!process.env[name]||process.env[name].includes('YOUR_'))){
 console.error('Vor der Veröffentlichung müssen die vier öffentlichen Firebase-Repository-Variablen eingerichtet sein.');process.exitCode=1;
}
