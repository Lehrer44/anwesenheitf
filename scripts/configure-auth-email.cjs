// Uses the signed-in Firebase CLI account. No credentials are written to source files.
const {configstore}=require('firebase-tools/lib/configstore');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {getConfig,updateConfig}=require('firebase-tools/lib/gcp/identityPlatform');
(async()=>{
 const index=process.argv.indexOf('--project'),project=index>=0?process.argv[index+1]:undefined;
 if(!project||!/^[a-z0-9-]+$/.test(project))throw Error('Bitte --project PROJEKT-ID angeben.');
 await requireAuth({project,user:configstore.get('user'),tokens:configstore.get('tokens')});
 const before=await getConfig(project);if(before.notification?.sendEmail?.method!=='DEFAULT')throw Error('Dieses Projekt verwendet keinen Standard-Mailversand. SMTP-Einstellungen bitte separat prüfen.');
 const replyTo=`noreply@${project}.firebaseapp.com`,template={senderDisplayName:'Listen',replyTo};
 const patch={notification:{defaultLocale:'de',sendEmail:{verifyEmailTemplate:template,resetPasswordTemplate:template}}};
 const fields=['notification.defaultLocale','notification.sendEmail.verifyEmailTemplate.senderDisplayName','notification.sendEmail.verifyEmailTemplate.replyTo','notification.sendEmail.resetPasswordTemplate.senderDisplayName','notification.sendEmail.resetPasswordTemplate.replyTo'];
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({project,dryRun:true,patch},null,2));return;}
 await updateConfig(project,patch,fields.join(','));const after=await getConfig(project);
 if(after.notification?.defaultLocale!=='de'||after.notification?.sendEmail?.verifyEmailTemplate?.replyTo!==replyTo||after.notification?.sendEmail?.verifyEmailTemplate?.senderDisplayName!=='Listen')throw Error('Die Mail-Einstellungen konnten nicht vollständig bestätigt werden.');
 console.log(JSON.stringify({project,applied:true,locale:after.notification.defaultLocale,senderDisplayName:'Listen',replyTo,delivery:after.notification.sendEmail.method}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
