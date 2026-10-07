/* Browser-only, synthetic Command Center calculations. No network, worker or mail. */
(function (root, factory) {
  'use strict';
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.CCPageEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const OFFSETS = Object.freeze([7, 6, 5, 4, 3]);
  const DAY = 86400000;
  const DEPARTMENTS = ['all', 'data-storage', 'data-tech', 'marketing', 'analysis', 'qa'];
  const ZERO = {n: 0n, d: 1n};
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  function keys(value, required, optional = []) {
    return plain(value) && required.every(key => Object.hasOwn(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  }
  function text(value, maximum = 160) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) fail('Некорректное текстовое поле');
    return value;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || +value.slice(0, 4) < 1) fail('Дата: YYYY-MM-DD');
    const result = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(+result) || result.toISOString().slice(0, 10) !== value) fail('Некорректная календарная дата');
    return result;
  }
  const iso = value => value.toISOString().slice(0, 10);
  const shifted = (value, days) => new Date(+value + days * DAY);
  function monthRange(period) {
    if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) fail('Период: YYYY-MM');
    const start = date(period + '-01');
    const next = new Date(+start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return {start, end: shifted(next, -1)};
  }
  function stamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail('Нужна ISO дата с часовым поясом');
    date(value.slice(0, 10));
    const clock = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/), offset = value.match(/[+-](\d{2}):(\d{2})$/);
    if (+clock[1] > 23 || +clock[2] > 59 || +(clock[3] || 0) > 59 || (offset && (+offset[1] > 23 || +offset[2] > 59))) fail('Нужна ISO дата с часовым поясом');
    const result = new Date(value);
    if (!Number.isFinite(+result)) fail('Нужна ISO дата с часовым поясом');
    return result;
  }
  function businessDate(currentTime) {
    const parts = new Intl.DateTimeFormat('en', {timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(stamp(currentTime));
    const field = type => parts.find(part => part.type === type).value;
    return `${field('year').padStart(4, '0')}-${field('month')}-${field('day')}`;
  }
  // Base-ten arithmetic keeps 0.1h + 0.2h exact instead of producing a false deficit.
  function decimal(value) {
    const match = String(value).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match) fail('Некорректные часы');
    const exponent = +(match[3] || 0) - (match[2] || '').length;
    const numerator = BigInt(match[1] + (match[2] || ''));
    return exponent >= 0 ? {n: numerator * 10n ** BigInt(exponent), d: 1n} : {n: numerator, d: 10n ** BigInt(-exponent)};
  }
  function align(a, b) {
    const d = a.d > b.d ? a.d : b.d;
    return {a: a.n * (d / a.d), b: b.n * (d / b.d), d};
  }
  function add(a, b) { const x = align(a, b); return {n: x.a + x.b, d: x.d}; }
  function subtract(a, b) { const x = align(a, b); return {n: x.a - x.b, d: x.d}; }
  function compare(a, b) { const x = align(a, b); return x.a < x.b ? -1 : x.a > x.b ? 1 : 0; }
  const number = value => Number(`${value.n}e-${value.d.toString().length - 1}`);
  function hours(value, nullable = false) {
    if (value === null && nullable) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 24) fail('Часы: число от 0 до 24 либо null для неизвестной нормы');
    return decimal(Object.is(value, -0) ? 0 : value);
  }
  function duration(value) {
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?h$/.test(value)) fail('Длительность списания: формат 8h; дробные часы, например 4.5h');
    if (!Number.isFinite(Number(value.slice(0, -1))) || Number(value.slice(0, -1)) <= 0 || Number(value.slice(0, -1)) > 24) fail('Длительность списания должна быть от 0 до 24 часов, не включая 0');
    return decimal(value.slice(0, -1));
  }
  function peopleMap(people) {
    if (people instanceof Map) return people;
    if (Array.isArray(people)) return new Map(people.map(person => [person.id, person]));
    return new Map(Object.entries(people || {}));
  }
  function validateImport(payload, people) {
    if (!keys(payload, ['schemaVersion', 'datasetType', 'period', 'source', 'policy', 'employees'])) fail('Требуется контракт Project Ruler: schemaVersion, datasetType, period, source, policy, employees');
    if (payload.schemaVersion !== 1 || payload.datasetType !== 'synthetic') fail('Публичная версия принимает только schemaVersion=1, datasetType=synthetic. Рабочие банковские данные не загружайте.');
    const {start, end} = monthRange(payload.period);
    const source = payload.source, policy = payload.policy;
    if (!keys(source, ['instance', 'capturedAt', 'coveredThrough', 'complete'])) fail('source: instance, capturedAt, coveredThrough, complete');
    text(source.instance); stamp(source.capturedAt);
    const coverage = date(source.coveredThrough);
    if (coverage < shifted(start, -1) || coverage > end || typeof source.complete !== 'boolean') fail('Некорректная полнота периода');
    if (!keys(policy, ['confirmed', 'maxAgeHours', 'acceptedStatuses'])) fail('policy: confirmed, maxAgeHours, acceptedStatuses');
    if (typeof policy.confirmed !== 'boolean' || !Number.isInteger(policy.maxAgeHours) || policy.maxAgeHours < 1 || policy.maxAgeHours > 168) fail('Нужны подтверждение правил и maxAgeHours от 1 до 168');
    if (!Array.isArray(policy.acceptedStatuses) || !policy.acceptedStatuses.length || policy.acceptedStatuses.length > 10 || new Set(policy.acceptedStatuses).size !== policy.acceptedStatuses.length) fail('acceptedStatuses: непустой список уникальных строк');
    policy.acceptedStatuses.forEach(status => text(status, 50));
    if (!Array.isArray(payload.employees) || payload.employees.length > 1000) fail('employees: список до 1000 сотрудников');
    const registry = peopleMap(people), seen = new Set(), entryIds = new Set();
    const dates = new Set(Array.from({length: end.getUTCDate()}, (_, index) => iso(shifted(start, index))));
    for (const employee of payload.employees) {
      if (!keys(employee, ['personId', 'email', 'expectedDays', 'allowedProjects', 'entries'])) fail('Сотрудник: personId, email, expectedDays, allowedProjects, entries');
      const id = text(employee.personId);
      if (!registry.has(id) || seen.has(id)) fail('Сотрудник отсутствует в реестре или повторяется');
      seen.add(id);
      if (employee.email !== null && (typeof employee.email !== 'string' || employee.email.length > 254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(employee.email))) fail('email: один адрес либо null');
      if (employee.allowedProjects !== null) {
        if (!Array.isArray(employee.allowedProjects) || employee.allowedProjects.length > 100 || new Set(employee.allowedProjects).size !== employee.allowedProjects.length) fail('allowedProjects: список уникальных ID либо null');
        employee.allowedProjects.forEach(project => text(project));
      }
      if (!Array.isArray(employee.expectedDays) || employee.expectedDays.length !== dates.size) fail('Нужна персональная норма каждого календарного дня, включая нулевые и неизвестные дни');
      const seenDates = new Set();
      for (const day of employee.expectedDays) {
        if (!keys(day, ['date', 'hours'], ['reason']) || !dates.has(day.date) || seenDates.has(day.date)) fail('Норма: дата вне месяца либо повтор; expectedDays: date, hours, необязательный reason');
        seenDates.add(day.date); hours(day.hours, true);
        if (Object.hasOwn(day, 'reason')) text(day.reason, 240);
      }
      if (!Array.isArray(employee.entries) || employee.entries.length > 2000) fail('entries: список до 2000 строк');
      for (const entry of employee.entries) {
        if (!keys(entry, ['id', 'date', 'projectId', 'hours', 'status'])) fail('Списание: id, date, projectId, hours, status');
        text(entry.id);
        if (entryIds.has(entry.id) || !dates.has(entry.date)) fail('ID списания повторяется либо дата вне месяца');
        entryIds.add(entry.id); text(entry.projectId); text(entry.status, 50);
        text(entry.hours, 40); // Invalid source duration remains a finding, as in the server version.
      }
    }
    return clone(payload);
  }
  function weekKey(value) {
    const thursday = shifted(date(value), 3 - (date(value).getUTCDay() + 6) % 7);
    const first = date(String(thursday.getUTCFullYear()).padStart(4, '0') + '-01-01');
    return `${thursday.getUTCFullYear()}-W${String(Math.ceil((+thursday - +first + DAY) / (7 * DAY))).padStart(2, '0')}`;
  }
  function assess(employee, snapshot, businessDay, currentTime) {
    const {start, end} = monthRange(snapshot.period);
    const due = new Date(Math.min(+end, +shifted(date(businessDay), -1)));
    const through = iso(due), source = snapshot.source, policy = snapshot.policy;
    const blockers = [], issues = [];
    const age = +stamp(currentTime) - +stamp(source.capturedAt);
    if (age < -300000 || age > policy.maxAgeHours * 3600000) blockers.push('Срез устарел или его дата находится в будущем');
    if (!source.complete || date(source.coveredThrough) < due) blockers.push('Не подтверждена полнота списаний до проверяемой даты');
    if (!policy.confirmed) blockers.push('Правила проверки не подтверждены');
    if (employee.allowedProjects === null) blockers.push('Не подтверждены разрешённые проекты');
    const expected = new Map(employee.expectedDays.filter(day => date(day.date) >= start && day.date <= through).map(day => [day.date, hours(day.hours, true)]));
    if ([...expected.values()].some(norm => norm === null)) blockers.push('Есть дни с неизвестной персональной нормой');
    const valid = new Map(), totals = new Map();
    for (const entry of employee.entries) {
      if (entry.date > through) continue;
      let quantity;
      try { quantity = duration(entry.hours); }
      catch (_) { issues.push({date: entry.date, code: 'format', text: 'Неверный формат длительности: ожидается 8h', entryId: entry.id}); continue; }
      totals.set(entry.date, add(totals.get(entry.date) || ZERO, quantity));
      const allowed = employee.allowedProjects !== null && employee.allowedProjects.includes(entry.projectId);
      const accepted = policy.acceptedStatuses.includes(entry.status);
      if (!allowed) issues.push({date: entry.date, code: 'project', text: 'Проект не входит в подтверждённый список', entryId: entry.id});
      if (!accepted) issues.push({date: entry.date, code: 'status', text: 'Статус списания не засчитывается по выбранным правилам', entryId: entry.id});
      if (allowed && accepted) valid.set(entry.date, add(valid.get(entry.date) || ZERO, quantity));
    }
    let missing = ZERO, expectedTotal = ZERO, validTotal = ZERO;
    const missingDays = [], weeks = new Map();
    for (const [day, norm] of expected) {
      const actual = valid.get(day) || ZERO;
      if (norm !== null) {
        expectedTotal = add(expectedTotal, norm);
        if (compare(actual, norm) < 0) {
          const difference = subtract(norm, actual);
          missing = add(missing, difference); missingDays.push({date: day, hours: number(difference)});
        }
        if (compare(actual, norm) > 0) issues.push({date: day, code: 'over', text: 'Списание больше персональной нормы; требуется проверка'});
      }
      const key = weekKey(day);
      if (!weeks.has(key)) weeks.set(key, {week: key, days: 0, expected: ZERO, valid: ZERO, unknown: false});
      const week = weeks.get(key);
      week.days++; week.unknown = week.unknown || norm === null;
      week.expected = add(week.expected, norm || ZERO); week.valid = add(week.valid, actual);
    }
    for (const quantity of valid.values()) validTotal = add(validTotal, quantity);
    for (const [day, total] of totals) if (compare(total, decimal(24)) > 0) issues.push({date: day, code: 'physical_limit', text: 'Сумма списаний больше 24 часов'});
    return {personId: employee.personId, period: snapshot.period, through, expectedHours: number(expectedTotal), validHours: number(validTotal), missingHours: number(missing), missingDays, issues, blockers,
      status: blockers.length ? 'unknown' : missing.n || issues.length ? 'attention' : 'ok', email: employee.email, sourceInstance: source.instance, capturedAt: source.capturedAt,
      weeks: [...weeks.values()].map(week => ({week: week.week, days: week.days, expectedHours: number(week.expected), validHours: number(week.valid), unknown: week.unknown}))};
  }
  function report(people, snapshots, period, businessDay, currentTime) {
    businessDay = businessDay || businessDate(currentTime);
    period = period || businessDay.slice(0, 7);
    const {end} = monthRange(period), snapshot = snapshots[period];
    const employees = new Map((snapshot ? snapshot.employees : []).map(employee => [employee.personId, employee]));
    const rows = people.map(person => {
      const employee = employees.get(person.id);
      const row = employee ? assess(employee, snapshot, businessDay, currentTime) : {personId: person.id, period, status: 'unknown', missingHours: null, missingDays: [], issues: [], blockers: ['Нет полного среза Project Ruler для сотрудника'], email: null};
      return {...row, name: person.name, departmentId: person.departmentId};
    });
    const quarterEnd = [3, 6, 9, 12].includes(end.getUTCMonth() + 1);
    if (quarterEnd) for (const row of rows) {
      let missing = decimal(row.missingHours || 0);
      const blockers = [...row.blockers], breakdown = [{period, missingHours: row.missingHours, missingDays: row.missingDays, capturedAt: row.capturedAt || null, issues: row.issues}];
      for (let month = end.getUTCMonth() - 1; month < end.getUTCMonth() + 1; month++) {
        const previousPeriod = `${end.getUTCFullYear()}-${String(month).padStart(2, '0')}`;
        const previous = snapshots[previousPeriod], employee = previous?.employees.find(employee => employee.personId === row.personId);
        if (!employee) blockers.push(`Нет среза для квартала: ${previousPeriod}`);
        else {
          const prior = assess(employee, previous, businessDay, currentTime);
          blockers.push(...prior.blockers);
          if (previous.source.instance !== row.sourceInstance) blockers.push('Источники месяцев квартала не сопоставлены');
          missing = add(missing, decimal(prior.missingHours));
          breakdown.push({period: previousPeriod, missingHours: prior.missingHours, missingDays: prior.missingDays, capturedAt: prior.capturedAt, issues: prior.issues});
        }
      }
      row.quarterMissingHours = blockers.length ? null : number(missing);
      row.quarterBlockers = [...new Set(blockers)];
      row.quarterBreakdown = breakdown.sort((a, b) => a.period.localeCompare(b.period));
    }
    return {period, through: iso(new Date(Math.min(+end, +shifted(date(businessDay), -1)))), rows,
      schedule: OFFSETS.map(offset => ({offset, date: iso(shifted(end, -offset))})), quarterEnd, quarter: `${end.getUTCFullYear()}-Q${Math.floor(end.getUTCMonth() / 3) + 1}`,
      rule: '40h в неделю; формат 8h. Проверяем завершённые дни по персональному календарю с отсутствиями. Дефицит по дням не взаимозачитывается.', mailConfigured: false};
  }
  function message(row, result, offset) {
    const quarter = result.quarterEnd && !row.quarterBlockers?.length;
    let subject = `Project Ruler: проверьте списания за ${result.period}`;
    const lines = [`Здравствуйте, ${row.name}!`, '', `Календарных дней до конца месяца: ${offset}.`];
    if (row.missingHours) lines.push(`По срезу ${row.capturedAt || ''} за завершённые дни до ${result.through} не хватает ${row.missingHours} ч.`,
      'Дни для проверки: ' + row.missingDays.slice(0, 31).map(day => `${day.date} (${day.hours} ч.)`).join(', '));
    else lines.push(`Завершённые дни текущего месяца до ${result.through} закрыты; проверьте месяцы квартала ниже.`);
    if (row.issues.length) lines.push('Также проверьте: ' + [...new Set(row.issues.map(issue => issue.text))].join('; '));
    if (quarter) {
      subject += ` · закрытие ${result.quarter}`;
      lines.push(`Квартальный дефицит по подтверждённым срезам: ${row.quarterMissingHours} ч.`);
      for (const part of row.quarterBreakdown) if (part.missingHours) lines.push(`${part.period} · срез ${part.capturedAt}: ` + part.missingDays.map(day => `${day.date} (${day.hours} ч.)`).join(', '));
    } else if (result.quarterEnd) lines.push('Квартал закрывается вместе с месяцем; полнота предыдущих месяцев пока не подтверждена.');
    lines.push('', 'Проверьте и исправьте записи в Project Ruler по действующим правилам. Если норма или отсутствие указаны неверно, уточните их у ответственного.', 'Command Center не изменяет ваши списания. После нового полного среза напоминания прекращаются, если дефицит устранён.');
    return {to: row.email, subject, body: lines.join('\n'), monthMissingHours: row.missingHours, quarter};
  }
  function candidates(mode, people, snapshots, businessDay, currentTime, enforceSchedule = false) {
    businessDay = businessDay || businessDate(currentTime);
    const result = report(people, snapshots, null, businessDay, currentTime);
    const offset = Math.round((+monthRange(result.period).end - +date(businessDay)) / DAY);
    const letters = enforceSchedule && !OFFSETS.includes(offset) ? [] : result.rows.filter(row => !row.blockers.length && row.email && (row.missingHours || row.quarterMissingHours)).map(row => ({
      key: 'preview:' + [mode, row.sourceInstance, row.personId, result.period, offset].map(encodeURIComponent).join('|'),
      personId: row.personId, departmentId: row.departmentId, name: row.name, offset, period: result.period, ...message(row, result, offset)
    }));
    return {report: result, letters};
  }
  function grafanaUrl(value, fromValue = 'now-24h', toValue = 'now', variables = {}) {
    text(value, 2000);
    if (!/^https:\/\//.test(value) || /[\\\r\n\t]/.test(value)) fail('Нужна HTTPS-ссылка Grafana без логина, пароля и фрагмента');
    let url;
    try { url = new URL(value); } catch (_) { fail('Некорректная ссылка Grafana'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) fail('Нужна HTTPS-ссылка Grafana без логина, пароля и фрагмента');
    if (url.hostname.length > 253 || (!url.hostname.startsWith('[') && url.hostname.split('.').some(part => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part)))) fail('Некорректное имя сервера Grafana');
    if (url.port && (+url.port < 1 || +url.port > 65535)) fail('Некорректный порт Grafana');
    if (!/^\/d(?:-solo)?\/[^/]+\//.test(url.pathname)) fail('Скопируйте Share link вида /d/UID/name или /d-solo/UID/name');
    for (const key of url.searchParams.keys()) if (/token|password|secret|api.?key|authorization/i.test(key)) fail('Токены и секреты нельзя сохранять в ссылке Grafana');
    url.searchParams.set('from', text(fromValue)); url.searchParams.set('to', text(toValue)); url.searchParams.set('timezone', 'Europe/Moscow');
    for (const [key, value] of Object.entries(variables || {})) {
      text(key, 80);
      if (!/^[A-Za-z0-9_]+$/.test(key)) fail('Имя переменной Grafana должно содержать буквы, цифры или _');
      url.searchParams.set('var-' + key, text(value));
    }
    return url.toString();
  }
  function validateDashboard(card) {
    if (!keys(card, ['id', 'departmentId', 'title', 'url', 'description', 'departmentVariable'])) fail('Некорректная карточка Grafana');
    text(card.id, 80); text(card.title);
    if (typeof card.description !== 'string' || card.description.length > 1000) fail('Описание до 1000 символов');
    if (!DEPARTMENTS.includes(card.departmentId)) fail('Неизвестный отдел');
    if (typeof card.departmentVariable !== 'string' || card.departmentVariable.length > 80 || (card.departmentVariable && !/^[A-Za-z0-9_]+$/.test(card.departmentVariable))) fail('Некорректное имя переменной отдела');
    grafanaUrl(card.url);
    return clone(card);
  }
  function template(people, currentTime) {
    const today = businessDate(currentTime), period = today.slice(0, 7), {start, end} = monthRange(period);
    const employees = people.map((person, index) => {
      const expectedDays = [], entries = [];
      for (let offset = 0; offset < end.getUTCDate(); offset++) {
        const day = shifted(start, offset), dayISO = iso(day), normal = day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
        const norm = index === 8 ? 0 : normal ? 8 : 0;
        expectedDays.push({date: dayISO, hours: norm, reason: 'Синтетический пример нормы / отсутствия'});
        if (norm && dayISO < today && index !== 1) entries.push({id: `example-${index}-${offset}`, date: dayISO, projectId: index === 2 && offset === 0 ? 'WRONG' : 'ACRM', hours: index === 3 ? '4h' : `${norm}h`, status: 'posted'});
      }
      if (index === 9) expectedDays[0].hours = null;
      return {personId: person.id, email: `employee${String(index + 1).padStart(2, '0')}@example.invalid`, expectedDays, allowedProjects: ['ACRM'], entries};
    });
    return {schemaVersion: 1, datasetType: 'synthetic', period, source: {instance: 'DEMO-Project-Ruler', capturedAt: currentTime, coveredThrough: iso(shifted(date(today), -1)), complete: true}, policy: {confirmed: true, maxAgeHours: 24, acceptedStatuses: ['posted']}, employees};
  }
  return Object.freeze({OFFSETS, businessDate, monthRange, stamp, duration, validateImport, assess, report, candidates, message, grafanaUrl, validateDashboard, template});
});
