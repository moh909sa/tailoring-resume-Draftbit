const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const root = path.resolve(__dirname, "..");
const SOURCE = "11111111-1111-4111-8111-111111111111";
const TAILORED = "22222222-2222-4222-8222-222222222222";
const ENGINE = "33333333-3333-4333-8333-333333333333";
const OWNER = "account-a";
const tick = () => new Promise(resolve => setImmediate(resolve));
const copy = value => JSON.parse(JSON.stringify(value));

function load(relative, mocks = {}) {
  const modules = new Map();
  function read(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const result = ts.transpileModule(source, {fileName:file, reportDiagnostics:true, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
    assert.equal(result.diagnostics.length, 0, file);
    const mod = {exports:{}};
    modules.set(file, mod);
    const localRequire = name => {
      if (Object.hasOwn(mocks,name)) return mocks[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file),name);
        const extension = [".ts",".tsx"].find(ext=>fs.existsSync(path.join(root,base+ext)));
        return read(base+extension);
      }
      return require(name);
    };
    new Function("require","module","exports",result.outputText)(localRequire,mod,mod.exports);
    return mod.exports;
  }
  return read(relative);
}
function nodes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value,...nodes(value.props?.children)];
}
function text(value) {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(text).join("");
  return typeof value === "object" ? text(value.props?.children) : String(value);
}
function harness() {
  let cursor=0, tree, component, dirty=false;
  const slots=[],effects=[];
  const h={params:{id:TAILORED},auth:{session:{user:{id:OWNER}},loading:false},calls:[],canGoBack:true,focused:true};
  const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  const hooks={...React,
    useState(initial) {const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==="function"?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==="function"?next(slots[i].value):next;dirty=true;}];},
    useRef(initial) {const i=cursor++;return (slots[i]??={current:initial});},
    useMemo(fn,deps) {const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useCallback(fn,deps) {return hooks.useMemo(()=>fn,deps);},
    useEffect(fn,deps) {const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
  };
  const router={push:href=>h.calls.push(["push",href]),replace:href=>h.calls.push(["replace",href]),back:()=>h.calls.push(["back"]),navigate:href=>h.calls.push(["navigate",href]),canGoBack:()=>h.canGoBack};
  const mocks={
    react:hooks,
    "react-native":{View:"View",Text:"Text",Pressable:"Pressable",ScrollView:"ScrollView",FlatList:"FlatList",ActivityIndicator:"Spinner",Platform:{OS:"web"},Keyboard:{dismiss(){}},AppState:{addEventListener:()=>({remove(){}})}},
    "expo-router":{router,useRouter:()=>router,useLocalSearchParams:()=>h.params,Stack:{Screen:"StackScreen"},useFocusEffect:fn=>hooks.useEffect(()=>h.focused?fn():undefined,[fn,h.focused])},
    "react-native-safe-area-context":{SafeAreaView:"SafeAreaView",useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})},
    "@/lib/auth/AuthProvider":{useAuth:()=>h.auth},
    "@/theming/ThemeProvider":{useTheme:()=>({theme:{colors:{primary:"purple"}}})},
    "@/lib/icons/LucideIcon":{__esModule:true,default:"Icon"},
    "@/lib/utils":{cn:(...v)=>v.filter(Boolean).join(" ")},
    "@/components/tailoring/ReviewContent":{readableLabel:key=>key},
    "@react-native-async-storage/async-storage":{__esModule:true,default:{getItem:async()=>null,setItem:async()=>{}}},
    "expo-crypto":{randomUUID:()=>"44444444-4444-4444-8444-444444444444"},
  };
  for(const [file,name] of Object.entries({"components/layout/AppScreen":"AppScreen","components/layout/AppSheet":"AppSheet","components/layout/ScreenHeader":"ScreenHeader","components/library/LibrarySections":"LibrarySections","components/cv/AccountSheet":"AccountSheet","components/cv/Notice":"Notice","components/cv/DocumentEmptyState":"DocumentEmptyState","components/ui/button":"Button","components/ui/text":"Text","components/editor/SectionEditor":"SectionEditor","components/editor/JobMatch":"JobMatch","components/editor/PdfViewer":"PdfViewer","components/editor/PdfReadability":"PdfReadability"}))mocks["@/"+file]={[name]:name};
  h.open=(file,extra={},exportName='default',props={})=>{const loaded=load(file,{...mocks,...extra})[exportName];component=()=>loaded(props);h.render();};
  h.render=()=>{cursor=0;dirty=false;tree=component();for(const effect of effects.splice(0))effect();return tree;};
  h.pump=async()=>{for(let i=0;i<8;i++){await tick();if(dirty)h.render();}};
  h.find=predicate=>nodes(tree).find(predicate);
  h.button=label=>h.find(n=>n.type==="Button"&&text(n)===label);
  h.getText=()=>text(tree);
  h.blur=()=>{h.focused=false;h.render();};
  h.focus=()=>{h.focused=true;h.render();};
  h.dispose=()=>slots.forEach(slot=>slot.cleanup?.());
  h.mocks=mocks;
  return h;
}
const routes=load("lib/editor/routes.ts");
const {CvEditorSession}=load("lib/editor/session.ts");
const makeDocument=()=>({tailoring_id:TAILORED,revision:6,updated_at:"2026-11-01T12:00:00Z",resume:{personalInfo:{name:"Test fixture"},summary:"Before",workExperience:[],education:[],additional:{technicalSkills:[]}},job:{title:"Engineer",company:null,description:"Isolated test job"},confirmed_skills:[],analysis:null});

