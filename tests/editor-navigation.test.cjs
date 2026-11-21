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
  const children=typeof value.type === "function" && ["ResumeSectionList","SectionActions","LevelControl","FontControl","LayoutFormatting","HighlightedResume","ResumeValue","HighlightText"].includes(value.type.name) ? value.type(value.props) : value.type === "EditorControlsPanel" ? [value.props.toolbar,value.props.children] : value.props?.children;
  return [value,...nodes(children)];
}
function text(value) {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(text).join("");
  if(typeof value === "object" && typeof value.type === "function" && ["ResumeSectionList","SectionActions","LevelControl","FontControl","LayoutFormatting","HighlightedResume","ResumeValue","HighlightText"].includes(value.type.name)) return text(value.type(value.props));
  return typeof value === "object" ? text(value.type === "EditorControlsPanel"?[value.props.toolbar,value.props.children]:value.props?.children) : String(value);
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
  const router={dismissTo:href=>h.calls.push(["dismissTo",href]),push:href=>h.calls.push(["push",href]),replace:href=>h.calls.push(["replace",href]),back:()=>h.calls.push(["back"]),navigate:href=>h.calls.push(["navigate",href]),canGoBack:()=>h.canGoBack};
  const mocks={
    react:hooks,
    "@/lib/editor/useKeywordHistory":{useKeywordHistory:()=>({history:null,historyLoading:false,historyError:false,retryHistory:()=>{}})},
    "./EditorFieldActivity":{useEditorFieldActivity:()=>()=>{}},
    "@/lib/editor/useEditorPdf":{useEditorPdf:input=>h.pdf??{pdf:input?{uri:`file:///same-${input.revision}.pdf`,revision:input.revision,filename:"cv.pdf",dispose:async()=>{}}:null,ready:!!input&&input.saveState==="saved",saveError:null,error:null,signature:input?JSON.stringify([input.resume,input.layout,input.skills]):null,retry:()=>{},acknowledged:null}},
    "react-native":{StyleSheet:{create:styles=>styles},View:"View",Text:"Text",Pressable:"Pressable",ScrollView:"ScrollView",FlatList:"FlatList",ActivityIndicator:"Spinner",KeyboardAvoidingView:"KeyboardAvoidingView",Platform:{OS:"web"},Keyboard:{dismiss(){},metrics:()=>undefined},useWindowDimensions:()=>({width:390,height:844}),AppState:{addEventListener:()=>({remove(){}})}},
    "expo-router":{router,useRouter:()=>router,useLocalSearchParams:()=>h.params,Stack:{Screen:"StackScreen"},useFocusEffect:fn=>hooks.useEffect(()=>h.focused?fn():undefined,[fn,h.focused])},
    "react-native-safe-area-context":{SafeAreaView:"SafeAreaView",useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})},
    "@/lib/editor/useLivePreview":{useLivePreview:()=>({pdf:null,updating:false,error:null,retry:()=>{},retain:()=>()=>{}})},
    "@/lib/editor/pdf":{shareEditorPdf:async()=>{}},
    "@/lib/auth/AuthProvider":{useAuth:()=>h.auth},
    "@/theming/ThemeProvider":{useTheme:()=>({theme:{colors:{primary:"purple"}}})},
    "@/lib/icons/LucideIcon":{__esModule:true,default:"Icon"},
    "@/lib/utils":{cn:(...v)=>v.filter(Boolean).join(" ")},
    "@/components/tailoring/ReviewContent":{readableLabel:key=>key},
    "@react-native-async-storage/async-storage":{__esModule:true,default:{getItem:async()=>null,setItem:async()=>{}}},
    "expo-crypto":{randomUUID:()=>"44444444-4444-4444-8444-444444444444"},
  };
  for(const [file,name] of Object.entries({"components/layout/AppScreen":"AppScreen","components/layout/AppSheet":"AppSheet","components/layout/ScreenHeader":"ScreenHeader","components/library/LibrarySections":"LibrarySections","components/cv/AccountSheet":"AccountSheet","components/cv/Notice":"Notice","components/cv/DocumentEmptyState":"DocumentEmptyState","components/ui/button":"Button","components/ui/text":"Text","components/editor/SectionEditor":"SectionEditor","components/editor/LiveCvRenderer":"LiveCvRenderer","components/editor/DesignLayout":"DesignLayout","components/editor/CvPreviewSurface":"CvPreviewSurface","components/editor/EditorControlsPanel":"EditorControlsPanel","components/editor/JobMatch":"JobMatch","components/editor/PdfViewer":"PdfViewer","components/editor/PdfReadability":"PdfReadability"}))mocks["@/"+file]={[name]:name};
  h.open=(file,extra={},exportName='default',props={})=>{
    if(file==='app/cv-editor/[id].tsx' && extra['@/lib/editor/useCvEditor']) {
      const original=extra['@/lib/editor/useCvEditor'].useCvEditor;
      let workspace={tool:'content',trayOpen:false,sectionKey:null,fieldPath:null,fieldLabel:null,documentOffset:0,documentZoom:1,documentPanX:0,panelHeight:190,matchSection:'overview'},trial;
      extra={...extra,'@/lib/editor/useCvEditor':{useCvEditor:(...args)=>{
        const editor=original(...args);
        return {...editor,
          workspace:editor.updateWorkspace?editor.workspace:workspace,
          layoutDraft:editor.updateLayoutDraft?editor.layoutDraft:trial??editor.layoutDraft??editor.layout??editor.document?.layout??null,
          updateWorkspace:editor.updateWorkspace??(patch=>{workspace={...workspace,...patch};dirty=true;}),
          updateLayoutDraft:editor.updateLayoutDraft??(value=>{trial=value;dirty=true;}),
          saveForPdf:editor.saveForPdf??(async()=>{if(trial&&editor.updateLayout)editor.updateLayout(trial);return editor.flush();}),
        };
      }}};
    }
    const loaded=load(file,{...mocks,...extra})[exportName];component=()=>loaded(props);h.render();
  };
  h.render=()=>{cursor=0;dirty=false;tree=component();for(const effect of effects.splice(0))effect();return tree;};
  h.pump=async()=>{for(let i=0;i<8;i++){await tick();if(dirty)h.render();}};
  h.find=predicate=>nodes(tree).find(predicate);
  h.button=label=>h.find(n=>(n.type==="Button" || n.type==="Pressable" && ["button","tab"].includes(n.props.accessibilityRole))&&(text(n)===label || n.props.accessibilityLabel===label));
  h.getText=()=>text(tree);
  h.blur=()=>{h.focused=false;h.render();};
  h.focus=()=>{h.focused=true;h.render();};
  h.dispose=()=>slots.forEach(slot=>slot.cleanup?.());
  h.mocks=mocks;
  return h;
}
const routes=load("lib/editor/routes.ts");
const {CvEditorSession}=load("lib/editor/session.ts");
const baseLayout=()=>({template:'swiss-single',pageSize:'A4',margins:{top:10,bottom:10,left:10,right:10},spacing:{section:3,item:2,lineHeight:3},fontSize:{base:3,headerScale:3,headerFont:'serif',bodyFont:'sans-serif'},compactMode:false,showContactIcons:false,accentColor:'blue'});
const makeDocument=()=>({layout:baseLayout(),layout_options:{templates:['swiss-single','modern'],page_sizes:['A4','LETTER']},tailoring_id:TAILORED,revision:6,updated_at:"2026-11-01T12:00:00Z",resume:{personalInfo:{name:"Test fixture"},summary:"Before",workExperience:[],education:[],additional:{technicalSkills:[]},sectionMeta:[['personalInfo','Personal Information','personalInfo'],['summary','Summary','text'],['workExperience','Experience','itemList'],['education','Education','itemList'],['additional','Skills','stringList']].map(([key,displayName,sectionType],order)=>({id:key,key,displayName,sectionType,isDefault:true,isVisible:true,order}))},job:{title:"Engineer",company:null,description:"Isolated test job"},confirmed_skills:[],analysis:null});

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
test("library opens Edit Resume directly using the saved tailoring ID and labels cards Open",async()=>{
  const h=harness();h.mocks['react-native'].Platform.OS='ios';h.auth={session:null,loading:false};
  h.open("app/(tabs)/library/tailored-cvs.tsx",{"@/lib/editor/api":{listTailoredCvs:async(owner)=>{assert.equal(owner,OWNER);return [{id:TAILORED,source_resume_id:SOURCE,engine_resume_id:ENGINE,status:"ready",job_title:"Engineer",company:null,created_at:"2026-11-01",updated_at:"2026-11-01"}];}}});
  const empty=h.find(n=>n.type==="FlatList").props.ListEmptyComponent;
  empty.props.action.props.onPress();h.render();assert.equal(h.find(n=>n.type==="AccountSheet").props.visible,true);
  h.auth={session:{user:{id:OWNER}},loading:false};h.render();await h.pump();
  const list=h.find(n=>n.type==="FlatList");assert.equal(list.props.data.length,1);
  list.props.renderItem({item:list.props.data[0]}).props.onPress();
  assert.equal(list.props.renderItem({item:list.props.data[0]}).props.accessibilityLabel,"Open Engineer");
  assert.deepEqual(h.calls.at(-1),["push",{pathname:"/cv-editor/[id]",params:{id:TAILORED,returnTo:"library"}}]);h.dispose();
});
test("editor disables PDF until content acknowledgement, then opens the displayed revision",async()=>{
 let remote=makeDocument(),release;const mutations=[];
 const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=>"mutation",parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{mutations.push(body);await new Promise(r=>release=r);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});await manager.restore();
 const h=harness();h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,updateResume:v=>manager.update(v),flush:()=>manager.flush()})}});
 h.button('Edit Summary')?.props.onPress();h.find(n=>n.props.accessibilityLabel==='Edit Summary').props.onPress();h.render();const section=h.find(n=>n.type==='SectionEditor');section.props.onChange('After editing');section.props.onClose();h.render();await tick();assert.equal(h.button('Open PDF preview').props.disabled,true);assert.equal(mutations[0].expected_revision,6);assert.equal(h.calls.length,0);
 release();await h.pump();h.render();h.button('Open PDF preview').props.onPress();await h.pump();assert.equal(h.calls.at(-1)[1].params.revision,'7');assert.equal(remote.resume.summary,'After editing');h.button('Back to saved CVs').props.onPress();assert.deepEqual(h.calls.at(-1),['back']);h.dispose();manager.dispose();
});

test("PDF screen loads the saved tailoring revision, shares the exact artifact, and navigates back",async()=>{
  const h=harness();h.params={id:TAILORED,revision:"7"};const seen=[];
  const artifact={uri:"blob:isolated-pdf-test",filename:"Tailored.pdf",revision:7,dispose:async()=>seen.push("disposed")};
  h.open("app/cv-editor/[id]/preview.tsx",{"@/lib/editor/api":{getEditorDocument:async(owner,id)=>{assert.equal(owner,OWNER);assert.equal(id,TAILORED);return {...makeDocument(),revision:7};}},"@/lib/editor/pdf":{loadEditorPdf:async(owner,id,revision,size)=>{seen.push([owner,id,revision,size]);return artifact;},shareEditorPdf:async pdf=>{assert.equal(pdf,artifact);seen.push("shared");}}});
  await h.pump();assert.equal(h.find(n=>n.type==="PdfViewer").props.uri,artifact.uri);
  assert.deepEqual(seen[0].slice(0,3),[OWNER,TAILORED,7]);assert.ok(seen[0][3] instanceof AbortSignal);
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
    const payload={expected_revision:6,mutation_id:'44444444-4444-4444-8444-444444444444',resume:{summary:'User edit'},confirmed_skills:['TypeScript'],layout:{...baseLayout(),template:'modern'}};
    response={...response,revision:7,resume:payload.resume,confirmed_skills:payload.confirmed_skills,layout:payload.layout};
    const saved=await api.saveEditorDocument(OWNER,TAILORED,payload,new AbortController().signal);assert.equal(saved.revision,7);assert.deepEqual(saved.layout,payload.layout);
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
      assert.equal(url,'https://contract-test.invalid/api/v1/mobile/tailored-cvs/'+TAILORED+'/pdf?revision=7');
      assert.equal(options.headers.Authorization,'Bearer isolated-test-token');
      return {ok:true,status:200,headers:new Headers({'content-type':'application/pdf','x-resume-revision':'7','x-pdf-page-count':'1'}),blob:async()=>new Blob(['%PDF-1.4\nIsolated transport test'],{type:'application/pdf'})};
    };
    artifact=await service.loadEditorPdf(OWNER,TAILORED,7,new AbortController().signal);
    assert.equal(artifact.revision,7);assert.equal(artifact.pageCount,1);
    const anchor={click(){clicked=true;downloadHref=this.href;},remove(){}};
    global.document={createElement:()=>anchor,body:{appendChild(){}}};
    await service.shareEditorPdf(artifact);assert.equal(clicked,true);assert.equal(downloadHref,artifact.uri);
  } finally {await artifact?.dispose();global.fetch=oldFetch;global.document=oldDocument;}
});


