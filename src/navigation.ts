export type View='overview'|'matrix'|'groups';
export function viewFromHash(hash:string):View{
 const params=new URLSearchParams(hash.replace(/^#/,'')),view=params.get('view');
 return !params.get('group')&&(view==='matrix'||view==='groups')?view:'overview';
}
export function hashForView(hash:string,view:View){
 const params=new URLSearchParams(hash.replace(/^#/,''));
 if(params.get('group'))return hash;
 params.set('view',view);return '#'+params.toString();
}
