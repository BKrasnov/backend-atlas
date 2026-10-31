/* Resume files stay in the authenticated workspace JSON, not the public build. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const previewURLs=[];
  function checkedText(value,max){if(typeof value!=='string'||value.length>max)throw Error('Некорректное описание резюме.');return value;}
  function checkedChunks(value,limit,signature){
    if(!Array.isArray(value)||!value.length||value.length>100||value.some(s=>typeof s!=='string'||s.length>32000))throw Error('Некорректный файл резюме.');
    const encoded=value.join('');
    if(encoded.length>Math.ceil(limit/3)*4||!encoded||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('Некорректный формат или размер файла резюме.');
    const raw=atob(encoded);if(raw.length>limit||!raw.startsWith(signature))throw Error('Нужен корректный PDF или PNG предпросмотра.');
    return [...value];
  }
  function validate(raw){
    if(raw===undefined)return [];
    if(!Array.isArray(raw)||raw.length>10)throw Error('В списке может быть до 10 резюме.');
    const seen=new Set();let total=0;
    return raw.map(r=>{
      if(!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(r.id)||seen.has(r.id)||typeof r.draft!=='boolean'||!Number.isInteger(r.experienceYears)||r.experienceYears<0||r.experienceYears>60||!Number.isInteger(r.pages)||r.pages<1||r.pages>30||typeof r.fileName!=='string'||!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\.pdf$/i.test(r.fileName)||typeof r.addedAt!=='string'||r.addedAt.length>64||!Number.isFinite(Date.parse(r.addedAt)))throw Error('Некорректная версия резюме.');
      if(!Array.isArray(r.tags)||r.tags.length>15)throw Error('Некорректные теги резюме.');seen.add(r.id);
      const pdfChunks=checkedChunks(r.pdfChunks,2*1024*1024,'%PDF-');
      if(r.previewChunks!==undefined&&!Array.isArray(r.previewChunks))throw Error('Некорректный предпросмотр резюме.');
      const previewChunks=r.previewChunks?.length?checkedChunks(r.previewChunks,1024*1024,'\x89PNG\r\n\x1a\n'):[];
      const extra=r.additionalPreviewPages??[];
      if(!Array.isArray(extra)||extra.length>r.pages-1||(extra.length&&!previewChunks.length))throw Error('Некорректное количество страниц предпросмотра.');
      const additionalPreviewPages=extra.map(page=>checkedChunks(page,1024*1024,'\x89PNG\r\n\x1a\n'));
      total+=pdfChunks.join('').length+previewChunks.join('').length+additionalPreviewPages.reduce((size,page)=>size+page.join('').length,0);if(total>10*1024*1024)throw Error('Список резюме превышает допустимый размер.');
      return {id:r.id,title:checkedText(r.title,160),summary:checkedText(r.summary,1000),tags:r.tags.map(t=>checkedText(t,60)),draft:r.draft,experienceYears:r.experienceYears,pages:r.pages,fileName:r.fileName,addedAt:r.addedAt,pdfChunks,previewChunks,additionalPreviewPages};
    });
  }
  function bytes(chunks){return Uint8Array.from(atob(chunks.join('')),c=>c.charCodeAt(0));}
  const pagePreviews=resume=>resume.previewChunks.length?[resume.previewChunks,...(resume.additionalPreviewPages||[])]:[];
  function releasePreview(){previewURLs.forEach(url=>URL.revokeObjectURL(url));previewURLs.length=0;}
  function mountPreview(host,resume){
    releasePreview();if(!resume)return;const pages=pagePreviews(resume);
    host.querySelectorAll('[data-resume-image]').forEach(image=>{const chunks=pages[Number(image.dataset.resumePage)];if(!chunks)return;const url=URL.createObjectURL(new Blob([bytes(chunks)],{type:'image/png'}));previewURLs.push(url);image.src=url;});
  }
  function download(resume){
    const url=URL.createObjectURL(new Blob([bytes(resume.pdfChunks)],{type:'application/pdf'}));const link=document.createElement('a');
    link.href=url;link.download=resume.fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render(resumes,selectedId){
    if(!resumes.length)return '<div class="resume-empty"><h2>Резюме пока нет</h2><p>Сохранённые версии резюме кандидата появятся здесь.</p></div>';
    const selected=resumes.find(r=>r.id===selectedId),pages=selected?pagePreviews(selected):[];
    return `<div class="resume-list">${resumes.map(r=>{
      const encoded=r.pdfChunks.join(''),size=Math.round((encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0))/1024);
      const date=new Date(r.addedAt).toLocaleDateString('ru-RU');
      return `<article class="resume-card"><div class="resume-file-mark" aria-hidden="true"><strong>PDF</strong><span>${r.pages} стр.</span></div><div class="resume-card-content"><div class="resume-card-heading"><h2>${esc(r.title)}</h2>${r.draft?'<span class="resume-draft">Черновик</span>':''}</div><p>${esc(r.summary)}</p><div class="resume-tags">${r.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="resume-meta"><span>${r.draft?'Условный стаж':'Стаж'}: ${r.experienceYears} лет</span><span>PDF · ${r.pages} стр. · ${size} КБ</span><span>Добавлено ${esc(date)}</span></div></div><div class="resume-card-actions"><button class="btn" id="resume-view-${esc(r.id)}" data-resume-view="${esc(r.id)}" aria-label="Просмотреть резюме" aria-expanded="${r.id===selectedId}" aria-controls="resume-preview-panel">${r.id===selectedId?'Скрыть просмотр':'Просмотреть'}</button><button class="btn btn-primary" data-resume-download="${esc(r.id)}" aria-label="Скачать резюме PDF">Скачать PDF</button></div></article>`;
    }).join('')}</div>${selected?`<section class="resume-preview" id="resume-preview-panel" aria-label="Просмотр резюме"><div class="resume-preview-heading"><div><span>ПРЕДПРОСМОТР</span><h2>${esc(selected.title)}</h2></div><button class="btn" data-resume-close aria-label="Закрыть просмотр">Закрыть</button></div>${pages.length?`<p class="resume-pages-count">Показано страниц: ${pages.length} из ${selected.pages}${pages.length<selected.pages?'. Все страницы доступны в PDF.':''}</p><div class="resume-preview-pages">${pages.map((page,i)=>`<figure class="resume-page"><figcaption>Страница ${i+1} из ${selected.pages}</figcaption><div class="resume-paper"><img data-resume-image data-resume-page="${i}" alt="Страница ${i+1} из ${selected.pages} резюме ${esc(selected.title)}. Текстовая версия доступна в PDF."></div></figure>`).join('')}</div>`:'<p class="resume-preview-note">Предпросмотр недоступен. Документ можно скачать в PDF.</p>'}<p class="resume-preview-note">Для выделения текста и печати скачайте исходный PDF.</p></section>`:''}`;
  }
  window.AtlasResumes=Object.freeze({validate,render,mountPreview,releasePreview,download});
})();
