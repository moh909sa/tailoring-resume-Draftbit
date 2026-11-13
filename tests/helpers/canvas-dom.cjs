// Deterministic layout model for the real canvas script, not a browser/device.
// Measured line heights make pagination, rich-text splitting and gestures testable.
function canvasDom(original,viewportWidth=390,viewportHeight=420){
 const texts=node=>node.nodeType===3?[node]:node.childNodes.flatMap(texts);
 class TextNode{constructor(value){this.nodeType=3;this.nodeValue=value;this.parentNode=null;}get textContent(){return this.nodeValue;}set textContent(value){this.nodeValue=value;}cloneNode(){return new TextNode(this.nodeValue);}remove(){if(this.parentNode)this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}}
 class Element{
  constructor(tag='div',attrs={}){this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs={...attrs};this.style={setProperty(k,v){this[k]=v;}};this.childNodes=[];this.parentNode=null;this.listeners={};this._left=0;this._top=0;}
  get className(){return this.attrs.class??'';}set className(value){this.attrs.class=value;}
  get classList(){return {contains:value=>this.className.split(/\s+/).includes(value)};}
  get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),value]));}
  get children(){return this.childNodes.filter(node=>node.nodeType===1);}get firstElementChild(){return this.children[0]??null;}
  get nextElementSibling(){if(!this.parentNode)return null;const siblings=this.parentNode.children;return siblings[siblings.indexOf(this)+1]??null;}
  get textContent(){return this.childNodes.map(node=>node.textContent).join('');}set textContent(value){this.replaceChildren(new TextNode(value));}
  setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}removeAttribute(key){delete this.attrs[key];}
  appendChild(node){node.remove();node.parentNode=this;this.childNodes.push(node);return node;}replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];nodes.forEach(node=>this.appendChild(node));}
  remove(){if(this.parentNode)this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}
  cloneNode(deep=false){const copy=new Element(this.tagName,this.attrs);Object.assign(copy.style,this.style);if(deep)this.childNodes.forEach(child=>copy.appendChild(child.cloneNode(true)));return copy;}
  matches(selector){return selector.split(',').some(item=>{const cls=item.match(/^\.([\w-]+)$/);if(cls)return this.classList.contains(cls[1]);const attr=item.match(/^(\w+)?\[([^\]]+)\]$/);return attr?(!attr[1]||this.tagName===attr[1].toUpperCase())&&this.getAttribute(attr[2])!==null:this.tagName===item.toUpperCase();});}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)??null;}
  addEventListener(name,fn){this.listeners[name]=fn;}setPointerCapture(){}
  get offsetHeight(){
   if(this.classList.contains('pencil'))return 0;
   if(this.classList.contains('paper'))return parseFloat(this.style.height)||0;
   let width=200,parent=this;while(parent){if(parent.style.width){width=parseFloat(parent.style.width)-40;break;}parent=parent.parentNode;}
   const lines=()=>this.textContent.length?Math.ceil(this.textContent.length/Math.max(5,Math.floor(width/7)))*20:0;
   if(this.classList.contains('paragraph')||this.classList.contains('skill-list'))return lines();
   if(this.classList.contains('bullet')||this.classList.contains('entry-row'))return Math.max(0,...this.children.map(child=>child.offsetHeight));
   if(this.classList.contains('section-heading'))return 24;
   const height=this.childNodes.reduce((n,node)=>n+(node.nodeType===3?(node.textContent.length?20:0):node.offsetHeight),0);
   return height+(this.tagName==='ARTICLE'?40:0);
  }
  getBoundingClientRect(){let top=0,node=this;while(node.parentNode){const siblings=node.parentNode.childNodes;for(const before of siblings.slice(0,siblings.indexOf(node)))top+=before.nodeType===1?before.offsetHeight+(parseFloat(before.style.marginBottom)||0):0;node=node.parentNode;}let zoom=1;const transform=ids.pages?.style.transform;if(transform)zoom=Number(transform.match(/scale\(([^)]+)\)/)[1]);return {left:0,top:top*zoom,width:200,height:this.offsetHeight*zoom};}
  get scrollLeft(){return this._left;}set scrollLeft(value){this._left=Math.max(0,value);}get scrollTop(){return this._top;}set scrollTop(value){this._top=Math.max(0,value);}
 }
 const ids=Object.fromEntries(['scroller','frame','pages','source','controls','fit','page-count'].map(id=>[id,new Element('div',{id})]));
 ids.scroller.clientWidth=viewportWidth;ids.scroller.clientHeight=viewportHeight;ids.scroller.getBoundingClientRect=()=>({left:0,top:0,width:viewportWidth,height:viewportHeight});
 ids.scroller.appendChild(ids.frame);ids.frame.appendChild(ids.pages);ids.frame.appendChild(ids.controls);
 let sourceBuilds=0;
 Object.defineProperty(ids.source,'innerHTML',{set(){sourceBuilds++;ids.source.replaceChildren(original().cloneNode(true));}});
 function range(){let start,end;const offset=(root,node,index)=>{let total=0,found=false;function visit(current){if(current===node){total+=current.nodeType===3?index:current.childNodes.slice(0,index).reduce((n,item)=>n+item.textContent.length,0);found=true;return;}if(current.nodeType===3){total+=current.nodeValue.length;return;}for(const child of current.childNodes){if(found)break;visit(child);}}visit(root);return total;};return {setStart(node,index){start={node,index};},setEnd(node,index){end={node,index};},deleteContents(){let root=start.node;const ancestors=new Set();for(let n=end.node;n;n=n.parentNode)ancestors.add(n);while(!ancestors.has(root))root=root.parentNode;const a=offset(root,start.node,start.index),b=offset(root,end.node,end.index);let pos=0;for(const text of texts(root)){const len=text.nodeValue.length,from=Math.max(0,a-pos),to=Math.min(len,b-pos);if(to>from)text.nodeValue=text.nodeValue.slice(0,from)+text.nodeValue.slice(to);pos+=len;}}};}
 const messages=[],observers=[];
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTreeWalker:node=>{const all=texts(node);let i=0;return {nextNode:()=>all[i++]??null};},createRange:range,body:{style:{}},documentElement:{style:{setProperty(){}}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
 const window={listeners:{},ReactNativeWebView:{postMessage:raw=>messages.push(JSON.parse(raw))},addEventListener(name,fn){this.listeners[name]=fn;}};
 class ResizeObserver{constructor(callback){observers.push(callback);}observe(){}}window.ResizeObserver=ResizeObserver;
 return {Element,TextNode,ids,messages,observers,context:{document,window,ResizeObserver,getComputedStyle:()=>({lineHeight:'20'}),setTimeout,clearTimeout,parent:{}},get sourceBuilds(){return sourceBuilds;}};
}
function fixtureFactory(){let dom;return {set(value){dom=value;},build(){const el=(tag,cls,text)=>{const node=new dom.Element(tag,{class:cls});if(text)node.appendChild(new dom.TextNode(text));return node;};const article=el('article','modern');
 for(let i=0;i<4;i++){const section=el('section','resume-section');section.setAttribute('data-section','section-'+i);const heading=el('div','section-heading');heading.appendChild(el('h2','','Section '+i));const pencil=el('button','pencil');pencil.setAttribute('data-key','section-'+i);pencil.setAttribute('data-path','[]');pencil.setAttribute('data-label','Section '+i);heading.appendChild(pencil);section.appendChild(heading);
 const paragraph=el('div','paragraph');const strong=el('strong','','Marked evidence '+i+' '+('meaningful words '.repeat(35)));paragraph.appendChild(strong);const link=el('a','','Linked text '+('link words '.repeat(8)));link.setAttribute('href','https://example.test');paragraph.appendChild(link);section.appendChild(paragraph);article.appendChild(section);}
 const skills=el('section','resume-section');skills.setAttribute('data-section','skills');const heading=el('div','section-heading');heading.appendChild(el('h2','','Skills'));skills.appendChild(heading);const list=el('div','skill-list');for(let i=0;i<25;i++){list.appendChild(el('span','','Skill '+i));if(i<24)list.appendChild(new dom.TextNode(', '));}skills.appendChild(list);article.appendChild(skills);return article;}};}
module.exports={canvasDom,fixtureFactory};