test("route parameters require a single tailored UUID and optional positive saved revision",()=>{
  for(const id of [undefined,"","[id]","not-a-uuid",[TAILORED,SOURCE]])assert.ok(routes.readEditorRoute({id}).error);
  assert.deepEqual(routes.readEditorRoute({id:[TAILORED],revision:["7"]}),{id:TAILORED,revision:7,error:null});
  assert.deepEqual(routes.readEditorRoute({id:TAILORED}),{id:TAILORED,revision:undefined,error:null});
  assert.equal(routes.readEditorRoute({id:"ABCDEF12-3456-4789-ABCD-123456ABCDEF"}).id,"abcdef12-3456-4789-abcd-123456abcdef");
  for(const revision of ["","0","-1","NaN","Infinity","1.5","9007199254740992",["6","7"]])assert.ok(routes.readEditorRoute({id:TAILORED,revision}).error);
});
test("signed-in editor hook with no/invalid ID stops loading and never requests a document",()=>{
  for(const id of [undefined,"[id]",[TAILORED,SOURCE]]) {
    const h=harness();let reads=0;
    const {useCvEditor}=load("lib/editor/useCvEditor.ts",{...h.mocks,"./api":{},"@/lib/editor/api":{getEditorDocument:async()=>{reads++;}}});
    const result=useCvEditor(id);
    assert.equal(result.loading,false);assert.match(result.error,/saved CV|invalid/);assert.equal(reads,0);h.dispose();
  }
});
test("library opens PDF first using the saved tailoring ID and labels cards Open",async()=>{
  const h=harness();h.mocks['react-native'].Platform.OS='ios';h.auth={session:null,loading:false};
  h.open("app/(tabs)/library/tailored-cvs.tsx",{"@/lib/editor/api":{listTailoredCvs:async(owner)=>{assert.equal(owner,OWNER);return [{id:TAILORED,source_resume_id:SOURCE,engine_resume_id:ENGINE,status:"ready",job_title:"Engineer",company:null,created_at:"2026-11-01",updated_at:"2026-11-01"}];}}});
  const empty=h.find(n=>n.type==="FlatList").props.ListEmptyComponent;
  empty.props.action.props.onPress();h.render();assert.equal(h.find(n=>n.type==="AccountSheet").props.visible,true);
  h.auth={session:{user:{id:OWNER}},loading:false};h.render();await h.pump();
  const list=h.find(n=>n.type==="FlatList");assert.equal(list.props.data.length,1);
  list.props.renderItem({item:list.props.data[0]}).props.onPress();
  assert.equal(list.props.renderItem({item:list.props.data[0]}).props.accessibilityLabel,"Open Engineer");
  assert.deepEqual(h.calls.at(-1),["push",{pathname:"/cv-editor/[id]/preview",params:{id:TAILORED}}]);h.dispose();
});
test("editor waits for latest edit acknowledgement, previews its revision, and Back returns to saved library",async()=>{
  let remote=makeDocument(),release,stored=null;const mutations=[];
  const manager=new CvEditorSession({read:async()=>null,write:async raw=>{stored=raw;},uuid:()=>"44444444-4444-4444-8444-444444444444",parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{mutations.push(copy(body));await new Promise(r=>release=r);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  await manager.restore();
  const h=harness();const api=()=>({...manager.snapshot,routeError:null,updateResume:v=>manager.update(v),updateConfirmedSkills:()=>{},flush:()=>manager.flush(),reload:()=>manager.refresh(),resolveConflict:mode=>manager.resolveConflict(mode),refreshAnalysis:()=>manager.refreshAnalysis()});
  h.open("app/cv-editor/[id].tsx",{"@/lib/editor/useCvEditor":{useCvEditor:api}});
  h.find(n=>n.props?.accessibilityLabel==="Edit Summary").props.onPress();h.render();
  const section=h.find(n=>n.type==="SectionEditor");section.props.onChange("After editing");section.props.onClose();h.render();
  h.button("Preview PDF").props.onPress();await tick();assert.equal(h.calls.length,0,"must not navigate before PATCH acknowledgement");
  assert.equal(mutations[0].expected_revision,6);assert.equal(JSON.parse(stored).pending.mutation_id,mutations[0].mutation_id);
  release();await h.pump();
  assert.deepEqual(h.calls.at(-1),["push",{pathname:"/cv-editor/[id]/preview",params:{id:TAILORED,revision:"7"}}]);
  assert.equal(remote.resume.summary,"After editing");
  h.find(n=>n.props?.accessibilityLabel==="Back to saved CVs").props.onPress();
  assert.deepEqual(h.calls.at(-1),["replace","/(tabs)/library/tailored-cvs"]);h.dispose();manager.dispose();
});
test("PDF screen loads the saved tailoring revision, shares the exact artifact, and navigates back",async()=>{
  const h=harness();h.params={id:TAILORED,revision:"7"};const seen=[];
  const artifact={uri:"blob:isolated-pdf-test",filename:"Tailored.pdf",revision:7,dispose:async()=>seen.push("disposed")};
  h.open("app/cv-editor/[id]/preview.tsx",{"@/lib/editor/api":{getEditorDocument:async(owner,id)=>{assert.equal(owner,OWNER);assert.equal(id,TAILORED);return {...makeDocument(),revision:7};}},"@/lib/editor/pdf":{loadEditorPdf:async(owner,id,revision,size)=>{seen.push([owner,id,revision,size]);return artifact;},shareEditorPdf:async pdf=>{assert.equal(pdf,artifact);seen.push("shared");}}});
  await h.pump();assert.equal(h.find(n=>n.type==="PdfViewer").props.uri,artifact.uri);
  assert.deepEqual(seen[0],[OWNER,TAILORED,7,"A4"]);
  h.button("Download PDF").props.onPress();await h.pump();assert.ok(seen.includes("shared"));
  h.find(n=>n.props?.accessibilityLabel==="Back").props.onPress();assert.deepEqual(h.calls.at(-1),["back"]);h.dispose();await tick();assert.ok(seen.includes("disposed"));
});
test("missing/invalid PDF parameters show recovery instead of loading or issuing requests",async()=>{
  for(const params of [{},{id:"[id]"},{id:TAILORED,revision:"0"}]){
    const h=harness();h.params=params;h.canGoBack=false;let reads=0;
    h.open("app/cv-editor/[id]/preview.tsx",{"@/lib/editor/api":{getEditorDocument:async()=>reads++},"@/lib/editor/pdf":{}});await h.pump();
    assert.equal(reads,0);assert.equal(h.find(n=>n.type==="Spinner"),undefined);assert.match(h.getText(),/Choose a saved CV|invalid/);
    h.button(params.id===TAILORED?"Return to editor":"Return to Tailored CVs").props.onPress();
    assert.deepEqual(h.calls.at(-1),params.id===TAILORED?["replace",{pathname:"/cv-editor/[id]",params:{id:TAILORED}}]:["replace","/(tabs)/library/tailored-cvs"]);h.dispose();
  }
});
test("signed-out PDF screen does not bypass auth, and missing CV responses stop loading",async()=>{
  for(const signedIn of [false,true]){
    const h=harness();h.auth.session=signedIn?{user:{id:OWNER}}:null;let reads=0;
    h.open("app/cv-editor/[id]/preview.tsx",{"@/lib/editor/api":{getEditorDocument:async()=>{reads++;throw Error("This saved CV could not be found.");}},"@/lib/editor/pdf":{loadEditorPdf:async()=>assert.fail("must not request PDF")}});await h.pump();
    assert.equal(reads,signedIn?1:0);assert.equal(h.find(n=>n.type==="Spinner"),undefined);assert.match(h.getText(),signedIn?/could not be found/:/sign in/);h.dispose();
  }
});
test("editor API sends current save contract to tailoring ID and rejects mismatched document responses",async()=>{
  const oldFetch=global.fetch;const calls=[];
  class ApiError extends Error {constructor(message,status){super(message);this.status=status;}}
  const auth={mobileEndpoint:p=>"https://contract-test.invalid/api/v1/mobile"+p,mobileAccessToken:async owner=>{assert.equal(owner,OWNER);return 'isolated-test-token';},apiErrorMessage:(_status,payload,fallback)=>payload?.detail||fallback,CvApiError:ApiError};
  const api=load("lib/editor/api.ts",{"@/lib/cv/api":auth});
  try {
    let response=makeDocument();
    global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>copy(response)};};
    assert.equal((await api.getEditorDocument(OWNER,TAILORED,new AbortController().signal)).tailoring_id,TAILORED);
    const payload={expected_revision:6,mutation_id:'44444444-4444-4444-8444-444444444444',resume:{summary:'User edit'},confirmed_skills:['TypeScript']};
    response={...response,revision:7,resume:payload.resume,confirmed_skills:payload.confirmed_skills};
    await api.saveEditorDocument(OWNER,TAILORED,payload,new AbortController().signal);
    assert.equal(calls[1].url,'https://contract-test.invalid/api/v1/mobile/tailored-cvs/'+TAILORED+'/editor');
    assert.equal(calls[1].options.method,'PATCH');assert.deepEqual(JSON.parse(calls[1].options.body),payload);
    assert.equal(calls[1].options.headers.Authorization,'Bearer isolated-test-token');
    response={...response,tailoring_id:SOURCE};
    await assert.rejects(api.getEditorDocument(OWNER,TAILORED,new AbortController().signal),/different CV/);
    global.fetch=async()=>({ok:false,status:404,json:async()=>({detail:'Tailored CV not found'})});
    await assert.rejects(api.getEditorDocument(OWNER,TAILORED,new AbortController().signal),e=>e.status===404&&/Return to Tailored CVs/.test(e.message));
  } finally {global.fetch=oldFetch;}
});
test("web PDF transport pins revision, validates response, and download uses the same Blob",async()=>{
  const oldFetch=global.fetch,oldDocument=global.document;let clicked=false,downloadHref=null;
  const service=load('lib/editor/pdf.web.ts',{'@/lib/cv/api':{mobileAccessToken:async owner=>{assert.equal(owner,OWNER);return 'isolated-test-token';},mobileEndpoint:p=>'https://contract-test.invalid/api/v1/mobile'+p}});
  let artifact;
  try {
    global.fetch=async(url,options)=>{
      assert.equal(url,'https://contract-test.invalid/api/v1/mobile/tailored-cvs/'+TAILORED+'/pdf?revision=7&page_size=A4');
      assert.equal(options.headers.Authorization,'Bearer isolated-test-token');
      return {ok:true,status:200,headers:new Headers({'content-type':'application/pdf','x-resume-revision':'7','x-pdf-page-count':'1'}),blob:async()=>new Blob(['%PDF-1.4\nIsolated transport test'],{type:'application/pdf'})};
    };
    artifact=await service.loadEditorPdf(OWNER,TAILORED,7,'A4',new AbortController().signal);
    assert.equal(artifact.revision,7);assert.equal(artifact.pageCount,1);
    const anchor={click(){clicked=true;downloadHref=this.href;},remove(){}};
    global.document={createElement:()=>anchor,body:{appendChild(){}}};
    await service.shareEditorPdf(artifact);assert.equal(clicked,true);assert.equal(downloadHref,artifact.uri);
  } finally {await artifact?.dispose();global.fetch=oldFetch;global.document=oldDocument;}
});


test("Tailor opens saved CVs in PDF first and keeps unsaved Continue review without starting another AI job", async () => {
  for(const saved of [false,true]) {
    const h=harness();h.mocks['react-native'].Platform.OS='ios';let starts=0;
    const input={resumeId:SOURCE,filename:'Original.pdf',jobDescription:'Full exact job description. '.repeat(5).trim()};
    const run={input,tailoringId:TAILORED,status:'success',saved,hydrating:false,jobRecovering:false,jobConnectionError:null,start:()=>{starts++;return true;}};
    h.open('app/(tabs)/tailor.tsx',{
      '@/lib/tailoring/TailoringProvider':{useTailoring:()=>run},
      '@/lib/tailoring/useTailorForm':{useTailorForm:()=>({form:{selectedId:SOURCE,description:input.jobDescription},loading:false,saving:false,error:null,update:()=>{}})},
      '@/lib/cv/useMyCv':{useMyCv:()=>({resumes:[{id:SOURCE,original_filename:'Original.pdf',processing_status:'ready',recovery_required:false}],loading:false})},
      '@/components/cv/CvSelectionSheet':{CvSelectionSheet:'SelectionSheet'},
      '@/components/ui/textarea':{Textarea:'Textarea'},
    });
    h.button(saved?'Open saved CV':'Continue review').props.onPress();
    assert.equal(starts,0);
    assert.deepEqual(h.calls.at(-1),['push',saved?{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED}}:{pathname:'/tailoring/review',params:{tailoringId:TAILORED}}]);h.dispose();
  }
});

