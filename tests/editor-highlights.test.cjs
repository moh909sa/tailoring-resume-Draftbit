const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}) {
  const modules = new Map();
  function read(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
    assert.equal(result.diagnostics.length, 0, file);
    const mod = {exports:{}}; modules.set(file, mod);
    new Function('require','module','exports',result.outputText)(name => {
      if (Object.hasOwn(mocks,name)) return mocks[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file),name);
        return read(base + ['.ts','.tsx'].find(ext => fs.existsSync(path.join(root,base+ext))));
      }
      return require(name);
    },mod,mod.exports);
    return mod.exports;
  }
  return read(relative);
}
const { buildKeywordHighlights: build, termOccurrences, highlightPath } = load('lib/editor/keywordHighlights.ts');
const get = (result, ...path) => result.parts.get(highlightPath(path));
const colored = (result, ...path) => get(result,...path).filter(part => part.kind);
const history = original => ({original,changes:[],keywords:[]});

test('one saved phrase can have an existing yellow occurrence and a confirmed blue addition', () => {
  const source={summary:'Supported TCP/IP networks for clients.'};
  const saved={summary:'Supported TCP/IP networks for clients. Configured TCP/IP routing.'};
  const result=build(saved,['TCP/IP'],'Configure TCP/IP networks',history(source));
  assert.deepEqual(colored(result,'summary'),[{text:'TCP/IP',kind:'matched'},{text:'TCP/IP',kind:'added'}]);
  assert.equal(get(result,'summary').map(p=>p.text).join(''),saved.summary);
});

test('matches span all saved sections while entry identity survives reordering', () => {
  const first={id:1,company:'A',title:'Engineer',description:['Used TCP/IP for support.']};
  const second={id:2,company:'B',title:'Analyst',description:['Maintained records.']};
  const source={summary:'TCP/IP support',workExperience:[first,second],additional:{technicalSkills:['TCP/IP']}};
  const saved={...source,workExperience:[second,{...first,description:['Used TCP/IP for support.','Configured TCP/IP and VLAN.']}],additional:{technicalSkills:['TCP/IP','VLAN']}};
  const result=build(saved,['TCP/IP','VLAN'],'TCP/IP and VLAN',history(source));
  assert.equal(colored(result,'summary')[0].kind,'matched');
  assert.equal(colored(result,'workExperience',1,'description',0)[0].kind,'matched');
  assert.deepEqual(colored(result,'workExperience',1,'description',1).map(p=>p.kind),['added','added']);
  assert.equal(colored(result,'additional','technicalSkills',0)[0].kind,'matched');
  assert.equal(colored(result,'additional','technicalSkills',1)[0].kind,'added');
});

test('complete terms and punctuation are matched without LAN inside VLAN or SQL inside NoSQL', () => {
  const text='VLAN LAN LANs NoSQL SQL TCP/IP C++ C++17 .NET';
  const result=build({summary:text},['LAN','SQL','TCP/IP','C++','.NET'],text,history({summary:text}));
  assert.deepEqual(colored(result,'summary').map(p=>p.text),['LAN','SQL','TCP/IP','C++','.NET']);
  assert.equal(termOccurrences('PLAN VLAN LAN','LAN').length,1);
});

test('long phrases, HTML entities, paragraphs and rich-text bullets retain readable saved content', () => {
  const { resumeReviewText }=load('lib/editor/resumeText.ts');
  const html='<p>English communication (written &amp; spoken)</p><ul><li>Troubleshooting <b>TCP/IP</b></li></ul><ol><li>First task</li><li>Second task</li></ol>';
  const text=resumeReviewText(html),result=build({summary:html},['English communication (written & spoken)','TCP/IP'],'English communication (written & spoken), TCP/IP',history({summary:html}));
  assert.match(text,/• Troubleshooting TCP\/IP/);assert.match(text,/1\. First task/);assert.match(text,/2\. Second task/);
  assert.equal(get(result,'summary').map(p=>p.text).join(''),text);
  assert.deepEqual(colored(result,'summary').map(p=>p.text),['English communication (written & spoken)','TCP/IP']);
});

test('ambiguous identical copies stay uncolored instead of assigning an arbitrary blue occurrence', () => {
  const result=build({summary:'TCP/IP TCP/IP'},['TCP/IP'],'TCP/IP',history({summary:'TCP/IP'}));
  assert.deepEqual(colored(result,'summary'),[]);
  assert.equal(result.unverified,2);
});

test('keywords and attestations without source history never establish an added location', () => {
  const result=build({summary:'TCP/IP support'},['TCP/IP'],'TCP/IP',{original:null,changes:[],keywords:['TCP/IP']});
  assert.deepEqual(colored(result,'summary'),[]);assert.equal(get(result,'summary').map(p=>p.text).join(''),'TCP/IP support');
});

