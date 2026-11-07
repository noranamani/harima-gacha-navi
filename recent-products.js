"use strict";
(async()=>{
  const list=document.getElementById("recent-products-list");
  const status=document.getElementById("recent-products-status");
  if(!list||!status)return;
  try{
    const r=await fetch("data/product-links-history.json",{cache:"no-store"});
    if(!r.ok)throw Error("unavailable");
    const data=await r.json();
    if(data.schemaVersion!==1||!Array.isArray(data.events))throw Error("invalid");
    const period=3*60*60*1000;
    const valid=data.events.filter(e=>{
      if(!e||typeof e.name!=="string"||typeof e.store!=="string")return false;
      if(!Number.isFinite(Date.parse(e.detectedAt)))return false;
      try{
        const u=new URL(e.url);
        return u.protocol==="https:"&&u.hostname==="bandainamco-am.co.jp"&&
          u.pathname.endsWith("/item_details.html")&&u.searchParams.has("product_code");
      }catch{return false;}
    }).sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt));
    const render=()=>{
      const now=Date.now();
      const fresh=valid.filter(e=>{
        const t=Date.parse(e.detectedAt);
        return t<=now&&now-t<period;
      });
      const items=fresh.slice(0,3);
      list.replaceChildren();
      if(!items.length){
        list.hidden=true;
        status.textContent="直近3時間以内に新しい商品リンクは検出されていません。";
        return;
      }
      list.hidden=false;status.textContent="直近3時間の新規掲載リンク";
      for(const event of items){
        const li=document.createElement("li");
        const a=document.createElement("a");a.href=event.url;a.target="_blank";
        a.rel="noopener noreferrer";a.textContent=event.name;
        const meta=document.createElement("span");meta.className="product-preview-store";
        meta.textContent=" — "+event.store;
        li.append(a,meta);list.append(li);
      }
      const nextExpiry=Math.min(...fresh.map(e=>Date.parse(e.detectedAt)+period));
      setTimeout(render,Math.max(1,nextExpiry-Date.now()+1));
    };
    render();
  }catch{
    list.hidden=true;status.textContent="現在、新着商品リンクの情報を取得できません。";
  }
})();
