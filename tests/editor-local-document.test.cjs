const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
function load(file,mocks={}) {
 const cache=new Map();
 const read=file=>{if(cache.has(file))return cache.get(file).exports;const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});assert.equal(compiled.diagnostics.length,0);const mod={exports:{}};cache.set(file,mod);const req=name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return read(base+['.ts','.tsx'].find(ext=>fs.existsSync(path.join(root,base+ext))));}return require(name);};new Function('require','module','exports',compiled.outputText)(req,mod,mod.exports);return mod.exports;};return read(file);
}
const mocks={'@/components/tailoring/ReviewContent':{readableLabel:key=>key}};
const {CvEditorSession}=load('lib/editor/session.ts'),{parseEditorDocument}=load('lib/editor/types.ts');
const {liveDocumentPayload,liveDocumentHtml,safeResumeHtml,serializeLivePayload}=load('lib/editor/liveDocument.ts',mocks);
const {applyTemplatePreset,supportsLiveTemplate}=load('lib/editor/documentTheme.ts');
const {fieldAt,replaceField}=load('lib/editor/fieldBindings.ts');
const layout=()=>({template:'swiss-single',pageSize:'A4',margins:{top:10,bottom:10,left:10,right:10},spacing:{section:3,item:2,lineHeight:3},fontSize:{base:3,headerScale:3,headerFont:'serif',bodyFont:'sans-serif'},compactMode:false,showContactIcons:false,accentColor:'blue',future:{retain:true}});
const resume=()=>({personalInfo:{name:'Sample Applicant',email:'sample@example.test'},summary:'A complete summary.',workExperience:[{id:1,title:'Engineer',company:'Example',years:'2021–Present',description:['A complete <strong>original</strong> bullet.'],descriptionStyles:['plain'],unknown:'Retain this'}],additional:{technicalSkills:['TypeScript'],languages:['English']},customSections:{notes:{sectionType:'text',text:'Keep the custom section.'}},sectionMeta:[{key:'notes',order:2,displayName:'Volunteering',isVisible:true},{key:'additional',order:4,displayName:'Skills',isVisible:true}]});
const document=()=>({tailoring_id:'saved-id',revision:4,updated_at:'now',resume:resume(),layout:layout(),layout_options:{templates:['swiss-single','clean','modern','latex'],page_sizes:['A4','LETTER']},confirmed_skills:[],job:{title:null,company:null,description:'Job'},analysis:null});
const options={editable:true,selectedKey:'summary',offset:0,background:'#18181b',accent:'#6547ff'};
function harness(config={}){
 let stored=config.raw??null,remote=document(),number=0;const saves=[],analyses=[],writes=[];
 const deps={read:async()=>stored,write:async raw=>{stored=raw;writes.push(JSON.parse(raw));},parseDocument:parseEditorDocument,uuid:()=>`mutation-${++number}`,onState:()=>{},load:async()=>clone(remote),save:async body=>{
  saves.push(clone(body));assert.ok(writes.some(w=>w.pending?.mutation_id===body.mutation_id));
  if(config.save)return config.save(body);
  remote={...remote,revision:remote.revision+1,resume:clone(body.resume),layout:clone(body.layout??remote.layout),confirmed_skills:clone(body.confirmed_skills)};return clone(remote);
 },analyze:async revision=>{analyses.push(revision);return {revision,status:'unavailable',score:null};}};
 return {session:new CvEditorSession(deps),deps,saves,analyses,get stored(){return stored;},get remote(){return remote;},set remote(value){remote=value;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('all ten templates, paper sizes, text sizes and margins update locally without scheduling a save or score',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();
 for(const template of ['swiss-single','swiss-two-column','clean','modern','modern-two-column','latex','vivid','vivid-single','modern-deedy','deedy'])for(const pageSize of ['A4','LETTER'])for(const base of [1,3,5])for(const margin of [5,12,25]){
  const next={...applyTemplatePreset(h.session.snapshot.layoutDraft,template),pageSize,fontSize:{...h.session.snapshot.layoutDraft.fontSize,base},margins:{top:margin,bottom:margin,left:margin,right:margin,retained:7}};
  h.session.updateLayoutDraft(next);
  const canvas=liveDocumentPayload(h.session.snapshot.resume,h.session.snapshot.layoutDraft,options);
  assert.match(canvas.markup,new RegExp(`class="${template}"`));assert.equal(canvas.paperWidth,pageSize==='LETTER'?816:210*96/25.4);
  assert.equal(h.session.snapshot.saveState,'saved');assert.deepEqual(h.session.snapshot.layout,layout());assert.deepEqual(h.session.snapshot.document.layout,layout());
 }
 await new Promise(resolve=>setTimeout(resolve,1900));
 assert.equal(h.saves.length,0);assert.equal(h.analyses.length,0);assert.equal((await h.session.flush()).revision,4);
 assert.equal(h.saves.length,0);assert.deepEqual(JSON.parse(h.stored).layoutDraft,h.session.snapshot.layoutDraft);
});

test('long Summary and rich Experience edits save and reopen while the layout trial remains separate',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();
 const draft={...layout(),template:'modern',pageSize:'LETTER',margins:{...layout().margins,left:18},fontSize:{...layout().fontSize,base:5}};
 h.session.updateLayoutDraft(draft);
 const summary='Complete details and evidence. '.repeat(90)+'\nA final line.';
 const bullet='<strong>Led delivery</strong> with <em>research</em> and <a href="https://example.test">measured results</a>. '.repeat(10);
 const experience=replaceField(h.session.snapshot.resume.workExperience,[0,'description',0],bullet);
 h.session.update({...h.session.snapshot.resume,summary,workExperience:experience});
 h.session.updateWorkspace({tool:'content',trayOpen:true,sectionKey:'workExperience',fieldPath:[0,'description',0],fieldLabel:'Experience bullet 1',documentOffset:465});
 const saved=await h.session.flush();assert.equal(saved.resume.summary,summary);assert.equal(saved.resume.workExperience[0].description[0],bullet);
 assert.deepEqual(h.saves[0].layout,layout());assert.deepEqual(h.session.snapshot.layoutDraft,draft);
 const rendered=liveDocumentPayload(h.session.snapshot.resume,draft,options);assert.ok(rendered.markup.includes(summary));assert.match(rendered.markup,/<strong>Led delivery<\/strong>/);
 h.session.dispose();const reopened=new CvEditorSession(h.deps);t.after(()=>reopened.dispose());await reopened.restore();
 assert.equal(reopened.snapshot.resume.summary,summary);assert.equal(fieldAt(reopened.snapshot.resume.workExperience,[0,'description',0]),bullet);
 assert.deepEqual(reopened.snapshot.layoutDraft,draft);assert.equal(reopened.snapshot.layoutDraftDirty,true);assert.equal(reopened.snapshot.workspace.documentOffset,465);assert.deepEqual(reopened.snapshot.workspace.fieldPath,[0,'description',0]);assert.equal(reopened.snapshot.resume.workExperience[0].unknown,'Retain this');
});

test('PDF explicitly saves the chosen layout through the shared revision writer after pending text',async(t)=>{
 let release,remote=document();const h=harness({save:async body=>{if(body.expected_revision===4)await new Promise(resolve=>release=resolve);remote={...remote,revision:remote.revision+1,resume:clone(body.resume),layout:clone(body.layout)};return clone(remote);}});t.after(()=>h.session.dispose());await h.session.restore();
 h.session.update({...h.session.snapshot.resume,summary:'Typing in progress'});const saving=h.session.flush();while(!release)await tick();
 const chosen={...layout(),template:'clean',pageSize:'LETTER',fontSize:{...layout().fontSize,base:4},margins:{...layout().margins,top:18}};
 h.session.updateLayoutDraft(chosen);h.session.updateWorkspace({tool:'format',trayOpen:true,documentOffset:300});
 const pdf=h.session.saveForPdf();release();await saving;const acknowledged=await pdf;
 assert.deepEqual(h.saves.map(s=>s.expected_revision),[4,5]);assert.deepEqual(h.saves[0].layout,layout());assert.deepEqual(h.saves[1].layout,chosen);assert.equal(acknowledged.revision,6);assert.equal(acknowledged.resume.summary,'Typing in progress');assert.deepEqual(acknowledged.layout,chosen);
 assert.equal(h.session.snapshot.layoutDraftDirty,false);assert.equal(h.session.snapshot.workspace.tool,'format');assert.equal(h.session.snapshot.workspace.documentOffset,300);assert.equal(h.analyses.length,0);
});

test('ambiguous explicit PDF saves replay the same receipt, retain newer trials and preserve the editor workspace',async(t)=>{
 const h=harness({save:async()=>{throw Error('Disconnected');}});t.after(()=>h.session.dispose());await h.session.restore();const chosen={...layout(),template:'modern'};
 h.session.updateLayoutDraft(chosen);h.session.updateWorkspace({tool:'templates',trayOpen:true,documentOffset:220});
 assert.equal(await h.session.saveForPdf(),null);const receipt=JSON.parse(h.stored).pending;assert.deepEqual(receipt.layout,chosen);
 h.session.updateLayoutDraft({...chosen,pageSize:'LETTER'});h.session.dispose();await tick();let remote=document(),replayed=[];
 const reopened=new CvEditorSession({...h.deps,save:async body=>{replayed.push(clone(body));remote={...remote,revision:remote.revision+1,resume:clone(body.resume),layout:clone(body.layout)};return clone(remote);}});t.after(()=>reopened.dispose());await reopened.restore();
 reopened.update({...reopened.snapshot.resume,summary:'Later text edit'});await reopened.flush();
 assert.deepEqual(replayed[0],receipt);assert.equal(replayed.at(-1).layout.pageSize,'A4');assert.equal(reopened.snapshot.layoutDraft.pageSize,'LETTER');assert.equal(reopened.snapshot.workspace.documentOffset,220);
 const pdf=await reopened.saveForPdf();assert.equal(pdf.layout.pageSize,'LETTER');assert.equal(pdf.resume.summary,'Later text edit');assert.equal(reopened.snapshot.layoutDraftDirty,false);
});

test('remote refresh preserves a local layout trial without creating a content conflict or leaking it into Job Match saves',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();h.session.updateLayoutDraft({...layout(),template:'clean'});
 h.remote={...document(),revision:5,layout:{...layout(),pageSize:'LETTER'}};await h.session.refresh();assert.equal(h.session.snapshot.saveState,'saved');assert.equal(h.session.snapshot.layout.pageSize,'LETTER');assert.equal(h.session.snapshot.layoutDraft.template,'clean');
 h.session.update({...h.session.snapshot.resume,summary:'Latest text'});await h.session.refreshAnalysis();assert.equal(h.saves[0].layout.template,'swiss-single');assert.equal(h.analyses.length,1);assert.equal(h.session.snapshot.layoutDraft.template,'clean');
});

