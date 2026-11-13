// Self-contained code shared by the sandboxed web frame and WKWebView.
// Data enters only via updateResume; pagination and gestures never call an API.
export const liveCanvasScript = String.raw`(function(){
  var scroller=document.getElementById('scroller'),frame=document.getElementById('frame'),pages=document.getElementById('pages'),source=document.getElementById('source'),controls=document.getElementById('controls'),fit=document.getElementById('fit'),counter=document.getElementById('page-count');
  var current=null,lastMarkup=null,restored=false,scale=1,fitScale=1,originX=12,zoom=1,viewX=0,viewY=0,pageCount=1,gap=24,gesture=null,scrollTimer=null,suppressClickUntil=0,updating=false,controlItems=[],controlsDirty=true;
  function send(message){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else parent.postMessage({cvDocument:message},'*');}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function visible(){return scroller.clientWidth>0&&scroller.clientHeight>0;}
  function remember(){if(!visible()||updating)return;viewX=scroller.scrollLeft;viewY=scroller.scrollTop;}
  function report(){clearTimeout(scrollTimer);scrollTimer=null;remember();send({type:'viewport',zoom:zoom,x:viewX,y:viewY});}
  function pageCounter(){if(!current)return;var page=clamp(Math.floor(((scroller.scrollTop+scroller.clientHeight/2-16)/scale)/(current.paperHeight+gap))+1,1,pageCount);counter.textContent=pageCount>1?page+' / '+pageCount:'';counter.style.display=pageCount>1?'block':'none';}
  function makeControls(){
    if(controlsDirty){
      controls.replaceChildren();controlItems=[];
      if(current&&current.editable){
        var originals=Array.from(source.querySelectorAll('[data-section]'));
        Array.from(pages.querySelectorAll('.paper')).forEach(function(paper,index){
          var rect=paper.getBoundingClientRect(),items=[];
          Array.from(paper.querySelectorAll('[data-section]')).forEach(function(section){
            var original=originals.find(function(item){return item.getAttribute('data-section')===section.getAttribute('data-section');}),button=original?original.querySelector('button[data-key]'):null;
            if(!button)return;
            var copy=button.cloneNode(true),entry=section.querySelector('[data-field-path]');if(entry){copy.setAttribute('data-path',entry.getAttribute('data-field-path'));var title=entry.querySelector('.entry-heading strong');if(title){var label=button.getAttribute('data-label')+' — '+title.textContent;copy.setAttribute('data-label',label);copy.setAttribute('aria-label','Edit '+label);}}controls.appendChild(copy);items.push({node:copy,naturalY:(section.getBoundingClientRect().top-rect.top)/scale});
          });controlItems.push({page:index,items:items});
        });
      }
      controlsDirty=false;
    }
    // Zoom moves existing gutter controls; no cloning/layout measurement per frame.
    controlItems.forEach(function(group){
      var pageTop=16+group.page*(current.paperHeight+gap)*scale,previous=pageTop-44;
      group.items.forEach(function(item){item.y=Math.max(pageTop+item.naturalY*scale,previous+44);previous=item.y;});
      var bottom=pageTop+current.paperHeight*scale-44;
      for(var k=group.items.length-1;k>=0;k--){group.items[k].y=Math.min(group.items[k].y,bottom);bottom=group.items[k].y-44;}
      group.items.forEach(function(item){item.node.style.left=(originX+current.paperWidth*scale)+'px';item.node.style.top=Math.max(pageTop,item.y)+'px';});
    });
  }
  function resize(){
    if(!current||!visible())return;
    updating=true;
    fitScale=Math.max(.05,Math.min(1,(scroller.clientWidth-56)/current.paperWidth));scale=fitScale*zoom;
    var canvasWidth=current.paperWidth*scale,canvasHeight=(pageCount*current.paperHeight+(pageCount-1)*gap)*scale;
    var width=Math.max(scroller.clientWidth,canvasWidth+56);originX=12+(width-56-canvasWidth)/2;
    frame.style.width=width+'px';frame.style.height=(canvasHeight+32)+'px';
    pages.style.left=originX+'px';pages.style.width=current.paperWidth+'px';pages.style.transform='scale('+scale+')';
    fit.style.display=zoom>1.005?'flex':'none';scroller.style.touchAction=zoom>1?'none':'pan-x pan-y';
    scroller.scrollLeft=viewX;scroller.scrollTop=viewY;
    makeControls();pageCounter();updating=false;
  }
  function zoomAround(next,x,y,anchor){
    if(!current||!visible())return;
    next=clamp(next,1,4);
    var ax=anchor?anchor.x:(scroller.scrollLeft+x-originX)/scale,ay=anchor?anchor.y:(scroller.scrollTop+y-16)/scale;
    zoom=next;resize();
    viewX=Math.max(0,originX+ax*scale-x);viewY=Math.max(0,16+ay*scale-y);
    scroller.scrollLeft=viewX;scroller.scrollTop=viewY;remember();pageCounter();
  }
  function paginate(){
    source.innerHTML=current.markup;
    var original=source.firstElementChild;if(!original)return;
    source.style.width=current.paperWidth+'px';pages.replaceChildren();
    var article=null,clones=null;
    function newPage(){
      var page=document.createElement('div');page.className='paper';page.style.width=current.paperWidth+'px';page.style.height=current.paperHeight+'px';page.style.marginBottom=gap+'px';
      article=original.cloneNode(false);article.removeAttribute('id');page.appendChild(article);pages.appendChild(page);clones=new Map();clones.set(original,article);
    }
    function hasContent(){return !!article.textContent.trim();}
    function fits(){return article.offsetHeight<=current.paperHeight+.5;}
    function parentFor(path){var parent=article;path.forEach(function(node){var copy=clones.get(node);if(!copy||!copy.parentNode){copy=node.cloneNode(false);copy.removeAttribute('id');parent.appendChild(copy);clones.set(node,copy);}parent=copy;});return parent;}
    function remove(node){var parent=node.parentNode;node.remove();while(parent&&parent!==article&&!parent.childNodes.length){var next=parent.parentNode;parent.remove();parent=next;}}
    function append(node,path){var copy=node.cloneNode(true);parentFor(path).appendChild(copy);return copy;}
    function textPoint(node,offset){var walker=document.createTreeWalker(node,4),text,last=null,remaining=offset;while((text=walker.nextNode())){last=text;if(remaining<=text.nodeValue.length)return {node:text,offset:remaining};remaining-=text.nodeValue.length;}return last?{node:last,offset:last.nodeValue.length}:null;}
    function slice(node,start,end){
      // Trim a full clone instead of cloning a nested Range: a Range whose
      // endpoints share one strong/link text node would otherwise lose that mark.
      var copy=node.cloneNode(true),point;
      if(end<copy.textContent.length){point=textPoint(copy,end);var tail=document.createRange();tail.setStart(point.node,point.offset);tail.setEnd(copy,copy.childNodes.length);tail.deleteContents();}
      if(start>0){point=textPoint(copy,start);var head=document.createRange();head.setStart(copy,0);head.setEnd(point.node,point.offset);head.deleteContents();}
      return copy;
    }
    function splitText(node,path){
      var text=node.textContent,start=0;
      while(start<text.length){
        var low=1,high=text.length-start,best=0;
        while(low<=high){var middle=Math.floor((low+high)/2),probe=slice(node,start,start+middle);parentFor(path).appendChild(probe);var ok=fits();remove(probe);if(ok){best=middle;low=middle+1;}else high=middle-1;}
        if(!best&&hasContent()){newPage();continue;}
        best=Math.max(1,best);
        // Do not bisect a surrogate pair, and prefer a word boundary when one fits.
        if(start+best<text.length&&best>1){var code=text.charCodeAt(start+best);if(code>=0xdc00&&code<=0xdfff)best--;var prefix=text.slice(start,start+best),boundary=Math.max(prefix.lastIndexOf(' '),prefix.lastIndexOf('\n'));if(boundary>best*.65)best=boundary+1;}
        var fragment=slice(node,start,start+best);parentFor(path).appendChild(fragment);start+=best;
        if(start<text.length)newPage();
      }
    }
    function leadingHeight(node){
      if(!node||node.nodeType!==1)return 0;
      var line=parseFloat(getComputedStyle(node).lineHeight)||19;
      if(node.classList.contains('entry')){var head=node.querySelector('.entry-heading'),bullet=node.querySelector('.bullet');return (head?head.offsetHeight:line)+(bullet?Math.min(bullet.offsetHeight+(bullet.classList.contains('keep-next')&&bullet.nextElementSibling?bullet.nextElementSibling.offsetHeight:0),current.paperHeight-200):line);}
      if(node.classList.contains('bullets')){var first=node.firstElementChild;var height=first?first.offsetHeight+(first.classList.contains('keep-next')&&first.nextElementSibling?first.nextElementSibling.offsetHeight:0):line;return height<current.paperHeight-200?height:line*2;}
      return node.classList.contains('paragraph')&&node.offsetHeight>line*4?line*2:Math.min(node.offsetHeight,current.paperHeight-200);
    }
    function place(node,path){
      if(node.nodeType===3){if(!node.textContent.length)return;var span=document.createElement('span');span.textContent=node.textContent;node=span;}
      if(node.nodeType!==1||node.classList.contains('pencil'))return;
      var whole=append(node,path);if(fits())return;remove(whole);
      if(node.classList.contains('entry')&&node.getAttribute('data-resume-item')!=='split'&&hasContent()){newPage();var kept=append(node,path);if(fits())return;remove(kept);}
      var structural=node.matches('.resume-section,.entry,.bullets,.nested,.skill-row,.skill-list');
      if(structural&&node.childNodes.length){
        var children=Array.from(node.childNodes),nextPath=path.concat([node]);
        children.forEach(function(child,index){
          if(child.nodeType===1&&child.matches('.section-heading,.entry-heading,.skill-label,.keep-next')&&hasContent()){
            var probe=append(child,nextPath),next=children.slice(index+1).find(function(item){return item.nodeType===1;}),enough=article.offsetHeight+leadingHeight(next)<=current.paperHeight+.5;remove(probe);if(!enough)newPage();
          }
          place(child,nextPath);
        });return;
      }
      var longParagraph=node.classList.contains('paragraph')&&node.offsetHeight>(parseFloat(getComputedStyle(node).lineHeight)||19)*4;
      if(!longParagraph&&hasContent()){
        newPage();var fresh=append(node,path);if(fits())return;remove(fresh);
      }
      // Oversized paragraphs/bullets continue with their inline marks and links.
      // No clipping, duplicated headings, artificial page limit, or dropped text.
      if(node.textContent.length)splitText(node,path);
    }
    newPage();Array.from(original.children).forEach(function(node){place(node,[]);});
    var all=Array.from(pages.children);if(all.length>1&&!all[all.length-1].textContent.trim())all[all.length-1].remove();
    pageCount=Math.max(1,pages.children.length);
    Array.from(pages.children).forEach(function(page,index){page.setAttribute('aria-label','Resume page '+(index+1)+' of '+pageCount);});
    send({type:'pages',count:pageCount});
  }
  window.updateResume=function(value){
    if(!value||typeof value.markup!=='string')return;
    var repaginate=lastMarkup!==value.markup;if(repaginate||!current||current.editable!==value.editable)controlsDirty=true;current=value;
    document.body.style.background=value.background;document.documentElement.style.setProperty('--ui-accent',value.accent);
    if(!restored){zoom=clamp(Number(value.initialZoom)||1,1,4);viewX=Math.max(0,Number(value.initialPanX)||0);viewY=Math.max(0,Number(value.initialOffset)||0);restored=true;}
    if(repaginate){paginate();lastMarkup=value.markup;}
    resize();
  };
  window.addEventListener('message',function(event){if(event.data&&event.data.cvDocumentUpdate)window.updateResume(event.data.cvDocumentUpdate);});
  document.addEventListener('click',function(event){var button=event.target.closest('button[data-key]');if(!button||Date.now()<suppressClickUntil)return;event.preventDefault();try{report();send({type:'section',key:button.dataset.key,target:{path:JSON.parse(button.dataset.path),label:button.dataset.label}});}catch(e){}});
  fit.addEventListener('click',function(){zoomAround(1,scroller.clientWidth/2,scroller.clientHeight/2);report();});
  scroller.addEventListener('scroll',function(){if(!visible()||updating)return;remember();pageCounter();clearTimeout(scrollTimer);scrollTimer=setTimeout(report,100);},{passive:true});
  function point(touch){var rect=scroller.getBoundingClientRect();return {x:touch.clientX-rect.left,y:touch.clientY-rect.top};}
  function pinch(touches){var a=point(touches[0]),b=point(touches[1]);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function startTouches(event){
    if(event.touches.length>=2){event.preventDefault();var p=pinch(event.touches);gesture={type:'pinch',distance:p.distance,zoom:zoom,anchor:{x:(scroller.scrollLeft+p.x-originX)/scale,y:(scroller.scrollTop+p.y-16)/scale}};suppressClickUntil=Date.now()+300;}
    else if(zoom>1&&event.touches.length===1){var t=point(event.touches[0]);gesture={type:'pan',x:t.x,y:t.y,left:scroller.scrollLeft,top:scroller.scrollTop};}
  }
  scroller.addEventListener('touchstart',startTouches,{passive:false});
  scroller.addEventListener('touchmove',function(event){
    if(event.touches.length>=2){event.preventDefault();if(!gesture||gesture.type!=='pinch')startTouches(event);var p=pinch(event.touches);zoomAround(gesture.zoom*p.distance/gesture.distance,p.x,p.y,gesture.anchor);suppressClickUntil=Date.now()+300;}
    else if(gesture&&gesture.type==='pan'&&event.touches.length===1){event.preventDefault();var t=point(event.touches[0]);scroller.scrollLeft=gesture.left+gesture.x-t.x;scroller.scrollTop=gesture.top+gesture.y-t.y;remember();pageCounter();suppressClickUntil=Date.now()+300;}
  },{passive:false});
  function endTouches(event){gesture=null;if(event.touches.length)startTouches(event);report();}
  scroller.addEventListener('touchend',endTouches,{passive:false});scroller.addEventListener('touchcancel',function(){gesture=null;report();},{passive:true});
  scroller.addEventListener('wheel',function(event){if(!event.ctrlKey)return;event.preventDefault();var p=point(event);zoomAround(zoom*Math.exp(-event.deltaY*.01),p.x,p.y);clearTimeout(scrollTimer);scrollTimer=setTimeout(report,100);},{passive:false});
  scroller.addEventListener('dblclick',function(event){if(event.target.closest('button'))return;event.preventDefault();var p=point(event);zoomAround(zoom>1?1:2,p.x,p.y);report();});
  scroller.addEventListener('pointerdown',function(event){if(event.pointerType!=='mouse'||zoom<=1||event.target.closest('button'))return;event.preventDefault();gesture={type:'mouse',x:event.clientX,y:event.clientY,left:scroller.scrollLeft,top:scroller.scrollTop};scroller.setPointerCapture(event.pointerId);});
  scroller.addEventListener('pointermove',function(event){if(!gesture||gesture.type!=='mouse')return;scroller.scrollLeft=gesture.left+gesture.x-event.clientX;scroller.scrollTop=gesture.top+gesture.y-event.clientY;remember();pageCounter();});
  scroller.addEventListener('pointerup',function(){if(gesture&&gesture.type==='mouse'){gesture=null;suppressClickUntil=Date.now()+100;report();}});
  if(window.ResizeObserver)new ResizeObserver(resize).observe(scroller);else window.addEventListener('resize',resize);
  window.addEventListener('pagehide',report);document.addEventListener('visibilitychange',function(){if(document.hidden)report();});
})();`;
