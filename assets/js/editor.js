(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const frame=$('sitePreview'),frameWrap=$('frameWrap'),toastEl=$('toast');
  const controls={text:$('textEditor'),font:$('elementFontSize'),radius:$('elementRadius'),color:$('elementColor'),background:$('elementBackground'),padding:$('elementPadding'),margin:$('elementMargin'),align:$('elementAlign'),layout:$('elementLayout'),gap:$('elementGap'),columns:$('elementColumns')};
  const rangeMap={maxWidth:['maxWidthOutput','px'],sidebarWidth:['sidebarWidthOutput','px'],sectionGap:['sectionGapOutput','px'],cardRadius:['cardRadiusOutput','px'],heroSize:['heroSizeOutput','px'],photoRadius:['photoRadiusOutput','px']};
  const draftKey='dzy-visual-editor-draft-v1';
  const markerStart='/* VISUAL_EDITOR_OVERRIDES_START */',markerEnd='/* VISUAL_EDITOR_OVERRIDES_END */';
  let frameDoc=null,selected=null,directoryHandle=null,pendingPhoto=null,localCss='',overrides={},history=[],future=[],restoring=false,draftLoaded=false,historyTimer=null;

  function toast(message,error=false){toastEl.textContent=message;toastEl.className='toast show'+(error?' error':'');clearTimeout(toastEl.timer);toastEl.timer=setTimeout(()=>toastEl.className='toast',2800)}
  function toHex(value,fallback='#edf6ff'){if(!value||value==='transparent')return fallback;const m=value.match(/[\d.]+/g);if(!m||m.length<3)return value.startsWith('#')?value:fallback;return '#'+m.slice(0,3).map(n=>Math.round(Number(n)).toString(16).padStart(2,'0')).join('')}
  function pxNumber(value){const n=parseFloat(value);return Number.isFinite(n)?Math.round(n):''}
  function safeFilename(file){const type=file.type;return type==='image/png'?'profile-photo.png':type==='image/webp'?'profile-photo.webp':'profile-photo.jpg'}
  function escapeCss(value){return String(value).replace(/[{}]/g,'')}

  function generatedCss(){
    const vars=Object.entries(overrides.variables||{}).map(([k,v])=>`${k}:${escapeCss(v)}`).join(';');
    const width=overrides.maxWidth||1180,side=overrides.sidebarWidth||315,gap=overrides.sectionGap||70,radius=overrides.cardRadius||16,hero=overrides.heroSize||43,photo=overrides.photoRadius||36,educationColumns=overrides.educationColumns||1,projectColumns=overrides.projectColumns||1;
    return `${markerStart}\n[data-theme="dark"]{${vars}}\n.wrapper,.nav-container{max-width:${width}px}\n@media(min-width:981px){.sidebar{width:${side}px}.content{width:calc(100% - ${side}px);margin-left:${side}px}}\n.section{margin-bottom:${gap}px}.info-card,.project-card{border-radius:${radius}px}.hero h2{font-size:${hero}px}.profile-photo{border-radius:${photo}px}\n@media(min-width:681px){.education-grid{grid-template-columns:repeat(${educationColumns},minmax(0,1fr))}.project-grid{grid-template-columns:repeat(${projectColumns},minmax(0,1fr))}.info-card,.info-card:first-child,.project-card,.project-card:last-child{grid-column:auto}}\n${markerEnd}`;
  }
  function runtimeCss(){return `
    ${generatedCss()}
    .editor-selected{outline:3px solid #ffbf47!important;outline-offset:3px!important;position:relative}
    [data-editor-hidden="true"]{display:block!important;opacity:.22!important;filter:grayscale(1)!important}
    body *{cursor:default} h1,h2,h3,p,small,a,span,img,.info-card,.project-card,.timeline-card,.compact-item,.skill-block,section,footer{cursor:pointer}
  `}
  function applyRuntimeCss(){if(!frameDoc)return;let style=frameDoc.getElementById('visual-editor-runtime');if(!style){style=frameDoc.createElement('style');style.id='visual-editor-runtime';frameDoc.head.appendChild(style)}style.textContent=runtimeCss()}

  function sanitizeHtml(){
    if(!frameDoc)return '';
    const clone=frameDoc.documentElement.cloneNode(true);
    clone.removeAttribute('data-theme');clone.removeAttribute('style');
    clone.querySelector('#visual-editor-runtime')?.remove();clone.querySelector('#editor-local-site-css')?.remove();clone.querySelector('#editor-base')?.remove();
    clone.querySelectorAll('.editor-selected').forEach(el=>el.classList.remove('editor-selected'));
    clone.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));
    clone.querySelectorAll('[data-editor-hidden]').forEach(el=>el.removeAttribute('data-editor-hidden'));
    clone.querySelectorAll('[data-editor-photo-src]').forEach(el=>{el.setAttribute('src',el.getAttribute('data-editor-photo-src'));el.removeAttribute('data-editor-photo-src')});
    clone.querySelectorAll('.section.visible').forEach(el=>el.classList.remove('visible'));
    return '<!doctype html>\n'+clone.outerHTML;
  }
  function snapshot(){return {html:sanitizeHtml(),overrides:JSON.parse(JSON.stringify(overrides))}}
  function snapshotKey(s){return s.html+'|'+JSON.stringify(s.overrides)}
  function pushHistory(){if(restoring||!frameDoc)return;const snap=snapshot(),last=history[history.length-1];if(!last||snapshotKey(last)!==snapshotKey(snap)){history.push(snap);if(history.length>40)history.shift();future=[];updateHistoryButtons();saveDraftSilently()}}
  function scheduleHistory(){clearTimeout(historyTimer);historyTimer=setTimeout(pushHistory,350)}
  function updateHistoryButtons(){$('undoButton').disabled=history.length<2;$('redoButton').disabled=future.length===0}
  function restoreSnapshot(snap){restoring=true;overrides=JSON.parse(JSON.stringify(snap.overrides||{}));syncGlobalControls();selected=null;frame.srcdoc=snap.html}

  function initFrame(){
    frameDoc=frame.contentDocument;if(!frameDoc)return;
    applyRuntimeCss();
    frameDoc.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();selectElement(pickTarget(event.target))},true);
    frameDoc.addEventListener('submit',event=>event.preventDefault(),true);
    if(restoring){restoring=false}else if(!history.length){pushHistory()}
    updateSelectionPanel();
  }
  function pickTarget(target){
    if(!target||['HTML','BODY','SCRIPT','STYLE'].includes(target.tagName))return null;
    if(target.closest('.theme-toggle'))return null;
    if(target.tagName==='I')target=target.parentElement;
    const card=target.closest('.info-card,.project-card,.timeline-card,.compact-item,.skill-block,.award-list>div');
    const text=target.closest('h1,h2,h3,p,small,a,span,img');
    return text||card||target.closest('section,footer')||target;
  }
  function selectElement(element){
    if(selected)selected.classList.remove('editor-selected');selected=element;
    if(selected){selected.classList.add('editor-selected');selected.scrollIntoView({block:'nearest',behavior:'smooth'})}
    updateSelectionPanel();
  }
  function elementPath(el){if(!el)return '';const parts=[];let node=el;while(node&&node!==frameDoc.body){let part=node.tagName.toLowerCase();if(node.id)part+='#'+node.id;else if(node.classList.length)part+='.'+[...node.classList].filter(x=>x!=='editor-selected').slice(0,2).join('.');parts.unshift(part);node=node.parentElement}return parts.join(' › ')}
  function textBinding(el){
    if(!el||el.tagName==='IMG')return {mode:'disabled',value:''};
    if(el.children.length===0)return {mode:'all',value:el.textContent.trim()};
    const direct=[...el.childNodes].filter(node=>node.nodeType===3&&node.nodeValue.trim());
    const inline=[...el.children].every(child=>['SPAN','STRONG','EM','B','I','BR'].includes(child.tagName));
    if(inline&&el.children.length===1&&direct.length===1)return {mode:'direct',node:direct[0],value:direct[0].nodeValue.trim()};
    return {mode:'disabled',value:''};
  }
  function gridColumnCount(style){if(style.display!=='grid'||!style.gridTemplateColumns||style.gridTemplateColumns==='none')return 2;return Math.max(1,style.gridTemplateColumns.split(' ').length)}
  function updateSelectionPanel(){
    const empty=$('selectionEmpty'),panel=$('selectionControls');
    if(!selected||!frameDoc?.contains(selected)){empty.hidden=false;panel.hidden=true;return}
    empty.hidden=true;panel.hidden=false;$('selectedPath').textContent=elementPath(selected);
    const binding=textBinding(selected);selected._editorTextBinding=binding;
    controls.text.disabled=binding.mode==='disabled';controls.text.value=binding.value;controls.text.placeholder=controls.text.disabled?'该元素包含多个内容块，请点击内部文字':'输入文字内容';
    const style=frame.contentWindow.getComputedStyle(selected);controls.font.value=pxNumber(style.fontSize);controls.radius.value=pxNumber(style.borderRadius);controls.color.value=toHex(style.color);controls.background.value=toHex(style.backgroundColor,'#0b2038');controls.padding.value=pxNumber(style.paddingTop);controls.margin.value=pxNumber(style.marginTop);controls.align.value=['left','center','right'].includes(style.textAlign)?style.textAlign:'';
    controls.layout.value=style.display==='grid'?'grid':style.display==='flex'?(style.flexDirection==='column'?'column':'row'):'';controls.gap.value=pxNumber(style.gap);controls.columns.value=gridColumnCount(style);
    $('toggleVisibility').textContent=selected.dataset.editorHidden==='true'?'显示':'隐藏';
  }

  function setStyle(property,value,unit=''){if(!selected)return;selected.style[property]=value===''?'':value+unit;scheduleHistory()}
  controls.text.addEventListener('input',()=>{if(!selected||controls.text.disabled)return;const binding=selected._editorTextBinding;if(binding.mode==='all')selected.textContent=controls.text.value;else if(binding.mode==='direct'){const leading=binding.node.nodeValue.match(/^\s*/)?.[0]||'';const trailing=binding.node.nodeValue.match(/\s*$/)?.[0]||'';binding.node.nodeValue=leading+controls.text.value+trailing}scheduleHistory()});
  controls.font.addEventListener('input',()=>setStyle('fontSize',controls.font.value,'px'));controls.radius.addEventListener('input',()=>setStyle('borderRadius',controls.radius.value,'px'));
  controls.color.addEventListener('input',()=>setStyle('color',controls.color.value));controls.background.addEventListener('input',()=>setStyle('backgroundColor',controls.background.value));
  controls.padding.addEventListener('input',()=>setStyle('padding',controls.padding.value,'px'));controls.margin.addEventListener('input',()=>setStyle('margin',controls.margin.value,'px'));controls.align.addEventListener('change',()=>setStyle('textAlign',controls.align.value));
  controls.layout.addEventListener('change',()=>{if(!selected)return;const value=controls.layout.value;if(!value){selected.style.display='';selected.style.flexDirection='';selected.style.flexWrap='';selected.style.gridTemplateColumns=''}else if(value==='grid'){selected.style.display='grid';selected.style.flexDirection='';selected.style.flexWrap='';selected.style.gridTemplateColumns=`repeat(${controls.columns.value||2}, minmax(0, 1fr))`}else{selected.style.display='flex';selected.style.flexDirection=value;selected.style.flexWrap=value==='row'?'wrap':'';selected.style.gridTemplateColumns=''}scheduleHistory()});
  controls.gap.addEventListener('input',()=>setStyle('gap',controls.gap.value,'px'));controls.columns.addEventListener('input',()=>{if(selected&&controls.layout.value==='grid')setStyle('gridTemplateColumns',`repeat(${controls.columns.value||2}, minmax(0, 1fr))`)});
  $('clearInlineStyles').addEventListener('click',()=>{if(!selected)return;selected.removeAttribute('style');selected.removeAttribute('data-editor-hidden');applyRuntimeCss();updateSelectionPanel();pushHistory();toast('已清除自定义样式')});
  $('toggleVisibility').addEventListener('click',()=>{if(!selected)return;const hidden=selected.dataset.editorHidden!=='true';selected.dataset.editorHidden=String(hidden);selected.style.display=hidden?'none':'';$('toggleVisibility').textContent=hidden?'显示':'隐藏';pushHistory()});
  function moveSelected(direction){if(!selected)return;const parent=selected.parentElement;if(direction<0&&selected.previousElementSibling)parent.insertBefore(selected,selected.previousElementSibling);if(direction>0&&selected.nextElementSibling)parent.insertBefore(selected.nextElementSibling,selected);pushHistory();selected.scrollIntoView({block:'nearest'})}
  $('moveUp').addEventListener('click',()=>moveSelected(-1));$('moveDown').addEventListener('click',()=>moveSelected(1));
  $('selectParent').addEventListener('click',()=>{if(selected?.parentElement&&selected.parentElement!==frameDoc.body)selectElement(selected.parentElement)});

  document.querySelectorAll('[data-variable]').forEach(input=>input.addEventListener('input',()=>{overrides.variables=overrides.variables||{};overrides.variables[input.dataset.variable]=input.value;applyRuntimeCss();scheduleHistory()}));
  ['educationColumns','projectColumns'].forEach(id=>$(id).addEventListener('change',()=>{overrides[id]=Number($(id).value);applyRuntimeCss();pushHistory()}));
  Object.keys(rangeMap).forEach(id=>{$(id).addEventListener('input',()=>{overrides[id]=Number($(id).value);$(rangeMap[id][0]).textContent=$(id).value+rangeMap[id][1];applyRuntimeCss();scheduleHistory()})});
  function syncGlobalControls(){
    document.querySelectorAll('[data-variable]').forEach(input=>{if(overrides.variables?.[input.dataset.variable])input.value=overrides.variables[input.dataset.variable]});
    Object.keys(rangeMap).forEach(id=>{if(overrides[id]!=null)$(id).value=overrides[id];$(rangeMap[id][0]).textContent=$(id).value+rangeMap[id][1]});
    ['educationColumns','projectColumns'].forEach(id=>{$(id).value=String(overrides[id]||1)});applyRuntimeCss()
  }

  document.querySelectorAll('.viewport-button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.viewport-button').forEach(x=>x.classList.remove('active'));button.classList.add('active');frameWrap.style.width=button.dataset.width;$('previewWidthLabel').textContent=button.dataset.width==='100%'?'自适应桌面':button.dataset.width}));
  $('previewTheme').addEventListener('click',()=>{if(!frameDoc)return;frameDoc.documentElement.dataset.theme=frameDoc.documentElement.dataset.theme==='light'?'dark':'light'});
  $('undoButton').addEventListener('click',()=>{if(history.length<2)return;future.push(history.pop());restoreSnapshot(history[history.length-1]);updateHistoryButtons()});
  $('redoButton').addEventListener('click',()=>{if(!future.length)return;const snap=future.pop();history.push(snap);restoreSnapshot(snap);updateHistoryButtons()});

  async function getProjectFiles(handle){const index=await handle.getFileHandle('index.html');const assets=await handle.getDirectoryHandle('assets');const cssDir=await assets.getDirectoryHandle('css');const css=await cssDir.getFileHandle('theme-luka.css');return {index,assets,css}}
  async function connectProject(){
    if(!window.showDirectoryPicker){toast('当前浏览器不支持文件夹直存，请使用 Chrome 或 Edge',true);return}
    try{const handle=await window.showDirectoryPicker({mode:'readwrite'});const files=await getProjectFiles(handle);directoryHandle=handle;const indexText=await (await files.index.getFile()).text();localCss=await (await files.css.getFile()).text();$('connectionDot').classList.add('connected');$('connectionText').textContent='已连接：'+handle.name;loadLocalPreview(indexText,localCss);toast('项目已连接，可直接保存')}catch(error){if(error.name!=='AbortError'){console.error(error);toast('所选文件夹不是有效主页项目',true)}}
  }
  function loadLocalPreview(html,css){const withBase=html.replace(/<head>/i,'<head><base id="editor-base" href="./">').replace(/<\/head>/i,`<style id="editor-local-site-css">${css}</style></head>`);restoring=true;selected=null;frame.srcdoc=withBase;history=[];future=[];setTimeout(()=>{restoring=false;pushHistory()},250)}
  $('connectButton').addEventListener('click',connectProject);

  async function writeText(handle,text){const writer=await handle.createWritable();await writer.write(text);await writer.close()}
  function stripOverrideBlock(css){const start=css.indexOf(markerStart),end=css.indexOf(markerEnd);if(start<0||end<0)return css.trimEnd();return (css.slice(0,start)+css.slice(end+markerEnd.length)).trimEnd()}
  async function saveProject(){
    try{if(!directoryHandle){await connectProject();if(!directoryHandle)return}const files=await getProjectFiles(directoryHandle);const cleanHtml=sanitizeHtml();let cssText=await (await files.css.getFile()).text();cssText=stripOverrideBlock(cssText)+'\n\n'+generatedCss()+'\n';await writeText(files.index,cleanHtml);await writeText(files.css,cssText);if(pendingPhoto){const imgDir=await files.assets.getDirectoryHandle('img');const photoHandle=await imgDir.getFileHandle(pendingPhoto.name,{create:true});const writer=await photoHandle.createWritable();await writer.write(pendingPhoto.file);await writer.close();pendingPhoto=null}localStorage.removeItem(draftKey);toast('已保存到本地项目，请提交并推送');pushHistory()}catch(error){console.error(error);toast('保存失败，请重新连接项目文件夹',true)}
  }
  $('saveButton').addEventListener('click',saveProject);

  $('photoInput').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file||!frameDoc)return;const photo=frameDoc.querySelector('.profile-photo');if(!photo){toast('预览中未找到个人照片',true);return}const name=safeFilename(file);pendingPhoto={file,name};photo.dataset.editorPhotoSrc='assets/img/'+name;photo.src=URL.createObjectURL(file);selectElement(photo);pushHistory();toast('照片已加入待保存内容')});

  function saveDraftSilently(){try{localStorage.setItem(draftKey,JSON.stringify(snapshot()))}catch(error){console.warn(error)}}
  $('saveDraft').addEventListener('click',()=>{saveDraftSilently();toast('草稿已保存在当前浏览器')});
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
  $('exportHtml').addEventListener('click',()=>download('index.html',sanitizeHtml(),'text/html;charset=utf-8'));
  $('exportCss').addEventListener('click',()=>download('visual-editor-overrides.css',generatedCss(),'text/css;charset=utf-8'));
  $('resetButton').addEventListener('click',()=>{if(!confirm('确定放弃当前浏览器草稿并重新载入线上主页吗？'))return;localStorage.removeItem(draftKey);history=[];future=[];overrides={};selected=null;frame.removeAttribute('srcdoc');frame.src='index.html?visual-editor='+(Date.now());toast('已重新载入主页')});

  frame.addEventListener('load',()=>{if(!draftLoaded&&!frame.srcdoc){const saved=localStorage.getItem(draftKey);if(saved){try{const draft=JSON.parse(saved);draftLoaded=true;overrides=draft.overrides||{};syncGlobalControls();restoring=true;frame.srcdoc=draft.html;return}catch(error){localStorage.removeItem(draftKey)}}}initFrame()});
  window.addEventListener('beforeunload',saveDraftSilently);
})();
