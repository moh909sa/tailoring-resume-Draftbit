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
  const children=typeof value.type === "function" && ["ResumeSectionList","SectionActions","LevelControl","FontControl","LayoutFormatting"].includes(value.type.name) ? value.type(value.props) : value.type === "EditorControlsPanel" ? [value.props.toolbar,value.props.children] : value.props?.children;
  return [value,...nodes(children)];
}
function text(value) {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(text).join("");
  if(typeof value === "object" && typeof value.type === "function" && ["ResumeSectionList","SectionActions","LevelControl","FontControl","LayoutFormatting"].includes(value.type.name)) return text(value.type(value.props));
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
test("editor waits for latest edit acknowledgement, previews its revision, and Back returns to saved library",async()=>{
  let remote=makeDocument(),release,stored=null;const mutations=[];
  const manager=new CvEditorSession({read:async()=>null,write:async raw=>{stored=raw;},uuid:()=>"44444444-4444-4444-8444-444444444444",parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{mutations.push(copy(body));await new Promise(r=>release=r);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  await manager.restore();
  const h=harness();const api=()=>({...manager.snapshot,routeError:null,updateResume:v=>manager.update(v),updateConfirmedSkills:()=>{},flush:()=>manager.flush(),reload:()=>manager.refresh(),resolveConflict:mode=>manager.resolveConflict(mode),refreshAnalysis:()=>manager.refreshAnalysis()});
  h.open("app/cv-editor/[id].tsx",{"@/lib/editor/useCvEditor":{useCvEditor:api}});
  h.find(n=>n.props.accessibilityLabel==="Edit Summary").props.onPress();h.render();
  const section=h.find(n=>n.type==="SectionEditor");section.props.onChange("After editing");section.props.onClose();h.render();
  h.button("Open PDF preview").props.onPress();await tick();assert.equal(h.calls.length,0,"must not navigate before PATCH acknowledgement");
  assert.equal(mutations[0].expected_revision,6);assert.equal(JSON.parse(stored).pending.mutation_id,mutations[0].mutation_id);
  release();await h.pump();
  assert.deepEqual(h.calls.at(-1),["push",{pathname:"/cv-editor/[id]/preview",params:{id:TAILORED,revision:"7",returnToEditor:"1"}}]);
  assert.equal(remote.resume.summary,"After editing");
  h.find(n=>n.props?.accessibilityLabel==="Back to saved CVs").props.onPress();
  assert.deepEqual(h.calls.at(-1),["back"]);h.dispose();manager.dispose();
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

test('editor control panes switch repeatedly through native style resolution without replacing edits',async()=>{
 const h=harness(),document=makeDocument();let updates=0;
 const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,refreshAnalysis:()=>{updates++;},flush:async()=>document};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 const renderers=new Map();
 const paint=async()=>{for(const node of nodes(h.render()).filter(n=>n.props.accessibilityRole==='tab')){const key=node.props.accessibilityLabel;if(!renderers.has(key))renderers.set(key,await nativeTransition());assert.doesNotThrow(()=>renderers.get(key)(node.props.className));}};
 await paint();for(const label of ['Job Match','Keyword Highlights','Overview','Templates','Content','Job Match','Templates']){h.button(label).props.onPress();h.render();await paint();}
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

test('PDF waits for acknowledgement and retains the editor draft and retry after a failed save',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,returnTo:'preview',previewReturnTo:'library'};
 const document=makeDocument();let finish;
 const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:()=>new Promise(resolve=>finish=resolve)};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 h.button('Open PDF preview').props.onPress();await h.pump();assert.deepEqual(h.calls,[]);
 finish(null);await h.pump();assert.deepEqual(h.calls,[]);assert.match(h.find(n=>n.type==='Notice').props.message,/text and layout are kept/);
 h.button('Retry saving').props.onPress();await h.pump();finish({...document,revision:7});await h.pump();
 assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1'}}]]);
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

test('Templates and Format use the local draft and server capabilities; PDF waits for explicit acknowledgement',async()=>{
 const h=harness(),document=makeDocument();let finish;
 const editor={document,resume:document.resume,layout:document.layout,layoutDraft:document.layout,updateLayoutDraft:next=>{editor.layoutDraft=next;},confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,saveForPdf:()=>new Promise(resolve=>finish=resolve)};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 h.button('Templates').props.onPress();h.render();
 const design=h.find(n=>n.type==='DesignLayout'&&n.props.mode==='templates');assert.equal(design.props.layout,editor.layoutDraft);assert.equal(design.props.options,document.layout_options);assert.equal(design.props.onChange,editor.updateLayoutDraft);
 design.props.onChange({...editor.layoutDraft,template:'modern'});h.render();assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.layout.template,'modern');assert.equal(editor.layout.template,'swiss-single');
 assert.equal(nodes(h.render()).filter(n=>n.type==='Button'&&n.props.accessibilityLabel==='Open PDF preview').length,1);
 h.button('Open PDF preview').props.onPress();await h.pump();assert.deepEqual(h.calls,[]);finish({...document,revision:7});await h.pump();
 assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1'}}]]);h.dispose();
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

test('control panes remember Job Match selection without discarding a pending Summary save',async(t)=>{
  const h=harness();t.after(()=>h.dispose());h.mocks['react-native'].Platform.OS='ios';h.params={id:TAILORED,returnTo:'preview',previewReturnTo:'library'};
  let remote=makeDocument(),release,saves=0;
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{saves++;await new Promise(resolve=>release=resolve);remote={...remote,revision:7,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,refreshAnalysis:()=>{},flush:()=>manager.flush(),updateResume:v=>manager.update(v)})}});
  const tab=label=>h.button(label) ?? h.find(n=>n.props.accessibilityRole==='tab'&&(text(n)===label || n.props.accessibilityLabel===label));
  const select=label=>{tab(label).props.onPress();h.render();};
  assert.equal(tab('Content').props.accessibilityState.selected,true);
  h.find(n=>n.props.accessibilityLabel==='Edit Summary').props.onPress();h.render();
  const section=h.find(n=>n.type==='SectionEditor');section.props.onChange('Pending complete Summary');section.props.onClose();await h.pump();
  assert.equal(saves,1);assert.equal(manager.snapshot.saveState,'saving');
  select('Templates');assert.ok(h.find(n=>n.type==='DesignLayout'));assert.match(h.find(n=>n.props.testID==='editor-content-controls').props.className,/hidden/);
  select('Job Match');assert.equal(tab('Overview').props.accessibilityState.selected,true);assert.equal(h.find(n=>n.type==='JobMatch').props.section,'overview');
  select('Keyword Highlights');assert.equal(h.find(n=>n.type==='JobMatch').props.section,'highlights');
  select('Templates');assert.equal(tab('Templates').props.accessibilityState.selected,true);
  select('Content');assert.ok(h.find(n=>n.props.accessibilityLabel==='Edit Summary'));assert.equal(manager.snapshot.resume.summary,'Pending complete Summary');
  select('Job Match');assert.equal(tab('Keyword Highlights').props.accessibilityState.selected,true);
  select('Overview');select('Content');assert.equal(tab('Content').props.accessibilityState.selected,true);
  assert.equal(saves,1);assert.deepEqual(h.calls,[]);assert.equal(h.find(n=>n.type==='KeyboardAvoidingView').props.behavior,'padding');
  release();await h.pump();assert.equal(manager.snapshot.saveState,'saved');assert.equal(remote.resume.summary,'Pending complete Summary');
  h.button('Open PDF preview').props.onPress();await h.pump();assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1'}}]]);
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

test('Job Match edit actions use the restored section editors',()=>{
  const h=harness(),document=makeDocument();
  const editor={document,resume:document.resume,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,flush:async()=>document,refreshAnalysis:()=>{}};
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
  h.button('Job Match').props.onPress();h.render();
  h.find(n=>n.type==='JobMatch').props.onEdit('workExperience');h.render();
  assert.equal(h.find(n=>n.type==='SectionEditor').props.section.key,'workExperience');h.dispose();
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

test('legacy CV preview saves complete display metadata before navigating to its acknowledged PDF revision',async(t)=>{
  const h=harness();t.after(()=>h.dispose());let remote=makeDocument();delete remote.resume.sectionMeta;
  const manager=new CvEditorSession({read:async()=>null,write:async()=>{},uuid:()=> '44444444-4444-4444-8444-444444444444',parseDocument:v=>v,load:async()=>copy(remote),save:async body=>{assert.ok(body.resume.sectionMeta.length);remote={...remote,revision:remote.revision+1,resume:copy(body.resume)};return copy(remote);},analyze:async()=>null,onState:()=>{}});
  t.after(()=>manager.dispose());await manager.restore();
  h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>({...manager.snapshot,flush:()=>manager.flush(),updateResume:v=>manager.update(v)})}});
  h.button('Open PDF preview').props.onPress();await h.pump();
  assert.deepEqual(h.calls,[['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1'}}]]);
  assert.equal(remote.resume.sectionMeta.find(meta=>meta.key==='summary').displayName,'Summary');
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

test('local renderer and tray survive tool changes and PDF return without automatic PDF or score requests',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();let exports=0,scoreRequests=0;
 const editor={document,resume:document.resume,layout:document.layout,layoutDraft:document.layout,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,
   updateLayoutDraft:next=>{editor.layoutDraft=next;},saveForPdf:async()=>{exports++;return{...document,revision:7,layout:editor.layoutDraft};},refreshAnalysis:()=>{scoreRequests++;}};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor},'@/lib/editor/useLivePreview':{useLivePreview:()=>{throw Error('Editor must not generate PDFs in the background');}}});
 assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.pdf,null);
 assert.equal(h.find(n=>n.type==='EditorControlsPanel').props.open,false);
 h.button('Templates').props.onPress();h.render();
 const design=h.find(n=>n.type==='DesignLayout'&&n.props.mode==='templates');
 for(const template of ['modern','swiss-single','clean']){design.props.onChange({...editor.layoutDraft,template});h.render();assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.layout.template,template);}
 h.find(n=>n.type==='CvPreviewSurface').props.onViewportChange({zoom:2.2,x:110,y:284});h.find(n=>n.type==='EditorControlsPanel').props.onHeightChange(287);h.render();
 h.button('Format').props.onPress();h.render();const format=h.find(n=>n.type==='DesignLayout'&&n.props.mode==='format');
 format.props.onChange({...editor.layoutDraft,pageSize:'LETTER',margins:{...editor.layoutDraft.margins,top:12},fontSize:{...editor.layoutDraft.fontSize,base:4}});h.render();
 assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.layout.pageSize,'LETTER');assert.equal(exports,0);assert.equal(scoreRequests,0);assert.deepEqual(editor.layout,document.layout);
 h.button('Format').props.onPress();h.render();assert.equal(h.find(n=>n.type==='EditorControlsPanel').props.open,false);
 assert.ok(h.find(n=>n.type==='DesignLayout'&&n.props.mode==='format'),'closing keeps the controls mounted');
 h.button('Format').props.onPress();h.render();h.button('Open PDF preview').props.onPress();await h.pump();
 assert.equal(exports,1);assert.deepEqual(h.calls.at(-1),['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'7',returnToEditor:'1'}}]);
 h.blur();h.focus();await h.pump();assert.equal(h.button('Format').props.accessibilityState.selected,true);assert.equal(h.find(n=>n.type==='EditorControlsPanel').props.open,true);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.scrollOffset,284);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.zoom,2.2);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.panX,110);assert.equal(h.find(n=>n.type==='EditorControlsPanel').props.height,287);
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

