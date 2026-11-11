const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}) {
 const cache=new Map();
 const read=file=>{if(cache.has(file))return cache.get(file).exports;const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});assert.equal(compiled.diagnostics.length,0);const mod={exports:{}};cache.set(file,mod);const req=name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return read(base+['.ts','.tsx'].find(ext=>fs.existsSync(path.join(root,base+ext))));}return require(name);};new Function('require','module','exports',compiled.outputText)(req,mod,mod.exports);return mod.exports;};return read(file);
}
const {parseEditorDocument}=load('lib/editor/types.ts'),{CvEditorSession}=load('lib/editor/session.ts'),{pdfPath}=load('lib/editor/pdfTypes.ts');
const clone=v=>JSON.parse(JSON.stringify(v));
const layout=()=>({template:'swiss-single',pageSize:'A4',margins:{top:10,bottom:10,left:10,right:10},spacing:{section:3,item:2,lineHeight:3},fontSize:{base:3,headerScale:3,headerFont:'serif',bodyFont:'sans-serif'},compactMode:true,showContactIcons:true,accentColor:'green'});
const document=()=>({tailoring_id:'saved-cv',revision:4,updated_at:'now',resume:{summary:'Original'},confirmed_skills:[],job:{title:'Engineer',company:null,description:'Job'},analysis:null,layout:layout(),layout_options:{templates:['swiss-single','modern'],page_sizes:['A4','LETTER']}});
function harness({raw=null,server=document(),save}={}) {
 let stored=raw,remote=server,n=0;const mutations=[],writes=[];
 const deps={read:async()=>stored,write:async value=>{stored=value;writes.push(JSON.parse(value));},uuid:()=>`layout-mutation-${++n}`,parseDocument:parseEditorDocument,load:async()=>clone(remote),save:async body=>{mutations.push(clone(body));assert.ok(writes.some(w=>w.pending?.mutation_id===body.mutation_id));if(save)return save(body);assert.equal(body.expected_revision,remote.revision);remote={...remote,revision:remote.revision+1,resume:clone(body.resume),confirmed_skills:clone(body.confirmed_skills),layout:clone(body.layout??remote.layout)};return clone(remote);},analyze:async()=>null,onState:()=>{}};
 return{deps,session:new CvEditorSession(deps),mutations,writes,get stored(){return stored;},get remote(){return remote;},set remote(value){remote=value;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('editor parses server layout/options without dropping full layout fields and rejects malformed ranges',()=>{
 const doc=document();doc.layout.future={keep:true};doc.layout.margins.extra=7;assert.deepEqual(parseEditorDocument(doc).layout,doc.layout);assert.deepEqual(parseEditorDocument(doc).layout_options,doc.layout_options);
 for(const bad of [{...layout(),margins:{...layout().margins,top:26}},{...layout(),fontSize:{...layout().fontSize,base:0}},{...layout(),pageSize:'A3'}])assert.throws(()=>parseEditorDocument({...doc,layout:bad}),/layout settings/);
 assert.throws(()=>parseEditorDocument({...doc,layout_options:{templates:['modern'],page_sizes:['A3']}}),/layout options/);
 const legacy=document();delete legacy.layout;delete legacy.layout_options;assert.equal(parseEditorDocument(legacy).layout,undefined);
});

test('layout-only changes send full layout with the resume, accept canonical values, and persist after reopening for Single Column and Modern A4',async()=>{
 for(const template of ['swiss-single','modern']) {
 const h=harness();await h.session.restore();const next={...h.session.snapshot.layout,template,margins:{...h.session.snapshot.layout.margins,top:12}};
 h.session.update(h.session.snapshot.resume,[],next);const saved=await h.session.flush();assert.equal(saved.revision,5);assert.deepEqual(h.mutations[0].layout,next);assert.deepEqual(h.mutations[0].resume,{summary:'Original'});assert.equal(h.mutations[0].layout.compactMode,true);assert.equal(h.mutations[0].layout.accentColor,'green');
 h.session.dispose();const reopened=new CvEditorSession(h.deps);await reopened.restore();assert.deepEqual(reopened.snapshot.layout,next);assert.equal(reopened.snapshot.layout.pageSize,'A4');assert.equal(reopened.snapshot.document.revision,5);reopened.dispose();
 }
});

test('layout changes during a content save cannot be lost; later content edits preserve the unsaved layout',async()=>{
 let release,remote=document(),count=0;
 const h=harness({save:async body=>{if(++count===1)await new Promise(resolve=>release=resolve);remote={...remote,revision:remote.revision+1,resume:clone(body.resume),layout:clone(body.layout)};return clone(remote);}});
 await h.session.restore();h.session.update({summary:'First edit'});const first=h.session.flush();while(!release)await tick();
 const modern={...h.session.snapshot.layout,template:'modern',fontSize:{...h.session.snapshot.layout.fontSize,base:4}};
 h.session.update(h.session.snapshot.resume,[],modern);h.session.update({summary:'Latest edit'});const final=h.session.flush();release();await first;const saved=await final;
 assert.equal(saved.revision,6);assert.equal(saved.resume.summary,'Latest edit');assert.deepEqual(saved.layout,modern);assert.deepEqual(h.mutations[1].layout,modern);assert.equal(h.mutations[1].expected_revision,5);h.session.dispose();
});

test('ambiguous layout saves retain the exact full mutation on reopening and idempotent replay',async()=>{
 const h=harness({save:async()=>{throw Error('Offline');}});await h.session.restore();const modern={...layout(),template:'modern',pageSize:'LETTER'};
 h.session.update(h.session.snapshot.resume,[],modern);assert.equal(await h.session.flush(),null);const pending=JSON.parse(h.stored).pending;assert.deepEqual(pending.layout,modern);h.session.dispose();
 let replay;const resumed=new CvEditorSession({...h.deps,save:async body=>{replay=body;return{...document(),revision:5,layout:clone(body.layout)};}});await resumed.restore();const saved=await resumed.flush();assert.deepEqual(replay,pending);assert.deepEqual(saved.layout,modern);resumed.dispose();
});

test('layout conflict choices preserve local design or explicitly adopt the server layout',async()=>{
 for(const mode of ['local','server']) {
 const h=harness();await h.session.restore();const local={...layout(),template:'modern'};h.session.update(h.session.snapshot.resume,[],local);
 h.remote={...document(),revision:5,layout:{...layout(),pageSize:'LETTER'}};await h.session.refresh();assert.equal(h.session.snapshot.saveState,'conflict');assert.deepEqual(h.session.snapshot.layout,local);
 await h.session.resolveConflict(mode);assert.equal(h.session.snapshot.layout.template,mode==='local'?'modern':'swiss-single');assert.equal(h.session.snapshot.layout.pageSize,mode==='local'?'A4':'LETTER');h.session.dispose();
 }
});

test('legacy recovery receipts without layout are replayed unchanged before creating any full-layout mutation',async()=>{
 const old=document();delete old.layout;delete old.layout_options;
 const pending={expected_revision:4,mutation_id:'legacy-id',resume:{summary:'Recovered edit'},confirmed_skills:[]};
 const raw=JSON.stringify({version:1,document:old,resume:pending.resume,confirmedSkills:[],pending,dirty:true});
 const h=harness({raw});await h.session.restore();await h.session.flush();assert.deepEqual(h.mutations[0],pending);assert.deepEqual(h.session.snapshot.layout,layout());assert.equal(h.session.snapshot.resume.summary,'Recovered edit');h.session.dispose();
});

test('PDF export and readability request use the same frozen revision and never a page_size override',async()=>{
 assert.equal(pdfPath('saved-cv',8),'/tailored-cvs/saved-cv/pdf?revision=8');
 const previous=global.fetch,calls=[];class ApiError extends Error{}
 const api=load('lib/editor/api.ts',{'@/lib/cv/api':{mobileEndpoint:p=>'https://test.invalid'+p,mobileAccessToken:async()=> 'test-token',CvApiError:ApiError,apiErrorMessage:()=>''}});
 try {global.fetch=async(url,options)=>{calls.push({url,options});return{ok:true,status:200,json:async()=>({revision:8,report:{extractability:'full',page_count:1,checks:[]}})};};
 const result=await api.checkEditorPdf('owner','saved-cv',8,new AbortController().signal);assert.equal(result.revision,8);assert.deepEqual(JSON.parse(calls[0].options.body),{expected_revision:8});
 }finally{global.fetch=previous;}
});

test('native download/share uses the exact cached artifact and revision-only PDF path',async()=>{
 let downloadUrl,shared;const service=load('lib/editor/pdf.native.ts',{'expo-file-system/legacy':{cacheDirectory:'file:///cache/',FileSystemSessionType:{FOREGROUND:0},EncodingType:{Base64:'base64'},deleteAsync:async()=>{},makeDirectoryAsync:async()=>{},readAsStringAsync:async()=> 'JVBERi0=',createDownloadResumable:(url)=>{downloadUrl=url;return{downloadAsync:async()=>({status:200,mimeType:'application/pdf',headers:{'X-Resume-Revision':'8'}}),cancelAsync:async()=>{}};}},'expo-sharing':{isAvailableAsync:async()=>true,shareAsync:async uri=>{shared=uri;}},'expo-crypto':{randomUUID:()=> 'isolated-cache'},'@/lib/cv/api':{mobileEndpoint:p=>'https://test.invalid'+p,mobileAccessToken:async()=> 'test-token'}});
 const artifact=await service.loadEditorPdf('owner','saved-cv',8,new AbortController().signal);assert.equal(downloadUrl,'https://test.invalid/tailored-cvs/saved-cv/pdf?revision=8');await service.shareEditorPdf(artifact);assert.equal(shared,artifact.uri);await artifact.dispose();
});
