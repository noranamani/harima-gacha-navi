"use strict";
/* Shared, safe in-card display for approved official product-link deltas.
 * Used on both the main store cards and generated city cards.
 * No new site page or third-party request is required to view a product.
 */
(function(root, factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HARIMA_GACHA_CARDS=api;
})(typeof window!=="undefined"?window:null,function(){
  const PERIOD_MS=3*60*60*1000; // Display only the first three hours; archive remains intact.
  const PREVIEW_COUNT=3;
  const detectedAtFormatter=new Intl.DateTimeFormat("ja-JP",{
    timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  });

  function safeOfficialProductUrl(raw){
    try{
      const url=new URL(raw);
      return url.protocol==="https:" && url.hostname==="bandainamco-am.co.jp" &&
        !url.username&&!url.password&&!url.port&&!url.hash &&
        url.pathname.endsWith("/item_details.html") &&
        !!url.searchParams.get("product_code");
    }catch{return false;}
  }

  function byStore(history,nowMs=Date.now()){
    if(!history || history.schemaVersion!==1 || !Array.isArray(history.events) ||
       !Number.isFinite(nowMs))throw Error("CARD_GACHA_HISTORY_INVALID");
    const filtered=history.events.filter(e=>{
      if(!e||typeof e.store!=="string"||!e.store.trim()||e.store.length>200||
         typeof e.name!=="string"||e.name.length<2||e.name.length>180||
         typeof e.detectedAt!=="string"||!safeOfficialProductUrl(e.url))return false;
      const when=Date.parse(e.detectedAt);
      return Number.isFinite(when)&&when<=nowMs&&nowMs-when<PERIOD_MS;
    }).sort((a,b)=>Date.parse(b.detectedAt)-Date.parse(a.detectedAt));
    const grouped=new Map(),seen=new Set();
    for(const e of filtered){
      const key=e.store+"\u0000"+e.url;
      if(seen.has(key))continue;
      seen.add(key);
      if(!grouped.has(e.store))grouped.set(e.store,[]);
      grouped.get(e.store).push({name:e.name,url:e.url,detectedAt:e.detectedAt});
    }
    return grouped;
  }

  function attach(card,items,doc){
    if(!card||!Array.isArray(items)||items.length===0)return false;
    if(card.querySelector(".card-new-gachas"))return false;
    const documentRef=doc||(typeof document!=="undefined"?document:null);
    if(!documentRef)return false;
    const freshAt=nowMs=>items.filter(e=>{
      if(!e||typeof e.detectedAt!=="string"||!safeOfficialProductUrl(e.url))return false;
      const when=Date.parse(e.detectedAt);
      return Number.isFinite(when)&&when<=nowMs&&nowMs-when<PERIOD_MS;
    });
    if(!freshAt(Date.now()).length)return false;

    const section=documentRef.createElement("section");
    section.className="card-new-gachas";
    section.setAttribute("aria-label","この店舗の新規掲載ガチャ");

    const makeList=part=>{
      const ul=documentRef.createElement("ul");ul.className="card-gacha-list";
      for(const e of part){
        const li=documentRef.createElement("li");
        const a=documentRef.createElement("a");
        a.href=e.url;a.target="_blank";a.rel="noopener noreferrer";
        a.textContent=e.name;
        const detectedAt=documentRef.createElement("small");
        detectedAt.textContent=detectedAtFormatter.format(new Date(e.detectedAt))+" 検出";
        li.append(a,detectedAt);ul.append(li);
      }
      return ul;
    };

    // Rebuild only this section when its oldest visible item reaches 3 hours.
    // Keep the store card and official links untouched; no new network fetch.
    function updateVisible(){
      const fresh=freshAt(Date.now());
      if(!fresh.length){section.remove();return;}
      const wasExpanded=!!section.querySelector(".card-gacha-extra")?.open;
      section.replaceChildren();
      const heading=documentRef.createElement("h4");
      heading.textContent="新規掲載のガチャ（"+fresh.length+"件）";
      section.append(heading,makeList(fresh.slice(0,PREVIEW_COUNT)));
      if(fresh.length>PREVIEW_COUNT){
        const details=documentRef.createElement("details");
        details.className="card-gacha-extra";
        details.open=wasExpanded;
        const summary=documentRef.createElement("summary");
        summary.textContent="ほか "+(fresh.length-PREVIEW_COUNT)+"件を表示";
        details.append(summary,makeList(fresh.slice(PREVIEW_COUNT)));
        section.append(details);
      }
      const note=documentRef.createElement("small");note.className="card-gacha-note";
      note.textContent="公式一覧への新規掲載です（検出から3時間のみ表示）。実際の入荷・在庫は保証しません。";
      section.append(note);

      // Timers also handle tabs left open, without waiting for the next reload.
      // Detached cards do not need work after a search/filter re-render.
      if(typeof window!=="undefined"&&typeof window.setTimeout==="function"){
        const firstExpiry=Math.min(...fresh.map(e=>Date.parse(e.detectedAt)+PERIOD_MS));
        window.setTimeout(()=>{
          if(section.isConnected)updateVisible();
        },Math.max(1,firstExpiry-Date.now()+1));
      }
    }

    updateVisible();
    const links=card.querySelector(".links");
    if(links)card.insertBefore(section,links);
    else card.append(section);
    return true;
  }

  return {byStore,attach,safeOfficialProductUrl};
});