test('PDF Back returns to the originating screen for existing CVs and to Tailored CVs after confirmation',async(t)=>{
  for(const origin of ['Tailor','Library','Changes confirmation'])await t.test(origin,async(t)=>{
    const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';
    h.params={id:TAILORED,...(origin==='Changes confirmation'?{returnTo:'library'}:{})};
    h.open('app/cv-editor/[id]/preview.tsx',{
      '@/lib/editor/api':{getEditorDocument:async()=>makeDocument()},
      '@/lib/editor/pdf':{loadEditorPdf:async()=>({uri:'file:///saved.pdf',revision:6,dispose:async()=>{}})},
    });
    await h.pump();assert.ok(h.button('Edit Resume'));assert.equal(h.button('Download PDF').props.disabled,false);
    h.find(n=>n.props.accessibilityLabel==='Back').props.onPress();
    assert.deepEqual(h.calls,[origin==='Changes confirmation'?['replace','/(tabs)/library/tailored-cvs']:['back']]);
  });
});


test("Job Match does not turn role keywords into invented skills, and confirmed missing skills can be restored", () => {
  const h=harness();const added=[];
  const props={analysis:{status:'current',revision:1,score:{overall_score:70,sub_scores:{},recommendations:[]},missing_keywords:['Senior engineer','Python'],matched_keywords:[],required_skills:['Python'],preferred_skills:[],total_keywords:2,matched_count:0},revision:1,dirty:false,loading:false,jobDescription:'Full job',confirmedSkills:['Python'],onAddSkill:skill=>added.push(skill),onRefresh:()=>{},onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  h.find(n=>n.props.accessibilityLabel==='Missing Keywords').props.onPress();const tree=h.render();
  const buttons=nodes(tree).filter(n=>n.props.accessibilityLabel?.includes('add to Skills'));
  assert.equal(buttons.length,1);buttons[0].props.onPress();assert.deepEqual(added,['Python']);
  assert.match(text(tree),/Senior engineer/);assert.match(text(tree),/Job keyword/);
});

test("leaving while a save is in flight cannot reopen a late PDF preview", async () => {
  const h=harness();let release;
  const pending=new Promise(resolve=>release=resolve);
  const document=makeDocument();
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saving',problem:null,analysis:null,analysisLoading:false,flush:()=>pending,updateResume(){},reload(){},resolveConflict(){},refreshAnalysis(){}};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  h.button('Preview PDF').props.onPress();await tick();
  h.find(n=>n.props?.accessibilityLabel==='Back to saved CVs').props.onPress();
  release(document);await h.pump();
  assert.ok(!h.calls.some(([method])=>method==='push'));
  assert.equal(h.calls.at(-1)[1],'/(tabs)/library/tailored-cvs');h.dispose();
});

// Exercise the installed native renderer, rather than mocking NativeWind as the
// earlier navigation tests do. Its diagnostic serializer reaches real React
// Navigation default-context getters through React element metadata.
function installedSource(relative, mocks) {
  const filename=path.join(root,"node_modules",relative);
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.equal(compiled.diagnostics.length,0);
  const mod={exports:{}};
  new Function('require','module','exports',compiled.outputText)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),mod,mod.exports);
  return mod.exports;
}
let nativeStyles;
async function nativeTransition() {
  if(!nativeStyles) nativeStyles=(async()=>{
    const postcss=require('postcss'),tailwind=require('tailwindcss');
    const config=require('../tailwind.config.js');
    const css=await postcss([tailwind({...config,safelist:[],content:[{raw:'bg-card bg-muted bg-background bg-primary border-primary border-transparent border-b-2 min-h-11 min-h-12 flex-1 items-center justify-center rounded-xl overflow-hidden gap-4 px-8',extension:'html'}]})]).process('@tailwind utilities;',{from:undefined});
    return require('react-native-css-interop/css-to-rn').cssToReactNativeRuntime(Buffer.from(css.css),{inlineRem:14}).rules;
  })();
  const rules=await nativeStyles;
  const {NavigationStateContext}=installedSource('@react-navigation/core/src/NavigationStateContext.tsx',{react:React});
  const {renderComponent,UpgradeState}=installedSource('react-native-css-interop/src/runtime/native/render-component.tsx',{
    react:React,'react-native':{Pressable:'Pressable'},'./globals':{containerContext:React.createContext({})},'./styles':{VariableContext:React.createContext({})}
  });
  const state={canUpgradeWarn:false,variables:UpgradeState.NONE,containers:UpgradeState.NONE,animated:UpgradeState.NONE,pressable:UpgradeState.NONE,originalProps:null};
  const child=React.createElement(NavigationStateContext.Provider,{value:{getKey:()=>TAILORED,getState:()=>({routes:[]})}},'Screen content');
  return className=>{
    // Matches native-interop's rule-set upgrade, using actual compiled app colors.
    if(className.split(/\s+/).some(name=>rules[name]?.variables)) state.variables ||= UpgradeState.SHOULD_UPGRADE;
    state.originalProps={className,children:child};
    return renderComponent('View',state,{children:child},{style:{flex:1}},state.variables?{'--tw-bg-opacity':1}:undefined);
  };
}

