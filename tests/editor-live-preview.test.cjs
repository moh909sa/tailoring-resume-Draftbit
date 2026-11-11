const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file){const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal(compiled.diagnostics.length,0);const mod={exports:{}};new Function('require','module','exports',compiled.outputText)(require,mod,mod.exports);return mod.exports;}
const {LivePreview}=load('lib/editor/livePreview.ts'),{EditorInstances}=load('lib/editor/instances.ts'),{CvEditorSession}=load('lib/editor/session.ts');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const target=(revision,ready=true,ownerId='owner')=>({ownerId,id:'cv',revision,ready});
function harness(){const requests=[],disposed=[];const preview=new LivePreview({delay:12,onState:()=>{},load:(value,signal)=>new Promise((resolve,reject)=>requests.push({target:value,signal,resolve,reject}))});const file=revision=>({uri:'file:///'+revision+'.pdf',revision,filename:revision+'.pdf',dispose:async()=>{disposed.push(revision);}});return{preview,requests,disposed,file};}
async function seed(h){h.preview.update(target(4));await wait(5);h.requests[0].resolve(h.file(4));await wait(1);assert.equal(h.preview.snapshot.pdf.revision,4);}

test('rapid acknowledged revisions coalesce and keep the last PDF visible until the final one arrives',async(t)=>{
 const h=harness();t.after(()=>h.preview.dispose());await seed(h);const old=h.preview.snapshot.pdf;
 h.preview.update(target(4,false));assert.equal(h.preview.snapshot.pdf,old);assert.equal(h.preview.snapshot.updating,true);
 h.preview.update(target(5));h.preview.update(target(6));h.preview.update(target(7));await wait(25);
 assert.deepEqual(h.requests.map(r=>r.target.revision),[4,7]);assert.equal(h.preview.snapshot.pdf,old);
 h.requests[1].resolve(h.file(7));await wait(1);assert.equal(h.preview.snapshot.pdf.revision,7);assert.equal(h.preview.snapshot.updating,false);
 assert.deepEqual(h.disposed,[],'do not revoke the previous file before the new renderer commits');h.preview.releaseRetired();assert.deepEqual(h.disposed,[4]);
});

test('late responses ignoring cancellation cannot replace a newer PDF or survive owner changes',async(t)=>{
 const h=harness();t.after(()=>h.preview.dispose());await seed(h);
 h.preview.update(target(5));await wait(20);h.preview.update(target(6));await wait(20);assert.equal(h.requests[1].signal.aborted,true);
 h.requests[2].resolve(h.file(6));await wait(1);h.requests[1].resolve(h.file(5));await wait(1);
 assert.equal(h.preview.snapshot.pdf.revision,6);assert.ok(h.disposed.includes(5));
 h.preview.update(target(6,true,'other-owner'));assert.equal(h.preview.snapshot.pdf,null);assert.notEqual(h.preview.snapshot.key,JSON.stringify(['owner','cv']));
 await wait(5);h.preview.dispose();h.requests[3].resolve(h.file(66));await wait(1);assert.ok(h.disposed.includes(66));
});

test('failed refresh keeps the old PDF, exposes retry, and rejects a mismatched revision',async(t)=>{
 const h=harness();t.after(()=>h.preview.dispose());await seed(h);
 h.preview.update(target(5));await wait(20);h.requests[1].reject(Error('Network unavailable'));await wait(1);
 assert.equal(h.preview.snapshot.pdf.revision,4);assert.equal(h.preview.snapshot.updating,false);assert.match(h.preview.snapshot.error,/Network/);
 h.preview.retry();await wait(20);h.requests[2].resolve(h.file(99));await wait(1);assert.equal(h.preview.snapshot.pdf.revision,4);assert.match(h.preview.snapshot.error,/another saved version/);assert.ok(h.disposed.includes(99));
 h.preview.retry();await wait(20);h.requests[3].resolve(h.file(5));await wait(1);assert.equal(h.preview.snapshot.pdf.revision,5);assert.equal(h.preview.snapshot.error,null);
});