test('a damaged layout trial never discards a recoverable content mutation',async(t)=>{
 const doc=document(),pending={expected_revision:4,mutation_id:'saved-receipt',resume:{...doc.resume,summary:'Recovered'},layout:doc.layout,confirmed_skills:[]};
 const raw=JSON.stringify({version:1,document:doc,resume:pending.resume,layout:doc.layout,confirmedSkills:[],dirty:true,pending,layoutDraft:{template:'damaged'},layoutDraftDirty:true});
 const h=harness({raw});t.after(()=>h.session.dispose());await h.session.restore();await h.session.flush();assert.deepEqual(h.saves[0],pending);assert.equal(h.session.snapshot.resume.summary,'Recovered');
});

test('live markup retains ordered custom sections and bullet styles, safely renders marks and never emits executable resume HTML',()=>{
 const data=resume();data.summary='<script>plain summary</script>';data.workExperience[0].description[0]='<script>alert(1)</script><img src=x onerror=alert(1)><b>Kept</b> <a href="javascript:alert(1)">unsafe link</a><a href="https://example.test?q=1&amp;x=2">safe</a>';
 const markup=liveDocumentPayload(data,layout(),options).markup;
 assert.match(markup,/&lt;script&gt;plain summary/);assert.match(markup,/<strong>Kept<\/strong>/);assert.doesNotMatch(markup,/<script|onerror|javascript:/);assert.match(markup,/class="bullet editable plain"/);assert.match(markup,/Volunteering/);assert.ok(markup.indexOf('Volunteering')<markup.indexOf('Technical Skills'));
 assert.match(markup,/data-key="workExperience" data-path="\[\]"/);assert.match(safeResumeHtml('<u>Underlined</u>'),/<u>Underlined/);
 const clean=applyTemplatePreset(layout(),'clean');assert.equal(clean.fontSize.headerFont,'sans-serif');assert.equal(clean.fontSize.bodyFont,'sans-serif');assert.equal(supportsLiveTemplate('latex'),true);
 assert.ok(!serializeLivePayload({...liveDocumentPayload(data,layout(),options),markup:'</script><script>bad</script>'}).includes('</script>'));
});

