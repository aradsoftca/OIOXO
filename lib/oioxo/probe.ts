/**
 * oioxo Code — the shared runtime PROBE injected into a running preview (whether
 * served by WebContainer OR rendered server-free via srcdoc). It captures runtime
 * errors, a console/error trace (Gem 7), frame/listener/canvas signals, accepts the
 * goal checks via postMessage, evaluates them, and posts ONE report back:
 *   { __oioxo:'probe', errors:[...], trace:[...] }
 * Kept as one exported string so the WebContainer static server and the instant
 * srcdoc preview (preview-oracle.makeStaticPreviewRun) are byte-identical oracles.
 */
export const PROBE_SCRIPT =
  '<script>(function(){var E=[],CHK=null;function rec(m){E.push(String(m))}' +
  'var T=[],tn=0;function tr(k,l){try{if(T.length<300)T.push({seq:tn++,kind:k,label:String(l)})}catch(_){}}' +
  'window.__oioxoFrames=0;window.__oioxoListeners=[];window.__oioxoCanvasPainted=false;' +
  'try{var cl=console.log;console.log=function(){tr("log",Array.prototype.map.call(arguments,String).join(" "));return cl.apply(console,arguments)};}catch(_){}' +
  'try{var raf=window.requestAnimationFrame;if(raf){window.requestAnimationFrame=function(cb){window.__oioxoFrames++;return raf.call(window,cb)}}}catch(_){}' +
  'try{var ael=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(t){try{if(window.__oioxoListeners.indexOf(t)<0)window.__oioxoListeners.push(t)}catch(_){}return ael.apply(this,arguments)}}catch(_){}' +
  'try{var C=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;if(C){["fill","stroke","fillRect","fillText","drawImage","strokeRect","strokeText","arc","ellipse","putImageData","lineTo"].forEach(function(m){var o=C[m];if(o)C[m]=function(){window.__oioxoCanvasPainted=true;return o.apply(this,arguments)}})}}catch(_){}' +
  "window.addEventListener('error',function(e){var m=(e.message||'error')+(e.filename?(' @'+(e.filename.split('/').pop())+':'+e.lineno):'');rec(m);tr('error',m)});" +
  "window.addEventListener('unhandledrejection',function(e){var m='unhandledrejection: '+((e.reason&&e.reason.message)||e.reason);rec(m);tr('error',m)});" +
  'var ce=console.error;console.error=function(){var m="console.error: "+Array.prototype.map.call(arguments,String).join(" ");rec(m);tr("log",m);return ce.apply(console,arguments)};' +
  "window.addEventListener('message',function(e){var d=e.data;if(d&&d.__oioxoSetChecks){CHK=d.__oioxoSetChecks}});" +
  'var deadline=Date.now()+6000;' +
  'function run(){if(CHK===null&&Date.now()<deadline){setTimeout(run,150);return;}' +
  'var fails=[];var arr=CHK||[];for(var i=0;i<arr.length;i++){var c=arr[i];try{var ok=eval(c.src);if(!ok)fails.push("not yet: "+c.name)}catch(err){fails.push("check error ("+c.name+"): "+(err&&err.message||err))}}' +
  'try{parent.postMessage({__oioxo:"probe",errors:E.concat(fails),trace:T},"*")}catch(_){}}' +
  "window.addEventListener('load',function(){setTimeout(run,900)});setTimeout(run,2600);})();</script>";