test('exact tracked comparisons recover verified additions when the original is unavailable', () => {
  const saved={workExperience:[{description:['Supported TCP/IP networks. Added VLAN support.']}]};
  const recorded={original:null,keywords:['TCP/IP','VLAN'],changes:[{path:'workExperience[0].description[0]',before:'Supported TCP/IP networks.',after:saved.workExperience[0].description[0]}]};
  const result=build(saved,[],'TCP/IP VLAN',recorded);
  assert.deepEqual(colored(result,'workExperience',0,'description',0),[{text:'TCP/IP',kind:'matched'},{text:'VLAN',kind:'added'}]);
  const edited=build({workExperience:[{description:['Added VLAN support. Supported TCP/IP networks.']} ]},[],'TCP/IP VLAN',recorded);
  assert.deepEqual(colored(edited,'workExperience',0,'description',0),[],'a changed after-value cannot inherit guessed positions');
});

test('different entry identities are not compared by array position', () => {
  const source={workExperience:[{company:'A',title:'Engineer',description:['Used TCP/IP.']}]};
  const saved={workExperience:[{company:'B',title:'Analyst',description:['TCP/IP support.']}]};
  const result=build(saved,['TCP/IP'],'TCP/IP',history(source));
  assert.deepEqual(colored(result,'workExperience',0,'description',0),[]);
});

test('job description remains a matching input and metadata is never a document keyword', () => {
  const saved={summary:'TCP/IP SQL',sectionMeta:[{displayName:'LAN'}],id:'TCP/IP'};
  const result=build(saved,['TCP/IP','SQL','LAN'],'SQL',history(saved));
  assert.deepEqual(colored(result,'summary'),[{text:'SQL',kind:'matched'}]);
  assert.equal(result.parts.has(highlightPath(['sectionMeta',0,'displayName'])),false);
  assert.equal(result.parts.has(highlightPath(['id'])),false);
});

test('large rewritten text does not use the broad diff fallback as proof of an addition', () => {
  const before=Array.from({length:500},(_,i)=>`old${i}`).join(' ')+' TCP/IP';
  const after='TCP/IP '+Array.from({length:500},(_,i)=>`new${i}`).join(' ');
  const result=build({summary:after},['TCP/IP'],'TCP/IP',history({summary:before}));
  assert.deepEqual(colored(result,'summary'),[]);
});

test('later saved edits are compared with the source, and the saved input is never mutated', () => {
  const source={summary:'TCP/IP support',customSections:{custom_1:{sectionType:'text',text:'Maintained networks'}}};
  const saved={summary:'TCP/IP support with VLAN',customSections:{custom_1:{sectionType:'text',text:'Maintained SQL networks'}}};
  const original=JSON.stringify(saved),result=build(saved,['TCP/IP','VLAN','SQL'],'TCP/IP VLAN SQL',history(source));
  assert.deepEqual(colored(result,'summary').map(p=>p.kind),['matched','added']);
  assert.equal(colored(result,'customSections','custom_1','text')[0].kind,'added');
  assert.equal(JSON.stringify(saved),original);
});

test('history uses authenticated read-only existing endpoints and tolerates a deleted original', async () => {
  const calls=[],previous=global.fetch;
  const cv={mobileAccessToken:async owner=>{assert.equal(owner,'owner-a');return 'owner-token';},mobileEndpoint:path=>'https://api.example/mobile'+path,apiErrorMessage:()=> 'Unavailable',CvApiError:class extends Error{constructor(message,status){super(message);this.status=status;}}};
  const {getEditorKeywordHistory}=load('lib/editor/api.ts',{'@/lib/cv/api':cv});
  let missing=false,wrong=false;
  global.fetch=async (url,options)=>{
    calls.push({url,options});
    const original=url.endsWith('/resumes/source');
    return {ok:!(original&&missing),status:original&&missing?404:200,json:async()=>original?{id:'source',processing_status:'ready',processed_resume:{summary:'TCP/IP'}}:{id:wrong?'other':'tailored',status:'ready',source_resume_id:'source',preview_json:{detailed_changes:[{field_path:'summary',new_value:'TCP/IP VLAN',original_value:'TCP/IP',change_type:'modified'}],keyword_placements:[{keyword:'VLAN',paths:['summary']}]}}};
  };
  try {
    const result=await getEditorKeywordHistory('owner-a','tailored',new AbortController().signal);
    assert.deepEqual(result.original,{summary:'TCP/IP'});assert.equal(result.changes[0].path,'summary');assert.deepEqual(result.keywords,['VLAN']);
    assert.equal(calls.length,2);assert.ok(calls.every(({options})=>options.method==='GET'&&options.headers.Authorization==='Bearer owner-token'&&!options.body));
    missing=true;const partial=await getEditorKeywordHistory('owner-a','tailored',new AbortController().signal);
    assert.equal(partial.original,null);assert.equal(partial.changes.length,1);
    wrong=true;const count=calls.length;await assert.rejects(getEditorKeywordHistory('owner-a','tailored',new AbortController().signal),/another CV/);assert.equal(calls.length,count+1);
  } finally {global.fetch=previous;}
});


