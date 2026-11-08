const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {makeReview,tailoringId}=require('./fixtures/tailoring-review.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(initial) {
  let cursor=0,dirty=false,value;
  const slots=[],effects=[],managers=[];
  const h={owner:'owner-a',storage:new Map(initial),reads:[],load:(owner,id)=>({...makeReview(),tailoring_id:id}),apply:async()=>{throw new Error('Unexpected apply request');}};
  const changed=(a,b)=>!a||b.some((v,i)=>!Object.is(a[i],v));
  const hooks={...React,
    createContext:()=>({Provider:'Provider'}),
    useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const previous=slots[i];slots[i]={deps,cleanup:previous?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}
  };
  class Manager {
    constructor(deps){this.deps=deps;managers.push(this);}
    setActive(){}
    async restore(){this.deps.onState({job:null,progress:null,recovering:false,submitting:false,connectionError:null,terminalError:null});}
    dispose(){}
  }
  const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/tailoring/TailoringProvider.tsx'),'utf8'),{fileName:'TailoringProvider.tsx',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal(compiled.diagnostics.length,0);
  const mod={exports:{}};
  const mocks={
    react:hooks,
    'expo-crypto':{randomUUID:()=>tailoringId},
    'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    '@/lib/tailoring/jobs':{DurableTailoringJob:Manager,jobStorageKey:owner=>'tailoring-job-v1:'+owner},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>h.storage.get(key)??null,setItem:async(key,raw)=>h.storage.set(key,raw),removeItem:async key=>h.storage.delete(key)}},
    '@/lib/auth/AuthProvider':{useAuth:()=>({session:h.owner?{user:{id:h.owner}}:null})},
    '@/lib/cv/types':{isRecord:v=>typeof v==='object'&&v!==null&&!Array.isArray(v)},
    '@/lib/tailoring/types':{keywordKey:s=>s.toLowerCase(),previewHasExpired:()=>false},
    '@/lib/cv/api':{applyTailoringKeywords:(...args)=>h.apply(...args),CvApiError:class extends Error{},loadTailoringReview:async(owner,id)=>{h.reads.push([owner,id]);return h.load(owner,id);}}
  };
  new Function('require','module','exports',compiled.outputText)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),mod,mod.exports);
  h.render=()=>{cursor=0;dirty=false;value=mod.exports.TailoringProvider({children:null}).props.value;for(const effect of effects.splice(0))effect();return value;};
  h.pump=async()=>{for(let n=0;n<12;n++){await tick();if(dirty)h.render();}return value;};
  h.value=()=>value;h.managers=managers;h.dispose=()=>slots.forEach(s=>s.cleanup?.());h.render();return h;
}
const input={resumeId:'source-cv',filename:'Original.pdf',jobDescription:'Full exact job description. '.repeat(5).trim()};
const reference=saved=>JSON.stringify({tailoringId,previewId:'preview-1',saved,input,step:1,selectedKeywords:[],pendingJobReview:false});
test('signing out and changing accounts hides drafts without deleting the original owners recovery pointer',async()=>{
  const h=harness([['tailoring-review-v1:owner-a',reference(false)]]);await h.pump();
  assert.equal(h.value().tailoringId,tailoringId);assert.equal(h.value().needsReload,true);
  h.owner=null;h.render();await h.pump();assert.equal(h.value().tailoringId,null);assert.ok(h.storage.has('tailoring-review-v1:owner-a'));
  h.owner='owner-b';h.render();await h.pump();assert.equal(h.value().input,null);assert.equal(h.value().tailoringId,null);
  h.owner='owner-a';h.render();await h.pump();assert.deepEqual(h.value().input,input);assert.equal(h.value().tailoringId,tailoringId);h.dispose();
});
test('relaunch retains a saved reference without retrieving an expired draft or starting paid work',async()=>{
  const h=harness([['tailoring-review-v1:owner-a',reference(true)]]);await h.pump();
  assert.equal(h.value().saved,true);assert.equal(h.value().needsReload,false);assert.deepEqual(h.value().input,input);
  await h.value().reloadReview();await h.pump();assert.deepEqual(h.reads,[]);assert.equal(h.value().tailoringId,tailoringId);h.dispose();
});
test('a different review link can load after a previous confirmation without inheriting saved state',async()=>{
  const h=harness([['tailoring-review-v1:owner-a',reference(true)]]);await h.pump();
  const next='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await h.value().reloadReview(next);await h.pump();
  assert.equal(h.value().saved,false);assert.equal(h.value().tailoringId,next);assert.equal(h.value().preview.tailoring_id,next);assert.deepEqual(h.reads,[['owner-a',next]]);h.dispose();
});

const pendingNames=['Incident management','Technical documentation'];
function pendingReview(applied=[]) {
  const preview=makeReview(applied.length?'preview-applied':'preview-1',76,applied);
  preview.review.keyword_options.supported=[];
  preview.review.keyword_options.needs_attestation=pendingNames.filter(name=>!applied.includes(name));
  return preview;
}
async function preparePendingReview() {
  const h=harness([['tailoring-review-v1:owner-a',reference(false)]]);
  await h.pump();h.load=()=>pendingReview();
  await h.value().reloadReview();await h.pump();
  h.value().setStep(0);h.render();
  for(const name of pendingNames){h.value().toggleKeyword(name,true);h.render();}
  assert.equal(h.value().selectedKeywords.length,2);
  return h;
}
test('successful keyword apply clears both pending selections and stays on Keywords',async()=>{
  const h=await preparePendingReview();let resolveApply;let calls=0;
  h.apply=async(owner,id,previewId,keywords)=>{calls++;assert.deepEqual(keywords.map(item=>item.keyword),pendingNames);return new Promise(resolve=>{resolveApply=resolve;});};
  h.value().applyKeywords();h.render();await h.pump();
  assert.equal(h.value().reviewActivity,'keywords');
  assert.equal(h.value().selectedKeywords.length,2);
  resolveApply(pendingReview(pendingNames));await h.pump();
  assert.equal(h.value().reviewActivity,null);assert.equal(h.value().selectedKeywords.length,0);
  assert.equal(h.value().step,0);assert.equal(calls,1);h.dispose();
});
test('failed apply retains pending selections through reconciliation for retry or deselection',async()=>{
  const h=await preparePendingReview();let calls=0;
  h.apply=async()=>{calls++;throw new Error('Network interrupted');};
  h.value().applyKeywords();h.render();await h.pump();
  assert.equal(h.value().reviewActivity,null);assert.equal(h.value().needsReload,false);
  assert.deepEqual(h.value().selectedKeywords.map(item=>item.keyword),pendingNames);
  assert.equal(h.value().step,0);assert.equal(calls,1);
  for(const name of pendingNames){h.value().toggleKeyword(name,true);h.render();}
  assert.equal(h.value().selectedKeywords.length,0);h.dispose();
});