const {canvasDom,fixtureFactory}=require('./helpers/canvas-dom.cjs');
function canvas(){const fixture=fixtureFactory(),dom=canvasDom(()=>fixture.build());fixture.set(dom);vm.runInNewContext(liveDocumentHtml().match(/<script>([\s\S]*)<\/script>/)[1],dom.context);return {dom,fixture};}
const canvasPayload=(changes={})=>({markup:'fixture-one',paperWidth:300,paperHeight:400,editable:true,initialZoom:1,initialPanX:0,initialOffset:0,background:'#222',accent:'#65f',...changes});

test('pagination preserves every character, rich mark, link, separator and section order across distinct measured page boundaries',()=>{
 for(const paperHeight of [400,360]){
  const {dom,fixture}=canvas();dom.context.window.updateResume(canvasPayload({paperHeight}));const pages=dom.ids.pages.children;
  assert.ok(pages.length>1);assert.equal(pages.map(page=>page.textContent).join(''),fixture.build().textContent);
  for(const page of pages){assert.equal(page.style.height,paperHeight+'px');assert.ok(page.firstElementChild.offsetHeight<=paperHeight+.5);assert.match(page.getAttribute('aria-label'),/Resume page/);}
  const marks=dom.ids.pages.querySelectorAll('strong').map(node=>node.textContent).join('');assert.equal(marks,fixture.build().querySelectorAll('strong').map(node=>node.textContent).join(''));
  const links=dom.ids.pages.querySelectorAll('a');assert.ok(links.length>4);assert.ok(links.every(link=>link.getAttribute('href')==='https://example.test'));
  assert.ok(dom.ids.controls.children.length>4,'continued sections keep a pencil on later pages');assert.ok(dom.ids.controls.children.every(button=>parseFloat(button.style.left)>=parseFloat(dom.ids.pages.style.left)+300*1));
 }
});