test("Tailor opens saved CVs in Edit Resume and keeps unsaved Continue review without starting another AI job", async () => {
  for(const saved of [false,true]) {
    const h=harness();h.mocks['react-native'].Platform.OS='ios';let starts=0;
    const input={resumeId:SOURCE,filename:'Original.pdf',jobDescription:'Full exact job description. '.repeat(5).trim()};
    const run={input,tailoringId:TAILORED,status:'success',saved,hydrating:false,jobRecovering:false,jobConnectionError:null,start:()=>{starts++;return true;}};
    h.open('app/(tabs)/tailor.tsx',{
      '@/lib/tailoring/TailoringProvider':{useTailoring:()=>run},
      '@/lib/aiConsent/AiConsentProvider':{useAiConsent:()=>({withConsent:start=>start()})},
      '@/lib/tailoring/useTailorForm':{useTailorForm:()=>({form:{selectedId:SOURCE,description:input.jobDescription},loading:false,saving:false,error:null,update:()=>{}})},
      '@/lib/cv/useMyCv':{useMyCv:()=>({resumes:[{id:SOURCE,original_filename:'Original.pdf',processing_status:'ready',recovery_required:false}],loading:false})},
      '@/components/cv/CvSelectionSheet':{CvSelectionSheet:'SelectionSheet'},
      '@/components/ui/textarea':{Textarea:'Textarea'},
    });
    h.button(saved?'Open saved CV':'Continue review').props.onPress();
    assert.equal(starts,0);
    assert.deepEqual(h.calls.at(-1),['push',saved?{pathname:'/cv-editor/[id]',params:{id:TAILORED,returnTo:'tailor'}}:{pathname:'/tailoring/review',params:{tailoringId:TAILORED}}]);h.dispose();
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


test("Job Match shows informational missing keywords without skill quick-add controls or a mutation callback", () => {
  const h=harness();
  const props={analysis:{status:'current',revision:1,score:{overall_score:70,sub_scores:{},recommendations:[]},missing_keywords:['Senior engineer','Python'],matched_keywords:[],required_skills:['Python'],preferred_skills:[],total_keywords:2,matched_count:0},revision:1,dirty:false,loading:false,jobDescription:'Full job',onRefresh:()=>{},onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  assert.deepEqual(nodes(h.render()).filter(n=>n.props.testID==='missing-keyword-chip').map(text),['Senior engineer','Python']);
  assert.doesNotMatch(h.getText(),/Add skills I have|Add to Skills|I have this|Hide skill choices/);
  assert.deepEqual(nodes(h.render()).filter(n=>n.props.accessibilityRole==='header').map(text),['ATS Score Breakdown','Missing Keywords','Recommendations']);h.dispose();
});

test("leaving while a save is in flight cannot reopen a late PDF preview", async () => {
  const h=harness();let release;
  const pending=new Promise(resolve=>release=resolve);
  const document=makeDocument();
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saving',problem:null,analysis:null,analysisLoading:false,flush:()=>pending,updateResume(){},reload(){},resolveConflict(){},refreshAnalysis(){}};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  h.button('Open PDF preview').props.onPress();await tick();
  h.find(n=>n.props?.accessibilityLabel==='Back to saved CVs').props.onPress();
  release(document);await h.pump();
  assert.ok(!h.calls.some(([method])=>method==='push'));
  assert.deepEqual(h.calls.at(-1),['back']);h.dispose();
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

test('first Job Match results do not upgrade reused native views after calculating',async(t)=>{
  const h=harness();t.after(()=>h.dispose());
  const props={analysis:null,revision:6,dirty:false,loading:true,jobDescription:'TCP/IP',savedResume:{summary:'TCP/IP'},onRefresh:()=>{},onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  let mounted=new Map();
  const paint=async()=>{
    const next=new Map();
    const visit=async(node,position)=>{
      if(!node || typeof node!=='object')return;
      if(Array.isArray(node)){for(let i=0;i<node.length;i++)await visit(node[i],position+'/'+(node[i]?.key??i));return;}
      // Preserve React's child slots (including nulls) and component types:
      // a status View must never be reused as a newly themed progress bar.
      const identity=position+'/'+String(node.type);
      if(node.type==='View'){
        const render=mounted.get(identity)??await nativeTransition();
        render(node.props.className??'');next.set(identity,render);
      }
      await visit(node.props?.children,identity+'/children');
    };
    await visit(h.render(),'root');mounted=next;
  };
  await paint();assert.match(h.getText(),/Calculating match…/);
  props.analysis={status:'current',revision:6,score:{overall_score:75,sub_scores:{keyword_match:75},recommendations:[]},matched_keywords:['TCP/IP'],matched_count:1,total_keywords:1};
  props.loading=false;
  await paint();assert.match(h.getText(),/Up to date/);assert.ok(h.find(n=>n.props.accessibilityRole==='progressbar'));
  props.loading=true;await paint();assert.match(h.getText(),/Updating match…/);
  props.loading=false;props.error='Network failed';await paint();assert.ok(h.button('Retry Update Match'));
  props.error=null;props.section='highlights';await paint();
  props.section='overview';await paint();assert.match(h.getText(),/Up to date/);
});

test('editor control panes switch repeatedly through native style resolution without replacing edits',async()=>{
 const h=harness(),document=makeDocument();let updates=0;
 const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,refreshAnalysis:()=>{updates++;},flush:async()=>document};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 const renderers=new Map();
 const paint=async()=>{for(const node of nodes(h.render()).filter(n=>n.props.accessibilityRole==='tab')){const key=node.props.accessibilityLabel;if(!renderers.has(key))renderers.set(key,await nativeTransition());assert.doesNotThrow(()=>renderers.get(key)(node.props.className));}};
 await paint();for(const label of ['Templates','Content','Format','Content','Templates']){h.button(label).props.onPress();h.render();await paint();}
 assert.equal(updates,0);assert.deepEqual(editor.resume,document.resume);h.dispose();
});

test('native PDF loading-to-document transitions preserve context; paper size is saved in the editor',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'6'};
 let release;const pending=new Promise(resolve=>release=resolve),seen=[];
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>pending},'@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision,signal)=>{seen.push([revision,signal]);return{uri:'file:///saved.pdf',revision,dispose:async()=>{}};},shareEditorPdf:async()=>{}}});
 const children=node=>Array.isArray(node.props.children)?node.props.children:[node.props.children];
 const loading=()=>h.find(n=>n.type==='View'&&children(n).some(c=>c?.type==='Spinner'));
 const document=()=>h.find(n=>n.type==='View'&&children(n).some(c=>c?.type==='PdfViewer'));
 const paint=await nativeTransition();paint(loading().props.className);release(makeDocument());await h.pump();
 assert.doesNotThrow(()=>paint(document().props.className));assert.equal(seen[0][0],6);assert.ok(seen[0][1] instanceof AbortSignal);
 assert.equal(h.find(n=>n.props.accessibilityLabel==='Letter paper size'),undefined);
 h.find(n=>n.props.accessibilityLabel==='Back').props.onPress();assert.deepEqual(h.calls.at(-1),['back']);
});

test('iOS preview downloads the same saved artifact and pins a new acknowledged layout revision after editing',async(t)=>{
 for(const template of ['swiss-single','swiss-two-column','modern','modern-two-column','latex','clean','vivid','vivid-single','modern-deedy','deedy'])await t.test(template,async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';h.params={id:TAILORED,revision:'6'};
  let remote={...makeDocument(),layout:{...baseLayout(),template}},release,signal;const loaded=[],shared=[],disposed=[];
  h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>copy(remote)},'@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision,abort)=>{signal=abort;if(revision===7)await new Promise(resolve=>release=resolve);const artifact={uri:`file:///saved-${revision}.pdf`,revision,pageCount:2,dispose:async()=>disposed.push(revision)};loaded.push({artifact,layout:copy(remote.layout),summary:remote.resume.summary});return artifact;},shareEditorPdf:async pdf=>shared.push(pdf)}});
  await h.pump();h.button('Download PDF').props.onPress();await h.pump();assert.equal(shared[0],loaded.at(-1).artifact);assert.equal(loaded.at(-1).layout.template,template);
  h.button('Edit Resume').props.onPress();assert.deepEqual(h.calls.at(-1),['push',{pathname:'/cv-editor/[id]',params:{id:TAILORED,returnTo:'preview'}}]);
  h.blur();await h.pump();assert.equal(signal.aborted,true);assert.equal(h.button('Download PDF').props.disabled,true);
  remote={...remote,revision:7,resume:{...remote.resume,summary:'Updated saved content'}};h.params={id:TAILORED,revision:'7'};
  h.focus();await h.pump();assert.equal(h.button('Download PDF').props.disabled,true);release();await h.pump();
  assert.equal(loaded.at(-1).summary,'Updated saved content');assert.match(h.getText(),/Version 7/);assert.equal(h.find(n=>n.type==='PdfViewer').props.uri,loaded.at(-1).artifact.uri);
  const check=h.find(n=>n.type==='PdfReadability');assert.equal(check.props.revision,7);assert.equal(check.props.pageSize,undefined);
  h.button('Download PDF').props.onPress();await h.pump();assert.equal(shared[1],loaded.at(-1).artifact);assert.equal(shared[1].revision,7);assert.ok(disposed.includes(6));
 });
});

test("Retry refresh loads the newest cached CV in Edit Resume and Job Match without writing", async (t) => {
  for (const file of ["app/cv-editor/[id].tsx", "app/cv-editor/[id]/job-match.tsx"]) {
    const h = harness();
    t.after(() => h.dispose());
    const cached = makeDocument();
    const latest = {
      ...cached,
      revision: 7,
      resume: { ...cached.resume, summary: "Updated on another device" },
      analysis: { status: "current", revision: 7, score: { overall_score: 80, sub_scores: {} }, total_keywords: 0, matched_count: 0 },
    };
    let reads = 0;
    let writes = 0;
    let analyses = 0;
    let offline = true;
    h.open(file, {
      "@react-native-async-storage/async-storage": {
        __esModule: true,
        default: {
          getItem: async () => JSON.stringify({ version: 1, document: cached, resume: cached.resume, confirmedSkills: [], pending: null, dirty: false }),
          setItem: async () => {},
        },
      },
      "./api": {
        getEditorDocument: async () => {
          reads++;
          if (offline) throw Error("Network unavailable");
          return copy(latest);
        },
        saveEditorDocument: async () => { writes++; },
        recalculateEditorAnalysis: async () => { analyses++; },
      },
    });
    await h.pump();
    assert.equal(reads, 1);
    assert.match(h.find(node => node.type === "Notice").props.message, /device copy/);
    if (file.endsWith("job-match.tsx")) {
      assert.equal(h.find(node => node.type === "JobMatch").props.revision, 6);
    } else {
      assert.equal(h.button("Open PDF preview").props.disabled, true);
    }

    offline = false;
    const retry = h.button("Retry refresh");
    assert.ok(retry, file);
    retry.props.onPress();
    retry.props.onPress();
    await h.pump();
    assert.equal(reads, 2);
    assert.equal(writes, 0);
    assert.equal(analyses, 0);
    assert.equal(h.button("Retry refresh"), undefined);
    if (file.endsWith("job-match.tsx")) {
      const match = h.find(node => node.type === "JobMatch").props;
      assert.equal(match.revision, 7);
      assert.equal(match.savedResume.summary, latest.resume.summary);
    } else {
      assert.equal(h.find(node => node.type === "CvPreviewSurface").props.resume.summary, latest.resume.summary);
      assert.match(h.getText(), /PDF v7/);
    }
  }
});

test('failed automatic PDF update retains the previous file and exposes retry without navigation',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();let retries=0;
 h.pdf={pdf:{uri:'file:///last.pdf',revision:6},ready:false,saveError:'Unable to save. Your edits are kept.',retry:()=>retries++};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,confirmedSkills:[],saveState:'saved',loading:false})}});
 assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf,h.pdf.pdf);assert.equal(h.find(n=>n.props.testID==='preview-updating-overlay'),undefined);assert.equal(h.button('Open PDF preview').props.disabled,true);h.button('Open PDF preview').props.onPress();assert.deepEqual(h.calls,[]);h.button('Retry PDF update').props.onPress();assert.equal(retries,1);
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

