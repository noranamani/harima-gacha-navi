"use strict";
/** Text+official-link extraction from ALREADY FETCHED approved Bandai store pages.
 * Never collect or republish official images, prices, stock or descriptions.
 * The first page is not a complete store inventory.
 */
const HOST = "bandainamco-am.co.jp";

function cleanText(html) {
  return String(html).replace(/<[^>]*>/g," ")
    .replace(/&amp;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,
      (_,hex,dec)=>String.fromCodePoint(parseInt(hex||dec,hex?16:10)))
    .replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
}

function extractOfficialProducts(html, inventoryUrl) {
  if(typeof html!=="string" || html.length>1000000) return [];
  let base;
  try{base=new URL(inventoryUrl);}catch{return [];}
  if(base.protocol!=="https:" || base.hostname!==HOST)return [];
  const matches=html.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi);
  const out=[],seen=new Set();
  for(const [,before,href,after,inner] of matches){
    let url;try{url=new URL(href,base);}catch{continue;}
    if(url.protocol!=="https:"||url.hostname!==HOST||
        !url.pathname.endsWith("/item_details.html")||
        !url.searchParams.get("product_code"))continue;
    // Strip tracking parameters to keep the same official product identity stable.
    url.search = "?product_code=" + encodeURIComponent(url.searchParams.get("product_code"));
    url.hash = "";
    const title=cleanText(inner).replace(/^在庫\s*[：:]?\s*[〇○△×✕]\s*/,"")
      .replace(/\s*\d{3,4}\s*円\s*\(?税込\)?\s*$/,"").trim();
    if(title.length<2||title.length>180||seen.has(url.href))continue;
    seen.add(url.href);
    out.push({name:title,url:url.href});
    if(out.length>=1000)break;
  }
  return out;
}

function updateApprovedProducts(config, observations) {
  if(config?.schemaVersion!==1 || config?.publicationApproved!==true||
      !Array.isArray(config.stores) || !(observations instanceof Map))
    throw Error("PRODUCT_CAPTURE_CONFIG_INVALID");
  let updated=0, skipped=0;
  const result=config.stores.map(s=>{
    const latest=observations.get(s.name);
    if(!latest)return s; // Failed fetch: keep last verified snapshot.
    if(!Array.isArray(latest)||!Array.isArray(s.items))
      throw Error("PRODUCT_CAPTURE_OBSERVATION_INVALID");
    // Short/truncated pages are not evidence that old products disappeared.
    const minSize=Math.max(3, Math.ceil(s.items.length*0.4));
    if(latest.length<minSize||latest.length>1000){
      skipped++; return s;
    }
    const next=latest.map(x=>{
      const url=new URL(x.url);
      if(url.hostname!==HOST||url.protocol!=="https:"||
          !url.pathname.endsWith("/item_details.html")||
          !url.searchParams.has("product_code") ||
          typeof x.name!=="string"||x.name.length<2||x.name.length>180)
        throw Error("PRODUCT_CAPTURE_INVALID_ITEM");
      return {name:x.name,url:url.href};
    });
    if(JSON.stringify(next)===JSON.stringify(s.items))return s;
    updated++;return {...s,items:next};
  });
  return {config:{...config,stores:result},updated,skipped};
}
module.exports={HOST,extractOfficialProducts,updateApprovedProducts};