test('pinch anchors the touched line, pans independently, fits again and never repaginates or calls an API during gestures',()=>{
 const {dom}=canvas(),scroller=dom.ids.scroller;dom.context.window.updateResume(canvasPayload({initialOffset:180}));
 const evt=touches=>({touches,preventDefault(){}}),a={clientX:120,clientY:150},b={clientX:220,clientY:250};
 const beforeScale=Number(dom.ids.pages.style.transform.match(/scale\(([^)]+)/)[1]),initialOrigin=parseFloat(dom.ids.pages.style.left),anchorX=(170-initialOrigin)/beforeScale,anchorY=(180+200-16)/beforeScale;
 scroller.listeners.touchstart(evt([a,b]));scroller.listeners.touchmove(evt([{clientX:70,clientY:100},{clientX:270,clientY:300}]));scroller.listeners.touchend(evt([]));
 const view=dom.messages.filter(message=>message.type==='viewport').at(-1);assert.equal(view.zoom,2);const afterScale=beforeScale*2;
 assert.ok(Math.abs((view.x+170-12)/afterScale-anchorX)<1e-6);assert.ok(Math.abs((view.y+200-16)/afterScale-anchorY)<1e-6);assert.equal(dom.ids.fit.style.display,'flex');
 scroller.listeners.touchstart(evt([{clientX:200,clientY:200}]));scroller.listeners.touchmove(evt([{clientX:150,clientY:160}]));scroller.listeners.touchend(evt([]));assert.equal(scroller.scrollLeft,view.x+50);assert.equal(scroller.scrollTop,view.y+40);
 const builds=dom.sourceBuilds;dom.context.window.updateResume(canvasPayload());assert.equal(dom.sourceBuilds,builds);assert.equal(dom.messages.filter(message=>message.type==='pages').length,1);
 dom.ids.fit.listeners.click();assert.equal(dom.messages.at(-1).zoom,1);assert.equal(dom.ids.fit.style.display,'none');
});

