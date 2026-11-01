const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(initial = new Map()) {
  let cursor = 0, dirty = false, value;
  const slots = [], effects = [];
  const h = { owner: 'owner-a', previous: null, recovering: false, storage: initial, fail: false, writes: [] };
  const hooks = {
    useRef(initial) { const i=cursor++; return slots[i] ??= {current:initial}; },
    useState(initial) { const i=cursor++; slots[i] ??= {value:initial}; return [slots[i].value, next => {slots[i].value = next; dirty = true;}]; },
    useEffect(fn,deps) {const i=cursor++;if(!slots[i] || deps.some((v,n)=>!Object.is(v,slots[i].deps[n]))) {const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}
  };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/tailoring/useTailorForm.ts'),'utf8'), {fileName:'form.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.equal(compiled.diagnostics.length,0);
  const mod={exports:{}};
  new Function('require','module','exports',compiled.outputText)(name=>{
    if(name==='react')return hooks;
    if(name==='@react-native-async-storage/async-storage') return {__esModule:true,default:{
      getItem:async key=>h.storage.get(key) ?? null,
      setItem:async(key,raw)=>{if(h.fail)throw Error('disk full');h.writes.push([key,raw]);h.storage.set(key,raw);}
    }};
    throw Error('unexpected dependency '+name);
  },mod,mod.exports);
  h.render=()=>{cursor=0;dirty=false;value=mod.exports.useTailorForm(h.owner,h.previous,h.recovering);for(const effect of effects.splice(0))effect();return value;};
  h.pump=async()=>{for(let n=0;n<8;n++){await tick();if(dirty)h.render();}return value;};
  h.dispose=()=>slots.forEach(s=>s.cleanup?.());
  h.value=()=>value;
  h.render();
  return h;
}
test('preparation survives remount before any paid job starts, preserving exact pasted text',async()=>{
  const h=harness();await h.pump();const description='  Responsibilities\n\n'+ 'Complete job details. '.repeat(120);
  h.value().update({selectedId:'ready-cv',description});await h.pump();assert.equal(h.value().saving,false);h.dispose();
  const next=harness(h.storage);await next.pump();assert.deepEqual(next.value().form,{selectedId:'ready-cv',description});next.dispose();
});
test('preparation is isolated by account and later job recovery cannot overwrite new inputs',async()=>{
  const h=harness();await h.pump();h.value().update({description:'Next opportunity'});await h.pump();
  h.previous={resumeId:'old-cv',jobDescription:'Old job',filename:'Old.pdf'};h.recovering=true;h.render();await h.pump();h.recovering=false;h.render();await h.pump();assert.equal(h.value().form.description,'Next opportunity');
  h.owner='owner-b';h.previous=null;h.render();await h.pump();assert.equal(h.value().form.description,'');
  h.owner='owner-a';h.render();await h.pump();assert.equal(h.value().form.description,'Next opportunity');h.dispose();
});
test('storage failure is visible and keeps the current input; a later write recovers',async()=>{
  const h=harness();await h.pump();h.fail=true;h.value().update({description:'Keep this exact input'});await h.pump();assert.match(h.value().error,/couldn’t be saved/);assert.equal(h.value().form.description,'Keep this exact input');
  h.fail=false;h.value().update({description:'Keep this exact input with edits'});await h.pump();assert.equal(h.value().error,null);h.dispose();
});
test('legacy submitted inputs restore without replacing a newer preparation draft',async()=>{
  const h=harness();h.recovering=true;h.render();await h.pump();h.previous={resumeId:'original',jobDescription:'Previous exact description',filename:'Original.pdf'};h.recovering=false;h.render();await h.pump();assert.equal(h.value().form.description,'Previous exact description');h.dispose();
});

test('text pasted before sign-in survives authentication without leaking between existing accounts',async()=>{
  const h=harness();await h.pump();h.owner=null;h.render();await h.pump();
  h.value().update({description:'Job text pasted before signing in'});await h.pump();
  h.owner='owner-c';h.render();await h.pump();assert.equal(h.value().form.description,'Job text pasted before signing in');
  assert.equal(JSON.parse(h.storage.get('tailoring-form-v1:owner-c')).description,'Job text pasted before signing in');
  h.owner='owner-d';h.render();await h.pump();assert.equal(h.value().form.description,'');h.dispose();
});