test('native styling reproducer identifies the exact misleading navigation exception',async()=>{
  const render=await nativeTransition();
  render('flex-1');
  assert.throws(()=>render('flex-1 bg-card'),error=>/Couldn.t find a navigation context/.test(error.message)&&/printUpgradeWarning/.test(error.stack));
});

test('saved editor can switch repeatedly between Edit CV and Job Match through native style resolution',async()=>{
  const h=harness(),document=makeDocument();let updates=0;
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,refreshAnalysis:()=>{updates++;},flush:async()=>document};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  const tabs=()=>['Edit CV','Job Match'].map(label=>h.find(n=>n.props.accessibilityRole==='tab'&&text(n)===label));
  const renderers=[await nativeTransition(),await nativeTransition()];
  const paint=()=>tabs().forEach((node,i)=>assert.doesNotThrow(()=>renderers[i](node.props.className),text(node)));
  paint();
  for(const label of ['Job Match','Edit CV','Job Match','Edit CV']){
    tabs().find(n=>text(n)===label).props.onPress();h.render();paint();
    if(label==='Job Match')assert.ok(h.find(n=>n.type==='JobMatch'));
  }
  const secondaryPaint=[await nativeTransition(),await nativeTransition()];
  const secondaryLabels=['Resume Content','Design & Layout','Overview','Keyword Highlights'];
  const paintSecondary=()=>nodes(h.render()).filter(n=>n.props.accessibilityRole==='tab'&&secondaryLabels.includes(n.props.accessibilityLabel)).forEach((node,index)=>assert.doesNotThrow(()=>secondaryPaint[index](node.props.className)));
  paintSecondary();
  for(const label of ['Design & Layout','Resume Content','Job Match','Keyword Highlights','Overview','Edit CV']){
    h.find(n=>n.props.accessibilityRole==='tab'&&text(n)===label).props.onPress();h.render();paintSecondary();
  }
  assert.equal(updates,1);assert.deepEqual(editor.resume,document.resume);h.dispose();
});

