let d=null;
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); d=e; document.getElementById("box").style.display="block"; });
setTimeout(()=>{ if(!window.matchMedia('(display-mode: standalone)').matches){ document.getElementById("box").style.display="block"; } }, 1500);
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
async function doInstall(){ if(d){ d.prompt(); await d.userChoice; d=null; document.getElementById("box").style.display="none"; } else { alert("Android: tap 3 dots -> Install app\n\niPhone: tap Share -> Add to Home Screen"); } }
function doClose(){ document.getElementById("box").style.display="none"; }