test('Back leaves local layout trials uncommitted and uses Library when no navigation history exists',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.canGoBack=false;h.params={id:TAILORED,returnTo:'preview'};
 const document=makeDocument();let contentFlushes=0,exports=0;
 const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:async()=>{contentFlushes++;return document;},saveForPdf:async()=>{exports++;return document;}};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 h.button('Templates').props.onPress();h.render();h.find(n=>n.type==='DesignLayout').props.onChange({...document.layout,template:'modern'});h.render();
 h.button('Back to saved preview').props.onPress();await h.pump();
 assert.equal(contentFlushes,1);assert.equal(exports,0);assert.deepEqual(h.calls,[['replace','/(tabs)/library/tailored-cvs']]);
});

test('editor sections respect saved names/order while keeping Personal Information first and preserving custom fields',()=>{
  const {resumeSections,replaceSection,entryTemplate}=load('components/editor/sections.ts',{'@/components/tailoring/ReviewContent':{readableLabel:key=>key}});
  const resume={...makeDocument().resume,customSections:{research:{sectionType:'text',text:'Keep research'}},sectionMeta:[{key:'summary',displayName:'Old summary label',order:99},{key:'workExperience',order:80},{key:'education',order:0}]};
  const before=copy(resume),sections=resumeSections(resume);
  assert.deepEqual(sections.slice(0,5).map(s=>s.label),['Personal Information','Education','Experience','Old summary label','Skills']);
  assert.equal(sections.at(-1).key,'customSections.research');
  const next=replaceSection(resume,'workExperience',[entryTemplate('workExperience')]);
  assert.deepEqual(resume,before);assert.deepEqual(next.customSections,before.customSections);assert.deepEqual(next.sectionMeta,before.sectionMeta);
  assert.ok(next.workExperience[0].id);assert.deepEqual(next.workExperience[0].description,[]);
});

test('Job Match Overview preserves engine precision, section order and stale evidence boundaries',()=>{
  const h=harness();let updates=0;
  const props={analysis:{status:'current',revision:6,score:{overall_score:72.4,sub_scores:{skills_coverage:89.3,keyword_match:66.7},recommendations:['Use accurate examples.']},matched_keywords:['Python','SQL'],missing_keywords:['React'],required_skills:['React'],preferred_skills:[],matched_count:2,total_keywords:3},revision:6,dirty:false,loading:false,jobDescription:'Full saved job description',confirmedSkills:['Python'],onRefresh:()=>updates++,onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  assert.match(h.getText(),/72\.4/);assert.match(h.getText(),/66\.7%/);assert.match(h.getText(),/89\.3%/);assert.match(h.getText(),/2 of 3/);
  const titles=['ATS Score Breakdown','Missing Keywords','Recommendations'];
  assert.deepEqual(nodes(h.render()).filter(n=>n.props.accessibilityRole==='header').map(text),titles);
  assert.deepEqual(nodes(h.render()).filter(n=>n.props.accessibilityRole==='progressbar').map(n=>n.props.accessibilityLabel),['Overall score','Keyword Match','Skills Coverage','Title Match','Section Completeness','Date Consistency']);
  assert.match(h.getText(),/Use accurate examples/);assert.doesNotMatch(h.getText(),/Highlighted Keywords|Yellow:|Blue:/);
  props.savedResume={summary:'Python and SQL'};
  props.section='highlights';h.render();
  const highlights=h.find(n=>typeof n.type==='function'&&n.type.name==='KeywordHighlights');
  assert.deepEqual(highlights.props.resume,props.savedResume);assert.ok(highlights.props.keywords.includes('Python'));
  assert.equal(h.find(n=>n.props.accessibilityRole==='tab'),undefined,'there is no nested resume/job switcher');
  assert.doesNotMatch(h.getText(),/Full saved job description/);
  props.dirty=true;h.render();assert.deepEqual(h.find(n=>typeof n.type==='function'&&n.type.name==='KeywordHighlights').props.resume,props.savedResume,'in-progress edits do not hide the saved document');
  props.section='overview';h.render();assert.match(h.getText(),/Results out of date/);h.button('Update Match').props.onPress();assert.equal(updates,1);
  props.dirty=false;props.revision=7;h.render();assert.match(h.getText(),/Results out of date/);
  props.section='highlights';h.render();assert.deepEqual(h.find(n=>typeof n.type==='function'&&n.type.name==='KeywordHighlights').props.resume,props.savedResume);
  props.analysis=null;props.section='overview';h.render();assert.match(h.getText(),/Not calculated/);assert.match(h.getText(),/Unavailable/);assert.doesNotMatch(h.getText(),/72\.4/);h.dispose();
});

test('Overview distinguishes genuine zero, full scores and unavailable metrics without inventing values',()=>{
  const h=harness();const props={analysis:{status:'current',revision:1,score:{overall_score:0,sub_scores:{keyword_match:0,skills_coverage:100,title_match:null,title_alignment:99,section_completeness:70.8},recommendations:[]},matched_keywords:[],missing_keywords:[],required_skills:[],preferred_skills:[],matched_count:0,total_keywords:0},revision:1,dirty:false,loading:false,jobDescription:'Job',confirmedSkills:[],onRefresh:()=>{},onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  const bar=label=>h.find(n=>n.props.accessibilityRole==='progressbar'&&n.props.accessibilityLabel===label);
  const fill=label=>nodes(bar(label)).find(n=>n.props.testID==='score-bar-fill');
  assert.equal(bar('Overall score').props.accessibilityValue.now,0);assert.equal(fill('Overall score'),undefined);assert.equal(fill('Keyword Match'),undefined);
  assert.equal(bar('Skills Coverage').props.accessibilityValue.now,100);assert.equal(fill('Skills Coverage').props.style.width,'100%');assert.match(fill('Skills Coverage').props.className,/bg-success/);
  assert.equal(fill('Section Completeness').props.style.width,'70.8%');assert.match(fill('Section Completeness').props.className,/bg-score-moderate/);
  assert.deepEqual(bar('Title Match').props.accessibilityValue,{text:'Unavailable'});assert.deepEqual(bar('Date Consistency').props.accessibilityValue,{text:'Unavailable'});assert.equal(fill('Title Match'),undefined);assert.doesNotMatch(h.getText(),/99%/);
  props.analysis.score.overall_score=100;props.analysis.score.sub_scores.keyword_match=20;h.render();assert.equal(fill('Overall score').props.style.width,'100%');assert.equal(fill('Keyword Match').props.style.width,'20%');assert.match(fill('Keyword Match').props.className,/bg-destructive/);
  props.analysis.score=null;h.render();assert.equal(bar('Overall score').props.accessibilityValue.text,'Unavailable');assert.equal(fill('Overall score'),undefined);assert.match(h.getText(),/Unavailable/);h.dispose();
});

test('Overview retains keyword chips, concise recommendations and help while moving layout guidance to Templates',()=>{
  const h=harness(),edits=[];const long='English communication (written and spoken) with cross-functional technical support teams';
  const props={analysis:{status:'stale',revision:1,score:{overall_score:67.3,sub_scores:{},recommendations:['Add Oracle NetSuite to your skills.','Use the exact job title in your headline. Recruiters filter by title.','Use the exact job title in your headline.','Quantify achievements with measurable results.','Check your dates.']},missing_keywords:[long,'Oracle NetSuite',long],required_skills:['Oracle NetSuite'],preferred_skills:[],matched_count:0,total_keywords:2},revision:2,dirty:false,loading:false,template:'swiss-two-column',jobDescription:'Job',savedResume:{personalInfo:{title:'Engineer'}},confirmedSkills:[],onRefresh:()=>{},onEdit:key=>edits.push(key)};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  const chips=nodes(h.render()).filter(n=>n.props.testID==='missing-keyword-chip');assert.equal(chips.length,2);assert.equal(text(chips[0]),long);assert.match(chips[0].props.className,/max-w-full/);assert.equal(nodes(chips[0]).find(n=>n.type==='Text').props.numberOfLines,undefined);
  assert.equal(h.find(n=>n.props.testID==='ats-layout-warning'),undefined);
  assert.match(h.getText(),/Use the exact job title in your headline\./);assert.match(h.getText(),/Quantify achievements/);assert.doesNotMatch(h.getText(),/Add Oracle NetSuite|Recruiters filter|Check your dates|Edit experience|Edit skills|version|previous analysis/i);
  assert.equal(h.getText().match(/Results out of date/g).length,1);
  assert.doesNotMatch(h.getText(),/Add skills I have|Add to Skills/);h.button('Edit headline').props.onPress();assert.deepEqual(edits,['personalInfo']);
  assert.equal(h.button('About Job Match').props.accessibilityState.expanded,false);assert.doesNotMatch(h.getText(),/Scores are estimates/);
  h.button('About Job Match').props.onPress();h.render();assert.match(h.getText(),/Scores are estimates/);assert.match(h.getText(),/accurate action verbs/);h.dispose();
});

test('Templates alone shows the short two-column notice for the selected layout',()=>{
  const h=harness(),document=makeDocument();const props={mode:'templates',layout:document.layout,options:{templates:['swiss-single','swiss-two-column','modern-two-column','vivid','deedy'],page_sizes:['A4']},onChange:()=>{},onReload:()=>{}};
  h.open('components/editor/DesignLayout.tsx',{},'DesignLayout',props);
  for(const template of ['swiss-single','modern','vivid-single','modern-deedy']){props.layout={...props.layout,template};h.render();assert.equal(h.find(n=>n.props.testID==='ats-layout-warning'),undefined);}
  for(const template of ['swiss-two-column','modern-two-column','vivid','deedy']){props.layout={...props.layout,template};h.render();assert.equal(text(h.find(n=>n.props.testID==='ats-layout-warning')),'Some ATS may read two-column resumes out of order.');}
  props.mode='format';h.render();assert.equal(h.find(n=>n.props.testID==='ats-layout-warning'),undefined);h.dispose();
});

test('Overview keeps stale, loading and retry in the score area and clears stale status at the saved revision',()=>{
  const h=harness();let calls=0;
  const props={analysis:{status:'current',revision:2,score:{overall_score:67.3,sub_scores:{keyword_match:70.8},recommendations:[]},missing_keywords:[],required_skills:[],preferred_skills:[],matched_count:3,total_keywords:5},revision:3,dirty:false,loading:false,confirmedSkills:[],jobDescription:'Job',onRefresh:()=>calls++,onEdit:()=>{}};
  h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
  const status=()=>h.find(n=>n.props.testID==='match-results-status');
  assert.match(text(status()),/Results out of date/);assert.match(text(status()),/Update Match/);assert.match(h.getText(),/67\.3/);
  h.button('Update Match').props.onPress();assert.equal(calls,1);
  props.loading=true;h.render();assert.match(text(status()),/Updating…/);assert.equal(h.button('Update Match').props.disabled,true);
  props.loading=false;props.error='Analysis could not be updated.';h.render();assert.match(text(status()),/Couldn’t update your match/);h.button('Retry Update Match').props.onPress();assert.equal(calls,2);
  props.error=null;props.analysis={...props.analysis,revision:3};h.render();assert.match(text(status()),/Up to date/);assert.doesNotMatch(h.getText(),/Results out of date|version/i);assert.equal(h.find(n=>n.props.accessibilityLabel==='Update Match'),undefined);
  props.analysis=null;h.render();assert.match(text(status()),/Not calculated/);assert.ok(h.button('Update Match'));h.dispose();
});

test('Templates retains server controls while PDF remains disabled until the displayed file catches up',async()=>{
 const h=harness(),document=makeDocument();const editor={document,resume:document.resume,layout:document.layout,layoutDraft:document.layout,updateLayoutDraft:next=>{editor.layoutDraft=next;},confirmedSkills:[],loading:false,saveState:'saved'};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});h.button('Templates').props.onPress();h.render();const design=h.find(n=>n.type==='DesignLayout');assert.equal(design.props.options,document.layout_options);design.props.onChange({...document.layout,template:'modern'});
 h.pdf={pdf:{uri:'file:///old.pdf',revision:6},ready:false,retry:()=>{}};h.render();assert.equal(editor.layout.template,'swiss-single');assert.equal(h.button('Open PDF preview').props.disabled,true);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf.uri,'file:///old.pdf');
 const overlay=()=>h.find(n=>n.props.testID==='preview-updating-overlay');
 assert.equal(overlay().props.pointerEvents,'none');assert.match(overlay().props.className,/absolute inset-0.*items-center justify-center/);
 const pane=h.find(n=>n.props.testID==='editor-pdf-pane');assert.ok(nodes(pane).includes(overlay()));assert.equal(nodes(pane).some(n=>n.type==='EditorControlsPanel'),false,'badge is centered in the PDF pane, above the tray');
 assert.match(text(overlay()),/Updating preview…/);assert.equal(h.pdf.updating,undefined,'out-of-date readiness shows the badge even before loading starts');
 h.button('Format').props.onPress();h.render();
 for(const base of [4,5,4,3]){const format=h.find(n=>n.type==='DesignLayout'&&n.props.mode==='format');format.props.onChange({...editor.layoutDraft,pageSize:'LETTER',fontSize:{...editor.layoutDraft.fontSize,base}});h.pdf={...h.pdf,saving:base===4,updating:base===5};h.render();assert.ok(overlay());assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf.uri,'file:///old.pdf');assert.equal(h.button('Format').props.disabled,false);}
 h.pdf={...h.pdf,error:'PDF retrieval failed'};h.render();assert.equal(overlay(),undefined);assert.ok(h.button('Retry PDF update'));
 h.pdf={...h.pdf,error:null,updating:true};h.render();assert.ok(overlay());
 editor.document={...document,revision:7};h.pdf={...h.pdf,pdf:{uri:'file:///modern.pdf',revision:7},ready:true,updating:false,signature:JSON.stringify([editor.resume,editor.layoutDraft,[]])};h.render();assert.equal(overlay(),undefined);h.button('Open PDF preview').props.onPress();await h.pump();assert.equal(h.calls.at(-1)[1].params.revision,'7');h.dispose();
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

