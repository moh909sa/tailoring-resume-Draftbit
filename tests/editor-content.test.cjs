const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
function load(file) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal(result.diagnostics.length,0,file);
  const mod={exports:{}};
  const requireLocal=name=>name==='@/components/tailoring/ReviewContent'?{readableLabel:key=>key}:name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name);
  new Function('require','module','exports',result.outputText)(requireLocal,mod,mod.exports);
  return mod.exports;
}
const sections=load('components/editor/sections.ts');
const {CvEditorSession}=load('lib/editor/session.ts');
const {richTextDocument}=load('components/editor/richTextDocument.ts');
const clone=v=>JSON.parse(JSON.stringify(v));
const html='Owned <strong>network <em>delivery</em></strong> with <u>care</u> and <a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">evidence</a>.';
const original=()=>({personalInfo:{name:'Example person'},summary:'Full original summary',workExperience:[{id:1,title:'Engineer',company:'Original employer',description:[html,'Second bullet'],descriptionStyles:['plain','bullet']}],education:[{id:2,institution:'University',degree:'Degree',description:'All details'}],additional:{technicalSkills:['TypeScript'],languages:['English']},personalProjects:[{id:3,name:'A project',description:[html],descriptionStyles:['plain']}],customSections:{research:{sectionType:'itemList',items:[{id:4,title:'A study',description:[html],descriptionStyles:['plain'],extra:{id:'nested-1',text:'Keep me'}}]}},extraField:{important:'Keep unknown raw content'}});
const names=resume=>sections.resumeSections(resume).map(s=>s.label);

test('legacy documents keep current navigation defaults, and default metadata sent to PDF does not alter content',()=>{
 const resume=original(),before=clone(resume);
 assert.deepEqual(names(resume).slice(0,6),['Personal Information','Summary','Experience','Education','Skills','Projects']);
 const complete=sections.withSectionMetadata(resume);
 assert.notEqual(complete,resume);assert.equal(complete.sectionMeta.find(s=>s.key==='additional').displayName,'Skills');
 assert.deepEqual(names(complete),names(resume));
 assert.deepEqual(Object.fromEntries(Object.entries(complete).filter(([key])=>key!=='sectionMeta')),before);
 assert.deepEqual(resume,before);assert.equal(sections.withSectionMetadata(complete),complete);
});

test('renaming changes only the display heading and moving never displaces the header',()=>{
 const resume=original();resume.sectionMeta=[{id:'about-id',key:'summary',displayName:'About',order:6,sectionType:'text',isDefault:true,isVisible:false,engineFlag:'keep'},{id:'jobs-id',key:'workExperience',displayName:'Career',order:2,sectionType:'itemList',isDefault:true,isVisible:true},{id:'edu-id',key:'education',displayName:'Learning',order:1,sectionType:'itemList',isDefault:true,isVisible:true}];
 const before=clone(resume);
 assert.deepEqual(names(resume).slice(0,4),['Personal Information','Learning','Career','About']);
 let next=sections.renameSection(resume,'summary',' About Me ');
 assert.equal(next.summary,resume.summary);assert.deepEqual(next.workExperience,resume.workExperience);
 assert.deepEqual(next.sectionMeta.find(s=>s.key==='summary'),{...resume.sectionMeta[0],displayName:'About Me',order:3});
 next=sections.moveSection(next,'workExperience',-1);
 assert.deepEqual(names(next).slice(0,4),['Personal Information','Career','Learning','About Me']);
 assert.equal(sections.moveSection(next,'workExperience',-1),next);
 assert.equal(sections.moveSection(next,'personalInfo',1),next);
 assert.equal(sections.renameSection(next,'personalInfo','Other'),next);
 assert.equal(sections.resumeSections(next).find(s=>s.key==='summary').hidden,true);
 assert.deepEqual(resume,before);
});

test('jobs, education, projects, custom items and bullets duplicate directly below and keep independent IDs and formatting',()=>{
 for(const field of ['workExperience','education','personalProjects']) {
   const list=original()[field],before=clone(list),result=sections.duplicateListItem(list,0);
   assert.equal(result.value.length,2);assert.deepEqual(result.value[0],before[0]);
   const {id,...copy}=result.value[1];const {id:sourceId,...source}=before[0];assert.notEqual(id,sourceId);assert.deepEqual(copy,source);
   result.value[1].title='Copy edit';assert.deepEqual(list,before);assert.deepEqual(result.value[0],before[0]);
 }
 const items=original().customSections.research.items,result=sections.duplicateListItem(items,0);
 assert.notEqual(result.value[1].extra.id,items[0].extra.id);assert.equal(result.value[1].description[0],html);
 result.value[1].description[0]='Independent';assert.equal(items[0].description[0],html);
 const bullets=sections.duplicateListItem([html,'Second'],0,['plain','bullet']);
 assert.deepEqual(bullets.value,[html,html,'Second']);assert.deepEqual(bullets.styles,['plain','plain','bullet']);
 assert.deepEqual(sections.duplicateListItem([html,'Second'],1,['plain']).styles,['plain','bullet','bullet']);
 const ids=Array.from({length:30},()=>sections.entryTemplate('workExperience').id);assert.equal(new Set(ids).size,30);
});