test('PDF remount restores zoom/pan/page position while hidden frame resizes do not erase the workspace',()=>{
 const {dom}=canvas();dom.context.window.updateResume(canvasPayload({initialZoom:2.25,initialPanX:120,initialOffset:750}));
 assert.equal(dom.ids.pages.style.transform,"scale(2.25)");assert.equal(dom.ids.scroller.scrollLeft,120);assert.equal(dom.ids.scroller.scrollTop,750);
 dom.ids.scroller.clientWidth=0;dom.ids.scroller.clientHeight=0;dom.ids.scroller.scrollTop=0;dom.ids.scroller.listeners.scroll();dom.observers[0]();
 dom.ids.scroller.clientWidth=390;dom.ids.scroller.clientHeight=420;dom.observers[0]();assert.equal(dom.ids.scroller.scrollTop,750);assert.equal(dom.ids.scroller.scrollLeft,120);
});

test('zoom, panel size and document position recover per document without a layout mutation or score request',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();h.session.updateWorkspace({documentZoom:2.4,documentPanX:125,documentOffset:640,panelHeight:282,tool:'format',trayOpen:true});await tick();h.session.dispose();await tick();
 const reopened=new CvEditorSession(h.deps);t.after(()=>reopened.dispose());await reopened.restore();assert.equal(reopened.snapshot.workspace.documentZoom,2.4);assert.equal(reopened.snapshot.workspace.documentPanX,125);assert.equal(reopened.snapshot.workspace.documentOffset,640);assert.equal(reopened.snapshot.workspace.panelHeight,282);assert.equal(h.saves.length,0);assert.equal(h.analyses.length,0);
});