test('header Job Match opens from every panel and Back retains the panel, active section, layout trial and in-flight edits',async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';h.params={id:TAILORED,returnTo:'library'};
  let remote=makeDocument(),release,saves=0,analyses=0;
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{saves++;await new Promise(resolve=>release=resolve);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>{analyses++;return null;},onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  const useEditor=()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:v=>manager.update(v),updateWorkspace:v=>manager.updateWorkspace(v),updateLayoutDraft:v=>manager.updateLayoutDraft(v),refreshAnalysis:()=>manager.refreshAnalysis()});
  const mocks={'@/lib/editor/useCvEditor':{useCvEditor:useEditor}};
  h.open('app/cv-editor/[id].tsx',mocks);
  h.find(n=>n.props.accessibilityLabel==='Edit Summary').props.onPress();h.render();
  h.find(n=>n.type==='SectionEditor').props.onChange('Pending complete Summary');
  const saving=manager.flush();await tick();h.render();
  assert.equal(saves,1);assert.equal(manager.snapshot.saveState,'saving');
  manager.updateLayoutDraft({...remote.layout,template:'modern'});h.render();
  for(const label of ['Content','Templates','Format']) {
    if(label!=='Content'){h.button(label).props.onPress();h.render();}
    const before=copy(manager.snapshot.workspace);
    const content=h.find(n=>n.props.testID==='editor-content-controls');assert.doesNotMatch(text(content),/Job Match/);assert.match(text(content),/Choose a section to edit/);
    assert.equal(h.button('Job Match').props.disabled,false,'Job Match stays available while content/PDF is saving');
    h.button('Job Match').props.onPress();h.render();
    assert.deepEqual(h.calls.at(-1),['push',{pathname:'/cv-editor/[id]/job-match',params:{id:TAILORED,editorReturnTo:'library'}}]);
    assert.deepEqual(manager.snapshot.workspace,before);h.blur();
    const match=harness();match.open('app/cv-editor/[id]/job-match.tsx',mocks);
    const view=()=>match.find(n=>n.type==='JobMatch');
    assert.equal(view().props.dirty,true);assert.equal(view().props.revision,6);assert.equal(view().props.savedResume.summary,'Before','highlights use the saved document, not the pending Summary');assert.equal(view().props.jobDescription,remote.job.description);
    match.button('Keyword Highlights').props.onPress();match.render();assert.equal(view().props.section,'highlights');
    match.button('Back to Edit Resume').props.onPress();assert.deepEqual(match.calls,[['back']]);match.dispose();
    h.focus();assert.equal(h.button(label).props.accessibilityState.selected,true);
    assert.deepEqual(manager.snapshot.workspace,{...before,matchSection:'highlights'});
    assert.equal(manager.snapshot.resume.summary,'Pending complete Summary');assert.equal(manager.snapshot.workspace.sectionKey,'summary');assert.equal(manager.snapshot.layoutDraft.template,'modern');
    assert.equal(saves,1);assert.equal(analyses,0,'Navigation never recalculates the score');
  }
  release();await saving;await h.pump();h.render();assert.equal(manager.snapshot.saveState,'saved');assert.equal(remote.resume.summary,'Pending complete Summary');
  h.calls.length=0;h.button('Open PDF preview').props.onPress();await h.pump();
  assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1',editorReturnTo:'library'}}]]);
});

test('Resume Content restores full tappable rows, ordered sections, one-line Summary and useful empty hints',()=>{
  const h=harness(),document=makeDocument();document.resume.personalProjects=[];
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:async()=>document};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  assert.doesNotMatch(h.getText(),/Make it yours|Refine your experience|Changes save automatically/);
  const rows=nodes(h.render()).filter(n=>n.props.accessibilityHint?.startsWith('Opens the '));
  assert.deepEqual(rows.slice(0,5).map(n=>n.props.accessibilityLabel),['Edit Personal Information','Edit Summary','Edit Experience','Edit Education','Edit Skills']);
  assert.ok(rows.every(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'));
  const summary=rows.find(n=>n.props.accessibilityLabel==='Edit Summary');
  assert.ok(nodes(summary).some(n=>n.type==='Text'&&n.props.numberOfLines===1&&text(n)==='Before'));
  assert.ok(nodes(summary).some(n=>n.type==='Icon'&&n.props.name==='ChevronRight'));
  assert.match(h.getText(),/Add your first project/);
  rows[0].props.onPress();h.render();assert.equal(h.find(n=>n.type==='SectionEditor').props.section.key,'personalInfo');h.dispose();
});

test('Personal Information and Summary open, save, and close at the original list offset before previewing latest edits',async(t)=>{
  const h=harness();t.after(()=>h.dispose());let remote=makeDocument();const scrolls=[];
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:v=>manager.update(v)})}});
  h.button('Content').props.onPress();h.render();
  h.find(n=>n.type==='ScrollView').props.ref.current={scrollTo:options=>scrolls.push(options)};
  const changes=[['Personal Information','personalInfo',{name:'Updated Name',email:'new@example.com'}],['Summary','summary','Updated full Summary with all details.']];
  for(const [label,key,value] of changes){
    const offset=key==='summary'?240:120;
    h.find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{y:offset}}});
    const prior=scrolls.length;
    h.find(n=>n.props.accessibilityLabel==='Edit '+label).props.onPress();h.render();
    assert.equal(scrolls.length,prior,'opening a modal must not reset the list');
    let section=h.find(n=>n.type==='SectionEditor');assert.equal(section.props.section.key,key);
    section.props.onChange(value);h.render();
    section=h.find(n=>n.type==='SectionEditor');section.props.onClose();await h.pump();h.render();
    assert.deepEqual(scrolls.at(-1),{y:offset,animated:false});assert.deepEqual(remote.resume[key],value);
    h.find(n=>n.props.accessibilityLabel==='Edit '+label).props.onPress();h.render();
    assert.deepEqual(h.find(n=>n.type==='SectionEditor').props.section.value,value);
    h.find(n=>n.type==='SectionEditor').props.onClose();await h.pump();
  }
  h.button('Open PDF preview').props.onPress();await h.pump();
  assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'8',returnToEditor:'1'}}]]);
});

test('dedicated Job Match retains refresh and contextual navigation without a skill mutation callback',async(t)=>{
  const h=harness(),document=makeDocument();t.after(()=>h.dispose());let refreshed=0,updates=[];
  const editor={document,resume:document.resume,workspace:{tool:'format',trayOpen:true,panelHeight:250,sectionKey:'summary',fieldPath:null,fieldLabel:null,matchSection:'overview'},confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:{status:'current',revision:6},analysisLoading:true,flush:async()=>assert.fail('navigation must not flush'),refreshAnalysis:()=>{refreshed++;},updateResume:(resume,skills)=>{editor.resume=resume;editor.confirmedSkills=skills;updates.push({resume,skills});},updateWorkspace:patch=>{editor.workspace={...editor.workspace,...patch};}};
  const historyCalls=[],history={original:document.resume,changes:[],keywords:[]};
  h.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor},'@/lib/editor/useKeywordHistory':{useKeywordHistory:(...args)=>{historyCalls.push(args);return {history,historyLoading:false,historyError:false};}}});
  for(let i=0;i<6;i++){
    editor.workspace.matchSection=i%2?'overview':'highlights';h.render();
    assert.deepEqual(historyCalls.at(-1),[OWNER,document.tailoring_id],'history is requested independently of the active tab');
    assert.equal(h.find(n=>n.type==='JobMatch').props.history,history);
  }
  let view=h.find(n=>n.type==='JobMatch');assert.equal(view.props.analysis,editor.analysis);assert.equal(view.props.loading,true);assert.equal(view.props.revision,6);
  editor.analysisLoading=false;h.render();h.find(n=>n.type==='JobMatch').props.onRefresh();assert.equal(refreshed,1);
  assert.equal(view.props.onAddSkill,undefined);assert.equal(updates.length,0);
  h.find(n=>n.type==='JobMatch').props.onEdit('workExperience');assert.deepEqual(h.calls,[['back']]);assert.equal(editor.workspace.tool,'content');assert.equal(editor.workspace.sectionKey,'workExperience');assert.equal(editor.workspace.panelHeight,250);
  const e=harness();t.after(()=>e.dispose());e.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});assert.equal(e.find(n=>n.type==='SectionEditor').props.section.key,'workExperience');
});

test('Job Match handles opening, errors, signed-out access and direct-link Back without mutations',()=>{
  for(const state of [{loading:true},{error:'Unable to open saved CV',loading:false},{error:'Sign in to open your saved CV.',loading:false}]) {
    const h=harness();h.canGoBack=false;h.auth={session:null,loading:false};h.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...state,document:null,resume:null})}});
    assert.equal(h.find(n=>n.type==='JobMatch'),undefined);if(state.loading)assert.match(h.getText(),/Opening your saved CV/);else assert.equal(h.find(n=>n.type==='Notice').props.message,state.error);
    h.button('Back to Edit Resume').props.onPress();assert.deepEqual(h.calls,[['replace','/(tabs)/library/tailored-cvs']]);h.dispose();
  }
  const h=harness(),document=makeDocument();h.canGoBack=false;h.params={id:TAILORED,editorReturnTo:'tailor'};
  h.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,loading:false,error:null,confirmedSkills:[],saveState:'saved'})}});
  h.button('Back to Edit Resume').props.onPress();assert.deepEqual(h.calls,[['replace',{pathname:'/cv-editor/[id]',params:{id:TAILORED,returnTo:'tailor'}}]]);h.dispose();
});

test('section fields size from saved text before focus and keep multiline input metrics aligned while values change',()=>{
  const h=harness();const value='English (Professional Working Proficiency)';
  const props={label:'Language',value,onChangeText:()=>{}};
  h.open('components/editor/EditorTextField.tsx',{'@/components/ui/input':{Input:'Input'}},'EditorTextField',props);
  const input=()=>h.find(n=>n.type==='Input');
  assert.equal(input().props.multiline,true);assert.equal(input().props.scrollEnabled,false);assert.equal(input().props.numberOfLines,undefined);
  assert.equal(input().props.value,value);assert.equal(input().props.textAlignVertical,'top');
  assert.ok(h.find(n=>n.type==='Text'&&text(n)===value+'\u200b'));
  assert.ok(h.find(n=>n.props.accessibilityElementsHidden===true&&n.props['aria-hidden']===true),'measurement copy must stay hidden from accessibility');
  props.value='A longer company name with additional words\nand a final line\n';h.render();
  assert.equal(input().props.value,props.value);assert.ok(h.find(n=>n.type==='Text'&&text(n)===props.value+'\u200b'));
  props.roomy=true;h.render();
  const mirror=h.find(n=>n.type==='Text'&&text(n)===props.value+'\u200b');assert.match(mirror.props.className,/min-h-40/);
  for(const token of ['native:text-lg','native:leading-6','px-4','py-3']){assert.ok(input().props.className.includes(token));assert.ok(mirror.props.className.includes(token));}
  h.dispose();
});

test('section header keeps Done outside keyboard-aware scrolling without double iOS padding',()=>{
  const h=harness();h.mocks['react-native']={...h.mocks['react-native'],KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'ios'}};
  const section={key:'summary',label:'Summary',hidden:false,personal:false,custom:false,sectionType:'text',value:'A complete saved summary.'};let closes=0;
  h.open('components/editor/SectionEditor.tsx',{'react-native':h.mocks['react-native']},'SectionEditor',{section,onChange:()=>{},onClose:()=>closes++,saveLabel:'All changes saved',onRename:()=>{},actions:{label:'Summary',canMoveUp:false,canMoveDown:true,onMove:()=>{}}});
  const scroll=h.find(n=>n.type==='ScrollView');assert.equal(scroll.props.automaticallyAdjustKeyboardInsets,true);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
  assert.equal(h.find(n=>n.type==='KeyboardAvoidingView').props.enabled,false);
  assert.equal(nodes(scroll).some(n=>n.type==='Button'&&text(n)==='Done'),false);h.button('Done').props.onPress();assert.equal(closes,1);h.dispose();
});