test('native PDF loading-to-document and paper-size transitions preserve context and Back returns to the editor',async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'6'};
  let release,reads=0;const pending=new Promise(resolve=>release=resolve);
  const sizes=[];
  h.open('app/cv-editor/[id]/preview.tsx',{
    '@/lib/editor/api':{getEditorDocument:async()=>++reads===1?pending:makeDocument()},
    '@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision,size)=>{sizes.push(size);return{uri:'file:///isolated/'+size+'.pdf',revision,dispose:async()=>{}};},shareEditorPdf:async()=>{}}
  });
  h.render();
  const children=node=>Array.isArray(node.props.children)?node.props.children:[node.props.children];
  const loading=()=>h.find(n=>n.type==='View'&&children(n).some(c=>c?.type==='Spinner'));
  const document=()=>h.find(n=>n.type==='View'&&children(n).some(c=>c?.type==='PdfViewer'));
  const paint=await nativeTransition();paint(loading().props.className);
  release(makeDocument());await h.pump();
  assert.doesNotThrow(()=>paint(document().props.className));
  h.find(n=>n.props.accessibilityLabel==='Letter paper size').props.onPress();h.render();
  assert.doesNotThrow(()=>paint(loading().props.className));await h.pump();
  assert.doesNotThrow(()=>paint(document().props.className));assert.deepEqual(sizes,['A4','LETTER']);
  h.find(n=>n.props.accessibilityLabel==='Back').props.onPress();assert.deepEqual(h.calls.at(-1),['back']);h.dispose();
});

