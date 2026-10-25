/* Fixed learning dates are derived from the program; only completion is stored. */
(() => {
  'use strict';
  const START='2026-10-26',DAY=86400000;
  const TECHNOLOGY_WEEKS=[
    ['api-1','api-2','api-3','data-1','infra-3','infra-4','testing-1','testing-2'],
    ['storage-1','storage-2','storage-3','cloud-1','infra-5'],
    ['api-4','api-5','testing-4','observability-4'],
    ['data-4','testing-5','observability-1'],
    ['messaging-1','messaging-4'],
    ['api-7','api-8','infra-8'],
    ['messaging-2','messaging-3'],
    ['data-2','testing-3','cicd-2'],
    ['data-3','infra-1'],
    ['security-3','infra-2','observability-6'],
    ['security-5','cicd-1','observability-3'],
    ['data-6','data-7','messaging-6'],
    ['messaging-5','infra-6','infra-7','cicd-3','observability-5'],
    ['data-5','observability-2'],
    ['api-6','cloud-2'],
    ['testing-6','cicd-5','cicd-6'],
    ['security-1','security-2','security-4','cloud-3'],
    ['cicd-4']
  ];
  const techWeeks=new Map(TECHNOLOGY_WEEKS.flatMap((ids,i)=>ids.map(id=>[id,i+1])));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=date=>Date.parse(date+'T00:00:00Z')/DAY;
  const iso=number=>new Date(number*DAY).toISOString().slice(0,10);
  function localDay(date=new Date()){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
  function weekRange(week){const start=number(START)+(week-1)*7;return {start:iso(start),due:iso(start+6)};}
  const technologyWeek=id=>techWeeks.get(id)||18;
  function status(due,done,today=localDay()){return done?'done':today>due?'overdue':today===due?'today':'scheduled';}
  const format=date=>date.split('-').reverse().join('.');
  function monthTitle(month){return new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'));}
  function shiftMonth(month,delta){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);}
  function monthCells(month){
    const first=number(month+'-01'),day=(new Date(first*DAY).getUTCDay()+6)%7,next=number(shiftMonth(month,1)+'-01');
    const count=Math.ceil((next-first+day)/7)*7;
    return Array.from({length:count},(_,i)=>{const date=iso(first-day+i);return {date,inMonth:date.startsWith(month)};});
  }
  function schedule({tasks,technologies,profile={},today=localDay()}){
    const learned=new Set(profile.calendar?.learnedTech||[]),pool=tasks.filter(t=>!t.project);
    const weeks=pool.map((t,i)=>{
      const range=weekRange(i+1),done=profile.tasks?.[t.id]?.status==='done';
      return {number:i+1,...range,current:today>=range.start&&today<=range.due,task:{...t,done,state:status(range.due,done,today)},technologies:[]};
    });
    for(const t of technologies){
      const week=weeks[Math.min(technologyWeek(t.id),weeks.length)-1];if(!week)continue;
      const done=learned.has(t.id);week.technologies.push({...t,done,overdue:!done&&today>week.due});
    }
    for(const w of weeks){w.overdue=w.task.state==='overdue'||w.technologies.some(t=>t.overdue);w.complete=w.task.done&&w.technologies.every(t=>t.done);}
    const allTech=weeks.flatMap(w=>w.technologies);
    return {today,weeks,overdueTasks:weeks.filter(w=>w.task.state==='overdue').length,overdueTech:allTech.filter(t=>t.overdue).length,doneTasks:weeks.filter(w=>w.task.done).length,doneTech:allTech.filter(t=>t.done).length,totalTech:allTech.length};
  }
  function deadlineBadge({due,done=false,today=localDay(),href,doneLabel='Готово'}){
    const state=status(due,done,today),days=number(today)-number(due);
    const text=state==='done'?doneLabel+' · '+format(due):state==='overdue'?'Просрочено на '+days+' дн. · '+format(due):state==='today'?'Срок сегодня · '+format(due):'До '+format(due);
    return `<a class="cal-deadline is-${state}" data-deadline-state="${state}" href="${esc(href)}">${esc(text)}</a>`;
  }
  function techControl(t,{due,done,today=localDay(),week}){
    return `<div class="cal-tech-row ${!done&&today>due?'is-overdue':''}"><label class="cal-learn"><input type="checkbox" id="calendar-tech-${esc(t.id)}" data-calendar-learn="${esc(t.id)}" aria-label="Изучено: ${esc(t.name)}" ${done?'checked':''}><span>${esc(t.name)}</span><small>${done?'Изучено':'Изучить'}</small></label>${deadlineBadge({due,done,today,href:'#calendar/'+week,doneLabel:'Изучено'})}</div>`;
  }
  function render(model,{month,filter='all',openWeeks=new Set()}={}){
    const weeks=model.weeks,byDate=new Map(weeks.map(w=>[w.due,w])),next=weeks.find(w=>!w.complete)||weeks.at(-1);
    const shown=weeks.filter(w=>filter==='overdue'?w.overdue:filter==='current'?w.current:filter==='done'?w.complete:true);
    const stats=[['all','Все недели',weeks.length],['current','На этой неделе',weeks.filter(w=>w.current).length],['overdue','Просрочено',weeks.filter(w=>w.overdue).length],['done','Выполнено',weeks.filter(w=>w.complete).length]];
    const taskLink=w=>`#tasks/${w.task.id}/brief`;
    return `${model.overdueTasks||model.overdueTech?`<div class="cal-alert" role="status"><strong>Требуют внимания: ${model.overdueTasks} заданий и ${model.overdueTech} технологий</strong><span>Сроки прошли. Завершите оставшееся; следующие недели сохраняют свои даты.</span><button class="btn" data-cal-filter="overdue">Показать просроченное</button></div>`:''}
    <div class="cal-layout"><section class="cal-month-panel" aria-label="Календарь по месяцам"><div class="cal-month-head"><h2 id="calendar-month-title">${esc(monthTitle(month))}</h2><div class="cal-month-actions"><button class="btn" data-cal-month="-1" aria-label="Предыдущий месяц">‹</button><button class="btn" data-cal-today>Сегодня</button><button class="btn" data-cal-month="1" aria-label="Следующий месяц">›</button></div></div>
    <div class="cal-month-grid" role="group" aria-labelledby="calendar-month-title">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span class="cal-weekday">${d}</span>`).join('')}${monthCells(month).map(cell=>{
      const w=byDate.get(cell.date),classes=`cal-day ${cell.inMonth?'':'is-outside'} ${cell.date===model.today?'is-today':''} ${w?(w.overdue?'is-overdue':w.complete?'is-done':'has-deadline'):''}`;
      const inner=`<time datetime="${cell.date}">${Number(cell.date.slice(-2))}</time>${cell.date===START?'<small class="cal-start">Старт</small>':''}${w?`<span class="cal-day-event">Неделя ${w.number}<b>${esc(w.task.title)}</b><small>1 задание · ${w.technologies.length} технологий</small></span>`:''}`;
      return w?`<button class="${classes}" data-cal-week="${w.number}" aria-label="Срок ${format(cell.date)}: ${esc(w.task.title)}; ${w.technologies.length} технологий${w.overdue?'; есть просрочка':''}">${inner}</button>`:`<div class="${classes}">${inner}</div>`;
    }).join('')}</div><p class="cal-month-note"><span class="cal-legend-dot"></span>Срок — воскресенье включительно. <span class="cal-legend-dot overdue"></span>Красным отмечено невыполненное после срока.</p></section>
    <aside class="cal-focus" aria-label="Ближайшая неделя"><div class="cal-eyebrow">${next.complete?'ПРОГРАММА ЗАВЕРШЕНА':'БЛИЖАЙШАЯ НЕЗАКРЫТАЯ НЕДЕЛЯ'}</div><strong class="cal-focus-number">${next.number}<small> / ${weeks.length}</small></strong><p>${format(next.start)} — ${format(next.due)}</p><h2>${esc(next.task.title)}</h2>${deadlineBadge({due:next.due,done:next.complete,today:model.today,href:'#calendar/'+next.number})}<a class="btn btn-primary" href="${taskLink(next)}">Открыть задание</a><p class="cal-focus-note">Одна задача в неделю. Технологии отмечаются отдельно; выполнение задачи не ставит отметки за вас.</p><div class="cal-program-range">СТАРТ <b>${format(START)}</b><br>ФИНИШ <b>${format(weeks.at(-1).due)}</b></div></aside></div>
    <section class="cal-plan" aria-label="План по неделям"><div class="cal-plan-head"><div><h2>Ваш план по неделям</h2><p>Технологии сгруппированы по практике. Любую можно изучить и отметить заранее.</p></div><div class="cal-filters" role="group" aria-label="Фильтр недель">${stats.map(([id,label,count])=>`<button class="btn ${filter===id?'active':''}" data-cal-filter="${id}" aria-pressed="${filter===id}">${label} <span>${count}</span></button>`).join('')}</div></div>
    ${shown.length?shown.map(w=>`<details class="cal-week ${w.overdue?'is-overdue':''} ${w.current?'is-current':''}" id="calendar-week-${w.number}" data-calendar-week="${w.number}" ${openWeeks.has(w.number)?'open':''}><summary><span class="cal-week-number">${String(w.number).padStart(2,'0')}</span><span class="cal-week-title"><strong>${esc(w.task.title)}</strong><small>${format(w.start)} — ${format(w.due)}${w.current?' · Эта неделя':''}</small></span><span class="cal-week-progress">${w.task.done?'Задание готово':'Задание не завершено'}<small>${w.technologies.filter(t=>t.done).length} / ${w.technologies.length} технологий</small></span><span class="cal-week-state ${w.overdue?'overdue':w.complete?'done':''}">${w.overdue?'Есть просрочка':w.complete?'Выполнено':w.current?'В работе':'По плану'}</span></summary><div class="cal-week-body"><div class="cal-task-line"><a class="cal-task-title" href="${taskLink(w)}">${esc(w.task.title)}</a><span data-calendar-task-state="${w.task.state}">${deadlineBadge({due:w.due,done:w.task.done,today:model.today,href:taskLink(w)})}</span></div><p class="cal-task-help">Завершите задание через критерии приёмки на этапе «Проверка».</p><h3>Изучить к ${format(w.due)}</h3>${w.technologies.length?w.technologies.map(t=>techControl(t,{due:w.due,done:t.done,today:model.today,week:w.number})).join(''):'<p class="cal-task-help">Новых технологий на этой неделе нет — закрепляйте изученное в проекте.</p>'}<a class="cal-topics-link" href="${taskLink(w)}">Условие, связанные темы и материалы задания →</a></div></details>`).join(''):'<div class="cal-empty">На этом фильтре пока нет недель.</div>'}</section>`;
  }
  window.AtlasLearningCalendar=Object.freeze({START,localDay,weekRange,technologyWeek,status,format,monthTitle,shiftMonth,monthCells,schedule,deadlineBadge,techControl,render});
})();