test('long saved Summary, company, languages and bullets retain full values through editing, Done, save and reopen',async(t)=>{
  const {renderToStaticMarkup}=require('react-dom/server');const h=harness();t.after(()=>h.dispose());let fields=[],actions=[],saved;
  const box=props=>React.createElement('div',null,props.children);
  const {SectionEditor}=load('components/editor/SectionEditor.tsx',{
    ...h.mocks,react:React,'react-native':{...h.mocks['react-native'],View:box,Pressable:box,KeyboardAvoidingView:box,ScrollView:box},
    '@/components/layout/AppSheet':{AppSheet:box},'@/components/ui/text':{Text:props=>React.createElement('span',null,props.children)},
    './EditorTextField':{EditorTextField:props=>{fields.push(props);return React.createElement('textarea',{value:props.value,readOnly:true});}},
    './RichTextField':{RichTextField:props=>{fields.push(props);return React.createElement('textarea',{value:props.value,readOnly:true});}},
    '@/components/ui/button':{Button:props=>{actions.push(props);return React.createElement('button',null,props.children);}},'@/lib/icons/LucideIcon':{__esModule:true,default:()=>null},
  });
  const fullSummary='Complete first paragraph with every saved detail. '.repeat(12)+'\n\nFinal saved line remains editable.';
  const language='English (Professional Working Proficiency)',company='International Health and Technology Partners';
  let remote={...makeDocument(),resume:{...makeDocument().resume,summary:fullSummary,workExperience:[{id:1,title:'Engineer',company,years:'2021–Present',description:['A complete experience bullet with all original details.'],descriptionStyles:['plain']}],additional:{technicalSkills:['TypeScript'],languages:[language]}}};
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  let kind='summary';
  const paint=()=>{
    fields=[];actions=[];const resume=manager.snapshot.resume;
    const value=kind==='summary'?resume.summary:kind==='company'?resume.workExperience[0]:resume.additional.languages;
    return renderToStaticMarkup(React.createElement(SectionEditor,{section:{key:kind==='summary'?'summary':kind==='company'?'workExperience':'additional.languages',label:kind,hidden:false,value},actions:{label:kind,canMoveUp:true,canMoveDown:true,onMove:()=>{}},onRename:()=>{},saveLabel:'Saving changes',onClose:()=>{saved=manager.flush();},onChange:next=>manager.update(kind==='summary'?{...resume,summary:next}:kind==='company'?{...resume,workExperience:[next]}:{...resume,additional:{...resume.additional,languages:next}})}));
  };
  paint();assert.equal(fields[0].value,fullSummary);assert.equal(fields[0].roomy,true);
  fields[0].onChangeText(fullSummary+'\nPasted final paragraph.');paint();assert.ok(fields[0].value.endsWith('Pasted final paragraph.'));
  kind='company';paint();const companyField=fields.find(f=>f.label.toLowerCase()==='company');assert.equal(companyField.value,company);companyField.onChangeText(company+' International');paint();
  const bullet=fields.find(f=>f.label==='Bullet 1');assert.ok(bullet.value.includes('all original details'));bullet.onChangeText('An updated complete bullet with research & delivery evidence.');paint();
  kind='languages';paint();assert.equal(fields[0].value,language);fields[0].onChangeText(language+' · fluent');paint();
  actions.find(a=>text(a.children)==='Done').onPress();await saved;
  assert.equal(remote.resume.workExperience[0].company,company+' International');assert.deepEqual(remote.resume.workExperience[0].descriptionStyles,['plain']);
  await manager.refresh();kind='summary';paint();assert.equal(fields[0].value,fullSummary+'\nPasted final paragraph.');kind='company';paint();assert.ok(fields.some(f=>f.value===company+' International'));assert.ok(fields.some(f=>f.value==='An updated complete bullet with research & delivery evidence.'));kind='languages';paint();assert.equal(fields[0].value,language+' · fluent');
});

test('opening a legacy CV PDF does not mutate saved content or invent another revision',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();delete document.resume.sectionMeta;let mutations=0;
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,confirmedSkills:[],saveState:'saved',loading:false,updateResume:()=>mutations++})}});
 h.button('Open PDF preview').props.onPress();await h.pump();assert.equal(h.calls.at(-1)[1].params.revision,'6');assert.equal(mutations,0);
});

test('iOS creation waits for sheet dismissal before opening each custom section; renamed headings and moved sections persist through Done',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.mocks['react-native']={...h.mocks['react-native'],Platform:{OS:'ios'}};
 let remote=makeDocument(),mutation=0;
 const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> `mutation-${++mutation}`,parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
 t.after(()=>manager.dispose());await manager.restore();
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:v=>manager.update(v)})},'@/components/editor/SectionControls':{AddCustomSectionSheet:'AddCustomSectionSheet',RenameSectionSheet:'RenameSectionSheet',SectionActions:'SectionActions',SectionActionsMenu:'SectionActionsMenu'}});
 h.find(n=>n.props.accessibilityLabel==='Actions for Summary').props.onPress();h.render();const summaryMenu=h.find(n=>n.type==='SectionActionsMenu');summaryMenu.props.onClose();summaryMenu.props.actions.onRename();h.render();h.find(n=>n.type==='RenameSectionSheet').props.onSave('About Me');h.render();
 h.find(n=>n.props.accessibilityLabel==='Actions for Experience').props.onPress();h.render();const jobsMenu=h.find(n=>n.type==='SectionActionsMenu');jobsMenu.props.onClose();jobsMenu.props.actions.onMove(-1);h.render();
 const {resumeSections}=load('components/editor/sections.ts',{'@/components/tailoring/ReviewContent':{readableLabel:key=>key}});
 assert.deepEqual(resumeSections(manager.snapshot.resume).slice(0,3).map(s=>s.label),['Personal Information','Experience','About Me']);
 for(const type of ['text','itemList','stringList']) {
  h.button('Add Custom Section').props.onPress();h.render();
  h.find(n=>n.type==='AddCustomSectionSheet').props.onCreate('My '+type,type);h.render();
  assert.equal(h.find(n=>n.type==='SectionEditor'),undefined,'creation and editor modals cannot overlap on iOS');
  const closing=h.find(n=>n.type==='AddCustomSectionSheet');assert.equal(closing.props.visible,false);closing.props.onDismiss();h.render();
  const opened=h.find(n=>n.type==='SectionEditor');assert.equal(opened.props.section.label,'My '+type);assert.equal(opened.props.section.sectionType,type);assert.equal(opened.key,null);
  opened.props.onClose();await h.pump();h.render();
 }
 await manager.refresh();h.render();
 h.find(n=>n.props.accessibilityLabel==='Edit About Me').props.onPress();h.render();assert.equal(h.find(n=>n.type==='SectionEditor').props.section.key,'summary');assert.equal(h.find(n=>n.type==='SectionEditor').props.section.value,'Before');
 assert.deepEqual(resumeSections(remote.resume).slice(0,3).map(s=>s.label),['Personal Information','Experience','About Me']);
});

test('section menus group short actions, keep deletion last/red, name the confirmation and defer iOS mutations until dismissal',()=>{
 const h=harness(),calls=[];h.mocks['react-native']={...h.mocks['react-native'],Platform:{OS:'ios'}};
 const actions={label:'Community work',canMoveUp:false,canMoveDown:true,onRename:()=>calls.push('rename'),onMove:d=>calls.push(d),onDuplicate:()=>calls.push('duplicate'),onDelete:()=>calls.push('delete')};
 h.open('components/editor/SectionControls.tsx',{},'SectionActionsMenu',{actions,onClose:()=>calls.push('close')});
 const buttons=nodes(h.render()).filter(n=>n.type==='Button').map(n=>text(n));
 assert.deepEqual(buttons,['Rename','Move Up','Move Down','Duplicate','Delete Section','Cancel']);
 assert.equal(h.button('Move Up').props.disabled,true);assert.match(h.getText(),/Community work/);
 h.button('Delete Section').props.onPress();h.render();assert.deepEqual(calls,[]);assert.match(h.getText(),/Delete “Community work”\?/);assert.match(h.getText(),/entire section and all its content/);
 assert.equal(h.button('Delete Section').props.variant,'destructive');h.button('Delete Section').props.onPress();h.render();assert.deepEqual(calls,[]);
 const modal=h.find(n=>n.type==='AppSheet');assert.equal(modal.props.visible,false);modal.props.onDismiss();assert.deepEqual(calls,['close','delete']);h.dispose();
});

test('canceling a custom-section delete leaves the CV intact, while built-in menus omit whole-section deletion/duplication',()=>{
 const h=harness();let deleted=0,closed=0;
 const actions={label:'Notes',canMoveUp:true,canMoveDown:false,onRename:()=>{},onMove:()=>{},onDelete:()=>deleted++};
 h.open('components/editor/SectionControls.tsx',{},'SectionActionsMenu',{actions,onClose:()=>closed++});
 h.button('Delete Section').props.onPress();h.render();h.button('Cancel').props.onPress();assert.equal(deleted,0);assert.equal(closed,1);h.dispose();
 const builtin=harness();builtin.open('components/editor/SectionControls.tsx',{},'SectionActionsMenu',{actions:{...actions,label:'Summary',onDelete:undefined},onClose:()=>{}});
 assert.equal(builtin.button('Delete Section'),undefined);assert.equal(builtin.button('Duplicate'),undefined);assert.equal(builtin.button('Move Down').props.disabled,true);builtin.dispose();
});

test('deleting a just-created or duplicated custom section closes its editor and saves content/metadata removal before PDF navigation',async(t)=>{
 const h=harness();t.after(()=>h.dispose());let remote=makeDocument(),mutation=0;
 const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=>`mutation-${++mutation}`,parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
 t.after(()=>manager.dispose());await manager.restore();
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:v=>manager.update(v)})},'@/components/editor/SectionControls':{AddCustomSectionSheet:'AddCustomSectionSheet',RenameSectionSheet:'RenameSectionSheet',SectionActions:'SectionActions',SectionActionsMenu:'SectionActionsMenu'}});
 h.button('Add Custom Section').props.onPress();h.render();h.find(n=>n.type==='AddCustomSectionSheet').props.onCreate('Volunteering','itemList');h.render();
 let opened=h.find(n=>n.type==='SectionEditor');const originalKey=opened.props.section.key;
 assert.equal(typeof opened.props.actions.onDelete,'function');opened.props.actions.onDuplicate();h.render();
 opened=h.find(n=>n.type==='SectionEditor');const copyKey=opened.props.section.key;assert.notEqual(copyKey,originalKey);assert.equal(typeof opened.props.actions.onDelete,'function');
 opened.props.actions.onDelete();await h.pump();h.render();assert.equal(h.find(n=>n.type==='SectionEditor'),undefined);
 h.find(n=>n.props.accessibilityLabel==='Actions for Volunteering').props.onPress();h.render();h.find(n=>n.type==='SectionActionsMenu').props.actions.onDelete();await h.pump();h.render();
 assert.deepEqual(manager.snapshot.resume.customSections,{});assert.ok(!remote.resume.sectionMeta.some(meta=>[copyKey.split('.')[1],originalKey.split('.')[1]].includes(meta.key)));
 await manager.refresh();h.render();assert.equal(h.find(n=>n.props.accessibilityLabel==='Edit Volunteering'),undefined);
 h.button('Open PDF preview').props.onPress();await h.pump();assert.equal(h.calls.at(-1)[1].params.revision,String(remote.revision));assert.deepEqual(remote.resume.customSections,{});
});