test('iOS preview downloads directly, then reloads edited saved content on return with the selected paper size',async(t)=>{
  for(const size of ['A4','LETTER'])await t.test(size,async(t)=>{
    const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';
    h.params={id:TAILORED,revision:'6'};
    let remote=makeDocument(),release,signal;const loaded=[],shared=[],disposed=[];
    h.open('app/cv-editor/[id]/preview.tsx',{
      '@/lib/editor/api':{getEditorDocument:async()=>copy(remote)},
      '@/lib/editor/pdf':{
        loadEditorPdf:async(owner,id,revision,pageSize,abort)=>{
          assert.equal(owner,OWNER);assert.equal(id,TAILORED);signal=abort;
          if(revision===7)await new Promise(resolve=>release=resolve);
          const artifact={uri:`file:///saved-${revision}-${pageSize}.pdf`,revision,pageCount:2,dispose:async()=>disposed.push(`${revision}-${pageSize}`)};
          loaded.push({artifact,pageSize,summary:remote.resume.summary});return artifact;
        },
        shareEditorPdf:async pdf=>shared.push(pdf),
      },
    });
    await h.pump();
    if(size==='LETTER'){
      h.find(n=>n.props.accessibilityLabel==='Letter paper size').props.onPress();await h.pump();
    }
    assert.match(h.getText(),/Engineer/);assert.match(h.getText(),/2 pages/);
    h.button('Download PDF').props.onPress();await h.pump();
    assert.equal(shared[0],loaded.at(-1).artifact);assert.equal(loaded.at(-1).pageSize,size);
    h.button('Edit Resume').props.onPress();
    assert.deepEqual(h.calls.at(-1),['push',{pathname:'/cv-editor/[id]',params:{id:TAILORED,returnTo:'preview',pageSize:size}}]);
    h.blur();await h.pump();assert.equal(signal.aborted,true);
    assert.equal(h.button('Download PDF').props.disabled,true);
    remote={...remote,revision:7,resume:{...remote.resume,summary:'Updated saved content'}};
    h.focus();await h.pump();assert.equal(h.button('Download PDF').props.disabled,true,'cannot download the old artifact during refresh');
    release();await h.pump();
    assert.equal(loaded.at(-1).pageSize,size);assert.equal(loaded.at(-1).summary,'Updated saved content');
    assert.match(h.getText(),/Version 7/);
    assert.equal(h.find(n=>n.type==='PdfViewer').props.uri,loaded.at(-1).artifact.uri);
    h.button('Download PDF').props.onPress();await h.pump();
    assert.equal(shared[1],loaded.at(-1).artifact);assert.equal(shared[1].revision,7);
    assert.ok(disposed.includes(`6-${size}`));
  });
});

test('editing from preview waits for saving before returning, retains recovery on failure, and avoids duplicate previews',async(t)=>{
  for(const action of ['Back to PDF preview','Preview PDF'])await t.test(action,async(t)=>{
    const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,returnTo:'preview',pageSize:'LETTER'};
    const document=makeDocument();let finish;
    const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:()=>new Promise(resolve=>finish=resolve)};
    h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
    const press=()=>action==='Preview PDF'?h.button(action).props.onPress():h.find(n=>n.props.accessibilityLabel===action).props.onPress();
    press();await h.pump();assert.deepEqual(h.calls,[]);
    finish(null);await h.pump();assert.deepEqual(h.calls,[]);assert.match(h.find(n=>n.type==='Notice').props.message,/Save your latest changes/);
    press();await h.pump();finish({...document,revision:7});await h.pump();
    assert.deepEqual(h.calls,[['back']]);
  });
});

