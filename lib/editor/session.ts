import type { EditorLayout } from "./layout";
import type { EditorAnalysis, EditorDocument, EditorSave, JsonObject } from "./types";

export type SaveState = "saved" | "saving" | "local" | "error" | "conflict";
export type EditorWorkspace = {
  tool: "content" | "templates" | "format" | "match";
  trayOpen: boolean;
  sectionKey: string | null;
  fieldPath: (string | number)[] | null;
  fieldLabel: string | null;
  documentOffset: number;
  documentZoom: number;
  documentPanX: number;
  panelHeight: number;
  matchSection: "overview" | "highlights";
};
export const emptyWorkspace = (): EditorWorkspace => ({tool:"content",trayOpen:true,sectionKey:null,fieldPath:null,fieldLabel:null,documentOffset:0,documentZoom:1,documentPanX:0,panelHeight:190,matchSection:"overview"});
export type EditorState = {
  document: EditorDocument | null;
  resume: JsonObject | null;
  layout: EditorLayout | null;
  layoutDraft: EditorLayout | null;
  layoutDraftDirty: boolean;
  workspace: EditorWorkspace;
  confirmedSkills: string[];
  loading: boolean;
  error: string | null;
  accessStatus: number | null;
  saveState: SaveState;
  problem: string | null;
  analysis: EditorAnalysis | null;
  analysisLoading: boolean;
};
export const emptyEditorState = (): EditorState => ({document: null, resume: null, layout: null, layoutDraft: null, layoutDraftDirty: false, workspace: emptyWorkspace(), confirmedSkills: [], loading: true, error: null, accessStatus: null, saveState: "saved", problem: null, analysis: null, analysisLoading: false});
type Backup = {version: 1; document: EditorDocument; resume: JsonObject; layout?: EditorLayout | null; confirmedSkills: string[]; pending: EditorSave | null; dirty: boolean; layoutDraft?: EditorLayout | null; layoutDraftDirty?: boolean; workspace?: EditorWorkspace};
type Dependencies = {
  read: () => Promise<string | null>;
  write: (raw: string) => Promise<unknown>;
  uuid: () => string;
  parseDocument: (value: unknown) => EditorDocument;
  load: (signal: AbortSignal) => Promise<EditorDocument>;
  save: (body: EditorSave, signal: AbortSignal) => Promise<EditorDocument>;
  analyze: (revision: number, signal: AbortSignal) => Promise<EditorAnalysis>;
  onState: (value: EditorState) => void;
};
export const editorStorageKey = (ownerId: string, id: string) => "cv-editor-v1:" + ownerId + ":" + id;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Couldn’t sync your edits. Please try again.";
const statusOf = (e: unknown) => typeof e === "object" && e !== null && "status" in e ? e.status : null;

