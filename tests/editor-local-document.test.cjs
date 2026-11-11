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

test('all three templates, paper sizes, text sizes and margins update locally without scheduling a save or score',async(t)=>{
 const h=harness();t.after(()=>h.session.dispose());await h.session.restore();
 for(const template of ['swiss-single','clean','modern'])for(const pageSize of ['A4','LETTER'])for(const base of [1,3,5])for(const margin of [5,12,25]){
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
 const clean=applyTemplatePreset(layout(),'clean');assert.equal(clean.fontSize.headerFont,'sans-serif');assert.equal(clean.fontSize.bodyFont,'sans-serif');assert.equal(supportsLiveTemplate('latex'),false);
 assert.ok(!serializeLivePayload({...liveDocumentPayload(data,layout(),options),markup:'</script><script>bad</script>'}).includes('</script>'));
});

test('the document bridge scales a full long document on iPhone widths and retains position through updates and hidden PDF navigation',async()=>{
 const scroller={clientWidth:350,clientHeight:400,scrollTop:0,style:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}},paper={style:{},offsetHeight:2600,innerHTML:'',className:''},frame={style:{}},variables={},messages=[],observers=[];
 const document={getElementById:id=>({scroller,paper,frame})[id],body:{style:{}},documentElement:{style:{setProperty:(k,v)=>variables[k]=v}},addEventListener(){}};
 const window={addEventListener(){},ReactNativeWebView:{postMessage:raw=>messages.push(JSON.parse(raw))}};
 class ResizeObserver{constructor(callback){this.callback=callback;observers.push(this);}observe(){}}
 window.ResizeObserver=ResizeObserver;
 const context={window,document,ResizeObserver,setTimeout,clearTimeout,parent:{postMessage(){}}};
 const script=liveDocumentHtml().match(/<script>([\s\S]*)<\/script>/)[1];vm.runInNewContext(script,context);
 window.updateResume(liveDocumentPayload(resume(),layout(),{...options,offset:112}));assert.equal(scroller.scrollTop,112);assert.equal(paper.style.width,`${210*96/25.4}px`);assert.equal(frame.style.height,`${2600*(310/(210*96/25.4))}px`);
 scroller.scrollTop=227;scroller.listeners.scroll();await new Promise(resolve=>setTimeout(resolve,115));assert.equal(messages.at(-1).offset,227);
 const updated={...layout(),template:'modern',pageSize:'LETTER',fontSize:{...layout().fontSize,base:5},margins:{top:25,bottom:12,left:5,right:18}};
 window.updateResume(liveDocumentPayload(resume(),updated,options));assert.equal(scroller.scrollTop,227);assert.equal(paper.style.width,'816px');assert.match(paper.innerHTML,/--font:16px/);assert.match(paper.innerHTML,/--top:94.488/);
 scroller.clientWidth=0;scroller.clientHeight=0;scroller.scrollTop=0;scroller.listeners.scroll();observers[0].callback();
 scroller.clientWidth=350;scroller.clientHeight=400;observers[0].callback();assert.equal(scroller.scrollTop,227);assert.equal(frame.style.height,`${2600*(310/816)}px`);
});
