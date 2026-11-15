const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file){const mod={exports:{}};const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal(result.diagnostics.length,0);new Function('require','module','exports',result.outputText)(name=>name.startsWith('.')?load(path.join(path.dirname(file),name+'.ts')):require(name),mod,mod.exports);return mod.exports;}
const {EditorPdfPreview}=load('lib/editor/editorPdfPreview.ts'),{PdfArtifacts}=load('lib/editor/pdfArtifacts.ts');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const deadline=Date.now()+2000;while(!check()){if(Date.now()>deadline)assert.fail('timed out waiting for asynchronous PDF state');await wait(5);}}
const input=(patch={})=>({ownerId:'owner',id:'cv',resume:{summary:'Original',personalProjects:[]},layout:{template:'deedy',pageSize:'A4',fontSize:{base:3}},skills:[],revision:1,editing:false,saveState:'saved',...patch});
const saved=(value,revision=value.revision)=>({tailoring_id:value.id,resume:value.resume,layout:value.layout,confirmed_skills:value.skills,revision,job:{title:'Engineer'}});
function harness(options={}){const saves=[],loads=[],disposed=[];let revision=1;const controller=new EditorPdfPreview({delay:Object.hasOwn(options,"delay")?options.delay:15,onState:()=>{},save:async value=>{saves.push(value);return options.save?options.save(value):saved(value,++revision);},load:async(target,signal)=>{loads.push({target,signal});return options.load?options.load(target,signal):{uri:'file:///'+target.revision+'.pdf',revision:target.revision,dispose:async()=>disposed.push(target.revision)};}});return{controller,saves,loads,disposed};}
async function seed(h){let value=input();h.controller.update(value);await until(()=>h.controller.snapshot.pdf);value={...value,revision:h.controller.snapshot.pdf.revision};h.controller.update(value);return value;}

test('format taps coalesce, retain the last actual PDF, and gate preview until the acknowledged file arrives',async(t)=>{
 const h=harness();t.after(()=>h.controller.dispose());let value=await seed(h);const old=h.controller.snapshot.pdf;assert.equal(h.controller.matches(value),true);
 for(const template of ['swiss-two-column','deedy','swiss-two-column']){value={...value,layout:{...value.layout,template}};h.controller.update(value);assert.equal(h.controller.snapshot.pdf,old);assert.equal(h.controller.matches(value),false);}
 value={...value,layout:{...value.layout,pageSize:'LETTER',fontSize:{base:5}}};h.controller.update(value);await wait(40);assert.equal(h.saves.length,2);assert.equal(h.loads.length,2);assert.equal(h.saves[1].layout.template,'swiss-two-column');assert.equal(h.saves[1].layout.pageSize,'LETTER');assert.equal(h.saves[1].layout.fontSize.base,5);value={...value,revision:3};h.controller.update(value);assert.equal(h.controller.matches(value),true);await wait(25);assert.equal(h.saves.length,2,'own acknowledged revision does not start another update');
});

test('typing across autosave revisions waits for field completion and preserves blank then populated projects for both templates',async(t)=>{
 for(const template of ['deedy','swiss-two-column']){const h=harness();t.after(()=>h.controller.dispose());let value=await seed(h);const old=h.controller.snapshot.pdf;
 for(let i=0;i<5;i++){value={...value,revision:10+i,editing:true,resume:{...value.resume,summary:'Long summary '.repeat(200)+i,personalProjects:[{name:'',description:[]}]},layout:{...value.layout,template}};h.controller.update(value);}
 await wait(35);assert.equal(h.saves.length,1);assert.equal(h.controller.snapshot.pdf,old);value={...value,editing:false};h.controller.update(value);await wait(35);assert.deepEqual(h.saves.at(-1).resume.personalProjects,[{name:'',description:[]}]);
 value={...value,editing:true,resume:{...value.resume,personalProjects:[{name:'Real project',description:['Full project detail '.repeat(100)]}]}};h.controller.update(value);await wait(25);assert.equal(h.saves.length,2);h.controller.update({...value,editing:false});await wait(35);assert.equal(h.saves.length,3);assert.equal(h.saves.at(-1).resume.personalProjects[0].name,'Real project');assert.equal(h.saves.at(-1).resume.summary,value.resume.summary);}
});

test('a newer formatting generation waits for the previous serialized export before saving its own captured layout',async(t)=>{
 let release;const h=harness({save:async value=>{if(value.layout.template==='deedy')await new Promise(resolve=>release=resolve);return saved(value,value.layout.template==='deedy'?2:3);}});t.after(()=>h.controller.dispose());h.controller.update(input());await wait(10);assert.equal(h.saves.length,1);h.controller.update(input({layout:{template:'swiss-two-column',pageSize:'LETTER'}}));await wait(30);assert.equal(h.saves.length,1);release();await wait(15);assert.equal(h.saves.length,2);assert.deepEqual(h.loads.map(v=>v.target.revision),[3]);assert.equal(h.controller.snapshot.pdf.revision,3);
});