test('an unsupported saved template is preserved and offers explicit PDF without starting background generation',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();document.layout={...document.layout,template:'future-template'};document.layout_options.templates.push('future-template');let exports=0;
 const editor={document,resume:document.resume,layout:document.layout,layoutDraft:document.layout,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,saveForPdf:async()=>{exports++;return document;}};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 assert.equal(h.find(n=>n.type==='CvPreviewSurface'),undefined);assert.equal(exports,0);assert.match(h.getText(),/Future Template is available in PDF preview/);assert.equal(editor.layoutDraft.template,'future-template');
 h.button('View template in PDF').props.onPress();await h.pump();assert.equal(exports,1);assert.equal(h.calls.at(-1)[1].params.revision,'6');
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


test('page-two pencil targets the existing role and keeps its resume ID through an acknowledged PDF export',async(t)=>{
 const h=harness();t.after(()=>h.dispose());const document=makeDocument();document.resume.workExperience=Array.from({length:4},(_,i)=>({id:i+1,title:'Role '+(i+1),company:'Company',description:['Original '+i]}));
 const editor={document,resume:document.resume,layout:document.layout,confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,saveForPdf:async()=>document};
 h.params={id:TAILORED,returnTo:'library'};h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});
 h.find(n=>n.type==='CvPreviewSurface').props.onViewportChange({zoom:1.8,x:88,y:650});
 h.find(n=>n.type==='CvPreviewSurface').props.onSectionPress('workExperience',{path:[3],label:'Experience — Role 4'});h.render();
 const section=h.find(n=>n.type==='SectionEditor');assert.deepEqual(section.props.target.path,[3]);assert.equal(section.props.section.value[3].id,4);assert.equal(h.find(n=>n.type==='CvPreviewSurface').props.zoom,1.8);
 h.button('Open PDF preview').props.onPress();await h.pump();assert.deepEqual(h.calls.at(-1),['push',{pathname:'/cv-editor/[id]/preview',params:{id:TAILORED,revision:'6',returnToEditor:'1',editorReturnTo:'library'}}]);
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

test('two PDF taps before a rerender prepare and navigate only once',async()=>{
 const h=harness(),document=makeDocument();let release,calls=0;
 const editor={document,resume:document.resume,layout:document.layout,layoutDraft:{...document.layout,template:'swiss-two-column'},confirmedSkills:[],loading:false,error:null,saveState:'saved',problem:null,analysis:null,analysisLoading:false,saveForPdf:async()=>{calls++;await new Promise(resolve=>release=resolve);return {...document,revision:7};}};
 h.open('app/cv-editor/[id].tsx',{'@/lib/editor/useCvEditor':{useCvEditor:()=>editor}});const tap=h.button('Open PDF preview').props.onPress;tap();tap();await h.pump();assert.equal(calls,1);assert.equal(h.calls.length,0);release();await h.pump();assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].params.revision,'7');h.dispose();
});


