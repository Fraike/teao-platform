import type {StandardPageSession,StandardPageSnapshot,StandardPageView} from '../types/standardPageSession';
let scope='',generation=0,snapshot:StandardPageSnapshot|null=null;
export function clearStandardPageSession(){generation++;snapshot=null;}
export function openStandardPageSession(nextScope:string):StandardPageSession {
  if(scope!==nextScope){clearStandardPageSession();scope=nextScope;}
  return {scope,generation,snapshot};
}
export function saveStandardPageSession(session:StandardPageSession,next:StandardPageSnapshot){
  if(session.scope===scope&&session.generation===generation)snapshot=next;
}
export function initialStandardPageView(saved:StandardPageSnapshot|null,params:URLSearchParams,entryKey:string):StandardPageView {
  const defaults:StandardPageView={category:'gear_damper',status:'all',standardType:'all',filters:{search:'',serialNo:'',customer:'',model:'',customerPartNo:'',vehicleModel:''}};
  if(saved?.entryKey===entryKey)return saved.view;
  if(params.has('category')||params.has('status')||params.has('standardId'))return defaults;
  return saved?.view||defaults;
}
export function standardPageRequestQuery(view:StandardPageView,canDirectPublish:boolean){
  const params=new URLSearchParams({category:view.category,all:'true',includeObsolete:'true'});
  const status=view.status==='deleted'&&!canDirectPublish?'all':view.status;
  if(status!=='all')params.set('status',status);else params.set('excludeObsolete','true');
  if(view.standardType!=='all')params.set('standardType',view.standardType);
  for(const [key,value] of Object.entries(view.filters)){
    if(view.category==='sanitary_damper'&&(key==='vehicleModel'||key==='customerPartNo'))continue;
    if(value.trim())params.set(key,value.trim());
  }
  return params.toString();
}