test('short entries stay whole, split entries retain leading/trailing bullet pairs, and later-page controls point to the same role',()=>{
 let dom;
 const build=()=>{const el=(tag,cls,text)=>{const node=new dom.Element(tag,{class:cls});if(text)node.appendChild(new dom.TextNode(text));return node;};const article=el('article','modern'),section=el('section','resume-section');section.setAttribute('data-section','workExperience');const heading=el('div','section-heading');heading.appendChild(el('h2','','Experience'));const button=el('button','pencil');for(const [key,value] of Object.entries({'data-key':'workExperience','data-path':'[]','data-label':'Experience'}))button.setAttribute(key,value);heading.appendChild(button);section.appendChild(heading);
 for(let role=0;role<3;role++){const entry=el('div','entry');entry.setAttribute('data-field-path',JSON.stringify([role]));entry.setAttribute('data-resume-item',role===0?'':'split');const header=el('div','entry-heading');header.appendChild(el('strong','','Role '+role));entry.appendChild(header);const bullets=el('div','bullets');const count=role===0?3:4;
  for(let index=0;index<count;index++){const bullet=el('div','bullet'+(count>=4&&(index===0||index===count-2)?' keep-next':''));const content=el('div','bullet-text'),paragraph=el('div','paragraph','Role '+role+' bullet '+index+' '+('evidence '.repeat(role===0?17:role===1?8:12)));content.appendChild(paragraph);bullet.appendChild(content);bullets.appendChild(bullet);}entry.appendChild(bullets);section.appendChild(entry);
 }article.appendChild(section);return article;};
 dom=canvasDom(build);vm.runInNewContext(liveDocumentHtml().match(/<script>([\s\S]*)<\/script>/)[1],dom.context);dom.context.window.updateResume(canvasPayload());
 const pages=dom.ids.pages.children;assert.equal(pages.map(page=>page.textContent).join(''),build().textContent);
 assert.equal(pages.filter(page=>page.querySelectorAll('[data-field-path]').some(node=>node.getAttribute('data-field-path')==='[0]')).length,1);
 const continued=dom.ids.controls.children.filter(button=>button.getAttribute('data-path')==='[2]');assert.ok(continued.length>=1);
 for(const page of pages){const text=page.textContent;for(const role of [1,2]){if(text.includes('Role '+role+' bullet 0'))assert.ok(text.includes('Role '+role+' bullet 1'));if(text.includes('Role '+role+' bullet 2'))assert.ok(text.includes('Role '+role+' bullet 3'));}}
});

test('PDF waits for a delayed refresh, preserves pending text and captures Two Column once on rapid taps',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();
 let release;h.deps.load=async()=>{await new Promise(resolve=>release=resolve);return clone(h.remote);};
 const refresh=h.session.refresh();while(!release)await tick();
 const chosen={...layout(),template:'swiss-two-column'};h.session.updateLayoutDraft(chosen);
 h.session.update({...h.session.snapshot.resume,summary:'Text typed during refresh'});
 const first=h.session.saveForPdf(),second=h.session.saveForPdf();assert.equal(first,second);
 h.session.updateLayoutDraft({...chosen,template:'vivid'});await tick();assert.equal(h.saves.length,0);
 release();await refresh;const saved=await first;
 assert.equal(saved.layout.template,'swiss-two-column');assert.equal(saved.resume.summary,'Text typed during refresh');assert.equal(saved.revision,6);
 assert.deepEqual(h.saves.map(save=>save.expected_revision),[4,5]);assert.equal(h.session.snapshot.layoutDraft.template,'vivid');assert.equal(h.session.snapshot.layoutDraftDirty,true);assert.equal(h.analyses.length,0);
});

test('a genuine newer revision discovered by delayed refresh blocks export and preserves local content and Two Column',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();let release;
 h.deps.load=async()=>{await new Promise(resolve=>release=resolve);return clone(h.remote);};
 const refresh=h.session.refresh();while(!release)await tick();h.session.updateLayoutDraft({...layout(),template:'swiss-two-column'});h.session.update({...h.session.snapshot.resume,summary:'Keep this local text'});
 const pdf=h.session.saveForPdf();h.remote={...h.remote,revision:5,resume:{...h.remote.resume,summary:'Another device'}};release();await refresh;
 assert.equal(await pdf,null);assert.equal(h.saves.length,0);assert.equal(h.session.snapshot.saveState,'conflict');assert.equal(h.session.snapshot.resume.summary,'Keep this local text');assert.equal(h.session.snapshot.layoutDraft.template,'swiss-two-column');
 h.deps.load=async()=>clone(h.remote);await h.session.resolveConflict('local');const saved=await h.session.saveForPdf();assert.equal(saved.revision,7);assert.equal(saved.resume.summary,'Keep this local text');assert.equal(saved.layout.template,'swiss-two-column');
});