test('custom titles get two lines and retain separate edit/action targets; the custom editor labels its existing actions',()=>{
 const h=harness();let opened=null,managed=null;
 const {resumeSections}=load('components/editor/sections.ts',{'@/components/tailoring/ReviewContent':{readableLabel:key=>key}});
 const name='Community leadership and professional development';
 const resume={...makeDocument().resume,customSections:{community:{sectionType:'text',text:'Original custom paragraph'}},sectionMeta:[...makeDocument().resume.sectionMeta,{id:'community',key:'community',displayName:name,sectionType:'text',isDefault:false,isVisible:true,order:5}]};
 const sections=resumeSections(resume),custom=sections.find(s=>s.custom);
 h.open('components/editor/ResumeSectionList.tsx',{},'ResumeSectionList',{sections,onOpen:key=>opened=key,onActions:key=>managed=key,onAdd:()=>{}});
 const row=h.find(n=>n.props.accessibilityLabel===`Edit ${name}`),action=h.find(n=>n.props.accessibilityLabel===`Actions for ${name}`);
 assert.equal(nodes(row).find(n=>n.type==='Text'&&text(n)===name).props.numberOfLines,2);
 assert.equal(nodes(h.find(n=>n.props.accessibilityLabel==='Edit Summary')).find(n=>n.type==='Text'&&text(n)==='Summary').props.numberOfLines,1);
 assert.ok(!nodes(row).includes(action),'the actions target must stay outside the edit pressable');
 assert.match(action.props.className,/h-11 w-11 shrink-0/);
 action.props.onPress();assert.equal(managed,custom.key);assert.equal(opened,null);
 row.props.onPress();assert.equal(opened,custom.key);h.dispose();
 const editor=harness();const actions={label:name,canMoveUp:true,canMoveDown:false,onRename:()=>{},onMove:()=>{},onDuplicate:()=>{},onDelete:()=>{}};
 editor.open('components/editor/SectionEditor.tsx',{},'SectionEditor',{section:custom,onChange:()=>{},onClose:()=>{},saveLabel:'All changes saved',onRename:()=>{},actions});
 const label=editor.button('Section actions');assert.ok(label);assert.equal(label.props.accessibilityLabel,`Actions for ${name}`);
 label.props.onPress();editor.render();const menu=editor.find(n=>typeof n.type==='function'&&n.type.name==='SectionActionsMenu');
 assert.equal(menu.props.actions.label,name);assert.equal(menu.props.actions.onDelete,actions.onDelete);editor.dispose();
});

test('Design & Layout displays only server-supported cards and paper sizes; Formatting controls preserve the full layout',()=>{
 const h=harness(),changes=[],props={layout:baseLayout(),options:{templates:['swiss-single','modern'],page_sizes:['A4','LETTER']},onChange:next=>{changes.push(next);props.layout=next;},onReload:()=>{}};
 h.open('components/editor/DesignLayout.tsx',{},'DesignLayout',props);
 assert.equal(h.find(n=>n.props.accessibilityLabel==='Single Column template').props.accessibilityState.checked,true);
 assert.equal(h.find(n=>n.props.accessibilityLabel==='Two Column template'),undefined);
 h.find(n=>n.props.accessibilityLabel==='Modern template').props.onPress();h.render();assert.equal(changes.at(-1).template,'modern');assert.equal(h.find(n=>n.props.accessibilityLabel==='Modern template').props.accessibilityState.checked,true);
 h.find(n=>n.props.accessibilityLabel==='Letter paper size').props.onPress();h.render();assert.equal(changes.at(-1).pageSize,'LETTER');
 assert.equal(h.find(n=>n.props.accessibilityLabel==='Increase top margin'),undefined);
 h.find(n=>n.props.accessibilityLabel==='Formatting').props.onPress();h.render();
 h.find(n=>n.props.accessibilityLabel==='Increase top margin').props.onPress();h.render();assert.equal(changes.at(-1).margins.top,11);assert.equal(changes.at(-1).margins.bottom,10);assert.equal(changes.at(-1).template,'modern');
 h.find(n=>n.props.accessibilityLabel==='Increase line spacing').props.onPress();h.render();assert.equal(changes.at(-1).spacing.lineHeight,4);
 h.find(n=>n.props.accessibilityLabel==='Increase text size').props.onPress();h.render();assert.equal(changes.at(-1).fontSize.base,4);
 h.find(n=>n.props.accessibilityLabel==='Body font: Mono').props.onPress();h.render();assert.equal(changes.at(-1).fontSize.bodyFont,'mono');assert.equal(changes.at(-1).fontSize.headerFont,'serif');assert.equal(changes.at(-1).pageSize,'LETTER');
 props.layout={...props.layout,margins:{...props.layout.margins,top:25},fontSize:{...props.layout.fontSize,base:1}};h.render();
 assert.equal(h.find(n=>n.props.accessibilityLabel==='Increase top margin').props.disabled,true);assert.equal(h.find(n=>n.props.accessibilityLabel==='Decrease text size').props.disabled,true);
 assert.equal(h.button('Open PDF preview'),undefined);h.dispose();
});

test('an explicit acknowledged PDF revision cannot drift to a newer server layout',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'7',pageSize:'LETTER'};
 const seen=[];
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>({...makeDocument(),revision:9,layout:{...baseLayout(),template:'modern',pageSize:'LETTER'}})},'@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision,signal)=>{seen.push([revision,signal]);return{uri:'blob:revision-seven',revision,dispose:async()=>{}};},shareEditorPdf:async()=>{}}});
 await h.pump();assert.equal(seen[0][0],7);assert.ok(seen[0][1] instanceof AbortSignal);assert.equal(h.find(n=>n.type==='PdfReadability').props.revision,7);assert.match(h.getText(),/Version 7/);assert.doesNotMatch(h.getText(),/Modern · Letter/);
});

test('tools and panel height survive PDF return while the same PDF surface remains mounted',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,layout:document.layout,confirmedSkills:[],loading:false,saveState:'saved'})}});
 const uri=h.find(n=>n.type==='CvPreviewSurface').props.pdf.uri;h.button('Templates').props.onPress();h.render();h.find(n=>n.type==='EditorControlsPanel').props.onHeightChange(275);h.render();h.button('Open PDF preview').props.onPress();await h.pump();h.blur();h.focus();assert.equal(h.button('Templates').props.accessibilityState.selected,true);assert.equal(h.find(n=>n.type==='EditorControlsPanel').props.height,275);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf.uri,uri);
});

test('the full PDF viewer returns to the existing editor without pushing a second editor instance',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'6',returnToEditor:'1'};
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>makeDocument()},'@/lib/editor/pdf':{loadEditorPdf:async()=>({uri:'file:///saved.pdf',revision:6,dispose:async()=>{}}),shareEditorPdf:async()=>{}}});
 await h.pump();h.button('Done, return to editor').props.onPress();assert.deepEqual(h.calls,[['back']]);
});

test('the divider follows continuous drag, persists only on release, retains children and temporarily fits the keyboard',()=>{
 const h=harness();let gestures;const committed=[];
 class Value{constructor(value){this.value=value;}setValue(value){this.value=value;}}
 const props={open:true,availableHeight:600,height:190,onHeightChange:value=>{committed.push(value);props.open=value>0;if(value>0)props.height=value;},toolbar:React.createElement('Toolbar'),children:React.createElement('PersistentControls')};
 h.mocks['react-native']={...h.mocks['react-native'],Animated:{Value,View:'AnimatedView'},PanResponder:{create:handlers=>{gestures=handlers;return{panHandlers:{}};}}};
 h.open('components/editor/EditorControlsPanel.tsx',{},'EditorControlsPanel',props);
 const shown=()=>h.find(n=>n.type==='AnimatedView').props.style.height.value;
 assert.equal(shown(),190);gestures.onPanResponderGrant();gestures.onPanResponderMove(null,{dy:-83});h.render();assert.equal(shown(),273);assert.equal(committed.length,0);
 gestures.onPanResponderRelease();h.render();assert.deepEqual(committed,[273]);
 props.availableHeight=320;h.render();assert.equal(shown(),124);assert.equal(committed.length,1);props.availableHeight=600;h.render();assert.equal(shown(),273);
 gestures.onPanResponderGrant();gestures.onPanResponderMove(null,{dy:-1000});assert.equal(shown(),404);gestures.onPanResponderMove(null,{dy:1000});assert.equal(shown(),0);gestures.onPanResponderRelease();h.render();assert.equal(props.open,false);assert.ok(h.find(n=>n.type==='PersistentControls'));assert.ok(h.find(n=>n.type==='Toolbar'));h.dispose();
});

test('all templates including future server templates display the actual PDF without a local renderer detour',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();document.layout.template='future-template';let saves=0;
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,layout:document.layout,confirmedSkills:[],loading:false,saveState:'saved',saveForPdf:async()=>{saves++;return document;}})}});
 const surface=h.find(n=>n.type==='CvPreviewSurface');assert.equal(surface.props.renderer,undefined);assert.equal(surface.props.pdf.revision,6);assert.equal(surface.props.editable,false);assert.doesNotMatch(h.getText(),/View template in PDF/);h.button('Open PDF preview').props.onPress();await h.pump();assert.equal(saves,0);assert.equal(h.calls.at(-1)[1].params.revision,'6');
});

test('plain multiline fields report the focused native selection line to the keyboard-aware section scroller',()=>{
 const h=harness();h.mocks['react-native'].Platform.OS='ios';const caret=[];
 h.open('components/editor/EditorTextField.tsx',{'@/components/ui/input':{Input:'Input'}},'EditorTextField',{label:'Summary',value:'first line\nsecond line\nlast line',onChangeText:()=>{},onCaret:y=>caret.push(y)});
 h.find(n=>n.type==='View'&&n.props.ref).props.ref.current={measureInWindow:callback=>callback(0,200,300,100)};
 const mirror=h.find(n=>n.type==='Text'&&n.props.onTextLayout),input=h.find(n=>n.type==='Input');
 mirror.props.onTextLayout({nativeEvent:{lines:[{text:'first line\n',y:12,height:24},{text:'second line\n',y:36,height:24},{text:'last line',y:60,height:24}]}});
 assert.equal(caret.length,0);input.props.onFocus();input.props.onSelectionChange({nativeEvent:{selection:{start:25,end:25}}});assert.equal(caret.at(-1),284);
 input.props.onBlur();const before=caret.length;input.props.onSelectionChange({nativeEvent:{selection:{start:0,end:0}}});assert.equal(caret.length,before);h.dispose();
});

test('the inline Experience editor reuses the rich bullet field and keeps sibling content intact',()=>{
 const {renderToStaticMarkup}=require('react-dom/server'),h=harness();let rich,changed;const box=props=>React.createElement('div',null,props.children);
 const {SectionEditor}=load('components/editor/SectionEditor.tsx',{...h.mocks,react:React,'react-native':{...h.mocks['react-native'],View:box,Pressable:box,KeyboardAvoidingView:box,ScrollView:box},'@/components/ui/text':{Text:props=>React.createElement('span',null,props.children)},'./RichTextField':{RichTextField:props=>{rich=props;return React.createElement('textarea',{value:props.value,readOnly:true});}},'@/components/ui/button':{Button:props=>React.createElement('button',null,props.children)},'@/lib/icons/LucideIcon':{__esModule:true,default:()=>null}});
 const value=[{id:1,title:'Engineer',company:'Keep company',description:['<strong>Original</strong> bullet','Keep second bullet'],descriptionStyles:['plain','bullet']}];
 renderToStaticMarkup(React.createElement(SectionEditor,{inline:true,section:{key:'workExperience',label:'Experience',value,hidden:false,personal:false,custom:false,sectionType:'itemList'},target:{path:[0,'description',0],label:'Experience bullet 1'},saveLabel:'Saving…',onChange:next=>changed=next,onClose:()=>{},onRename:()=>{},actions:{label:'Experience',canMoveUp:true,canMoveDown:true,onRename:()=>{},onMove:()=>{}}}));
 assert.equal(rich.value,value[0].description[0]);rich.onChangeText('<em>Updated</em> full bullet');assert.equal(changed[0].description[0],'<em>Updated</em> full bullet');assert.equal(changed[0].description[1],'Keep second bullet');assert.equal(changed[0].company,'Keep company');assert.deepEqual(changed[0].descriptionStyles,['plain','bullet']);h.dispose();
});


test('Content can edit later Experience entries while the multipage PDF keeps the same resume ID',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();document.resume.workExperience=Array.from({length:4},(_,i)=>({id:i+1,title:'Role '+(i+1),description:['Original '+i]}));let next;
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,confirmedSkills:[],loading:false,saveState:'saved',updateResume:value=>next=value})}});
 h.find(n=>n.props.accessibilityLabel==='Edit Experience').props.onPress();h.render();const section=h.find(n=>n.type==='SectionEditor');assert.equal(section.props.section.value[3].id,4);const roles=copy(section.props.section.value);roles[3].description[0]='Updated page-two role';section.props.onChange(roles);assert.equal(next.workExperience[3].description[0],'Updated page-two role');assert.equal(next.workExperience[0].description[0],'Original 0');assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf.revision,6);
});

test('PDF Done without history recovers the same editor and its originating screen',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.canGoBack=false;h.params={id:TAILORED,revision:'6',returnToEditor:'1',editorReturnTo:'tailor'};
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>makeDocument()},'@/lib/editor/pdf':{loadEditorPdf:async()=>({uri:'file:///same.pdf',revision:6,dispose:async()=>{}}),shareEditorPdf:async()=>{}}});await h.pump();h.button('Done, return to editor').props.onPress();assert.deepEqual(h.calls,[['replace',{pathname:'/cv-editor/[id]',params:{id:TAILORED,returnTo:'tailor'}}]]);
});