test('each custom type has the engine shape; a whole copy follows the source and preserves metadata on other sections',()=>{
 let resume=sections.withSectionMetadata(original());resume.sectionMeta.find(s=>s.key==='research').displayName='Research';
 for(const [type,shape] of [['text',{text:''}],['itemList',{items:[]}],['stringList',{strings:[]}]]) {
  const added=sections.addCustomSection(resume,'Named '+type,type);
  assert.deepEqual(added.resume.customSections[added.key.split('.')[1]],{sectionType:type,...shape});
  const row=sections.resumeSections(added.resume).find(s=>s.key===added.key);assert.equal(row.label,'Named '+type);assert.equal(row.sectionType,type);
  resume=added.resume;
 }
 const before=clone(resume),copy=sections.duplicateCustomSection(resume,'customSections.research');
 const ordered=sections.resumeSections(copy.resume);const index=ordered.findIndex(s=>s.key==='customSections.research');
 assert.equal(ordered[index+1].key,copy.key);assert.equal(ordered[index+1].label,'Research (copy)');
 assert.equal(ordered[index+1].value.items[0].description[0],html);assert.notEqual(ordered[index+1].value.items[0].id,resume.customSections.research.items[0].id);
 ordered[index+1].value.items[0].description[0]='Changed copy';assert.deepEqual(resume,before);
 assert.equal(sections.duplicateCustomSection(resume,'summary'),null);
});

test('renames, order, entry and bullet copies, rich marks/links, and all custom types survive serialized save and a new editor session',async()=>{
 let remote={tailoring_id:'saved-cv',revision:4,updated_at:'now',resume:original(),confirmed_skills:[],job:{title:'Engineer',company:null,description:'Job'},analysis:null},stored=null,counter=0;
 const mutations=[];
 const deps={read:async()=>stored,write:async value=>{stored=value;},uuid:()=>`mutation-${++counter}`,parseDocument:v=>v,load:async()=>clone(remote),save:async body=>{assert.equal(body.expected_revision,remote.revision);mutations.push(clone(body));remote={...remote,revision:remote.revision+1,resume:clone(body.resume)};return clone(remote);},analyze:async()=>null,onState:()=>{}};
 const session=new CvEditorSession(deps);await session.restore();
 let resume=sections.renameSection(session.snapshot.resume,'summary','About Me');resume=sections.moveSection(resume,'workExperience',-1);
 const roles=sections.duplicateListItem(resume.workExperience,0).value;roles[1].company='New employer for copy only';roles[1].description=sections.duplicateListItem(roles[1].description,0,roles[1].descriptionStyles).value;roles[1].description[1]=html+' Copy detail.';resume={...resume,workExperience:roles};
 for(const type of ['text','itemList','stringList']) {
  const added=sections.addCustomSection(resume,'Extra '+type,type);resume=added.resume;
  resume=sections.replaceSection(resume,added.key,type==='text'?{sectionType:type,text:'Complete paragraph & details'}:type==='itemList'?{sectionType:type,items:[{id:100,title:'Entry',description:[html]}]}:{sectionType:type,strings:['Skill A','Skill B']});
 }
 session.update(resume);const saved=await session.flush();assert.equal(saved.revision,5);assert.equal(mutations.length,1);session.dispose();
 const reopened=new CvEditorSession(deps);await reopened.restore();
 assert.deepEqual(reopened.snapshot.resume,resume);assert.deepEqual(names(reopened.snapshot.resume).slice(0,3),['Personal Information','Experience','About Me']);
 assert.equal(reopened.snapshot.resume.workExperience[0].company,'Original employer');assert.equal(reopened.snapshot.resume.workExperience[1].company,'New employer for copy only');assert.equal(reopened.snapshot.resume.workExperience[1].description[0],html);
 assert.deepEqual(reopened.snapshot.resume.customSections.custom_2.items[0].description,[html]);reopened.dispose();
});

test('the shared rich editing document safely embeds saved text and has syntactically valid editing/selection code',()=>{
 const payload='</script><script>globalThis.unexpected=true</script>'+html;
 const document=richTextDocument(payload,'Bullet "one"',{colors:{card:'white',foreground:'black',input:'gray',primary:'blue',border:'gray',muted:'white',primaryForeground:'white',mutedForeground:'gray',background:'white',destructive:'red'},typography:{},name:'test'});
 const scripts=[...document.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);assert.doesNotThrow(()=>new Function(scripts[0][1]));assert.ok(!document.includes(payload));
 assert.match(document,/Display Text/);assert.match(document,/URL/);assert.match(document,/contenteditable="true"/);
});

