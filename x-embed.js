"use strict";
(function(){
  const container=document.getElementById("stores");
  if(!container)return;
  let widgetsPromise;
  function widgets(){
    if(window.twttr?.widgets?.createTimeline)return Promise.resolve(window.twttr);
    if(widgetsPromise)return widgetsPromise;
    widgetsPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://platform.twitter.com/widgets.js";
      script.async=true;
      script.dataset.xWidgets="true";
      script.onload=()=>{let attempts=0;const poll=()=>{if(window.twttr?.widgets?.createTimeline)resolve(window.twttr);else if(++attempts<20)setTimeout(poll,100);else reject(new Error("X widgets API unavailable"))};poll()};
      script.onerror=()=>reject(new Error("X widgets script blocked"));
      document.head.append(script);
    });
    return widgetsPromise;
  }
  function fallback(holder,url,message){
    holder.replaceChildren();
    const note=document.createElement("p");note.className="x-embed-note";note.textContent=message;
    const link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Xで公式投稿を確認する";
    holder.append(note,link);
  }
  async function mount(holder,url,height){
    const token=Symbol("timeline");
    holder._xToken=token;
    const status=document.createElement("p");status.className="x-embed-note";status.textContent="Xの投稿を読み込み中…";
    const direct=document.createElement("a");direct.href=url;direct.target="_blank";direct.rel="noopener noreferrer";direct.textContent="Xで公式投稿を開く";
    holder.replaceChildren(status,direct);
    let timeout;
    try{
      const api=await Promise.race([widgets(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("timeout")),10000)})]);
      clearTimeout(timeout);
      if(!holder.isConnected||holder._xToken!==token)return;
      const mountPoint=document.createElement("div");holder.append(mountPoint);
      const screenName=new URL(url).pathname.slice(1);
      const result=await Promise.race([
        api.widgets.createTimeline({sourceType:"profile",screenName},mountPoint,{height,chrome:"noheader",dnt:true}),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("timeline timeout")),12000)})
      ]);
      clearTimeout(timeout);
      if(!holder.isConnected||holder._xToken!==token)return;
      if(!result)throw new Error("empty timeline");
      status.remove();
    }catch(error){
      clearTimeout(timeout);
      if(holder.isConnected&&holder._xToken===token)fallback(holder,url,"Xの埋め込みを表示できませんでした。ブラウザの追跡防止やX側の制限が原因の場合があります。");
    }
  }
  window.HARIMA_X_EMBED={mount};
  container.addEventListener("click",event=>{
    const button=event.target.closest(".embed-toggle");
    if(!button)return;
    const card=button.closest(".card"),holder=card?.querySelector(".embed-holder");
    if(!holder)return;
    if(button.getAttribute("aria-expanded")==="true"){
      holder._xToken=null;holder.replaceChildren();holder.hidden=true;
      button.setAttribute("aria-expanded","false");button.textContent="公式Xの投稿を表示";return;
    }
    const url=button.dataset.url;
    if(!/^https:\/\/x\.com\/[A-Za-z0-9_]+$/.test(url||""))return;
    holder.hidden=false;button.setAttribute("aria-expanded","true");button.textContent="投稿表示を閉じる";
    mount(holder,url,420);
  });
})();