test('Templates renders every server option in one two-column grid with readable names and local-only selection',()=>{
 const h=harness(),document=makeDocument(),ids=['swiss-single','swiss-two-column','modern','modern-two-column','latex','clean','vivid','vivid-single','modern-deedy','deedy'];let selected=null;
 h.open('components/editor/DesignLayout.tsx',{},'DesignLayout',{mode:'templates',layout:{...document.layout,template:'modern-two-column'},options:{templates:ids,page_sizes:['A4','LETTER']},onChange:layout=>selected=layout,onReload:()=>{}});
 const cards=nodes(h.render()).filter(node=>node.props?.accessibilityRole==='radio');assert.equal(cards.length,10);assert.equal(cards.filter(card=>card.props.accessibilityState.checked).length,1);
 for(let i=0;i<cards.length;i++){assert.match(cards[i].props.className,/w-\[48%\]/);assert.ok(nodes(cards[i]).filter(node=>node.type==='Text').every(node=>!node.props.numberOfLines));cards[i].props.onPress();assert.equal(selected.template,ids[i]);}
 assert.doesNotMatch(h.getText(),/More templates|PDF preview/);assert.equal(h.calls.length,0);h.dispose();
});

test('two PDF taps reuse the ready artifact and navigate once without another export',async()=>{
 const h=harness(),document=makeDocument();let calls=0;h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,confirmedSkills:[],saveState:'saved',loading:false,saveForPdf:async()=>{calls++;return document;}})}});
 const tap=h.button('Open PDF preview').props.onPress;tap();tap();await h.pump();assert.equal(calls,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].params.revision,'6');h.dispose();
});

test('PDF retrieval retry keeps the frozen revision; viewer retry and download reuse the retrieved artifact',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'6',returnToEditor:'1'};let fail=true;const loads=[],shares=[];const artifact={uri:'file:///frozen-v6.pdf',revision:6,dispose:async()=>{}};
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>({...makeDocument(),revision:7})},'@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision)=>{loads.push(revision);if(fail)throw Error('Service unavailable');return artifact;},shareEditorPdf:async pdf=>shares.push(pdf)}});
 await h.pump();assert.match(h.getText(),/PDF retrieval failed/);assert.equal(h.button('Download PDF').props.disabled,true);fail=false;h.button('Retry PDF retrieval').props.onPress();await h.pump();assert.deepEqual(loads,[6,6]);
 h.find(node=>node.type==='PdfViewer').props.onError();h.render();assert.match(h.getText(),/viewer could not display/);h.button('Retry viewer').props.onPress();h.render();assert.ok(h.find(node=>node.type==='PdfViewer'));assert.deepEqual(loads,[6,6]);
 h.button('Download PDF').props.onPress();await h.pump();assert.equal(shares[0],artifact);assert.deepEqual(loads,[6,6]);
});

test('full-screen preview and Download use the exact inline PDF artifact without another Railway request',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'7',returnToEditor:'1'};const inlinePdf={uri:'file:///inline-two-column-v7.pdf',revision:7,filename:'CV.pdf',dispose:async()=>assert.fail('viewer must release the editor lease')};let released=0,shared;
 h.open('app/cv-editor/[id]/preview.tsx',{
  '@/lib/editor/pdfArtifacts':{editorPdfArtifacts:{acquire:(owner,id,revision)=>{assert.deepEqual([owner,id,revision],[OWNER,TAILORED,7]);return{pdf:inlinePdf,title:'Two Column',layout:{...baseLayout(),template:'swiss-two-column'},release:()=>released++};}}},
  '@/lib/editor/api':{getEditorDocument:async()=>assert.fail('must use the already loaded revision')},
  '@/lib/editor/pdf':{loadEditorPdf:async()=>assert.fail('must not load a second file'),shareEditorPdf:async pdf=>{shared=pdf;}},
 });await h.pump();assert.equal(h.find(n=>n.type==='PdfViewer').props.uri,inlinePdf.uri);h.button('Download PDF').props.onPress();await h.pump();assert.equal(shared,inlinePdf);h.button('Done, return to editor').props.onPress();assert.deepEqual(h.calls.at(-1),['back']);h.dispose();assert.equal(released,1);
});

test('a formatting change immediately before repaint cannot open a stale PDF',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();let draft=document.layout;
 const editor={document,resume:document.resume,layout:document.layout,confirmedSkills:[],saveState:'saved',loading:false,updateLayoutDraft:value=>draft=value,getSnapshot:()=>({document,resume:document.resume,layoutDraft:draft,confirmedSkills:[],saveState:'saved'})};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...editor,layoutDraft:draft})}});
 const oldTap=h.button('Open PDF preview').props.onPress;editor.updateLayoutDraft({...draft,template:'deedy',pageSize:'LETTER'});oldTap();await h.pump();assert.deepEqual(h.calls,[]);
});

test('PDF handoff keeps the old artifact and indicator until viewer readiness, then publishes the identical replacement',async(t)=>{
 const h=harness();t.after(()=>h.dispose());let document=makeDocument();let draft=document.layout;const files=[],disposed=[],published=[];
 const editor={document,resume:document.resume,layout:document.layout,layoutDraft:draft,confirmedSkills:[],saveState:'saved',loading:false,updateLayoutDraft:value=>{draft=value;editor.layoutDraft=value;},saveForPdf:async()=>{if(document.layout!==draft){document={...document,revision:document.revision+1,layout:draft};editor.document=document;editor.layout=draft;}return document;}};
 const realHook=load('lib/editor/useEditorPdf.ts',{...h.mocks,'./pdf':{loadEditorPdf:async(_owner,_id,revision)=>{const pdf={uri:'file:///handoff-'+revision+'.pdf',revision,filename:'cv.pdf',dispose:async()=>disposed.push(revision)};files.push(pdf);return pdf;}},'./pdfArtifacts':{editorPdfArtifacts:{publish:(_owner,_id,artifact)=>{published.push(artifact);return()=>{};}}}});
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor},'@/lib/editor/useEditorPdf':realHook});
 const settle=async check=>{const deadline=Date.now()+2000;while(!check()){assert.ok(Date.now()<deadline,'timed out waiting for handoff');await new Promise(r=>setTimeout(r,10));await h.pump();}};
 const surface=()=>h.find(n=>n.type==='CvPreviewSurface');await settle(()=>files.length===1&&surface());const old=files[0];assert.equal(h.button('Open PDF preview').props.disabled,true);surface().props.onViewerReady(old);await h.pump();assert.equal(h.button('Open PDF preview').props.disabled,false);
 h.button('Templates').props.onPress();h.render();h.find(n=>n.type==='DesignLayout'&&n.props.mode==='templates').props.onChange({...draft,template:'swiss-two-column'});h.render();assert.ok(h.find(n=>n.props.testID==='preview-updating-overlay'));
 await settle(()=>files.length===2&&surface()?.props.pendingPdf);const next=files[1];assert.equal(surface().props.pdf,old);assert.equal(surface().props.pendingPdf,next);assert.equal(h.button('Open PDF preview').props.disabled,true);assert.ok(h.find(n=>n.props.testID==='preview-updating-overlay'));assert.deepEqual(disposed,[],'the old viewer still owns a lease after PDF fetch');assert.equal(published.at(-1).pdf,old);
 surface().props.onViewerReady(old);await h.pump();assert.equal(surface().props.pdf,old,'late old-viewer callback cannot enable preview');surface().props.onViewerReady(next);await h.pump();assert.equal(surface().props.pdf,next);assert.equal(surface().props.pendingPdf,null);assert.equal(h.button('Open PDF preview').props.disabled,false);assert.equal(h.find(n=>n.props.testID==='preview-updating-overlay'),undefined);assert.equal(published.at(-1).pdf,next);assert.deepEqual(disposed,[6]);
});

test('PDF layers keep the replacement viewer mounted with the same key during the handoff',()=>{
 const h=harness(),{PdfCvRenderer}=load('components/editor/CvPreviewSurface.tsx',{...h.mocks,'./PdfViewer':{PdfViewer:'PdfViewer'}});const old={uri:'file:///old.pdf'},next={uri:'file:///next.pdf'};let ready;
 const before=PdfCvRenderer({pdf:old,pendingPdf:next,onViewerReady:file=>ready=file,onError:()=>{}});const viewers=nodes(before).filter(n=>n.type==='PdfViewer');assert.deepEqual(viewers.map(n=>n.props.uri),[old.uri,next.uri]);viewers[1].props.onReady();assert.equal(ready,next);const nextLayer=nodes(before).find(n=>n.key===next.uri);assert.equal(nextLayer.props.pointerEvents,'none');assert.match(nextLayer.props.className,/z-0/);
 const after=PdfCvRenderer({pdf:next,pendingPdf:null,onError:()=>{}});const retained=nodes(after).find(n=>n.key===next.uri);assert.equal(retained.key,nextLayer.key);assert.equal(retained.props.pointerEvents,'auto');assert.match(retained.props.className,/z-10/);h.dispose();
});

test('web and iOS PDF load readiness waits for two frames; errors and unmount cancel pending callbacks',()=>{
 const originalRaf=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;const frames=new Map();let sequence=0;
 globalThis.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const frame=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
 try{for(const platform of ['web','ios']){
  const h=harness();h.mocks['react-native'].Platform.OS=platform;let ready=0,errors=0;const props={uri:'file:///loaded.pdf',onReady:()=>ready++,onError:()=>errors++};
  h.open('components/editor/PdfViewer.'+(platform==='ios'?'native':'web')+'.tsx',{'react-native-webview':{WebView:'WebView'}},'PdfViewer',props);const viewer=()=>h.find(n=>n.type===(platform==='ios'?'WebView':'iframe'));
  viewer().props.onLoad();assert.equal(ready,0);frame();assert.equal(ready,0);frame();assert.equal(ready,1);
  viewer().props.onLoad();viewer().props.onError();frame();frame();assert.equal(ready,1);assert.equal(errors,1);
  props.uri='file:///new.pdf';h.render();viewer().props.onLoad();h.dispose();frame();frame();assert.equal(ready,1);
 }}finally{globalThis.requestAnimationFrame=originalRaf;globalThis.cancelAnimationFrame=originalCancel;}
});

test('template and formatting controls mark each tap for timing without generating extra previews',()=>{
 const h=harness(),document=makeDocument();let taps=0;const changes=[];h.pdf={pdf:{uri:'file:///same.pdf',revision:6},ready:true,formatTap:()=>taps++};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({document,resume:document.resume,layout:document.layout,layoutDraft:document.layout,confirmedSkills:[],saveState:'saved',loading:false,updateLayoutDraft:next=>changes.push(next)})}});
 h.button('Templates').props.onPress();h.render();h.find(n=>n.type==='DesignLayout'&&n.props.mode==='templates').props.onChange({...document.layout,template:'deedy'});assert.equal(taps,1);
 h.button('Format').props.onPress();h.render();for(const base of [4,5,4])h.find(n=>n.type==='DesignLayout'&&n.props.mode==='format').props.onChange({...document.layout,fontSize:{...document.layout.fontSize,base}});assert.equal(taps,4);assert.equal(changes.length,4);assert.deepEqual(h.calls,[]);h.dispose();
});