// One serialized writer per open document. A persisted mutation is replayed with
// its original UUID, while edits made during the request remain a separate draft.
export class CvEditorSession {
  private state = emptyEditorState();
  private dirty = false;
  private pending: EditorSave | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private saving: Promise<EditorDocument | null> | null = null;
  private reading: AbortController | null = null;
  private analyzing: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private workspaceTimer: ReturnType<typeof setTimeout> | null = null;
  private firstEdit: number | null = null;
  private initialized = false;
  private disposed = false;
  private active = true;
  private refreshing = false;
  private refreshTask: Promise<void> | null = null;
  private exporting: Promise<EditorDocument | null> | null = null;
  private retries = 0;
  constructor(private readonly deps: Dependencies) {}
  get snapshot() { return this.state; }
  private change(patch: Partial<EditorState>) {
    this.state = {...this.state, ...patch};
    if (!this.disposed) this.deps.onState(this.state);
  }
  private async persist() {
    const {document, resume, layout, layoutDraft, layoutDraftDirty, workspace, confirmedSkills} = this.state;
    if (!document || !resume) return;
    const raw = JSON.stringify({version: 1, document, resume, layout, layoutDraft, layoutDraftDirty, workspace, confirmedSkills, pending: this.pending, dirty: this.dirty} satisfies Backup);
    const write = this.writes.catch(() => undefined).then(() => this.deps.write(raw));
    this.writes = write;
    await write;
  }
  private stopTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private schedule(delay?: number) {
    this.stopTimer();
    if (!this.active || this.disposed || !this.dirty || this.state.error || this.state.saveState === "conflict") return;
    const wait = delay ?? Math.max(500, Math.min(1800, 10000 - (Date.now() - (this.firstEdit ?? Date.now()))));
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, wait);
  }
  private accept(doc: EditorDocument, keepDraft: boolean) {
    const analysis = keepDraft && doc.analysis ? {...doc.analysis, status: doc.analysis.score ? "stale" as const : "unavailable" as const} : doc.analysis;
    const keepLayoutDraft=this.state.layoutDraftDirty && !same(this.state.layoutDraft,doc.layout ?? null);
    this.change({...(keepLayoutDraft ? {} : {layoutDraft:doc.layout ?? null,layoutDraftDirty:false}), document: doc, ...(keepDraft ? {} : {resume: doc.resume, confirmedSkills: doc.confirmed_skills}), ...(!keepDraft || this.state.layout === null ? {layout:doc.layout ?? null} : {}), analysis, loading: false, error: null, accessStatus: null});
  }
  async restore() {
    try {
      const raw = await this.deps.read();
      if (this.disposed) return;
      if (raw) {
        const data = JSON.parse(raw) as Backup;
        const doc = this.deps.parseDocument(data.document);
        const candidate = this.deps.parseDocument({...doc, resume: data.resume, confirmed_skills: data.confirmedSkills, layout:data.layout ?? doc.layout});
        if (data.version === 1) {
          const dirty = data.dirty === true;
          const p = data.pending;
          const pending = p && typeof p.mutation_id === "string" && Number.isSafeInteger(p.expected_revision) && same(p.resume, this.deps.parseDocument({...doc, resume:p.resume, confirmed_skills:p.confirmed_skills, layout:p.layout ?? doc.layout}).resume) ? p : null;
          this.dirty = dirty;
          this.pending = pending;
          // Trial layouts never enter the serialized content writer until PDF is explicit.
          if (data.layoutDraft && data.layoutDraftDirty === true) {
            try {
              const trial = this.deps.parseDocument({...doc,layout:data.layoutDraft}).layout;
              if (trial) this.change({layoutDraft:trial,layoutDraftDirty:!same(trial,doc.layout ?? null)});
            } catch { /* A damaged layout trial must not discard content recovery. */ }
          }
          const w = data.workspace;
          if (w && ["content","templates","format","match"].includes(w.tool)) this.change({workspace:{
            ...emptyWorkspace(),tool:w.tool,trayOpen:w.trayOpen === true,
            sectionKey:typeof w.sectionKey === "string" ? w.sectionKey : null,
            fieldPath:Array.isArray(w.fieldPath) && w.fieldPath.every(k=>typeof k === "string" || Number.isSafeInteger(k)) ? w.fieldPath : null,
            fieldLabel:typeof w.fieldLabel === "string" ? w.fieldLabel : null,
            documentOffset:typeof w.documentOffset === "number" && Number.isFinite(w.documentOffset) ? Math.max(0,w.documentOffset) : 0,
            documentZoom:typeof w.documentZoom === "number" && Number.isFinite(w.documentZoom) ? Math.max(1,Math.min(4,w.documentZoom)) : 1,
            documentPanX:typeof w.documentPanX === "number" && Number.isFinite(w.documentPanX) ? Math.max(0,w.documentPanX) : 0,
            panelHeight:typeof w.panelHeight === "number" && Number.isFinite(w.panelHeight) ? Math.max(0,w.panelHeight) : 190,
            matchSection:w.matchSection === "highlights" ? "highlights" : "overview",
          }});
          this.accept(doc, false);
          this.change({resume: candidate.resume, layout:candidate.layout ?? null, confirmedSkills: candidate.confirmed_skills, saveState: this.dirty ? "local" : "saved", analysis:this.dirty && doc.analysis ? {...doc.analysis,status:doc.analysis.score ? "stale":"unavailable"} : doc.analysis});
        }
      }
    } catch {
      // A damaged cache must never become a replacement server document.
      this.dirty = false;
      this.pending = null;
    }
    this.initialized = true;
    if (!this.disposed) await this.refresh();
  }
  refresh(): Promise<void> {
    if (this.refreshTask) return this.refreshTask;
    if (this.exporting) return Promise.resolve();
    const task = this.readLatest();
    this.refreshTask = task;
    void task.then(() => { if (this.refreshTask === task) this.refreshTask = null; }, () => { if (this.refreshTask === task) this.refreshTask = null; });
    return task;
  }
  private async readLatest() {
    if (!this.initialized || this.disposed || !this.active || this.refreshing || this.saving) return;
    this.refreshing = true;
    const controller = new AbortController();
    this.reading = controller;
    try {
      const latest = await this.deps.load(controller.signal);
      if (this.disposed || controller.signal.aborted) return;
      const oldRevision = this.state.document?.revision;
      if (this.dirty && same(latest.resume, this.state.resume) && same(latest.confirmed_skills, this.state.confirmedSkills) && (this.state.layout === null || same(latest.layout ?? null,this.state.layout))) {
        this.dirty = false; this.pending = null;
        this.accept(latest, false);
        this.change({saveState: "saved", problem: null});
      } else if (this.dirty && oldRevision !== latest.revision && !this.pending) {
        this.accept(latest, true);
        this.change({saveState: "conflict", problem: "A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
      } else {
        this.accept(latest, this.dirty);
        if (!this.dirty) this.change({saveState: "saved", problem: null});
      }
      await this.persist();
    } catch (e) {
      if (this.disposed || controller.signal.aborted) return;
      const status = statusOf(e);
      if (status === 401 || status === 403 || status === 404) {
        this.stopTimer();
        this.change({loading:false, accessStatus:status, error:errorMessage(e) + (this.dirty ? " Your unsynced edits are still kept on this device." : ""), problem:null, saveState:this.dirty ? "local":"error"});
      } else this.change({loading:false, error:this.state.document ? null : errorMessage(e), ...(this.state.document ? {problem:"You’re offline or the service is unavailable. Your saved device copy is open.", saveState:this.dirty ? "local" : this.state.saveState} : {})});
    } finally {
      this.refreshing = false;
      if (this.reading === controller) this.reading = null;
    }
    if (this.dirty && this.state.saveState !== "conflict") this.schedule();
  }
  updateLayoutDraft(layout: EditorLayout) {
    if (!this.state.document || this.disposed || same(layout,this.state.layoutDraft)) return;
    this.change({layoutDraft:layout,layoutDraftDirty:!same(layout,this.state.document.layout ?? null)});
    void this.persist().catch(()=>this.change({problem:"Your layout could not be kept on this device. Keep this screen open and try PDF again."}));
  }
  updateWorkspace(patch: Partial<EditorWorkspace>) {
    if (this.disposed) return;
    this.change({workspace:{...this.state.workspace,...patch}});
    if (this.workspaceTimer) clearTimeout(this.workspaceTimer);
    this.workspaceTimer=setTimeout(()=>{this.workspaceTimer=null;void this.persist().catch(()=>undefined);},250);
  }
  saveForPdf(): Promise<EditorDocument | null> {
    if (this.exporting) return this.exporting;
    // Capture the choice at the tap, before an in-flight read or receipt completes.
    const selected = this.state.layoutDraft;
    const task = this.preparePdf(selected);
    this.exporting = task;
    void task.then(() => { if (this.exporting === task) this.exporting = null; }, () => { if (this.exporting === task) this.exporting = null; });
    return task;
  }
  private async preparePdf(selected: EditorLayout | null): Promise<EditorDocument | null> {
    if (this.refreshTask) await this.refreshTask;
    // First reconcile any content/receipt. An unrelated autosave always uses layout,
    // while the canvas uses layoutDraft. Only this explicit action bridges them.
    const content = await this.flush();
    if (!content || this.disposed) return null;
    if (selected && !same(selected,content.layout ?? null)) this.update(this.state.resume!,this.state.confirmedSkills,selected);
    const saved=await this.flush();
    if (saved && same(this.state.layoutDraft,selected)) {
      this.change({layoutDraft:saved.layout ?? null,layoutDraftDirty:false});
      await this.persist();
    }
    return saved;
  }
  update(resume: JsonObject, skills = this.state.confirmedSkills, layout = this.state.layout) {
    if (!this.state.document || this.disposed || (same(resume, this.state.resume) && same(skills,this.state.confirmedSkills) && same(layout,this.state.layout))) return;
    this.dirty = true;
    this.firstEdit ??= Date.now();
    this.retries = 0;
    this.analyzing?.abort();
    this.change({resume,layout,confirmedSkills:skills, saveState:this.state.saveState === "conflict" ? "conflict" : "saving", problem:this.state.saveState === "conflict" ? this.state.problem : null, analysisLoading:false, analysis:this.state.analysis ? {...this.state.analysis,status:this.state.analysis.score ? "stale":"unavailable"} : null});
    void this.persist().catch(() => this.change({saveState:"error",problem:"Device storage is unavailable. Keep this screen open and try saving again."}));
    this.schedule();
  }
  async flush(): Promise<EditorDocument | null> {
    this.stopTimer();
    if (this.refreshTask) await this.refreshTask;
    if (this.state.error || this.disposed) return null;
    if (this.saving) { await this.saving; return this.dirty && this.state.saveState === "saving" ? this.flush() : this.state.saveState === "saved" ? this.state.document : null; }
    if (!this.dirty) return this.state.document;
    if (!this.state.document || !this.state.resume || this.disposed || this.refreshing || this.state.saveState === "conflict") return null;
    const run = this.savePending();
    this.saving = run;
    let result: EditorDocument | null;
    try { result = await run; }
    finally { this.saving = null; }
    return !result && this.dirty && this.state.saveState === "saving" && !this.disposed ? this.flush() : result;
  }
  private async savePending(): Promise<EditorDocument | null> {
    const document = this.state.document!;
    const payload = this.pending ?? {expected_revision: document.revision,mutation_id:this.deps.uuid(),resume:this.state.resume!,confirmed_skills:this.state.confirmedSkills,...(this.state.layout ? {layout:this.state.layout} : {})};
    this.pending = payload;
    this.firstEdit = Date.now();
    this.change({saveState:"saving",problem:null});
    try {
      await this.persist();
      const saved = await this.deps.save(payload, new AbortController().signal);
      if (saved.revision < document.revision) {
        this.pending = null;
        this.change({saveState:"conflict",problem:"A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
        await this.persist();
        return null;
      }
      const stillSame = same(this.state.resume,payload.resume) && same(this.state.confirmedSkills,payload.confirmed_skills) && same(this.state.layout,payload.layout ?? null);
      this.pending = null;
      this.dirty = !stillSame;
      this.accept(saved,!stillSame);
      this.retries = 0;
      this.change({saveState:stillSame ? "saved":"saving",problem:null});
      if (stillSame) this.firstEdit = null;
      await this.persist();
      return stillSame ? saved : null;
    } catch (e) {
      const status = statusOf(e);
      if (status === 401 || status === 403 || status === 404) {
        this.change({accessStatus:status, error:errorMessage(e) + " Your unsynced edits are still kept on this device.", saveState:"local",problem:null});
      } else if (status === 409) {
        this.pending = null;
        this.change({saveState:"conflict",problem:"A newer version was saved elsewhere. Your edits are safe here. Choose which version to keep."});
      } else if (statusOf(e) === 422 || statusOf(e) === 413) {
        this.pending = null;
        this.change({saveState:"error",problem:errorMessage(e)});
      } else {
        this.change({saveState:"local",problem:"Your edits are kept on this device. We couldn’t sync them yet. Try again when connected."});
        if (this.retries++ < 2) this.schedule(Math.min(30000,5000 * this.retries));
      }
      await this.persist().catch(() => this.change({saveState:"error",problem:"Couldn’t save to this device or the server. Keep this screen open and try again."}));
      return null;
    }
  }
  async resolveConflict(mode: "local" | "server") {
    if (this.saving || this.disposed) return;
    const controller = new AbortController();
    try {
      const latest = await this.deps.load(controller.signal);
      if (this.disposed) return;
      this.pending = null;
      this.dirty = mode === "local";
      this.accept(latest, mode === "local");
      this.change({saveState:mode === "local" ? "saving":"saved",problem:null});
      await this.persist();
      if (mode === "local") await this.flush();
    } catch (e) { this.change({problem:errorMessage(e)}); }
  }
  async refreshAnalysis() {
    if (this.analyzing || this.disposed) return;
    let doc = await this.flush();
    if (!doc && this.dirty && this.state.saveState === "saving") doc = await this.flush();
    if (!doc || this.disposed || this.dirty) return;
    const controller = new AbortController();
    this.analyzing = controller;
    this.change({analysisLoading:true,problem:null});
    try {
      const analysis = await this.deps.analyze(doc.revision,controller.signal);
      if (this.disposed || controller.signal.aborted) return;
      const current = this.state.document;
      if (current && !this.dirty && current.revision === analysis.revision) {
        this.change({analysis,document:{...current,analysis}});
        await this.persist();
      }
    } catch (e) { if (!controller.signal.aborted && !this.disposed) this.change({problem:errorMessage(e)}); }
    finally { if (this.analyzing === controller) { this.analyzing = null; this.change({analysisLoading:false}); } }
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) {this.stopTimer();this.reading?.abort();void this.persist().catch(() => undefined);}
    else if (this.initialized) void this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.stopTimer();if(this.workspaceTimer)clearTimeout(this.workspaceTimer);this.reading?.abort();this.analyzing?.abort();
    // Transport cancellation cannot roll back a server save. Keep the mutation
    // receipt and device backup so the next session can safely reconcile it.
    void this.persist().catch(() => undefined);
  }
}
