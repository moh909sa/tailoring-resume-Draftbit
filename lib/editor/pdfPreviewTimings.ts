/* global __DEV__ */
type Stage="formatTap"|"debounceEnd"|"saveStart"|"saveEnd"|"pdfFetchStart"|"pdfFetchEnd"|"viewerReady";
// Debug output contains durations only: no document IDs, content, URLs or revisions.
// WKWebView/iframe load is a readiness proxy, NOT a first-page-paint measurement.
export class PdfPreviewTimings {
  readonly firstTap:number;
  private tapTime:number;
  private values:Partial<Record<Stage,number>>={};
  private active=true;
  // eslint-disable-next-line no-console -- Debug-only timing measurements, never document data.
  constructor(firstTap?:number,private enabled=typeof __DEV__!=="undefined"&&__DEV__,private now=()=>performance.now(),private log:(values:Record<string,number>)=>void=values=>console.debug("PDF preview timings (ms)",values)){
    this.tapTime=this.enabled?this.now():0;this.firstTap=firstTap??this.tapTime;this.mark("formatTap");
  }
  mark(stage:Stage){
    if(!this.active||!this.enabled)return;
    const time=this.now();this.values[stage]=time;
    const elapsed=(a:number,b:number)=>Math.round((a-b)*10)/10;
    const values:Record<string,number>={[stage]:elapsed(time,this.tapTime)};
    if(stage==="viewerReady"){
      values.endToEnd=elapsed(time,this.tapTime);values.burstEndToEnd=elapsed(time,this.firstTap);
      const v=this.values;
      if(v.debounceEnd!==undefined)values.debounce=elapsed(v.debounceEnd,this.tapTime);
      if(v.saveStart!==undefined&&v.debounceEnd!==undefined)values.writerWait=elapsed(v.saveStart,v.debounceEnd);
      if(v.saveEnd!==undefined&&v.saveStart!==undefined)values.save=elapsed(v.saveEnd,v.saveStart);
      if(v.pdfFetchEnd!==undefined&&v.pdfFetchStart!==undefined)values.pdfFetch=elapsed(v.pdfFetchEnd,v.pdfFetchStart);
      if(v.pdfFetchEnd!==undefined)values.viewer=elapsed(time,v.pdfFetchEnd);
      this.active=false;
    }
    this.log(values);
  }
  get burstStart(){return this.active?this.firstTap:undefined;}
  cancel(){this.active=false;}
}
