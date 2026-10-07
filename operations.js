'use strict';
let rulerSelectedPeriod='', rulerLoadedReport=null, rulerMode='';
async function refreshOperations(){
 if(rulerMode!==state.mode){rulerMode=state.mode;rulerSelectedPeriod='';rulerLoadedReport=null;}
 if(rulerSelectedPeriod&&rulerSelectedPeriod!==state.operations.report.period)rulerLoadedReport=await api('/api/ruler/report',{period:rulerSelectedPeriod});
 else rulerLoadedReport=null;
}
function rulerReport(){return rulerLoadedReport||state.operations.report;}
function rulerRows(){return rulerReport().rows.filter(x=>department==='all'||x.departmentId===department);}
function rulerStatus(row){return tag(row.status==='unknown'?'Данных недостаточно':row.status==='attention'?'Проверить списания':'Без отклонений',row.status==='unknown'?'':row.status==='attention'?'amber':'green');}
function rulerView(){
 const report=rulerReport(), data=rulerRows(), periods=[...new Set([state.today.slice(0,7),...state.operations.periods])].sort().reverse();
 const pages=state.hostingMode==='github-pages';
 const counts=[['Базовая норма','40h','В неделю; исключения по календарю'],['Недосписание',data.filter(x=>x.status!=='unknown'&&x.missingHours>0).length,'За завершённые дни'],['Записи с замечаниями',data.filter(x=>x.issues.length).length,'Формат, проекты и сумма часов'],['Данных недостаточно',data.filter(x=>x.status==='unknown').length,'Проверка и письма заблокированы']];
 return head('Контроль списаний','Project Ruler · проверка записей и закрытие месяца',button('Импорт из Project Ruler','ruler-import','','primary')+button('Предпросмотр писем','ruler-preview')+'<a class="export-link" href="/api/ruler/template">Шаблон JSON</a>')+
 `<div class="ruler-toolbar"><label>Период <select id="ruler-period">${periods.map(p=>`<option value="${e(p)}" ${p===report.period?'selected':''}>${e(p)}</option>`).join('')}</select></label><span>${tag('Формат: 8h','blue')} Проверка до ${e(dateText(report.through))}</span></div>`+
 `<div class="stats">${counts.map(([label,value,note])=>`<div class="stat"><div class="stat-top">${e(label)}</div><div class="stat-value">${e(value)}</div><div class="stat-note">${e(note)}</div></div>`).join('')}</div>`+
 `${state.operations.worker.error?`<div class="notice">${e(state.operations.worker.error)}</div>`:''}<section class="panel"><div class="panel-head"><h2>Напоминания перед закрытием</h2>${tag(report.quarterEnd?'Месяц и квартал':'Календарный месяц','blue')}</div><div class="panel-body"><div class="reminder-calendar">${report.schedule.map(d=>`<div class="reminder-day ${d.date===state.today?'due':''}"><strong>−${d.offset} ${d.offset>=5?'дней':'дня'}</strong><span>${e(dateText(d.date))}</span></div>`).join('')}</div><p class="subtle">${pages?'Здесь показан план напоминаний и предпросмотр текстов. Рассылка за 7/6/5/4/3 дня работает только в серверной версии.':'Одно письмо сотруднику на каждую дату. Проверка повторяется перед отправкой; после исправления списаний письма прекращаются. В квартальном месяце квартал включается в то же письмо.'}</p><div class="metric-row"><span>Автоматическая проверка очереди</span>${tag(pages?'Нужен сервер':state.operations.worker.error?'Приостановлена':'Каждую минуту',pages||state.operations.worker.error?'amber':'blue')}</div><div class="metric-row"><span>Входной источник</span>${tag(state.operations.worker.feedConfigured?'Автоматический файл':'Ручной импорт','blue')}</div><div class="metric-row"><span>Почтовый канал</span>${tag(pages?'Предпросмотр без отправки':report.mailConfigured?'SMTP настроен для локального пилота':'SMTP не настроен',report.mailConfigured?'green':'amber')}</div><div class="actions">${button(pages?'Проверить план на сегодня':'Проверить очередь сейчас','ruler-check')} ${button('Журнал писем','ruler-outbox')}</div></div></section>`+
 `<div class="notice">${e(report.rule)} Будущие дни не считаются недосписанием. ${state.mode==='demo'?'Норма 8h в рабочий день и отсутствия в демо — синтетические примеры. Письма из демо не отправляются.':'Полнота, нормы, статусы и проекты должны быть подтверждены в импортируемом срезе.'}</div>`+
 (data.length?table(['Сотрудник','Норма / зачтено','Не хватает','Результат проверки','Следующий шаг'],data.map(x=>`<tr><td><span class="name">${e(x.name)}</span><div class="subtle">${e(deptName(x.departmentId))}</div><small class="source">${e(x.capturedAt?'Срез: '+dateText(x.capturedAt):'Источник не получен')}</small></td><td>${x.expectedHours===undefined?'—':`${x.weeks?.some(w=>w.unknown)?'Неизвестна':e(x.expectedHours)+'h'} / ${e(x.validHours)}h`}</td><td>${x.status==='unknown'?'—':`${e(x.missingHours)}h`}${report.quarterEnd?`<div class="subtle">Квартал: ${x.quarterMissingHours===null||x.quarterMissingHours===undefined?'не проверен':e(x.quarterMissingHours)+'h'}</div>`:''}</td><td>${rulerStatus(x)}<div class="subtle">${e(x.blockers[0]|| (x.issues.length?'Замечаний: '+x.issues.length:x.missingDays.length?'Незакрытых дней: '+x.missingDays.length:'Завершённые дни закрыты'))}</div></td><td>${button('Подробности','ruler-detail',`data-id="${e(x.personId)}"`)}</td></tr>`).join('')):empty('Нет сотрудников для проверки','Добавьте сотрудников и импортируйте полный нормализованный срез Project Ruler.'));
}
function rulerDetails(id){
 const row=rulerRows().find(x=>x.personId===id);if(!row)return;
 openDialog('Списания · '+row.name,`${rulerStatus(row)}<p class="subtle">Базовая норма 40h в неделю. Ниже — индивидуальные ожидания по календарю за завершённые дни. Недели, пересекающие границу месяца, показаны частично.</p>${row.blockers.map(x=>`<div class="notice">${e(x)}</div>`).join('')}<h3>Недельные итоги</h3>${row.weeks?.length?table(['Неделя','Норма','Зачтено','Полнота'],row.weeks.map(w=>`<tr><td>${e(w.week)}</td><td>${w.unknown?'Неизвестна':e(w.expectedHours)+'h'}</td><td>${e(w.validHours)}h</td><td>${w.days===7?'7 дней':e(w.days)+' дн. · часть недели'}</td></tr>`).join('')):'<p class="subtle">Недельные данные отсутствуют.</p>'}<h3>Не закрытые дни</h3><p class="subtle">${e(row.missingDays.map(x=>`${x.date}: ${x.hours}h`).join(' · ')||'По доступному срезу нет подтверждённых незакрытых дней')}</p><h3>Замечания к записям</h3>${row.issues.length?row.issues.map(x=>`<p class="subtle"><strong>${e(x.date)}</strong> · ${e(x.text)} ${e(x.entryId||'')}</p>`).join(''):'<p class="subtle">Замечаний в доступных записях нет.</p>'}${row.quarterBlockers?.length?`<h3>Полнота квартала</h3><p class="subtle">${e(row.quarterBlockers.join('; '))}</p>`:''}`);
}
const outboxLabels={queued:'Ожидает отправки',smtp_accepted:'Принято SMTP',retryable:'Временный отказ SMTP',failed:'Отказ SMTP',uncertain:'Результат отправки неизвестен',cancelled:'Отменено при перепроверке',dispatching:'Передаётся SMTP'};
function rulerOutbox(){
 const data=state.operations.outbox.filter(x=>department==='all'||x.departmentId===department);
 openDialog('Журнал писем',`<p class="subtle">Принятие SMTP не подтверждает доставку в почтовый ящик. При неизвестном результате автоматический повтор запрещён.</p>${data.length?table(['Сотрудник','Период / ступень','Результат'],data.map(x=>`<tr><td>${e(x.name)}</td><td>${e(x.period)} · −${e(x.offset)}</td><td>${tag(outboxLabels[x.status]||x.status)}</td></tr>`).join('')):empty('Писем в очереди пока нет','Очередь формируется только за 7/6/5/4/3 дня до конца месяца при подтверждённом дефиците и полном свежем срезе.')}`);
}
async function rulerPreview(){
 const result=await api('/api/ruler/preview');const letters=result.letters.filter(x=>department==='all'||x.departmentId===department);
 openDialog('Предпросмотр писем',`<div class="notice">Текущий месяц: ${e(result.period)}. Это текст для проверки. Предпросмотр ничего не отправляет. В рассылку попадают только актуальные случаи в назначенные календарные даты.</div>${letters.length?letters.map(x=>`<section class="panel"><div class="panel-head"><h3>${e(x.name)}</h3></div><div class="panel-body"><p class="subtle">Кому: ${e(x.to)}</p><strong>${e(x.subject)}</strong><div class="summary">${e(x.body)}</div></div></section>`).join(''):empty('Нет подтверждённых получателей','Данных недостаточно, адрес не указан или завершённые дни уже закрыты.')}`);
}
function grafanaView(){
 const data=state.operations.dashboards.filter(x=>department==='all'||x.departmentId==='all'||x.departmentId===department);
 return head('Grafana','Дашборды управления · внутренние ссылки и единый период',button('Добавить дашборд','grafana-new','','primary'))+
 `<div class="ruler-toolbar"><label>Период <select id="grafana-range"><option value="24h">Последние 24 часа</option><option value="7d">Последние 7 дней</option><option value="30d">Последние 30 дней</option><option value="month">Текущий месяц</option></select></label><span>${tag('Авторизация в Grafana','blue')}</span></div>`+
 `<div class="notice">Сохраняйте внутреннюю Share link. Дашборд открывается с вашими правами Grafana; фильтр отдела не выдаёт доступ. Встраивание, API и события Alerting предусмотрены следующим этапом после проверки установки.</div>`+
 (data.length?`<div class="card-grid">${data.map(x=>`<section class="card"><div class="dashboard-icon">${icon('layers')}</div><h2>${e(x.title)}</h2><p>${e(x.description||'Внутренний дашборд')}</p><small class="source">${e(new URL(x.url).hostname)} · ${e(x.departmentId==='all'?'Всё управление':deptName(x.departmentId))}</small><div class="actions"><a class="dashboard-link primary" target="_blank" rel="noopener noreferrer" href="${e(buildGrafanaLink(x))}" data-dashboard="${e(x.id)}">Открыть Grafana ↗</a>${button('Настроить','grafana-edit',`data-id="${e(x.id)}"`)}</div></section>`).join('')}</div>`:empty('Добавьте внутренний дашборд','Назначение: pipeline и свежесть данных, тестовые стенды, качество, релизы. Настоящие ссылки вашей Grafana ещё не предоставлены.'));
}
function buildGrafanaLink(card){
 const url=new URL(card.url), range=document.getElementById('grafana-range')?.value||'24h';
 const ranges={'24h':['now-24h','now'],'7d':['now-7d','now'],'30d':['now-30d','now'],month:['now/M','now']};
 url.searchParams.set('from',ranges[range][0]);url.searchParams.set('to',ranges[range][1]);url.searchParams.set('timezone','Europe/Moscow');
 if(card.departmentVariable&&department!=='all')url.searchParams.set('var-'+card.departmentVariable,department);
 return url.toString();
}
function grafanaForm(id){
 const card=state.operations.dashboards.find(x=>x.id===id)||{};
 openDialog(card.id?'Настроить дашборд':'Добавить дашборд Grafana',`<form id="grafana-form" data-id="${e(card.id||crypto.randomUUID())}"><div class="form-grid">${field('Название','title',input('title','text',card.title||'','required maxlength="160"'),true)}${field('Отдел','departmentId',select('departmentId',[['all','Всё управление'],...state.departments.map(x=>[x.id,x.short])],card.departmentId||department),true)}${field('Внутренняя Share link','url',input('url','url',card.url||'','required maxlength="2000" placeholder="https://…/d/…/…"'),true)}${field('Описание','description',`<textarea name="description" maxlength="1000">${e(card.description||'')}</textarea>`,true)}${field('Имя переменной отдела, если есть','departmentVariable',input('departmentVariable','text',card.departmentVariable||'','maxlength="80" placeholder="Например department"'),true)}<small class="subtle field full">Переменная должна существовать в дашборде и принимать ID отделов Command Center. Оставьте поле пустым, если сопоставление ещё не настроено. Токены и пароли в ссылке запрещены.</small></div><div class="form-error" role="alert"></div><div class="form-footer">${button('Отмена','close-dialog')}<button type="submit" class="primary">Сохранить дашборд</button></div></form>`);
}
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-action]');if(!b)return;
 const action=b.dataset.action;if(!action.startsWith('ruler-')&&!action.startsWith('grafana-'))return;
 try{
  if(action==='ruler-detail')rulerDetails(b.dataset.id);
  else if(action==='ruler-preview'){b.disabled=true;await rulerPreview();}
  else if(action==='ruler-outbox')rulerOutbox();
  else if(action==='ruler-check'){b.disabled=true;const result=await api('/api/ruler/check',{});await load();toast(state.hostingMode==='github-pages'?`По плану сегодня: ${result.eligibleToday} получателей. Это проверка в браузере; письма не отправляются.`:`Получателей сегодня: ${result.eligibleToday}. Источник Project Ruler этим действием не обновляется.`);}
  else if(action==='ruler-import')openDialog('Импорт среза Project Ruler',`<form id="ruler-import-form"><label class="field">Файл Project Ruler JSON<input name="file" type="file" accept="application/json,.json" required></label><p class="subtle">${state.hostingMode==='github-pages'?'Только синтетический тестовый срез. Скачайте пример кнопкой «Шаблон JSON».':'Нормализованный контракт app/fixtures/project-ruler.example.json.'} Это отдельный формат: персональный календарь, проекты, списания в виде 8h, полнота и время среза. До 512 КБ.</p><div class="form-error" role="alert"></div><div class="form-footer">${button('Отмена','close-dialog')}<button type="submit" class="primary">Проверить и загрузить</button></div></form>`);
  else if(action==='grafana-new')grafanaForm();
  else if(action==='grafana-edit')grafanaForm(b.dataset.id);
 }catch(error){toast(error.message);}finally{b.disabled=false;}
});
document.addEventListener('change',async event=>{
 if(event.target.id==='ruler-period'){try{rulerSelectedPeriod=event.target.value;await refreshOperations();render();}catch(error){toast(error.message);}}
 if(event.target.id==='grafana-range')for(const link of document.querySelectorAll('[data-dashboard]')){const card=state.operations.dashboards.find(x=>x.id===link.dataset.dashboard);link.href=buildGrafanaLink(card);}
});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['ruler-import-form','grafana-form'].includes(form.id))return;event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;form.querySelector('.form-error').textContent='';
 try{
  const values=Object.fromEntries(new FormData(form).entries());
  if(form.id==='grafana-form')await api('/api/grafana/save',{id:form.dataset.id,...values});
  else{if(values.file.size>524288)throw new Error('Файл больше 512 КБ');const payload=JSON.parse(await values.file.text());await api('/api/ruler/import',payload);}
  modal.close();await load();toast('Сохранено. Внешние списания не изменялись.');
 }catch(error){form.querySelector('.form-error').textContent=error.message;}finally{submit.disabled=false;}
});