test('PATCH 409 after refresh cannot export or overwrite a newer revision; explicit conflict resolution remains required',async(t)=>{
 let remote=document(),first=true;
 const h=harness({save:async body=>{
  if(first){first=false;remote={...remote,revision:5,resume:{...remote.resume,summary:'Remote writer'}};throw Object.assign(Error('Revision conflict'),{status:409});}
  assert.equal(body.expected_revision,remote.revision);remote={...remote,revision:remote.revision+1,resume:clone(body.resume),layout:clone(body.layout)};return clone(remote);
 }});t.after(()=>h.session.dispose());await h.session.restore();let release;
 h.deps.load=async()=>{await new Promise(resolve=>release=resolve);return clone(remote);};const refresh=h.session.refresh();while(!release)await tick();
 h.session.updateLayoutDraft({...layout(),template:'swiss-two-column'});const exporting=h.session.saveForPdf();release();await refresh;
 assert.equal(await exporting,null);assert.equal(h.session.snapshot.saveState,'conflict');assert.equal(h.session.snapshot.layoutDraft.template,'swiss-two-column');assert.equal(JSON.parse(h.stored).pending,null);assert.equal(await h.session.saveForPdf(),null);assert.equal(h.saves.length,1);
 h.deps.load=async()=>clone(remote);await h.session.resolveConflict('local');const saved=await h.session.saveForPdf();assert.equal(saved.revision,6);assert.equal(saved.layout.template,'swiss-two-column');assert.equal(h.saves.length,2);
});

test('each of the ten templates has a local layout and revision-aware explicit export smoke check',async(t)=>{
 const ids=['swiss-single','swiss-two-column','modern','modern-two-column','latex','clean','vivid','vivid-single','modern-deedy','deedy'];
 for(const template of ids)await t.test(template,async()=>{
  const h=harness();try{await h.session.restore();const draft=applyTemplatePreset({...layout(),pageSize:'LETTER'},template);h.session.updateLayoutDraft(draft);
  const canvas=liveDocumentPayload(h.session.snapshot.resume,draft,options);assert.equal(supportsLiveTemplate(template),true);assert.match(canvas.markup,new RegExp(`class="${template}"`));assert.equal(h.saves.length,0);
  const saved=await h.session.saveForPdf();assert.deepEqual(saved.layout,draft);assert.equal(saved.revision,5);assert.equal(h.saves.length,1);assert.equal(h.saves[0].expected_revision,4);assert.equal(h.analyses.length,0);
  }finally{h.session.dispose();}
 });
});

test('actual column markup routes shared sections, sidebar fields and rich bullets without losing content',()=>{
 const data=resume();data.education=[{id:9,institution:'University',degree:'BSc',years:'2020'}];data.additional.awards=['Distinction'];
 for(const template of ['swiss-two-column','modern-two-column','vivid','deedy']){
  const markup=liveDocumentPayload(data,{...layout(),template},options).markup;
  assert.match(markup,/class="resume-grid"/);const main=markup.match(/class="resume-column main-column">([\s\S]*?)(?=<div class="resume-column|<\/article>)/)?.[1];const sidebar=markup.match(/class="resume-column sidebar-column">([\s\S]*?)(?=<div class="resume-column|<\/article>)/)?.[1];
  assert.match(main,/data-section="workExperience"/);assert.match(main,/data-field-path="\[0\]"/);assert.match(main,/<strong>original<\/strong>/);assert.doesNotMatch(sidebar,/data-section="workExperience"/);assert.match(sidebar,/data-section="education"/);assert.match(sidebar,/data-subsection="technicalSkills"/);assert.match(sidebar,/data-path="\[&quot;technicalSkills&quot;\]"/);assert.match(template==='deedy'?main:sidebar,/Distinction/);
  assert.equal((markup.match(/A complete summary\./g)||[]).length,1);assert.equal((markup.match(/TypeScript/g)||[]).length,1);
 }
 const classic=liveDocumentPayload(data,{...layout(),template:'latex'},options).markup;assert.ok(classic.indexOf('Example')<classic.indexOf('Engineer'));
 const vivid=liveDocumentPayload(data,{...layout(),template:'vivid-single'},options).markup;assert.match(vivid,/name-first/);assert.doesNotMatch(vivid,/resume-grid/);
});