test('files being shared are retained through a refresh and disposed only after sharing ends',async(t)=>{
 const h=harness();t.after(()=>h.preview.dispose());await seed(h);const release=h.preview.retain(h.preview.snapshot.pdf);
 h.preview.update(target(5));await wait(20);h.requests[1].resolve(h.file(5));await wait(1);h.preview.releaseRetired();assert.deepEqual(h.disposed,[]);
 h.preview.dispose();assert.deepEqual(h.disposed,[5]);release();assert.deepEqual(h.disposed,[5,4]);release();assert.deepEqual(h.disposed,[5,4]);
});

test('one account/CV shares one editor writer until its final consumer leaves',()=>{
 const pool=new EditorInstances();let creates=0,restores=0,disposes=0,detach=0,emit;
 const make=notify=>{creates++;emit=notify;return{manager:{snapshot:{revision:4},restore:async()=>{restores++;},dispose:()=>disposes++},detach:()=>detach++};};
 const first=pool.acquire('owner:cv',make),second=pool.acquire('owner:cv',make);assert.equal(first.manager,second.manager);assert.equal(creates,1);assert.equal(restores,1);
 let a=0,b=0;first.subscribe(()=>a++);second.subscribe(()=>b++);first.release();emit({revision:5});assert.equal(a,1);assert.equal(b,2);assert.equal(disposes,0);
 const other=pool.acquire('other-owner:cv',make);assert.notEqual(other.manager,second.manager);second.release();second.release();assert.equal(disposes,1);assert.equal(detach,1);other.release();assert.equal(disposes,2);
});

test('rapid template/margin edits save once and preview only the final acknowledged revision',async(t)=>{
 const layout={template:'swiss-single',pageSize:'A4',margins:{top:10,bottom:10,left:10,right:10},spacing:{section:3,item:2,lineHeight:3},fontSize:{base:3,headerScale:3,headerFont:'serif',bodyFont:'sans-serif'},compactMode:false,showContactIcons:false,accentColor:'blue'};
 let remote={tailoring_id:'cv',revision:4,updated_at:'now',resume:{summary:'Preserve original content'},confirmed_skills:[],job:{description:'Job'},analysis:null,layout},stored=null;const saves=[],renders=[];
 const preview=new LivePreview({delay:12,onState:()=>{},load:async value=>{renders.push(value.revision);return{uri:'file:///'+value.revision,revision:value.revision,filename:'cv.pdf',dispose:async()=>{}};}});
 const session=new CvEditorSession({read:async()=>stored,write:async value=>{stored=value;},uuid:()=> 'same-durable-mutation',parseDocument:v=>v,load:async()=>remote,save:async body=>{saves.push(body);remote={...remote,revision:5,resume:body.resume,layout:body.layout};return remote;},analyze:async()=>null,onState:state=>{if(state.document)preview.update(target(state.document.revision,state.saveState==='saved'));}});
 t.after(()=>{session.dispose();preview.dispose();});await session.restore();await wait(5);
 for(const template of ['modern','swiss-single','modern'])session.update(session.snapshot.resume,[],{...session.snapshot.layout,template});
 session.update(session.snapshot.resume,[],{...session.snapshot.layout,margins:{...session.snapshot.layout.margins,top:12}});
 assert.equal(preview.snapshot.pdf.revision,4);assert.equal(preview.snapshot.updating,true);
 // Flush represents the pause boundary; the production session schedules this writer.
 const acknowledged=await session.flush();await wait(25);assert.equal(saves.length,1);assert.equal(acknowledged.revision,5);assert.deepEqual(renders,[4,5]);assert.equal(preview.snapshot.pdf.revision,5);
 assert.equal(saves[0].layout.template,'modern');assert.equal(saves[0].layout.margins.top,12);assert.equal(saves[0].resume.summary,'Preserve original content');
});