test('phrases never join separate skill items or bullets into a fabricated match', () => {
  const source={additional:{technicalSkills:['Network','Support']}};
  const separate=build(source,['Network Support'],'Network Support',history(source));
  assert.equal(separate.verified,0);
  const saved={additional:{technicalSkills:['Network Support']}};
  assert.deepEqual(colored(build(saved,['Network Support'],'Network Support',history(source)),'additional','technicalSkills',0),[{text:'Network Support',kind:'added'}]);
});

function hookHarness(readHistory) {
  const slots=[];let cursor=0,dirty=false,args=[],result;
  const effects=[];
  const react={
    useRef(initial) {const i=cursor++;return (slots[i]??={current:initial});},
    useState(initial) {const i=cursor++;slots[i]??={value:initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true;}];},
    useEffect(fn,deps) {const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const {useKeywordHistory}=load('lib/editor/useKeywordHistory.ts',{react,'./api':{getEditorKeywordHistory:readHistory}});
  const h={
    render(...next) {if(next.length)args=next;cursor=0;dirty=false;result=useKeywordHistory(...args);for(const effect of effects.splice(0))effect();return result;},
    async pump() {for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)h.render();}return result;},
    dispose() {slots.forEach(slot=>slot?.cleanup?.());},
  };
  return h;
}

test('history starts with owner/resume IDs, survives repeated tab renders, and fences account/document changes', async()=>{
  const pending=[];
  const h=hookHarness((owner,id,signal)=>new Promise((resolve,reject)=>pending.push({owner,id,signal,resolve,reject})));
  try {
    assert.equal(h.render(undefined,'cv').historyLoading,false);assert.equal(pending.length,0);
    h.render('a','cv');assert.equal((await h.pump()).historyLoading,true);
    for(let i=0;i<6;i++)h.render('a','cv');
    assert.equal(pending.length,1,'in-flight reads are reused');
    assert.equal(h.render('b','cv').history,null);assert.equal(pending[0].signal.aborted,true);
    pending[0].resolve(history({summary:'PRIVATE ACCOUNT A'}));
    assert.equal((await h.pump()).history,null);
    const loaded=history({summary:'ACCOUNT B'});pending[1].resolve(loaded);
    assert.equal((await h.pump()).history,loaded);
    for(let i=0;i<6;i++){const view=h.render('b','cv');assert.equal(view.history,loaded);assert.equal(view.historyLoading,false);}
    assert.equal(pending.length,2,'tab renders do not reload or clear history');
    assert.equal(h.render('b','other').history,null);
    pending[2].reject(Error('Network failed'));
    const failed=await h.pump();assert.equal(failed.historyError,true);assert.equal(failed.historyLoading,false);
    failed.retryHistory();failed.retryHistory();await h.pump();assert.equal(pending.length,4);
    failed.retryHistory();await h.pump();assert.equal(pending.length,4,'retry cannot restart an in-flight request');
    pending[3].resolve({original:null,changes:[],keywords:[]});
    const partial=await h.pump();assert.equal(partial.historyError,false,'unavailable provenance is not a loading failure');
    assert.equal(partial.historyLoading,false);
    h.render(undefined,undefined);assert.equal((await h.pump()).history,null);
  } finally {h.dispose();}
});


test('moving an existing phrase is not treated as adding a keyword',()=>{
  const source={summary:'TCP/IP supported one two three four five six seven eight.'};
  const saved={summary:'Supported one two three four five six seven eight. TCP/IP'};
  const result=build(saved,['TCP/IP'],'TCP/IP',history(source));
  assert.ok(!colored(result,'summary').some(part=>part.kind==='added'));
});

test('an old occurrence moved to uncertain fields cannot make every new location blue',()=>{
  const source={summary:'TCP/IP',customSections:{a:{text:''},b:{text:''}}};
  const saved={summary:'',customSections:{a:{text:'TCP/IP'},b:{text:'TCP/IP'}}};
  const result=build(saved,['TCP/IP'],'TCP/IP',history(source));
  assert.deepEqual(colored(result,'customSections','a','text'),[]);
  assert.deepEqual(colored(result,'customSections','b','text'),[]);
});