test('preview refresh failures cannot download the previous saved artifact',async(t)=>{
  const h=harness();t.after(()=>h.dispose());let fail=false;
  h.open('app/cv-editor/[id]/preview.tsx',{
    '@/lib/editor/api':{getEditorDocument:async()=>{if(fail)throw Error('Unable to refresh saved CV');return makeDocument();}},
    '@/lib/editor/pdf':{loadEditorPdf:async()=>({uri:'file:///old.pdf',revision:6,dispose:async()=>{}})},
  });
  await h.pump();h.blur();fail=true;h.focus();await h.pump();
  assert.match(h.getText(),/Unable to refresh/);assert.equal(h.button('Download PDF').props.disabled,true);
  assert.equal(h.find(n=>n.type==='PdfViewer'),undefined);
});

test('returning editor without navigation history replaces itself with the saved Letter preview',async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.canGoBack=false;
  h.params={id:TAILORED,returnTo:'preview',pageSize:'LETTER'};const document=makeDocument();
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:async()=>({...document,revision:8})};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  h.find(n=>n.props.accessibilityLabel==='Back to PDF preview').props.onPress();await h.pump();
  assert.deepEqual(h.calls,[['replace',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'8',pageSize:'LETTER'}}]]);
});

test('editor core sections have the agreed labels/order despite PDF metadata and preserve custom fields',()=>{
  const {resumeSections,replaceSection,entryTemplate}=load('components/editor/sections.ts',{'@/components/tailoring/ReviewContent':{readableLabel:key=>key}});
  const resume={...makeDocument().resume,customSections:{research:{sectionType:'text',text:'Keep research'}},sectionMeta:[{key:'summary',displayName:'Old summary label',order:99},{key:'workExperience',order:80},{key:'education',order:0}]};
  const before=copy(resume),sections=resumeSections(resume);
  assert.deepEqual(sections.slice(0,5).map(s=>s.label),['Personal Information','Summary','Experience','Education','Skills']);
  assert.equal(sections.at(-1).key,'customSections.research');
  const next=replaceSection(resume,'workExperience',[entryTemplate('workExperience')]);
  assert.deepEqual(resume,before);assert.deepEqual(next.customSections,before.customSections);assert.deepEqual(next.sectionMeta,before.sectionMeta);
  assert.ok(next.workExperience[0].id);assert.deepEqual(next.workExperience[0].description,[]);
});

test('Job Match keeps engine precision, disclosure order and stale evidence boundaries',()=>{
  const h=harness();let updates=0;
  const props={analysis:{status:'current',revision:6,score:{overall_score:72.4,sub_scores:{keyword_match:66.7,skills_coverage:89.3},recommendations:['Use accurate examples.']},matched_keywords:['Python','SQL'],missing_keywords:['React'],required_skills:['React'],preferred_skills:[],matched_count:2,total_keywords:3},revision:6,dirty:false,loading:false,jobDescription:'Full saved job description',confirmedSkills:['Python'],onRefresh:()=>updates++,onAddSkill:()=>{},onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  assert.match(h.getText(),/72\.4/);assert.match(h.getText(),/66\.7%/);assert.match(h.getText(),/2 of 3/);
  const titles=['ATS Score Breakdown','Missing Keywords','Recommendations','About Job Match & Tips'];
  assert.deepEqual(nodes(h.render()).filter(n=>titles.includes(n.props.accessibilityLabel)).map(n=>n.props.accessibilityLabel),titles);
  assert.equal(h.find(n=>n.props.accessibilityLabel==='ATS Score Breakdown').props.accessibilityState.expanded,false);
  h.find(n=>n.props.accessibilityLabel==='ATS Score Breakdown').props.onPress();h.render();assert.match(h.getText(),/89\.3 \/ 100/);
  props.section='highlights';h.render();
  assert.match(h.getText(),/Python · SQL/);assert.match(h.getText(),/Yellow: matched keywords/);assert.match(h.getText(),/Blue: keywords you added/);
  assert.equal(h.find(n=>n.type==='Text'&&n.props.className?.includes('text-tertiary')&&text(n).includes('Python')),undefined,'confirmed skill strings do not establish blue placement evidence');
  props.dirty=true;h.render();assert.doesNotMatch(h.getText(),/Python · SQL/);assert.match(h.getText(),/Update Match to verify/);
  props.section='overview';h.render();assert.match(h.getText(),/Needs updating/);h.button('Save & Update Match').props.onPress();assert.equal(updates,1);
  props.dirty=false;props.revision=7;h.render();assert.match(h.getText(),/Previous result for version 6/);
  props.section='highlights';h.render();assert.doesNotMatch(h.getText(),/Python · SQL/);
  h.find(n=>n.props.accessibilityRole==='tab'&&text(n)==='Job Description').props.onPress();h.render();assert.match(h.getText(),/Full saved job description/);
  props.section='overview';h.render();props.section='highlights';h.render();
  assert.equal(h.find(n=>n.props.accessibilityRole==='tab'&&text(n)==='Job Description').props.accessibilityState.selected,true);
  props.analysis=null;props.section='overview';h.render();assert.match(h.getText(),/Not calculated/);assert.doesNotMatch(h.getText(),/72\.4/);h.dispose();
});

test('Design & Layout reuses paper-size controls in Preview after a successful save',async()=>{
  const h=harness(),document=makeDocument();let finish;
  h.params={id:TAILORED,returnTo:'preview',pageSize:'LETTER'};
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:()=>new Promise(resolve=>finish=resolve)};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  assert.equal(h.find(n=>n.props.accessibilityRole==='tab'&&text(n)==='Edit CV').props.accessibilityState.selected,true);
  h.find(n=>n.props.accessibilityLabel==='Design & Layout').props.onPress();h.render();
  assert.equal(h.find(n=>n.props.accessibilityLabel==='Design & Layout').props.accessibilityState.selected,true);assert.equal(h.find(n=>n.type==='AppSheet'),undefined);assert.doesNotMatch(h.getText(),/Font size|Line spacing|Margins/);
  h.button('Choose paper size').props.onPress();await h.pump();assert.deepEqual(h.calls,[]);
  finish({...document,revision:7});await h.pump();assert.deepEqual(h.calls,[['back']]);h.dispose();
});

