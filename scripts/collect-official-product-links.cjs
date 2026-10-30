"use strict";
const fs=require("node:fs"),vm=require("node:vm");
const file="data/product-links-input.json";
const config=JSON.parse(fs.readFileSync(file,"utf8"));
if(config.publicationApproved!==true){console.log("Product link import disabled.");process.exit(0);}
const ctx={window:{}};vm.runInNewContext(fs.readFileSync("stores.js","utf8"),ctx,{timeout:1000});
const stores=Array.from(ctx.window.HARIMA_STORES).filter(s=>s.inventory&&new URL(s.inventory).hostname==="bandainamco-am.co.jp");
const clean=s=>s.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex||dec,hex?16:10))).replace(/\s+/g," ").trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const results=[];
  for(const store of stores){
    let response;
    try{
      response=await fetch(store.inventory,{headers:{"User-Agent":"HarimaGachaNavi-LinkMonitor/1.0 (non-commercial reference links)","Accept":"text/html"},signal:AbortSignal.timeout(12000)});
      if(!response.ok){console.warn("Skip store HTTP",response.status,store.name);continue;}
      const body=(await response.text()).slice(0,600000);
      const matches=[...body.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];
      const items=[],seen=new Set();
      for(const [,before,href,after,inner] of matches){
        let url;try{url=new URL(href,store.inventory);}catch{continue;}
        if(url.hostname!=="bandainamco-am.co.jp"||url.protocol!=="https:"||!url.pathname.endsWith("/item_details.html")||!url.searchParams.has("product_code"))continue;
        const title=clean(inner).replace(/^在庫\s*[：:]?\s*[〇○△×✕]\s*/,"").replace(/\s*\d{3,4}円\s*\(?税込\)?\s*$/,"").trim();
        if(title.length<2||title.length>180||seen.has(url.href))continue;
        seen.add(url.href);items.push({name:title,url:url.href});
      }
      if(items.length===0){console.warn("No parseable product links; retain previous data:",store.name);continue;}
      results.push({name:store.name,items});
      console.log(store.name+": "+items.length+" product links on first page");
    }catch(e){console.warn("Unavailable; retain previous data:",store.name,String(e));}
    await delay(1200);
  }
  if(!results.length){console.log("No successful store fetch; preserve previous approved dataset.");return;}
  const oldByName=new Map((config.stores||[]).map(s=>[s.name,s]));
  for(const entry of results)oldByName.set(entry.name,entry);
  const storesOut=stores.filter(s=>oldByName.has(s.name)).map(s=>oldByName.get(s.name));
  const next={schemaVersion:1,publicationApproved:true,stores:storesOut};
  const serialized=JSON.stringify(next,null,2)+"\n";
  if(serialized!==fs.readFileSync(file,"utf8"))fs.writeFileSync(file,serialized);
})().catch(e=>{console.error(e);process.exitCode=1;});
