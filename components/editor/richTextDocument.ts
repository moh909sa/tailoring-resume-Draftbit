import type { Theme } from "@/theming/Theme";

export type RichTextProps = {label:string;value:string;onChangeText:(value:string)=>void;onCaret?:(y:number)=>void};
export type RichTextMessage = {type:"change";value:string} | {type:"height";height:number} | {type:"caret";y:number};
const json = (value: unknown) => JSON.stringify(value).replace(/</g,"\\u003c");

// One editing surface on WKWebView and web. Persist only the print engine's
// strong/em/u/a vocabulary; no styles, editor state or selection enters the CV.
export function richTextDocument(value: string, label: string, theme: Theme): string {
  const c = theme.colors;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:${c.card};color:${c.foreground};font-family:system-ui,-apple-system,sans-serif;font-size:18px;line-height:24px;overflow:hidden}
  #wrap{border:1px solid ${c.input};border-radius:12px;overflow:hidden}#wrap:focus-within{border-color:${c.primary}}
  #editor{min-height:72px;padding:12px 16px;outline:none;white-space:pre-wrap;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text}
  #toolbar{display:none;border-bottom:1px solid ${c.border};background:${c.muted};padding:4px 8px;gap:4px;align-items:center}#wrap.active #toolbar{display:flex}
  button{border:0;background:transparent;color:${c.foreground};border-radius:8px;min-width:44px;min-height:44px;font-size:18px;cursor:pointer}button[aria-pressed=true]{background:${c.primary};color:${c.primaryForeground}}button:focus-visible{outline:2px solid ${c.primary}}
  #hint{font-size:12px;line-height:16px;color:${c.mutedForeground};margin:0 8px 0 auto}a{color:${theme.name === "dark" ? c.foreground : c.primary};text-decoration:underline}
  #link-form{display:none;padding:12px 16px;border-top:1px solid ${c.border};background:${c.card}}#link-form.open{display:block}label{display:block;font-size:14px;margin-bottom:12px}input{display:block;width:100%;margin-top:6px;border:1px solid ${c.input};border-radius:8px;padding:12px;font:inherit;background:${c.background};color:${c.foreground}}
  #link-actions{display:flex;flex-wrap:wrap;gap:8px}#save-link{background:${c.primary};color:${c.primaryForeground};padding:0 14px;font-size:14px}#cancel-link,#remove-link{font-size:14px;padding:0 8px}#error{color:${c.destructive};font-size:14px;line-height:20px}p{margin:0}strong,b{font-weight:700}em,i{font-style:italic}
  </style></head><body><div id="wrap"><div id="toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-command="bold" aria-label="Bold" aria-pressed="false"><b>B</b></button><button type="button" data-command="italic" aria-label="Italic" aria-pressed="false"><i>I</i></button><button type="button" data-command="underline" aria-label="Underline" aria-pressed="false"><u>U</u></button><button type="button" id="link" aria-label="Add or edit link">↗</button><span id="hint">Select text</span></div><div id="editor" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true"></div><form id="link-form" aria-label="Edit link"><label>Display Text<input id="link-text" required></label><label>URL<input id="link-url" type="url" inputmode="url" autocapitalize="none" autocomplete="url" placeholder="https://example.com" required></label><p id="error" role="alert"></p><div id="link-actions"><button type="submit" id="save-link">Save link</button><button type="button" id="cancel-link">Cancel</button><button type="button" id="remove-link">Remove link</button></div></form></div>
  <script>(function(){
  var editor=document.getElementById('editor'),wrap=document.getElementById('wrap'),form=document.getElementById('link-form'),display=document.getElementById('link-text'),url=document.getElementById('link-url'),error=document.getElementById('error');
  var savedRange=null,linkRange=null,lastSent=${json(value)},composing=false;
  editor.setAttribute('aria-label',${json(label)});
  function send(data){var message=JSON.stringify(data);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else parent.postMessage({cvRichText:message},'*');}
  function safeUrl(value){try{var parsed=new URL(value);return ['https:','http:','mailto:','tel:'].indexOf(parsed.protocol)!==-1 ? parsed.href : '';}catch(e){return '';}}
  function clean(node){
    if(node.nodeType===3)return document.createTextNode(node.nodeValue||'');
    var fragment=document.createDocumentFragment();if(node.nodeType!==1)return fragment;
    var tag=node.tagName.toLowerCase();if(['script','style','iframe','object','svg','math'].indexOf(tag)!==-1)return fragment;
    if(tag==='br'){if(node.parentElement&&['div','p'].indexOf(node.parentElement.tagName.toLowerCase())!==-1&&node.parentElement.childNodes.length===1)return fragment;return document.createTextNode('\\n');}
    var normalized=tag==='b'?'strong':tag==='i'?'em':tag;
    var target=['strong','em','u','a'].indexOf(normalized)!==-1?document.createElement(normalized):fragment;
    if(normalized==='a'){var href=safeUrl(node.getAttribute('href')||'');if(href){target.setAttribute('href',href);target.setAttribute('target','_blank');target.setAttribute('rel','noopener noreferrer');}else target=fragment;}
    // WebKit can produce styled spans for editing commands.
    if(tag==='span'){
      var marks=[];if(/bold|[6-9]00/.test(node.style.fontWeight))marks.push('strong');if(node.style.fontStyle==='italic')marks.push('em');if(/underline/.test(node.style.textDecoration))marks.push('u');
      var outer=fragment;marks.forEach(function(mark){var next=document.createElement(mark);outer.appendChild(next);outer=next;});target=outer;
    }
    Array.from(node.childNodes).forEach(function(child){target.appendChild(clean(child));});
    if(tag==='span')return fragment;
    if(tag==='div'||tag==='p'||tag==='li'){var previous=node.previousSibling;if(previous&&!(previous.nodeType===1&&['div','p','li','br'].indexOf(previous.tagName.toLowerCase())!==-1)&&!(previous.textContent||'').endsWith('\\n'))target.insertBefore(document.createTextNode('\\n'),target.firstChild);if(node.nextSibling)target.appendChild(document.createTextNode('\\n'));}
    return target;
  }
  function cleaned(value){var doc=new DOMParser().parseFromString(value,'text/html'),holder=document.createElement('div');Array.from(doc.body.childNodes).forEach(function(node){holder.appendChild(clean(node));});return holder.innerHTML;}
  function height(){send({type:'height',height:Math.ceil(wrap.getBoundingClientRect().height)+2});}
  function caret(){var sel=window.getSelection();if(!sel||!sel.rangeCount||!editor.contains(sel.anchorNode))return;var range=sel.getRangeAt(0);savedRange=range.cloneRange();var rect=range.getBoundingClientRect();if(rect.height)send({type:'caret',y:rect.bottom});}
  function remember(){var sel=window.getSelection();if(sel&&sel.rangeCount&&editor.contains(sel.anchorNode)){savedRange=sel.getRangeAt(0).cloneRange();document.getElementById('hint').textContent=savedRange.collapsed?'Select text':'';}document.querySelectorAll('[data-command]').forEach(function(button){button.setAttribute('aria-pressed',String(document.queryCommandState(button.dataset.command)));});caret();}
  function restore(range){editor.focus();var selection=window.getSelection();if(range){selection.removeAllRanges();selection.addRange(range);}}
  function changed(){if(composing)return;lastSent=cleaned(editor.innerHTML);send({type:'change',value:lastSent});height();remember();caret();}
  window.setEditorValue=function(value){if(value===lastSent)return;lastSent=value;editor.innerHTML=cleaned(value);height();};
  window.addEventListener('message',function(e){if(e.source===parent&&typeof e.data?.cvRichValue==='string')window.setEditorValue(e.data.cvRichValue);});
  editor.innerHTML=cleaned(lastSent);
  editor.addEventListener('input',changed);editor.addEventListener('compositionstart',function(){composing=true;});editor.addEventListener('compositionend',function(){composing=false;changed();});
  editor.addEventListener('focus',function(){wrap.classList.add('active');height();});
  wrap.addEventListener('focusout',function(){setTimeout(function(){if(!wrap.contains(document.activeElement)&&!form.classList.contains('open')){wrap.classList.remove('active');height();}},100);});
  document.addEventListener('selectionchange',remember);editor.addEventListener('keyup',caret);editor.addEventListener('click',caret);
  document.querySelectorAll('[data-command]').forEach(function(button){button.addEventListener('mousedown',function(e){e.preventDefault();});button.addEventListener('click',function(){restore(savedRange);document.execCommand('styleWithCSS',false,false);document.execCommand(button.dataset.command,false,null);changed();});});
  editor.addEventListener('paste',function(e){e.preventDefault();var text=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,text);changed();});
  editor.addEventListener('click',function(e){if(e.target.closest('a'))e.preventDefault();});
  function selectedLink(){var range=savedRange;if(!range)return null;var node=range.startContainer;var el=node.nodeType===1?node:node.parentElement;var a=el.closest('a');return a&&editor.contains(a)?a:null;}
  document.getElementById('link').addEventListener('mousedown',function(e){e.preventDefault();});
  document.getElementById('link').addEventListener('click',function(){remember();linkRange=savedRange?savedRange.cloneRange():null;var a=selectedLink();if(a){linkRange=document.createRange();linkRange.selectNodeContents(a);display.value=a.textContent||'';url.value=a.getAttribute('href')||'';}else{display.value=linkRange?linkRange.toString():'';url.value='';}document.getElementById('remove-link').hidden=!a;error.textContent='';form.classList.add('open');height();display.focus();});
  function closeLink(){form.classList.remove('open');error.textContent='';restore(linkRange);height();}
  document.getElementById('cancel-link').addEventListener('click',closeLink);
  document.getElementById('remove-link').addEventListener('click',function(){closeLink();document.execCommand('unlink',false,null);changed();});
  form.addEventListener('submit',function(e){e.preventDefault();var href=safeUrl(url.value.trim());if(!href||!display.value.trim()){error.textContent='Enter display text and a full https://, http://, mailto: or tel: URL.';height();return;}var a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(linkRange&&linkRange.toString()===display.value){a.appendChild(linkRange.cloneContents());a.querySelectorAll('a').forEach(function(n){n.replaceWith.apply(n,Array.from(n.childNodes));});}else a.textContent=display.value;restore(linkRange);document.execCommand('unlink',false,null);document.execCommand('insertHTML',false,a.outerHTML);form.classList.remove('open');changed();});
  document.addEventListener('focusin',function(e){if(e.target.tagName==='INPUT')setTimeout(function(){send({type:'caret',y:e.target.getBoundingClientRect().bottom});},100);});
  if(window.ResizeObserver)new ResizeObserver(height).observe(wrap);height();
  })();</script></body></html>`;
}