test('late PDF responses never replace newer edits and PDF retrieval retry does not save again',async(t)=>{
 const requests=[];const h=harness({load:(target,signal)=>new Promise((resolve,reject)=>requests.push({target,signal,resolve,reject}))});t.after(()=>h.controller.dispose());h.controller.update(input());await wait(12);h.controller.update(input({layout:{template:'swiss-two-column'}}));await wait(35);assert.equal(requests[0].signal.aborted,true);requests[1].reject(Error('Railway unavailable'));await wait(5);assert.match(h.controller.snapshot.error,/Railway unavailable/);h.controller.retry();await wait(10);assert.equal(h.saves.length,2);const newest={uri:'file:///latest.pdf',revision:3,dispose:async()=>{}};requests[2].resolve(newest);requests[0].resolve({uri:'file:///old.pdf',revision:2,dispose:async()=>h.disposed.push(2)});await wait(5);assert.equal(h.controller.snapshot.pdf,newest);assert.deepEqual(h.disposed,[2]);
});

test('save conflict keeps the old PDF and selected layout; explicit recovery retries saving before requesting any PDF',async(t)=>{
 let conflict=false;const h=harness({save:async value=>conflict?null:saved(value,value.layout.template==='deedy'?1:3)});t.after(()=>h.controller.dispose());let value=await seed(h);const old=h.controller.snapshot.pdf;conflict=true;value={...value,layout:{...value.layout,template:'swiss-two-column'},saveState:'conflict'};h.controller.update(value);await wait(30);assert.match(h.controller.snapshot.saveError,/conflict/);assert.equal(h.controller.snapshot.pdf,old);assert.equal(h.loads.length,1);assert.equal(h.controller.matches(value),false);conflict=false;h.controller.retry();await wait(15);assert.equal(h.saves.at(-1).layout.template,'swiss-two-column');assert.equal(h.loads.at(-1).target.revision,3);
});

test('the full-screen handoff leases the identical owner-scoped file through replacement and disposal',async(t)=>{
 const h=harness(),registry=new PdfArtifacts();t.after(()=>h.controller.dispose());const value=await seed(h),pdf=h.controller.snapshot.pdf;const unpublish=registry.publish('owner','cv',{pdf,title:'Engineer',layout:value.layout,retain:()=>h.controller.retain(pdf)});assert.equal(registry.acquire('other','cv',pdf.revision),null);const fullscreen=registry.acquire('owner','cv',pdf.revision);assert.equal(fullscreen.pdf,pdf);unpublish();h.controller.update({...value,layout:{template:'swiss-two-column'}});await wait(35);h.controller.releaseRetired();assert.deepEqual(h.disposed,[]);h.controller.dispose();assert.deepEqual(h.disposed,[3]);fullscreen.release();assert.deepEqual(h.disposed,[3,2]);assert.equal(registry.acquire('owner','cv',2),null);
});


test('formatting uses 400 ms after the final tap while typing and text completion retain their existing delay',async(t)=>{
 const h=harness({delay:undefined});t.after(()=>h.controller.dispose());let value=await seed(h);const old=h.controller.snapshot.pdf;
 value={...value,layout:{...value.layout,template:'swiss-two-column'}};h.controller.update(value);await wait(250);assert.equal(h.saves.length,1);
 for(const base of [4,5,4]){value={...value,layout:{...value.layout,fontSize:{base},pageSize:'LETTER'}};h.controller.update(value);assert.equal(h.controller.snapshot.pdf,old);assert.equal(h.controller.snapshot.updating,true);assert.equal(h.controller.matches(value),false);}
 await wait(250);assert.equal(h.saves.length,1,'each tap restarts the formatting debounce');await wait(250);assert.equal(h.saves.length,2,'final formatting starts preview preparation after 400 ms rather than 700 ms');await until(()=>h.loads.length===2 && !h.controller.snapshot.updating);assert.equal(h.saves.at(-1).layout.fontSize.base,4);value={...value,revision:3};h.controller.update(value);assert.equal(h.controller.matches(value),true);
 value={...value,editing:true,resume:{...value.resume,summary:'Typed latest summary'}};h.controller.update(value);await wait(750);assert.equal(h.saves.length,2,'typing remains paused');value={...value,editing:false};h.controller.update(value);await wait(500);assert.equal(h.saves.length,2,'text completion retains 700 ms');await until(()=>h.saves.length===3);assert.equal(h.saves.at(-1).resume.summary,'Typed latest summary');
});

test('debug timing logs contain only measured durations and are silent when disabled',()=>{
 const {PdfPreviewTimings}=load('lib/editor/pdfPreviewTimings.ts');const logs=[];let clock=100;
 const timing=new PdfPreviewTimings(undefined,true,()=>clock,value=>logs.push(value));clock=500;timing.mark('debounceEnd');timing.mark('saveStart');clock=530;timing.mark('saveEnd');timing.mark('pdfFetchStart');clock=750;timing.mark('pdfFetchEnd');clock=810;timing.mark('viewerReady');
 assert.deepEqual(logs.at(-1),{viewerReady:710,endToEnd:710,burstEndToEnd:710,debounce:400,writerWait:0,save:30,pdfFetch:220,viewer:60});assert.ok(logs.every(row=>Object.values(row).every(v=>typeof v==='number')));new PdfPreviewTimings(undefined,false,()=>clock,()=>assert.fail('release logging must be silent')).mark('viewerReady');
 const old=new PdfPreviewTimings(undefined,true,()=>clock,()=>{});old.cancel();old.mark('pdfFetchEnd');
});
