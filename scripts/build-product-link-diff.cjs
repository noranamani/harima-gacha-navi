"use strict";
/** Deterministic product-link delta and recent history for approved stores.
 * A new LINK on the visible official listing is not proof of a new delivery.
 */
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const inputPath="data/product-links-input.json";
const snapshotPath="data/product-links-snapshot.json";
const diffPath="data/product-links-diff.json";
const historyPath="data/product-links-history.json";
const KEEP_MS=30*86400000;
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));

function build({input,previous=null,history={schemaVersion:1,events:[]},storeMap,now=new Date()}){
  if(input?.schemaVersion!==1||input.publicationApproved!==true||
    !Array.isArray(input.stores)||history.schemaVersion!==1||
    !Array.isArray(history.events)||!(storeMap instanceof Map)||
    !(now instanceof Date)||Number.isNaN(now.getTime()))
    throw Error("PRODUCT_DIFF_INPUT_INVALID");
  if(previous!==null && (previous.schemaVersion!==1 || !Array.isArray(previous.stores)))
    throw Error("PRODUCT_SNAPSHOT_INVALID");
  const beforeMap=new Map((previous?.stores||[]).map(s=>[s.name,s]));
  const stamp=now.toISOString();
  const seen=new Set(),snap=[],diff=[],events=[];
  for(const entry of input.stores){
    assert(entry&&typeof entry.name==="string"&&storeMap.has(entry.name),"Unknown store");
    assert(!seen.has(entry.name),"Duplicate store");seen.add(entry.name);
    assert(Array.isArray(entry.items)&&entry.items.length<=1000);
    const items=[],unique=new Set();
    for(const item of entry.items){
      assert(typeof item.name==="string"&&item.name.length>=2&&item.name.length<=180);
      const url=new URL(item.url);
      assert.equal(url.protocol,"https:");
      assert.equal(url.hostname,"bandainamco-am.co.jp");
      assert(!url.username&&!url.password&&!url.hash);
      assert(/\/item\//.test(url.pathname)||/item_details\.html/.test(url.pathname));
      const key=url.href;
      assert(!unique.has(key),"Repeated product URL");unique.add(key);
      items.push({name:item.name,url:key});
    }
    const before=beforeMap.get(entry.name);
    const beforeUrls=new Set((before?.items||[]).map(x=>x.url));
    const added=before?items.filter(x=>!beforeUrls.has(x.url)):[];
    const removed=before?(before.items||[]).filter(x=>!unique.has(x.url)):[];
    const inventory=storeMap.get(entry.name).inventory;
    for(const item of added){
      events.push({
        detectedAt:stamp,store:entry.name,name:item.name,
        url:item.url,inventory
      });
    }
    snap.push({name:entry.name,items});
    diff.push({name:entry.name,inventory,initialBaseline:!before,
      added,removedCount:removed.length});
  }
  const unchanged=JSON.stringify((previous?.stores||[]).map(s=>({name:s.name,items:s.items})))===
    JSON.stringify(snap);
  const oldEvents=history.events.filter(x=>
    x && typeof x.detectedAt==="string"&&
    Number.isFinite(Date.parse(x.detectedAt)) &&
    Date.parse(x.detectedAt)>=now.getTime()-KEEP_MS &&
    Date.parse(x.detectedAt)<=now.getTime());
  const all=[...events,...oldEvents].sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt)).slice(0,200);
  return {
    snapshot:unchanged?null:{schemaVersion:1,updatedAt:stamp,stores:snap},
    diff:{schemaVersion:1,updatedAt:stamp,
      notice:"新規掲載は入荷・再入荷を保証しません。取得対象は公式商品一覧の表示範囲のみです。",
      stores:diff},
    history:{schemaVersion:1,lastComparedAt:stamp,retentionDays:30,events:all},
    addedCount:events.length,changed:!unchanged
  };
}
function main(){
  const input=read(inputPath);
  if(input.publicationApproved!==true){
    console.log("Product link processing disabled until source/usage approval.");return;
  }
  const source=fs.readFileSync("stores.js","utf8"),ctx={window:{}};
  vm.runInNewContext(source,ctx,{timeout:1000});
  const catalog=Array.from(ctx.window.HARIMA_STORES||[]).filter(s=>s.inventory);
  const storeMap=new Map(catalog.map(s=>[s.name,s]));
  const previous=fs.existsSync(snapshotPath)?read(snapshotPath):null;
  const history=fs.existsSync(historyPath)?read(historyPath):{schemaVersion:1,events:[]};
  const result=build({input,previous,history,storeMap});
  if(!input.stores.length){console.log("No approved product records; no publication.");return;}
  if(result.snapshot) fs.writeFileSync(snapshotPath,JSON.stringify(result.snapshot,null,2)+"\n");
  fs.writeFileSync(diffPath,JSON.stringify(result.diff,null,2)+"\n");
  fs.writeFileSync(historyPath,JSON.stringify(result.history,null,2)+"\n");
  console.log("PRODUCT_LINK_DIFF:",result.addedCount,"new listing links;",
    result.changed?"snapshot changed":"no changes");
}
if(require.main===module){
  try{main()}catch(error){console.error(error);process.exitCode=1;}
}
module.exports={build};
