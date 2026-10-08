/* GitHub Pages transport: synthetic browser data, no remote API or mail. */
(function(root){
'use strict';
const kinds=['people','requests','expiries','time','risks','releases','services','documents'];
const fields={people:['id','departmentId','name','role','project','skills','availability','sourceRef'],requests:['id','departmentId','personId','title','packageId','resources','target','reason','status','externalId','createdAt','sourceRef'],expiries:['id','departmentId','personId','resource','kind','expiresOn','expiryState','sourceRef'],time:['id','departmentId','personId','date','project','hours','note','status','sourceRef'],risks:['id','departmentId','personId','title','severity','dueOn','status','createdAt','sourceRef'],releases:['id','departmentId','title','passed','failed','blocked','notStarted','sourceRef'],services:['id','departmentId','title','type','status','lastObservedAt','sourceRef'],documents:['id','departmentId','title','text','sourceRef']};
const clone=x=>JSON.parse(JSON.stringify(x));
function object(x){return x&&typeof x==='object'&&!Array.isArray(x);}
function keys(x,allowed){if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw Error('Неизвестные поля или неверный формат записи');}
function text(x,k,max=160,required=true){const v=x[k]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Поле '+k+': требуется текст до '+max+' символов');return v.trim();}
function id(v){if(typeof v!=='string'||!v.trim()||v.length>160||['__proto__','constructor','prototype'].includes(v))throw Error('Некорректный ID');}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw Error('Требуется дата YYYY-MM-DD');}
function stamp(v){if(v!==null&&(typeof v!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v))))throw Error('Требуется ISO дата с часовым поясом либо null');}
function one(v,allowed){if(!allowed.includes(v))throw Error('Недопустимое значение '+v);}
function list(v,max,len){if(!Array.isArray(v)||v.length>max||v.some(s=>typeof s!=='string'||s.length>len))throw Error('Некорректный список строк');}
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
function createTransport({seed,research={},storage,storageKey,engine,clock=()=>new Date(),uuid=()=>crypto.randomUUID(),lock}){
 const departmentIds=seed.state.departments.map(x=>x.id), emptyData=()=>Object.fromEntries(kinds.map(k=>[k,[]]));
 function validate(kind,row){
  keys(row,fields[kind]||[]);id(row.id);one(row.departmentId,departmentIds);
  keys(row.sourceRef,['system','instance','objectId','updatedAt']);for(const k of ['system','instance','objectId'])text(row.sourceRef,k);stamp(row.sourceRef.updatedAt);
  if(row.sourceRef.system==='LOCAL'&&(row.sourceRef.instance!=='single-user-pilot'||row.sourceRef.objectId!==row.id))throw Error('LOCAL sourceRef должен принадлежать этой локальной записи');
  if(kind==='people'){text(row,'name',120);text(row,'role',120);text(row,'project',160,false);list(row.skills??[],20,80);one(row.availability??'available',['available','absent','unknown']);}
  if(['requests','expiries','time','risks'].includes(kind))id(row.personId);
  if(kind==='requests'){for(const k of ['title','target'])text(row,k);one(row.target,['ИнфраМенеджер','ТЕЗИС']);one(row.status,['draft','recorded','pending','closed','unknown']);list(row.resources??[],30,160);text(row,'reason',1000,false);text(row,'externalId',160,false);text(row,'packageId',160,false);}
  if(kind==='expiries'){text(row,'resource');one(row.kind,['access','account','certificate']);one(row.expiryState,['known','unknown','never']);if(row.expiryState==='known')date(row.expiresOn);else if(row.expiresOn!==null)throw Error('Неизвестная дата должна быть null');}
  if(kind==='time'){date(row.date);text(row,'project');text(row,'note',1000,false);if(typeof row.hours!=='number'||!Number.isFinite(row.hours)||row.hours<=0||row.hours>24)throw Error('Часы: больше 0 и не больше 24');one(row.status,['draft','confirmed_local','confirmed_source']);}
  if(kind==='risks'){text(row,'title',240);one(row.severity,['high','medium','low']);one(row.status,['open','closed']);date(row.dueOn);}
  if(kind==='releases'){text(row,'title');for(const k of ['passed','failed','blocked','notStarted'])if(!Number.isInteger(row[k])||row[k]<0||row[k]>1000000)throw Error('Некорректный счётчик релиза');}
  if(kind==='services'){text(row,'title');one(row.type,['pipeline','environment']);one(row.status,['healthy','degraded','down','unknown']);stamp(row.lastObservedAt);}
  if(kind==='documents'){text(row,'title');text(row,'text',15000);}
  if('createdAt' in row){stamp(row.createdAt);if(row.createdAt===null)throw Error('createdAt обязателен');}
 }
 function references(data){
  const people=new Map(data.people.map(x=>[x.id,x]));
  for(const kind of ['requests','expiries','time','risks'])for(const row of data[kind])if(!people.has(row.personId)||people.get(row.personId).departmentId!==row.departmentId)throw Error(kind+': сотрудник отсутствует или отдел не совпадает');
  // Preserve the numeric JSON value exactly in base ten, including exponent
  // notation. Rounding individual rows could hide a physical-limit overflow.
  const totals=new Map();for(const row of data.time){
   const k=canonical([row.personId,row.date]),[mantissa,power='0']=String(row.hours).split('e'),[whole,fraction='']=mantissa.split('.'),exponent=Number(power)-fraction.length;
   let units=BigInt(whole+fraction),scale=1n;
   if(exponent>=0)units*=10n**BigInt(exponent);else scale=10n**BigInt(-exponent);
   const previous=totals.get(k)||{units:0n,scale:1n},common=scale>previous.scale?scale:previous.scale;
   const total={units:previous.units*(common/previous.scale)+units*(common/scale),scale:common};
   if(total.units>24n*total.scale)throw Error('Суммарное время за день превышает 24h');totals.set(k,total);
  }
 }
 function fresh(){return {version:1,mode:'demo',scopes:{demo:{data:clone(seed.state.data),snapshots:clone(seed.rulerSnapshots),dashboards:clone(seed.state.operations.dashboards||[]),audit:[],commands:[]},local:{data:emptyData(),snapshots:{},dashboards:[],audit:[],commands:[]}}};}
 function read(){
  const raw=storage.getItem(storageKey);if(!raw)return fresh();let saved;try{saved=JSON.parse(raw);}catch{throw Error('Сохранённые данные повреждены. Экспортируйте их перед очисткой данных сайта.');}
  keys(saved,['version','mode','scopes']);if(saved.version!==1)throw Error('Неподдерживаемая версия данных браузера');one(saved.mode,['demo','local']);keys(saved.scopes,['demo','local']);
  for(const mode of ['demo','local']){const s=saved.scopes[mode];keys(s,['data','snapshots','dashboards','audit','commands']);keys(s.data,kinds);for(const k of kinds){if(!Array.isArray(s.data[k]))throw Error('Некорректные данные браузера');s.data[k].forEach(x=>validate(k,x));}references(s.data);if(!object(s.snapshots)||!Array.isArray(s.dashboards)||!Array.isArray(s.audit)||!Array.isArray(s.commands))throw Error('Некорректные данные браузера');s.dashboards.forEach(x=>engine.validateDashboard(x));}
  return saved;
 }
 function save(db){try{storage.setItem(storageKey,JSON.stringify(db));}catch{throw Error('Браузер не сохранил запись: хранилище недоступно или переполнено. Экспортируйте данные и освободите место.');}}
 function audit(scope,action,objectId,now){scope.audit.unshift({at:now,action,objectId});scope.audit=scope.audit.slice(0,100);}
 function businessDate(now){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(now));}
 function sourceKey(row){return canonical([row.sourceRef.system,row.sourceRef.instance,row.sourceRef.objectId]);}
 function importData(db,body,now){
  keys(body,['schemaVersion','datasetType','data']);if(body.schemaVersion!==1||body.datasetType!=='synthetic')throw Error('GitHub Pages принимает только синтетические тестовые данные (datasetType=synthetic). Рабочие данные используйте во внутренней серверной версии.');keys(body.data,kinds);
  const s=db.scopes[db.mode],merged=clone(s.data);let count=0;
  for(const [kind,rows] of Object.entries(body.data)){
   if(!Array.isArray(rows)||rows.length>1000)throw Error('До 1000 записей в коллекции');const ids=new Set(),refs=new Set(),indexed=new Map(merged[kind].map(r=>[r.id,r]));
   for(const row of rows){validate(kind,row);const ref=sourceKey(row);if(ids.has(row.id)||refs.has(ref))throw Error('Повтор ID или sourceRef в импорте');ids.add(row.id);refs.add(ref);
    const previous=indexed.get(row.id);if(previous){if(sourceKey(previous)!==ref)throw Error('ID принадлежит другому sourceRef');const old=previous.sourceRef.updatedAt,stampNew=row.sourceRef.updatedAt;if(old&&(!stampNew||Date.parse(stampNew)<Date.parse(old)))throw Error('Импорт содержит старую версию');if(canonical(previous)!==canonical(row)&&(!stampNew||(old&&Date.parse(stampNew)===Date.parse(old))))throw Error('Изменённая запись требует новой версии источника');}
    indexed.set(row.id,clone(row));count++;
   }merged[kind]=[...indexed.values()];
  }
  for(const k of kinds){const refs=merged[k].map(sourceKey);if(new Set(refs).size!==refs.length)throw Error('sourceRef связан с другим ID');}references(merged);s.data=merged;audit(s,'import',String(count),now);return {imported:count,mode:db.mode,observedAt:now};
 }
 function run(path,body,key){
  const db=read(),s=db.scopes[db.mode],now=clock().toISOString(),today=businessDate(now),period=today.slice(0,7),people=s.data.people;
  if(body!==undefined&&JSON.stringify(body).length>524288)throw Error('JSON больше 512 КБ');
  if(path==='/api/state')return {...clone(seed.state),mode:db.mode,today,readAt:now,hostingMode:'github-pages',csrfToken:'browser-only',data:clone(s.data),audit:clone(s.audit.slice(0,30)),operations:{report:engine.report(people,s.snapshots,period,today,now),periods:Object.keys(s.snapshots),dashboards:clone(s.dashboards),outbox:[],worker:{available:false,error:'GitHub Pages: проверка работает при открытом сайте. Для фонового импорта и автоматических писем подключите серверную версию.',feedConfigured:false,checkedAt:null}}};
  if(path==='/api/export')return {schemaVersion:1,datasetType:'synthetic',data:clone(s.data)};
  if(path==='/api/template')return {schemaVersion:1,datasetType:'synthetic',data:emptyData()};
  if(path==='/api/ruler/template')return engine.template(people,now);
  if(path.startsWith('/api/research/')){const doc=path.slice('/api/research/'.length);if(typeof research[doc]!=='string')throw Error('Материал недоступен');return {text:research[doc]};}
  if(path==='/api/ruler/report'){keys(body,['period']);return engine.report(people,s.snapshots,body.period,today,now);}
  if(path==='/api/ruler/preview'){const result=engine.candidates(db.mode,people,s.snapshots,today,now,false);return {period,letters:result.letters,preview:true};}
  if(path==='/api/ruler/check'){const result=engine.candidates(db.mode,people,s.snapshots,today,now,true);return {eligibleToday:result.letters.length,queued:0,preview:true};}
  let result;
  if(path==='/api/mode'){keys(body,['mode']);one(body.mode,['demo','local']);db.mode=body.mode;result={mode:db.mode};}
  else if(path==='/api/import')result=importData(db,body,now);
  else if(path==='/api/ruler/import'){
   const peopleMap=Object.fromEntries(people.map(x=>[x.id,x])),snapshot=engine.validateImport(body,peopleMap),previous=s.snapshots[snapshot.period];
   if(previous){if(snapshot.source.instance!==previous.source.instance)throw Error('Период принадлежит другому источнику');const a=Date.parse(snapshot.source.capturedAt),b=Date.parse(previous.source.capturedAt);if(a<b||a===b&&canonical(snapshot)!==canonical(previous))throw Error('Изменённый срез требует новой версии источника');}
   s.snapshots[snapshot.period]=snapshot;audit(s,'ruler:import',snapshot.period,now);result={period:snapshot.period,imported:snapshot.employees.length,mode:db.mode};
  }else if(path==='/api/grafana/save'){
   const card=engine.validateDashboard(body);one(card.departmentId,['all',...departmentIds]);id(card.id);const i=s.dashboards.findIndex(x=>x.id===card.id);if(i<0)s.dashboards.push(card);else s.dashboards[i]=card;audit(s,'grafana:save',card.id,now);result=card;
  }else if(path.startsWith('/api/create/')){
   const kind=path.slice('/api/create/'.length);one(kind,['people','requests','expiries','time','risks']);keys(body,fields[kind]);if(typeof key!=='string'||key.length<8||key.length>160)throw Error('Требуется ключ операции');
   const fingerprint=canonical({kind,body}),previous=s.commands.find(x=>x.key===key);if(previous){if(previous.fingerprint!==fingerprint)throw Error('Ключ операции использован с другими данными');return previous.result;}
   const row=clone(body);row.id=uuid();row.sourceRef={system:'LOCAL',instance:'single-user-pilot',objectId:row.id,updatedAt:now};if(kind==='requests')Object.assign(row,{status:'draft',externalId:'',createdAt:now});if(kind==='time')row.status='draft';if(kind==='risks')Object.assign(row,{status:'open',createdAt:now});validate(kind,row);s.data[kind].push(row);references(s.data);s.commands.push({key,fingerprint,result:row});if(s.commands.length>2000)throw Error('Лимит операций браузера достигнут: экспортируйте данные');audit(s,'create:'+kind,row.id,now);result=row;
  }else if(path.startsWith('/api/action/')){
   const pieces=path.split('/');if(pieces.length!==5)throw Error('Некорректный путь действия');const kind=pieces[3],identifier=decodeURIComponent(pieces[4]);one(kind,['requests','time','risks']);const row=s.data[kind].find(x=>x.id===identifier);if(!row)throw Error('Запись не найдена');
   const ref=row.sourceRef;if(ref.system!=='DEMO'&&!(ref.system==='LOCAL'&&ref.instance==='single-user-pilot'&&ref.objectId===row.id))throw Error('Запись внешнего источника доступна для чтения');
   keys(body,kind==='requests'?['action','externalId']:['action']);
   if(kind==='requests'&&body.action==='record'&&['draft','recorded'].includes(row.status)){row.externalId=text(body,'externalId');row.status='recorded';}
   else if(kind==='time'&&body.action==='confirm'&&row.status!=='confirmed_source')row.status='confirmed_local';
   else if(kind==='risks'&&body.action==='close')row.status='closed';else throw Error('Недопустимое действие');
   row.sourceRef.updatedAt=now;audit(s,body.action+':'+kind,row.id,now);result=row;
  }else throw Error('Действие недоступно в версии GitHub Pages');
  save(db);return clone(result);
 }
 let tail=Promise.resolve();
 return {request(path,body,key){const next=tail.then(()=>lock?lock(storageKey,()=>run(path,body,key)):run(path,body,key));tail=next.catch(()=>{});return next;}};
}
if(typeof module==='object'&&module.exports)module.exports={createTransport};
else{
 const storageKey='command-center-pages:v1:'+new URL('.',location.href).pathname;
 const ready=Promise.all(['seed.json','research.json'].map(p=>fetch(new URL(p,location.href),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Не удалось загрузить '+p);return r.json();}))).then(([seed,research])=>createTransport({seed,research,storage:localStorage,storageKey,engine:root.CCPageEngine,lock:navigator.locks?((key,fn)=>navigator.locks.request(key,fn)):undefined}));
 root.CommandCenterTransport={request:async(path,body,key)=>(await ready).request(path,body,key)};
 document.addEventListener('click',async event=>{
  const link=event.target.closest('a[href^="/api/"]');if(!link)return;event.preventDefault();
  const path=link.getAttribute('href');if(!['/api/export','/api/template','/api/ruler/template'].includes(path))return;
  try{
   const value=await root.CommandCenterTransport.request(path),json=JSON.stringify(value,null,2),url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
   const filename=path.includes('/ruler/')?'project-ruler-template.json':path.endsWith('/export')?'command-center-export.json':'command-center-template.json';
   openDialog(path.endsWith('/export')?'Экспорт тестовых данных':'Шаблон тестовых данных',`<p class="subtle">Сохраните JSON в файл или скопируйте его. Записи остаются в этом браузере.</p><label class="field">${e(filename)}<textarea id="request-copy" readonly rows="12">${e(json)}</textarea></label><div class="form-footer"><a class="export-link" href="${e(url)}" download="${e(filename)}">Скачать JSON</a><button type="button" data-action="copy-request">Скопировать JSON</button></div>`);
   document.getElementById('modal').addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
  }catch(error){if(typeof toast==='function')toast(error.message);}
 });
}
})(typeof window==='undefined'?{}:window);