test('Keyword Highlights presents the legend followed by the complete saved document without inner tabs or a job panel',()=>{
  const h=harness();
  const source={summary:'Supported TCP/IP networks.',workExperience:[{id:1,title:'Engineer',company:'Acme',description:['Maintained TCP/IP services.']}],additional:{technicalSkills:['TCP/IP']}};
  const saved={...source,summary:'Supported TCP/IP networks. Added VLAN monitoring.',additional:{technicalSkills:['TCP/IP','VLAN','English communication (written and spoken)']},customSections:{custom_1:{sectionType:'text',text:'Complete custom paragraph.'}},sectionMeta:[{key:'summary',displayName:'Profile',order:0},{key:'workExperience',displayName:'Work history',order:1},{key:'additional',displayName:'Skills & awards',order:2},{key:'custom_1',displayName:'Community',order:3}]};
  const props={resume:saved,keywords:['TCP/IP','VLAN'],jobDescription:'TCP/IP VLAN PRIVATE JOB DESCRIPTION',history:{original:source,changes:[],keywords:[]}};
  h.open('components/editor/KeywordHighlights.tsx',{},'KeywordHighlights',props);
  const content=h.getText();
  assert.match(content,/Yellow — Matched keywords/);assert.match(content,/Blue — Keywords you added/);
  assert.doesNotMatch(content,/Yellow marks keywords|Some keyword history|Checking keyword history|Retry highlights/);
  assert.match(content,/Complete custom paragraph/);assert.match(content,/English communication \(written and spoken\)/);
  assert.ok(content.indexOf('Yellow —')<content.indexOf('Your resume'));assert.ok(content.indexOf('Your resume')<content.indexOf('Supported TCP/IP'));
  assert.deepEqual(nodes(h.render()).filter(n=>n.props.accessibilityRole==='header').map(text),['Your resume','Profile','Work history','Skills & awards','Community']);
  assert.equal(h.find(n=>n.props.accessibilityRole==='tab'||n.type==='ScrollView'),undefined,'the route owns the single scroll');
  assert.doesNotMatch(content,/PRIVATE JOB DESCRIPTION|exact locations|Exact text locations/);
  const spans=nodes(h.render()).filter(n=>n.type==='Text'&&/text-highlight-(matched|added)-foreground/.test(n.props.className??''));
  assert.ok(spans.some(n=>text(n)==='TCP/IP'&&n.props.className.includes('bg-highlight-matched')));
  assert.ok(spans.some(n=>text(n)==='VLAN'&&n.props.className.includes('bg-highlight-added')));
  props.resume={...saved,summary:'Updated intro. Supported TCP/IP networks. Added VLAN monitoring.'};
  h.render();assert.match(h.getText(),/Updated intro/);
  const updatedSpans=nodes(h.render()).filter(n=>n.type==='Text'&&/text-highlight-(matched|added)-foreground/.test(n.props.className??''));
  assert.ok(updatedSpans.some(n=>text(n)==='TCP/IP'&&n.props.className.includes('bg-highlight-matched')));
  assert.ok(updatedSpans.some(n=>text(n)==='VLAN'&&n.props.className.includes('bg-highlight-added')));
  props.keywords=['English communication (written and spoken)'];props.jobDescription='English communication (written and spoken)';h.render();
  assert.ok(nodes(h.render()).some(n=>n.type==='Text'&&text(n)==='English communication (written and spoken)'&&n.props.className?.includes('text-highlight-added-foreground')),'new engine terms recompute highlights');
  props.history=null;h.render();assert.doesNotMatch(h.getText(),/Some keyword history|No verified keyword|Retry highlights/);
  let retries=0;props.historyError=true;props.onRetry=()=>{retries++;};h.render();
  assert.doesNotMatch(h.getText(),/Only verified occurrences/);assert.match(h.getText(),/Complete custom paragraph/);
  h.button('Retry highlights').props.onPress();assert.equal(retries,1);
  h.dispose();
});


test('recommendation display removes chip repetition and duplicate themes without changing server data',()=>{
  const {overviewRecommendations}=load('lib/editor/recommendations.ts');
  const original=['Quantify SQL achievements.','Use the exact job title in your headline. Recruiters filter literally.','Match the job title in your professional title.','Add measurable results to your bullets.','Quantify achievements with numbers.','Use strong action verbs.'];const before=copy(original);
  assert.deepEqual(overviewRecommendations(original,['SQL']).map(item=>item.text),['Use the exact job title in your headline.','Add measurable results to your bullets.']);
  assert.deepEqual(original,before);assert.deepEqual(overviewRecommendations(['Add missing keywords.','Some irrelevant description.'],[]),[]);
});


test('missing keywords can be reviewed, manually added in Edit Resume, saved, then analyzed without changing confirmations',async(t)=>{
  let remote=makeDocument(),analyzedRevision=null;
  remote.resume.additional={technicalSkills:['Existing skill'],languages:['Arabic']};remote.confirmed_skills=['Existing skill'];
  remote.analysis={status:'current',revision:6,score:{overall_score:60,sub_scores:{},recommendations:[]},missing_keywords:['Python'],matched_keywords:[],required_skills:['Python'],preferred_skills:[],matched_count:0,total_keywords:1};
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{remote={...remote,revision:remote.revision+1,resume:copy(body.resume),confirmed_skills:copy(body.confirmed_skills),analysis:{...remote.analysis,status:'stale'}};return copy(remote);},analyze:async revision=>{analyzedRevision=revision;assert.ok(remote.resume.additional.technicalSkills.includes('Python'));return {...remote.analysis,status:'current',revision,missing_keywords:[],matched_keywords:['Python'],matched_count:1};},onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  const useEditor=()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:(resume,skills)=>manager.update(resume,skills),updateWorkspace:patch=>manager.updateWorkspace(patch),refreshAnalysis:()=>manager.refreshAnalysis()});
  const mocks={'@/lib/editor/useCvEditor':{useCvEditor:useEditor}};
  const match=harness();t.after(()=>match.dispose());match.open('app/cv-editor/[id]/job-match.tsx',mocks);
  const initial=match.find(n=>n.type==='JobMatch').props;
  const overview=harness();t.after(()=>overview.dispose());overview.open('components/editor/JobMatch.tsx',{},'JobMatch',initial);
  assert.match(overview.getText(),/Python/);assert.doesNotMatch(overview.getText(),/Add skills I have|Add to Skills/);
  match.button('Back to Edit Resume').props.onPress();assert.deepEqual(match.calls,[['back']]);
  const editor=harness();t.after(()=>editor.dispose());editor.open('app/cv-editor/[id].tsx',mocks);
  editor.find(n=>n.props.accessibilityLabel==='Edit Skills').props.onPress();editor.render();
  const section=editor.find(n=>n.type==='SectionEditor');assert.deepEqual(section.props.section.value.technicalSkills,['Existing skill']);
  section.props.onChange({...section.props.section.value,technicalSkills:['Existing skill','Python']});editor.render();
  editor.find(n=>n.type==='SectionEditor').props.onClose();await editor.pump();
  assert.deepEqual(remote.resume.additional.technicalSkills,['Existing skill','Python']);assert.deepEqual(remote.resume.additional.languages,['Arabic']);assert.deepEqual(remote.confirmed_skills,['Existing skill']);
  editor.button('Job Match').props.onPress();assert.equal(editor.calls.at(-1)[1].pathname,'/cv-editor/[id]/job-match');
  match.render();assert.equal(match.find(n=>n.type==='JobMatch').props.revision,remote.revision);
  match.find(n=>n.type==='JobMatch').props.onRefresh();await match.pump();
  assert.equal(analyzedRevision,remote.revision);assert.equal(manager.snapshot.analysis.status,'current');assert.deepEqual(manager.snapshot.analysis.missing_keywords,[]);assert.deepEqual(manager.snapshot.confirmedSkills,['Existing skill']);
});


test('Job Match automatically scores each saved revision once per visit and shares analysis across tabs',async(t)=>{
  const h=harness();t.after(()=>h.dispose());const doc=makeDocument(),pending=[];
  const editor={document:null,resume:null,loading:true,saveState:'saved',workspace:{matchSection:'overview'},analysis:null,analysisLoading:false,analysisError:null,
    updateWorkspace:patch=>{editor.workspace={...editor.workspace,...patch};},
    refreshAnalysis:()=>new Promise(resolve=>pending.push({revision:editor.document.revision,resolve}))};
  h.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  await h.pump();assert.equal(pending.length,0,'waits for the saved document');
  editor.document=doc;editor.resume=doc.resume;editor.loading=false;editor.saveState='saving';h.render();await h.pump();assert.equal(pending.length,0,'waits for content autosaves');
  editor.saveState='saved';h.render();await h.pump();assert.deepEqual(pending.map(p=>p.revision),[6]);
  for(let i=0;i<6;i++){h.button(i%2?'Overview':'Keyword Highlights').props.onPress();h.render();}
  assert.equal(pending.length,1);assert.equal(h.find(n=>n.type==='JobMatch').props.loading,true);
  const analysis={status:'current',revision:6,score:{overall_score:75,sub_scores:{},recommendations:[]},matched_keywords:['TCP/IP']};
  editor.analysis=analysis;pending[0].resolve();await h.pump();
  for(const tab of ['Overview','Keyword Highlights','Overview']){h.button(tab).props.onPress();h.render();assert.equal(h.find(n=>n.type==='JobMatch').props.analysis,analysis);assert.equal(h.find(n=>n.type==='JobMatch').props.loading,false);}
  assert.equal(pending.length,1);
  const reopened=harness();t.after(()=>reopened.dispose());
  reopened.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});await reopened.pump();
  assert.equal(pending.length,1,'reopening a current saved result does not calculate again');
  assert.equal(reopened.find(n=>n.type==='JobMatch').props.analysis,analysis);
  assert.equal(reopened.find(n=>n.type==='JobMatch').props.loading,false);
  editor.document={...doc,revision:7};editor.analysis={...analysis,status:'stale'};h.render();await h.pump();assert.deepEqual(pending.map(p=>p.revision),[6,7]);
  editor.analysisError='Network failed';pending[1].resolve();await h.pump();h.render();await h.pump();assert.equal(pending.length,2,'failure does not automatically loop');
  h.find(n=>n.type==='JobMatch').props.onRefresh();h.find(n=>n.type==='JobMatch').props.onRefresh();await h.pump();assert.equal(pending.length,3,'explicit retry is serialized');
  editor.analysis={...analysis,revision:7};editor.analysisError=null;pending[2].resolve();await h.pump();assert.equal(h.find(n=>n.type==='JobMatch').props.analysis.revision,7);assert.equal(pending.length,3);
  const next=harness();t.after(()=>next.dispose());editor.analysis={...analysis,status:'stale',revision:6};next.open('app/cv-editor/[id]/job-match.tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});await next.pump();assert.equal(pending.length,4,'a new visit can try the stale revision again');pending[3].resolve();await next.pump();
});

test('first scoring replaces empty breakdown and stale scoring retains bars with retry on either tab',()=>{
 const h=harness();const props={analysis:null,revision:6,dirty:false,loading:true,jobDescription:'TCP/IP',savedResume:{summary:'TCP/IP'},onRefresh:()=>{},onEdit:()=>{}};
 h.open('components/editor/JobMatch.tsx',{},'JobMatch',props);
 assert.match(h.getText(),/Calculating match…/);assert.doesNotMatch(h.getText(),/Unavailable|Not calculated|No keyword results|No recommendations/);assert.equal(h.find(n=>n.props.accessibilityRole==='progressbar'),undefined);
 props.analysis={status:'stale',revision:5,score:{overall_score:75,sub_scores:{keyword_match:75},recommendations:[]},matched_keywords:['TCP/IP'],matched_count:1,total_keywords:1};h.render();assert.match(h.getText(),/Updating match…/);assert.match(h.getText(),/75/);assert.ok(h.find(n=>n.props.accessibilityRole==='progressbar'));
 props.section='highlights';h.render();assert.match(h.getText(),/Updating match…/);assert.equal(h.find(n=>typeof n.type==='function'&&n.type.name==='KeywordHighlights').props.keywords[0],'TCP/IP');
 props.loading=false;props.error='private raw error';h.render();assert.match(h.getText(),/Couldn’t update your match/);assert.ok(h.button('Retry Update Match'));assert.doesNotMatch(h.getText(),/private raw error/);h.dispose();
});


test('verified additions fill entire skill chips, while matches and other sections keep inline colors',()=>{
 const h=harness();const long='Basic networking (Wi-Fi, cabling, IP addressing, DNS/DHCP)';
 const source={summary:'Supported TCP/IP.',workExperience:[{id:1,description:['Maintained TCP/IP.']}],additional:{technicalSkills:['Python'],languages:[]}};
 const resume={...source,summary:'Supported TCP/IP. Added networking.',workExperience:[{id:1,description:['Maintained TCP/IP. Added networking.']}],additional:{technicalSkills:['Python','SQL',long],languages:['English']}};
 const props={resume,keywords:['TCP/IP','Python','SQL','networking','English'],jobDescription:'TCP/IP Python SQL networking English',history:{original:source,changes:[],keywords:[]}};
 h.open('components/editor/KeywordHighlights.tsx',{},'KeywordHighlights',props);
 const chipNodes=()=>nodes(h.render()).filter(n=>n.type==='View'&&n.props.className?.includes('rounded-sm px-2 py-1'));
 for(const label of ['SQL',long]){
  const chip=chipNodes().find(n=>text(n)===label);assert.ok(chip);assert.match(chip.props.className,/bg-highlight-added/);
  const labels=nodes(chip).filter(n=>n.type==='Text');assert.equal(labels.length,1,'one plain label without segmented inline backgrounds');
  assert.equal(text(labels[0]),label);assert.match(labels[0].props.className,/text-highlight-added-foreground/);assert.doesNotMatch(labels[0].props.className,/bg-highlight/);assert.equal(labels[0].props.numberOfLines,undefined);
 }
 const matched=chipNodes().find(n=>text(n)==='Python');assert.match(matched.props.className,/bg-muted/);assert.ok(nodes(matched).some(n=>n.props.className?.includes('bg-highlight-matched')));
 const language=chipNodes().find(n=>text(n)==='English');assert.match(language.props.className,/bg-muted/,'non-Skills chips retain word-level treatment');
 assert.equal(nodes(h.render()).filter(n=>n.type==='Text'&&text(n)==='networking'&&n.props.className?.includes('bg-highlight-added')).length,2,'Summary and Experience still highlight just the added word');
 props.history=null;h.render();assert.ok(chipNodes().every(n=>!n.props.className.includes('bg-highlight-added')),'unknown provenance never fills chips');h.dispose();
});