test('column pagination flows each lane from page one and preserves all text, marks and original sidebar bindings',()=>{
 for(const template of ['swiss-two-column','modern-two-column','vivid','deedy'])for(const tallSide of [false,true]){
  let dom;
  const build=()=>{
   const el=(tag,cls,text)=>{const node=new dom.Element(tag,{class:cls});if(text)node.appendChild(new dom.TextNode(text));return node;};
   const article=el('article',template),grid=el('div','resume-grid'),main=el('div','resume-column main-column'),side=el('div','resume-column sidebar-column');
   const header=el('header','identity','One shared identity');article.appendChild(header);article.appendChild(grid);(template==='deedy'?[side,main]:[main,side]).forEach(lane=>grid.appendChild(lane));
   for(const [lane,key] of [[main,'workExperience'],[side,'additional']]){
    const section=el('section','resume-section');section.setAttribute('data-section',key);if(key==='additional')section.setAttribute('data-subsection','technicalSkills');
    const head=el('div','section-heading');head.appendChild(el('h2','',key));const button=el('button','pencil');button.setAttribute('data-key',key);button.setAttribute('data-path',key==='additional'?'["technicalSkills"]':'[]');button.setAttribute('data-label',key);head.appendChild(button);section.appendChild(head);
    const paragraph=el('div','paragraph');paragraph.appendChild(el('strong','','Rich '+key+' '+('evidence '.repeat(lane===side&&tallSide?150:lane===main&&!tallSide?200:8))));section.appendChild(paragraph);lane.appendChild(section);
   }return article;
  };
  dom=canvasDom(build);const original=build();vm.runInNewContext(liveDocumentHtml().match(/<script>([\s\S]*)<\/script>/)[1],dom.context);dom.context.window.updateResume(canvasPayload({markup:template,paperWidth:300,paperHeight:400}));
  const papers=dom.ids.pages.children;assert.ok(papers.length>1);assert.ok(papers[0].querySelector('.main-column'));assert.ok(papers[0].querySelector('.sidebar-column'));
  for(const lane of ['main-column','sidebar-column']){
   const text=papers.flatMap(paper=>paper.querySelectorAll('.'+lane)).map(column=>column.textContent).join('');assert.equal(text,original.querySelector('.'+lane).textContent);
  }
  assert.equal(papers.map(p=>p.textContent).join('').split('One shared identity').length,2);
  for(const paper of papers)assert.ok(paper.firstElementChild.offsetHeight<=400.5);
  assert.ok(dom.ids.controls.children.some(button=>button.getAttribute('data-path')==='["technicalSkills"]'));
  assert.ok(papers.flatMap(p=>p.querySelectorAll('strong')).every(mark=>mark.textContent.startsWith('Rich')||mark.textContent.includes('evidence')));
 }
});


test('layout-only Two Column export during delayed refresh sends one PATCH and returns its acknowledged revision',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();let release;
 h.deps.load=async()=>{await new Promise(resolve=>release=resolve);return clone(h.remote);};const refreshing=h.session.refresh();while(!release)await tick();
 h.session.updateLayoutDraft({...layout(),template:'swiss-two-column'});const pdf=h.session.saveForPdf();await tick();assert.equal(h.saves.length,0);release();await refreshing;const saved=await pdf;
 assert.equal(h.saves.length,1);assert.equal(h.saves[0].expected_revision,4);assert.equal(h.saves[0].layout.template,'swiss-two-column');assert.equal(saved.revision,5);assert.deepEqual(saved.resume,resume());assert.equal(saved.layout.template,'swiss-two-column');
});
