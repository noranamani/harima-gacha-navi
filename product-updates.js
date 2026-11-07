"use strict";
(async()=>{
  const target=document.getElementById("product-diff");
  const filter=document.getElementById("product-store-filter");
  const counter=document.getElementById("product-result-count");
  const checked=document.getElementById("product-checked-at");
  if(!target||!filter||!counter||!checked)return;
  const dateTime=value=>new Intl.DateTimeFormat("ja-JP",{
    timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
  const officialUrl=value=>{
    try{
      const u=new URL(value);
      return u.protocol==="https:"&&u.hostname==="bandainamco-am.co.jp"&&
        u.pathname.endsWith("/item_details.html")&&u.searchParams.has("product_code");
    }catch{return false;}
  };
  try{
    const result=await fetch("data/product-links-history.json",{cache:"no-store"});
    if(!result.ok)throw Error("missing data");
    const data=await result.json();
    if(data.schemaVersion!==1||!Array.isArray(data.events))throw Error("invalid data");
    checked.textContent=data.lastComparedAt&&Number.isFinite(Date.parse(data.lastComparedAt))?
      "最後に比較処理が実行された日時："+dateTime(data.lastComparedAt)+"（日本時間）":
      "まだ比較処理の実績がありません。";
    const now=Date.now(),limit=3*60*60*1000;
    const events=data.events.filter(e=>e&&typeof e.store==="string"&&
      typeof e.name==="string"&&e.name.length>=2&&e.name.length<=180&&
      officialUrl(e.url)&&Number.isFinite(Date.parse(e.detectedAt))&&
      now-Date.parse(e.detectedAt)>=0&&now-Date.parse(e.detectedAt)<limit)
      .sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt));
    for(const name of [...new Set(events.map(x=>x.store))].sort((a,b)=>a.localeCompare(b,"ja"))){
      const option=document.createElement("option");
      option.value=name;option.textContent=name;filter.append(option);
    }
    let expiryTimer=null;
    const render=()=>{
      if(expiryTimer!==null)clearTimeout(expiryTimer);
      const current=Date.now();
      const fresh=events.filter(e=>current>=Date.parse(e.detectedAt)&&current-Date.parse(e.detectedAt)<limit);
      const deadlines=fresh.map(e=>Date.parse(e.detectedAt)+limit);
      if(deadlines.length)expiryTimer=setTimeout(render,Math.max(1,Math.min(...deadlines)-Date.now()+1));
      target.replaceChildren();
      const visible=fresh.filter(e=>!filter.value||e.store===filter.value);
      counter.textContent=visible.length+"件";
      if(!visible.length){
        const p=document.createElement("p");p.textContent="直近3時間以内に、この店舗の新しい商品リンクは検出されていません。";target.append(p);return;
      }
      const list=document.createElement("ul");list.className="product-event-list";
      for(const event of visible){
        const li=document.createElement("li");li.className="product-event";
        const info=document.createElement("p");info.className="product-event-meta";
        info.textContent=dateTime(event.detectedAt)+" 検出 ・ "+event.store;
        const a=document.createElement("a");a.href=event.url;a.textContent=event.name;
        a.target="_blank";a.rel="noopener noreferrer";
        li.append(info,a);list.append(li);
      }
      target.append(list);
    };
    filter.addEventListener("change",render);
    render();
  }catch{
    checked.textContent="確認日時を取得できません。";
    counter.textContent="—";
    target.textContent="現在、新規掲載情報を読み込めません。店舗ごとの公式商品一覧をご確認ください。";
  }
})();
