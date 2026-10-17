/* Architecture editor: the stored graph is separate from its temporary camera and selection. */
(() => {
  'use strict';
  const TYPES = [
    {id:'client',name:'Клиент',add:'Добавить клиент',hint:'Браузер или приложение',color:'#5366b7'},
    {id:'api',name:'API',add:'Добавить API',hint:'Точка входа в систему',color:'#6b55ce'},
    {id:'service',name:'Сервис',add:'Добавить сервис',hint:'Бизнес-логика',color:'#6679a1'},
    {id:'database',name:'База данных',add:'Добавить базу данных',hint:'Постоянные данные',color:'#32887f'},
    {id:'cache',name:'Кеш',add:'Добавить кеш',hint:'Быстрый доступ',color:'#a57c36'},
    {id:'queue',name:'Очередь',add:'Добавить очередь',hint:'События и сообщения',color:'#ad6c50'},
    {id:'worker',name:'Воркер',add:'Добавить воркер',hint:'Фоновая обработка',color:'#8d63a8'},
    {id:'external',name:'Внешний сервис',add:'Добавить внешний сервис',hint:'Сторонняя система',color:'#608598'},
    {id:'component',name:'Свой блок',add:'Добавить свой блок',hint:'Любой компонент',color:'#7e8193'}
  ];
  const type = kind => TYPES.find(t=>t.id===kind)||TYPES.at(-1);
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ports = {left:[0,29,-1,0],right:[220,29,1,0],top:[110,0,0,-1],bottom:[110,58,0,1]};
  function geometry(a,b,edge={}) {
    const dx=b.x-a.x,dy=b.y-a.y,horizontal=Math.abs(dx)>=Math.abs(dy)*1.6;
    const from=ports[edge.fromPort]||ports[horizontal?(dx>=0?'right':'left'):(dy>=0?'bottom':'top')];
    const to=ports[edge.toPort]||ports[horizontal?(dx>=0?'left':'right'):(dy>=0?'top':'bottom')];
    const x1=a.x+from[0],y1=a.y+from[1],x2=b.x+to[0],y2=b.y+to[1];
    const distance=Math.max(44,Math.min(240,Math.hypot(x2-x1,y2-y1)*.42));
    const cx1=x1+from[2]*distance,cy1=y1+from[3]*distance,cx2=x2+to[2]*distance,cy2=y2+to[3]*distance;
    return {path:`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,mx:(x1+3*cx1+3*cx2+x2)/8,my:(y1+3*cy1+3*cy2+y2)/8,xs:[x1,cx1,cx2,x2],ys:[y1,cy1,cy2,y2]};
  }
  function bounds(d) {
    const curves=d.edges.map(e=>{const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);return a&&b?geometry(a,b,e):{xs:[],ys:[]};});
    const xs=[...d.nodes.flatMap(n=>[n.x,n.x+220]),...curves.flatMap(g=>g.xs)],ys=[...d.nodes.flatMap(n=>[n.y,n.y+58]),...curves.flatMap(g=>g.ys)];
    const x=Math.min(0,...xs)-32,y=Math.min(0,...ys)-32;
    return {x,y,width:Math.max(360,...xs)+32-x,height:Math.max(200,...ys)+32-y};
  }
  const svgStyles = '.sketch-node-body{fill:white;stroke:#d8dce9;stroke-width:1.3}.sketch-node-title{font:600 12px Arial,sans-serif;fill:#33384e}.sketch-node-kind{font:10px Arial,sans-serif}.sketch-link{fill:none;stroke:#9b93bc;stroke-width:1.6}.sketch-label-bg{fill:#fff;stroke:#e6e2f1}.sketch-edge-label{font:11px Arial,sans-serif;fill:#63597b}';
  function svg(d,id,{interactive=false,node=null,edge=null}={}) {
    const marker='sketch-arrow-'+id;
    return `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9b93bc"/></marker></defs>`+
      d.edges.map((e,i)=>{
        const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);if(!a||!b)return '';
        const g=geometry(a,b,e),label=e.label||(interactive?'Подпись связи':''),text=label.length>36?label.slice(0,35)+'…':label,w=clamp(text.length*6.6+20,46,270);
        return `<g ${interactive?`data-edge-index="${i}"`:''}><path class="sketch-link ${edge===i?'is-selected':''}" d="${g.path}" marker-end="url(#${marker})"/>${interactive?`<path class="sketch-link-hit" d="${g.path}"/>`:''}${label?`<rect class="sketch-label-bg" x="${g.mx-w/2}" y="${g.my-12}" width="${w}" height="24" rx="6"/><text class="sketch-edge-label ${!e.label?'is-placeholder':''}" x="${g.mx}" y="${g.my+4}" text-anchor="middle">${esc(text)}</text>`:''}<title>${esc(e.label||'Связь без подписи')}</title></g>`;
      }).join('')+d.nodes.map(n=>{
        const meta=type(n.kind),text=n.label.length>28?n.label.slice(0,27)+'…':n.label;
        return `<g class="sketch-node ${node===n.id?'is-selected':''}" transform="translate(${n.x},${n.y})" ${interactive?`data-node-id="${esc(n.id)}" data-node-kind="${meta.id}" tabindex="0" role="button" aria-label="Блок ${esc(n.label)}"`:''}><rect class="sketch-node-body" width="220" height="58" rx="10"/><path d="M 4 12 L 4 46" style="stroke:${meta.color};stroke-width:4;stroke-linecap:round"/><text class="sketch-node-kind" x="16" y="18" style="fill:${meta.color}">${esc(meta.name)}</text><text class="sketch-node-title" x="16" y="39">${esc(text)}</text><title>${esc(n.label)}</title>${interactive?Object.entries(ports).map(([side,p])=>`<circle class="sketch-port" data-port="${side}" cx="${p[0]}" cy="${p[1]}" r="6" tabindex="0" role="button" aria-label="${esc(n.label)}: связь ${side}"/>`).join(''):''}</g>`;
      }).join('');
  }
  let serial=0;
  class Editor {
    constructor(host,{read,write,notify=()=>{}}) {
      this.host=host;this.write=write;this.notify=notify;this.diagram=clone(read());this.id=++serial;
      this.selected={node:null,edge:null};this.history=[];this.future=[];this.mode='select';this.connectFrom=null;this.drag=null;
      this.camera={x:0,y:0,zoom:1};this.events=new AbortController();
      const shortcuts={undo:['Ctrl+Z','Control+Z Meta+Z'],redo:['Ctrl+Y','Control+Y Control+Shift+Z Meta+Shift+Z'],fullscreen:['F','F']};
      const button=(action,label,title=label)=>{const shortcut=shortcuts[action];return `<button class="btn ${action==='fullscreen'?'sketch-fullscreen-toggle':''}" type="button" data-editor-action="${action}" aria-label="${title}" title="${title}${shortcut?' · '+shortcut[0]:''}" ${shortcut?`aria-keyshortcuts="${shortcut[1]}"`:''}><span>${label}</span>${shortcut?`<kbd aria-hidden="true">${shortcut[0]}</kbd>`:''}</button>`;};
      host.className='sketch-editor';
      host.innerHTML=`<div class="sketch-editor-toolbar" role="toolbar" aria-label="Управление схемой"><div class="sketch-tools">${button('select','Выбор')}${button('pan','Перемещение')}${button('connect','Связать')}</div><div class="sketch-tools">${button('undo','Отменить','Отменить изменение')}${button('redo','Повторить','Повторить изменение')}</div><div class="sketch-tools sketch-view-tools">${button('zoom-out','−','Уменьшить масштаб')}<output data-editor-zoom aria-label="Масштаб">100%</output>${button('zoom-in','+','Увеличить масштаб')}${button('fit','Вместить','Показать всю схему')}${button('fullscreen','На весь экран','Полноэкранный режим')}</div></div><div class="sketch-editor-layout"><aside class="sketch-palette" aria-label="Компоненты архитектуры"><strong>КОМПОНЕНТЫ</strong><p>Перетащите на поле<br>или нажмите</p>${TYPES.map(t=>`<button type="button" class="sketch-palette-item" draggable="true" data-component="${t.id}" aria-label="${t.add}" style="--component-color:${t.color}"><span>${t.name}</span><small>${t.hint}</small></button>`).join('')}</aside><div class="sketch-stage"><div id="sketch-host" class="sketch-canvas" tabindex="0" aria-label="Поле схемы"><svg id="sketch-svg" class="sketch-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Редактор схемы архитектуры"></svg><div class="sketch-empty-state"><strong>Из чего состоит ваша система?</strong><span>Добавьте компонент из палитры.<br>Потяните за точку блока, чтобы создать связь.</span></div></div><div class="sketch-context" aria-label="Выбранный элемент"></div></div></div><p class="sketch-editor-status" id="sketch-status" role="status">Черновик сохраняется автоматически. Перетаскивайте свободное поле для перемещения.</p>`;
      this.canvas=host.querySelector('.sketch-canvas');this.svg=host.querySelector('svg');
      const on=(el,event,fn,options={})=>el.addEventListener(event,fn,{...options,signal:this.events.signal});
      on(host,'click',e=>{const component=e.target.closest('[data-component]');if(component){this.add(component.dataset.component);return;}const action=e.target.closest('[data-editor-action]');if(action)this.action(action.dataset.editorAction);});
      on(host,'submit',e=>{if(e.target.matches('.sketch-edit-form')){e.preventDefault();this.rename(new FormData(e.target).get('label'));}});
      on(host,'dragstart',e=>{const item=e.target.closest('[data-component]');if(item){e.dataTransfer.setData('application/x-atlas-component',item.dataset.component);e.dataTransfer.effectAllowed='copy';}});
      on(this.canvas,'dragover',e=>{if([...e.dataTransfer.types].includes('application/x-atlas-component')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
      on(this.canvas,'drop',e=>{const kind=e.dataTransfer.getData('application/x-atlas-component');if(!TYPES.some(t=>t.id===kind))return;e.preventDefault();const p=this.point(e);this.add(kind,{x:p.x-110,y:p.y-29});});
      on(this.canvas,'pointerdown',e=>this.pointerDown(e));on(this.canvas,'pointermove',e=>this.pointerMove(e));
      on(this.canvas,'pointerup',e=>this.pointerUp(e));on(this.canvas,'pointercancel',()=>this.cancelDrag());
      on(this.canvas,'dblclick',e=>{if(e.target.closest('[data-node-id], [data-edge-index]'))this.host.querySelector('.sketch-edit-form input')?.focus();});
      on(this.canvas,'keydown',e=>this.key(e));
      on(this.canvas,'wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();this.zoom(e.deltaY<0?1.15:1/1.15,e);},{passive:false});
      on(document,'fullscreenchange',()=>this.syncFullscreen());
      on(document,'keydown',e=>this.shortcut(e));
      this.observer=new ResizeObserver(()=>{const size=this.size(),changed=!this.lastSize||Math.abs(size.width-this.lastSize.width)>1||Math.abs(size.height-this.lastSize.height)>1;this.lastSize=size;if(changed)this.fit();else this.resize();});this.observer.observe(this.canvas);
      this.fit();this.render();this.syncFullscreen();
    }
    destroy(){this.events.abort();this.observer.disconnect();}
    point(event){return new DOMPoint(event.clientX,event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());}
    size(){const box=this.canvas.getBoundingClientRect();return {width:Math.max(1,box.width),height:Math.max(1,box.height)};}
    resize(){const s=this.size();this.svg.setAttribute('viewBox',`${this.camera.x} ${this.camera.y} ${s.width/this.camera.zoom} ${s.height/this.camera.zoom}`);this.host.querySelector('[data-editor-zoom]').textContent=Math.round(this.camera.zoom*100)+'%';this.draw();}
    fit(){const s=this.size(),d=this.diagram;if(!d.nodes.length){this.camera={x:0,y:0,zoom:Math.min(1,s.width/920)};return this.resize();}const minX=Math.min(...d.nodes.map(n=>n.x))-48,minY=Math.min(...d.nodes.map(n=>n.y))-48,maxX=Math.max(...d.nodes.map(n=>n.x+220))+48,maxY=Math.max(...d.nodes.map(n=>n.y+58))+48;const zoom=clamp(Math.min(s.width/(maxX-minX),s.height/(maxY-minY),1.2),.2,2);this.camera={zoom,x:(minX+maxX-s.width/zoom)/2,y:(minY+maxY-s.height/zoom)/2};this.resize();}
    zoom(factor,event){const s=this.size(),old=this.camera.zoom,next=clamp(old*factor,.2,2.5),p=event?this.point(event):{x:this.camera.x+s.width/old/2,y:this.camera.y+s.height/old/2};this.camera.x=p.x-(p.x-this.camera.x)*old/next;this.camera.y=p.y-(p.y-this.camera.y)*old/next;this.camera.zoom=next;this.resize();}
    draw(){const s=this.size(),c=this.camera;this.svg.innerHTML=`<defs><pattern id="sketch-grid-${this.id}" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#dcd8ee"/></pattern></defs><rect x="${c.x}" y="${c.y}" width="${s.width/c.zoom}" height="${s.height/c.zoom}" fill="url(#sketch-grid-${this.id})"/>${svg(this.diagram,this.id,{interactive:true,...this.selected})}${this.drag?.type==='link'?`<path class="sketch-link sketch-preview" d="M ${this.drag.start.x} ${this.drag.start.y} L ${this.drag.end.x} ${this.drag.end.y}"/>`:''}`;this.host.querySelector('.sketch-empty-state').hidden=!!this.diagram.nodes.length;this.canvas.dataset.mode=this.mode;}
    render(){this.draw();this.context();for(const b of this.host.querySelectorAll('[data-editor-action]')){const a=b.dataset.editorAction;if(['select','pan','connect'].includes(a))b.setAttribute('aria-pressed',String(a===this.mode));if(a==='undo')b.disabled=!this.history.length;if(a==='redo')b.disabled=!this.future.length;}}
    context(){const box=this.host.querySelector('.sketch-context'),node=this.diagram.nodes.find(n=>n.id===this.selected.node),edge=this.diagram.edges[this.selected.edge];if(!node&&!edge){box.innerHTML='<span class="sketch-context-hint">Выберите блок или стрелку для редактирования. Масштаб: Ctrl + колесо.</span>';return;}const label=node?'Название блока':'Подпись связи',value=node?.label??edge.label;box.innerHTML=`<form class="sketch-edit-form"><label class="x-field">${label}<input name="label" maxlength="${node?60:80}" value="${esc(value)}" placeholder="${node?'Название компонента':'HTTP, SQL или событие'}" ${node?'required':''}></label><button class="btn" type="submit">Применить</button><button class="btn" type="button" data-editor-action="delete" aria-label="Удалить выбранное">Удалить</button></form>`;}
    message(text){this.host.querySelector('#sketch-status').textContent=text;}
    commit(before){if(JSON.stringify(before)===JSON.stringify(this.diagram))return;this.history.push(before);if(this.history.length>40)this.history.shift();this.future=[];this.write(clone(this.diagram));this.render();}
    add(kind,point){if(this.diagram.nodes.length>=30)return this.notify('На схеме может быть до 30 блоков.');const before=clone(this.diagram),meta=type(kind);let position=null;for(let i=0;i<300;i++){const p=point?{x:point.x+(i%5)*40,y:point.y+Math.floor(i/5)*80}:{x:40+(i%4)*260,y:60+Math.floor(i/4)*120};p.x=clamp(Math.round(p.x/20)*20,8,3380);p.y=clamp(Math.round(p.y/20)*20,8,2342);if(!this.diagram.nodes.some(n=>Math.abs(n.x-p.x)<240&&Math.abs(n.y-p.y)<78)){position=p;break;}}if(!position)return this.notify('Освободите место для нового блока.');const count=this.diagram.nodes.filter(n=>n.kind===meta.id).length,id='n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);this.diagram.nodes.push({id,kind:meta.id,label:meta.name+(count?' '+(count+1):''),...position});this.selected={node:id,edge:null};this.commit(before);if(!point)this.fit();this.message('Компонент добавлен. Название можно изменить ниже.');}
    link(from,to,fromPort,toPort){if(from===to)return;const existing=this.diagram.edges.findIndex(e=>e.from===from&&e.to===to);if(existing>=0){this.selected={node:null,edge:existing};this.render();return;}if(this.diagram.edges.length>=90)return this.notify('На схеме может быть до 90 связей.');const before=clone(this.diagram),edge={from,to,label:''};if(ports[fromPort])edge.fromPort=fromPort;if(ports[toPort])edge.toPort=toPort;this.diagram.edges.push(edge);this.selected={node:null,edge:this.diagram.edges.length-1};this.commit(before);this.message('Связь добавлена. Укажите протокол или смысл взаимодействия.');}
    rename(value){const before=clone(this.diagram),node=this.diagram.nodes.find(n=>n.id===this.selected.node),edge=this.diagram.edges[this.selected.edge];if(node&&String(value).trim())node.label=String(value).trim().slice(0,60);else if(edge)edge.label=String(value).trim().slice(0,80);this.commit(before);this.message('Название сохранено.');}
    async action(action){if(['select','pan','connect'].includes(action)){this.mode=action;this.connectFrom=null;this.render();this.message(action==='connect'?'Выберите блок-отправитель, затем блок-получатель.':'Перетащите блок или свободное поле.');return;}if(action==='zoom-in')return this.zoom(1.25);if(action==='zoom-out')return this.zoom(.8);if(action==='fit')return this.fit();if(action==='fullscreen')return this.toggleFullscreen();if(action==='undo'||action==='redo'){const from=action==='undo'?this.history:this.future,to=action==='undo'?this.future:this.history;if(!from.length)return;to.push(clone(this.diagram));this.diagram=from.pop();this.selected={node:null,edge:null};this.write(clone(this.diagram));this.render();return;}if(action==='delete'){const before=clone(this.diagram);if(this.selected.node){this.diagram.nodes=this.diagram.nodes.filter(n=>n.id!==this.selected.node);this.diagram.edges=this.diagram.edges.filter(e=>e.from!==this.selected.node&&e.to!==this.selected.node);}else if(this.selected.edge!==null)this.diagram.edges.splice(this.selected.edge,1);this.selected={node:null,edge:null};this.commit(before);}}
    pointerDown(e){if(e.button!==0&&e.button!==1)return;e.preventDefault();const element=e.target.closest('[data-node-id]'),edge=e.target.closest('[data-edge-index]'),port=e.target.closest('[data-port]');if(element&&this.mode!=='pan'&&e.button!==1){const node=this.diagram.nodes.find(n=>n.id===element.dataset.nodeId);this.selected={node:node.id,edge:null};if(port){const p=ports[port.dataset.port];this.drag={type:'link',id:node.id,port:port.dataset.port,start:{x:node.x+p[0],y:node.y+p[1]},end:this.point(e)};}else if(this.mode==='connect'){if(this.connectFrom){this.link(this.connectFrom,node.id);this.connectFrom=null;this.mode='select';this.render();return;}this.connectFrom=node.id;this.message('Теперь выберите блок-получатель.');}else{const p=this.point(e);this.drag={type:'node',id:node.id,offset:{x:p.x-node.x,y:p.y-node.y},before:clone(this.diagram)};}}else if(edge&&this.mode!=='pan'){this.selected={node:null,edge:Number(edge.dataset.edgeIndex)};}else{this.selected={node:null,edge:null};this.drag={type:'pan',x:e.clientX,y:e.clientY,camera:{...this.camera}};}this.canvas.focus({preventScroll:true});if(this.drag)this.canvas.setPointerCapture(e.pointerId);this.render();}
    pointerMove(e){const drag=this.drag;if(!drag)return;if(drag.type==='pan'){this.camera.x=drag.camera.x-(e.clientX-drag.x)/this.camera.zoom;this.camera.y=drag.camera.y-(e.clientY-drag.y)/this.camera.zoom;this.resize();return;}const p=this.point(e);if(drag.type==='link')drag.end=p;else{const n=this.diagram.nodes.find(n=>n.id===drag.id);n.x=clamp(Math.round((p.x-drag.offset.x)/20)*20,8,3380);n.y=clamp(Math.round((p.y-drag.offset.y)/20)*20,8,2342);}this.draw();}
    pointerUp(e){const drag=this.drag;if(!drag)return;this.drag=null;if(drag.type==='link'){const target=document.elementFromPoint(e.clientX,e.clientY),node=target?.closest('[data-node-id]');if(node)this.link(drag.id,node.dataset.nodeId,drag.port,target.closest('[data-port]')?.dataset.port);}else if(drag.type==='node')this.commit(drag.before);if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.render();}
    cancelDrag(){if(this.drag?.type==='node')this.diagram=this.drag.before;this.drag=null;this.render();}
    expanded(){return document.fullscreenElement===this.host||this.host.classList.contains('sketch-expanded');}
    syncFullscreen(){
      const expanded=this.expanded(),button=this.host.querySelector('[data-editor-action="fullscreen"]');
      button.setAttribute('aria-pressed',String(expanded));button.querySelector('span').textContent=expanded?'Выйти из полного экрана':'На весь экран';
      button.querySelector('kbd').textContent=expanded?'Esc':'F';button.title=expanded?'Выйти из полного экрана · Esc':'На весь экран · F';button.setAttribute('aria-keyshortcuts',expanded?'F Escape':'F');
      this.resize();
    }
    async toggleFullscreen(){
      if(this.expanded()){
        if(document.fullscreenElement===this.host)try{await document.exitFullscreen();}catch{}
        this.host.classList.remove('sketch-expanded');
      }else{
        try{await this.host.requestFullscreen();}catch{this.host.classList.add('sketch-expanded');}
      }
      this.syncFullscreen();this.canvas.focus({preventScroll:true});
    }
    shortcut(e){
      if(e.defaultPrevented||e.isComposing||e.altKey||!this.host.isConnected||this.host.closest('.app')?.inert||document.querySelector('dialog[open]'))return;
      const rect=this.host.getBoundingClientRect();if(!this.expanded()&&(rect.bottom<=0||rect.top>=document.documentElement.clientHeight))return;
      const editing=e.target.isContentEditable||e.target.closest?.('input,textarea,select');
      if(e.key==='Escape'){
        if(this.expanded()){e.preventDefault();this.toggleFullscreen();}
        this.connectFrom=null;this.mode='select';this.cancelDrag();return;
      }
      if(editing)return;
      const code=e.code||('Key'+e.key.toUpperCase());
      if((e.ctrlKey||e.metaKey)&&(code==='KeyZ'||code==='KeyY')){
        e.preventDefault();if(this.drag){this.cancelDrag();return;}
        this.action(code==='KeyY'||e.shiftKey?'redo':'undo');return;
      }
      if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&code==='KeyF'&&!e.repeat){e.preventDefault();this.toggleFullscreen();}
    }
    key(e){const target=e.target.closest('[data-node-id]'),node=this.diagram.nodes.find(n=>n.id===(target?.dataset.nodeId||this.selected.node));if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.action('delete');return;}if(!node)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const before=clone(this.diagram),step=e.shiftKey?40:20;node.x=clamp(node.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),8,3380);node.y=clamp(node.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),8,2342);this.selected={node:node.id,edge:null};this.commit(before);this.svg.querySelector(`[data-node-id="${node.id}"]`)?.focus();}if(e.key==='Enter'||e.key===' '){e.preventDefault();if(e.target.closest('[data-port]')||this.mode==='connect'){if(this.connectFrom){this.link(this.connectFrom,node.id);this.connectFrom=null;}else{this.connectFrom=node.id;this.mode='connect';this.message('Выберите получателя клавишей Tab и нажмите Enter.');}}else{this.selected={node:node.id,edge:null};this.context();this.host.querySelector('.sketch-edit-form input')?.focus();}}}
  }
  window.AtlasDiagramEditor=Object.freeze({create:(host,options)=>new Editor(host,options),geometry,bounds,svg,svgStyles,kinds:TYPES.map(t=>t.id)});
})();