test('Add Job saves a new role through the existing revision flow without changing existing role bullets',async()=>{
  const {entryTemplate,replaceSection}=load('components/editor/sections.ts',{'@/components/tailoring/ReviewContent':{readableLabel:key=>key}});
  const originalRole={id:3,title:'Engineer',company:'Original company',years:'2020–2024',description:['<b>Existing</b> complete bullet'],descriptionStyles:['plain']};
  let remote={...makeDocument(),resume:{...makeDocument().resume,workExperience:[originalRole],customSections:{notes:{text:'Keep this'}}}};
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{assert.equal(body.expected_revision,6);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  await manager.restore();
  const newRole={...entryTemplate('workExperience'),title:'Senior Engineer',company:'New company',description:['An accurate new bullet']};
  manager.update(replaceSection(manager.snapshot.resume,'workExperience',[...manager.snapshot.resume.workExperience,newRole]));
  const saved=await manager.flush();assert.equal(saved.revision,7);
  assert.deepEqual(saved.resume.workExperience[0],originalRole);assert.deepEqual(saved.resume.workExperience[1],newRole);
  assert.deepEqual(saved.resume.customSections,{notes:{text:'Keep this'}});manager.dispose();
});

test('four editor secondary tabs remember their main-tab selection without discarding a pending Summary save',async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';h.params={id:TAILORED,returnTo:'preview',pageSize:'LETTER'};
  let remote=makeDocument(),release,saves=0;
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{saves++;await new Promise(resolve=>release=resolve);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,refreshAnalysis:()=>{},flush:()=>manager.flush(),updateResume:v=>manager.update(v)})}});
  const tab=label=>h.find(n=>n.props.accessibilityRole==='tab'&&text(n)===label);
  const select=label=>{tab(label).props.onPress();h.render();};
  assert.equal(tab('Edit CV').props.accessibilityState.selected,true);assert.equal(tab('Resume Content').props.accessibilityState.selected,true);
  h.find(n=>n.props.accessibilityLabel==='Edit Summary').props.onPress();h.render();
  const section=h.find(n=>n.type==='SectionEditor');section.props.onChange('Pending complete Summary');section.props.onClose();await h.pump();
  assert.equal(saves,1);assert.equal(manager.snapshot.saveState,'saving');
  select('Design & Layout');assert.ok(h.button('Choose paper size'));assert.equal(h.find(n=>n.props.accessibilityLabel==='Edit Summary'),undefined);
  select('Job Match');assert.equal(tab('Overview').props.accessibilityState.selected,true);assert.equal(h.find(n=>n.type==='JobMatch').props.section,'overview');
  select('Keyword Highlights');assert.equal(h.find(n=>n.type==='JobMatch').props.section,'highlights');
  select('Edit CV');assert.equal(tab('Design & Layout').props.accessibilityState.selected,true);
  select('Resume Content');assert.ok(h.find(n=>n.props.accessibilityLabel==='Edit Summary'));assert.equal(manager.snapshot.resume.summary,'Pending complete Summary');
  select('Job Match');assert.equal(tab('Keyword Highlights').props.accessibilityState.selected,true);
  select('Overview');select('Edit CV');assert.equal(tab('Resume Content').props.accessibilityState.selected,true);
  assert.equal(saves,1);assert.deepEqual(h.calls,[]);assert.equal(h.find(n=>n.type==='ScrollView').props.keyboardDismissMode,'interactive');
  release();await h.pump();assert.equal(manager.snapshot.saveState,'saved');assert.equal(remote.resume.summary,'Pending complete Summary');
  h.button('Preview PDF').props.onPress();await h.pump();assert.deepEqual(h.calls,[['back']]);
});