test('delete removes every matching custom metadata record, preserves other sections, and cannot delete built-ins',()=>{
 let resume=sections.withSectionMetadata(original());
 resume.sectionMeta.push({id:'legacy-meta',key:'customSections.research',displayName:'Legacy research',order:99}, {id:'external',key:'other',displayName:'Keep metadata',order:100,engineField:true});
 const before=clone(resume),deleted=sections.deleteCustomSection(resume,'customSections.research');
 assert.equal(deleted.customSections.research,undefined);
 assert.ok(deleted.sectionMeta.every(meta=>!['research','customSections.research'].includes(meta.key)));
 assert.deepEqual(deleted.workExperience,before.workExperience);assert.equal(deleted.summary,before.summary);
 assert.deepEqual(deleted.sectionMeta.find(meta=>meta.id==='external'),before.sectionMeta.at(-1));
 assert.deepEqual(resume,before);
 assert.equal(sections.deleteCustomSection(resume,'summary'),resume);
 assert.equal(sections.deleteCustomSection(resume,'customSections.missing'),resume);
 assert.deepEqual(sections.resumeSections(deleted).filter(s=>s.custom),[]);
});

test('new and duplicated text, item and skill sections can all be deleted without deleting the source or formatting',()=>{
 for(const type of ['text','itemList','stringList']) {
  const added=sections.addCustomSection(original(),'New '+type,type);
  const copy=sections.duplicateCustomSection(added.resume,added.key);
  let removed=sections.deleteCustomSection(copy.resume,copy.key);
  assert.ok(sections.resumeSections(removed).some(s=>s.key===added.key));
  assert.ok(!sections.resumeSections(removed).some(s=>s.key===copy.key));
  removed=sections.deleteCustomSection(removed,added.key);
  assert.deepEqual(removed.customSections,original().customSections);
  assert.equal(removed.workExperience[0].description[0],html);
  assert.ok(!removed.sectionMeta.some(meta=>meta.key===added.key.split('.')[1]||meta.key===copy.key.split('.')[1]));
 }
});

test('a deletion during an older save survives both acknowledgements and reopening, and is the next PDF revision',async()=>{
 let remote={tailoring_id:'saved-cv',revision:4,updated_at:'now',resume:sections.withSectionMetadata(original()),confirmed_skills:[],job:{title:'Engineer',company:null,description:'Job'},analysis:null},stored=null,counter=0,release;
 const requests=[];
 const deps={read:async()=>stored,write:async value=>{stored=value;},uuid:()=>`mutation-${++counter}`,parseDocument:v=>v,load:async()=>clone(remote),save:async body=>{requests.push(clone(body));if(requests.length===1)await new Promise(resolve=>{release=resolve;});assert.equal(body.expected_revision,remote.revision);remote={...remote,revision:remote.revision+1,resume:clone(body.resume)};return clone(remote);},analyze:async()=>null,onState:()=>{}};
 const session=new CvEditorSession(deps);await session.restore();
 session.update(sections.renameSection(session.snapshot.resume,'customSections.research','Volunteering'));
 const oldSave=session.flush();while(!release)await new Promise(resolve=>setImmediate(resolve));
 const deleted=sections.deleteCustomSection(session.snapshot.resume,'customSections.research');session.update(deleted);
 const exportSave=session.flush();release();await oldSave;const forPdf=await exportSave;
 assert.equal(forPdf.revision,6);assert.equal(requests.length,2);
 assert.ok(requests[0].resume.customSections.research);assert.equal(requests[1].resume.customSections.research,undefined);
 assert.ok(!requests[1].resume.sectionMeta.some(meta=>meta.key==='research'));
 assert.equal(session.snapshot.resume.customSections.research,undefined);session.dispose();
 const reopened=new CvEditorSession(deps);await reopened.restore();
 assert.equal(reopened.snapshot.resume.customSections.research,undefined);assert.deepEqual(reopened.snapshot.resume,deleted);
 assert.ok(!sections.resumeSections(reopened.snapshot.resume).some(s=>s.label==='Volunteering'));reopened.dispose();
});

test('an ambiguous delete retains the exact deletion mutation for safe retry and never restores the section locally',async()=>{
 let remote={tailoring_id:'saved-cv',revision:4,updated_at:'now',resume:sections.withSectionMetadata(original()),confirmed_skills:[],job:{title:'Engineer',company:null,description:'Job'},analysis:null},stored=null,counter=0,fail=true;
 const requests=[];
 const deps={read:async()=>stored,write:async value=>{stored=value;},uuid:()=>`mutation-${++counter}`,parseDocument:v=>v,load:async()=>clone(remote),save:async body=>{requests.push(clone(body));if(fail)throw Error('Connection lost');remote={...remote,revision:remote.revision+1,resume:clone(body.resume)};return clone(remote);},analyze:async()=>null,onState:()=>{}};
 const session=new CvEditorSession(deps);await session.restore();session.update(sections.deleteCustomSection(session.snapshot.resume,'customSections.research'));
 assert.equal(await session.flush(),null);assert.equal(session.snapshot.resume.customSections.research,undefined);
 assert.equal(JSON.parse(stored).resume.customSections.research,undefined);assert.equal(JSON.parse(stored).pending.resume.customSections.research,undefined);
 fail=false;await session.flush();assert.deepEqual(requests[1],requests[0]);assert.equal(remote.resume.customSections.research,undefined);session.dispose();
});