test('PDF retrieval retry keeps the frozen revision; viewer retry and download reuse the retrieved artifact',async(t)=>{
 const h=harness();t.after(()=>h.dispose());h.params={id:TAILORED,revision:'6',returnToEditor:'1'};let fail=true;const loads=[],shares=[];const artifact={uri:'file:///frozen-v6.pdf',revision:6,dispose:async()=>{}};
 h.open('app/cv-editor/[id]/preview.tsx',{'@/lib/editor/api':{getEditorDocument:async()=>({...makeDocument(),revision:7})},'@/lib/editor/pdf':{loadEditorPdf:async(owner,id,revision)=>{loads.push(revision);if(fail)throw Error('Service unavailable');return artifact;},shareEditorPdf:async pdf=>shares.push(pdf)}});
 await h.pump();assert.match(h.getText(),/PDF retrieval failed/);assert.equal(h.button('Download PDF').props.disabled,true);fail=false;h.button('Retry PDF retrieval').props.onPress();await h.pump();assert.deepEqual(loads,[6,6]);
 h.find(node=>node.type==='PdfViewer').props.onError();h.render();assert.match(h.getText(),/viewer could not display/);h.button('Retry viewer').props.onPress();h.render();assert.ok(h.find(node=>node.type==='PdfViewer'));assert.deepEqual(loads,[6,6]);
 h.button('Download PDF').props.onPress();await h.pump();assert.equal(shares[0],artifact);assert.deepEqual(loads,[6,6]);
});
