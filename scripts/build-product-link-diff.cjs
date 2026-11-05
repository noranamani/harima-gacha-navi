"use strict";
/**
 * Only a previously UNSEEN official product URL can create a new-listing event.
 * The official store's front page shows a rotating subset, so comparing
 * adjacent 20-product samples incorrectly generates the same "new" products
 * on every check. Keep a persistent per-store observed URL set instead.
 *
 * Migration from legacy history: preserve all URLs as a baseline, discard
 * unreliable old "new" events and warm up for 24h; do not invent arrivals.
 */
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const inputPath="data/product-links-input.json";
const snapshotPath="data/product-links-snapshot.json";
const diffPath="data/product-links-diff.json";
const historyPath="data/product-links-history.json";
const observedPath="data/product-links-observed.json";
const KEEP_MS=30*86400000, WARMUP_MS=24*3600000, MAX_SEEN_PER_STORE=4000;
const HOST="bandainamco-am.co.jp";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));

function validItem(item){
  if(!item||typeof item.name!=="string"||item.name.length<2||item.name.length>180
      ||typeof item.url!=="string")return false;
  try {
    const u=new URL(item.url);
    return u.protocol==="https:"&&u.hostname===HOST&&
      !u.username&&!u.password&&!u.hash&&
      u.pathname.endsWith("/item_details.html")&&
      !!u.searchParams.get("product_code");
  }catch{return false;}
}
function uniqueEvents(events,nowMs){
  const filtered=events.filter(e=>e&&typeof e.store==="string"&&
    validItem(e)&&typeof e.detectedAt==="string"&&
    Number.isFinite(Date.parse(e.detectedAt))&&
    Date.parse(e.detectedAt)>=nowMs-KEEP_MS&&
    Date.parse(e.detectedAt)<=nowMs)
    .sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt));
  const seen=new Set(),out=[];
  for(const e of filtered){
    const key=e.store+"\u0000"+e.url;
    if(seen.has(key))continue;
    seen.add(key);out.push(e);
    if(out.length===200)break;
  }
  return out;
}
function build({input,previous=null,history={schemaVersion:1,events:[]},
  observed=null,storeMap,now=new Date()}){
  if(input?.schemaVersion!==1||input.publicationApproved!==true||
    !Array.isArray(input.stores)||history?.schemaVersion!==1||
    !Array.isArray(history.events)||!(storeMap instanceof Map)||
    !(now instanceof Date)||Number.isNaN(now.getTime()))
    throw Error("PRODUCT_DIFF_INPUT_INVALID");
  if(previous!==null&&(previous.schemaVersion!==1||!Array.isArray(previous.stores)))
    throw Error("PRODUCT_SNAPSHOT_INVALID");
  if(observed!==null &&
    (observed.schemaVersion!==1||typeof observed.startedAt!=="string"||
      !Number.isFinite(Date.parse(observed.startedAt))||
      Date.parse(observed.startedAt)>now.getTime()||
      !Array.isArray(observed.stores)))
    throw Error("PRODUCT_OBSERVED_STATE_INVALID");
  const migrating=observed===null;
  const stamp=now.toISOString();
  const beforeMap=new Map((previous?.stores||[]).map(s=>[s.name,s]));
  const observedMap=new Map((observed?.stores||[]).map(s=>[s.name,s]));
  if(observedMap.size!==(observed?.stores||[]).length)
    throw Error("PRODUCT_OBSERVED_DUPLICATE_STORE");
  const previouslyReported=new Map();
  if(migrating){
    for(const e of history.events){
      if(!e||typeof e.store!=="string"||!validItem(e))continue;
      if(!previouslyReported.has(e.store))previouslyReported.set(e.store,[]);
      previouslyReported.get(e.store).push(e);
    }
  }
  const knownStores=new Set(),snapshot=[],diff=[],newEvents=[],seenStores=[];
  let pageMovement=0,newObservations=0;
  for(const entry of input.stores){
    assert(entry&&typeof entry.name==="string"&&storeMap.has(entry.name),"Unknown store");
    assert(!knownStores.has(entry.name),"Duplicate store");knownStores.add(entry.name);
    assert(Array.isArray(entry.items)&&entry.items.length<=1000);
    const incoming=[],urls=new Set();
    for(const product of entry.items){
      assert(validItem(product),"PRODUCT_URL_OR_NAME_INVALID");
      assert(!urls.has(product.url),"Repeated product URL");
      urls.add(product.url);
      incoming.push({name:product.name,url:product.url});
    }
    const previousStore=beforeMap.get(entry.name);
    const oldUrls=new Set((previousStore?.items||[]).map(i=>i.url));
    pageMovement+=incoming.filter(i=>!oldUrls.has(i.url)).length;
    const seed=migrating?[
      ...(previousStore?.items||[]),
      ...(previouslyReported.get(entry.name)||[])
    ]:observedMap.get(entry.name)?.items;
    if(!migrating && !Array.isArray(seed))
      throw Error("PRODUCT_OBSERVED_STORE_MISSING");
    const unique=new Map();
    for(const item of seed||[]){
      if(!validItem(item))throw Error("PRODUCT_OBSERVED_ITEM_INVALID");
      unique.set(item.url,{name:item.name,url:item.url});
    }
    const eligible=!migrating && now.getTime()-Date.parse(observed.startedAt)>=WARMUP_MS;
    const added=[];
    for(const item of incoming){
      if(unique.has(item.url))continue;
      unique.set(item.url,item);
      newObservations++;
      if(eligible){
        added.push(item);
        newEvents.push({
          detectedAt:stamp,store:entry.name,name:item.name,
          url:item.url,inventory:storeMap.get(entry.name).inventory
        });
      }
    }
    if(migrating){
      // At migration include the current page, too: all prior "new" events
      // were generated by comparing rotating first-page samples.
      for(const item of incoming)unique.set(item.url,item);
    }
    if(unique.size>MAX_SEEN_PER_STORE)throw Error("PRODUCT_OBSERVED_LIMIT");
    seenStores.push({name:entry.name,items:[...unique.values()]});
    snapshot.push({name:entry.name,items:incoming});
    diff.push({
      name:entry.name,inventory:storeMap.get(entry.name).inventory,
      initialBaseline:migrating||!previousStore,
      added,removedCount:previousStore?
        (previousStore.items||[]).filter(i=>!urls.has(i.url)).length:0
    });
  }
  const prevObserved=(observed?.stores||[]).map(s=>s.name);
  for(const name of prevObserved)
    if(!knownStores.has(name))throw Error("PRODUCT_OBSERVED_UNKNOWN_STORE");
  const unchanged=JSON.stringify((previous?.stores||[]).map(s=>({name:s.name,items:s.items})))===
    JSON.stringify(snapshot);
  const kept=migrating?[]:uniqueEvents(history.events,now.getTime());
  const all=uniqueEvents([...newEvents,...kept],now.getTime());
  return {
    snapshot:unchanged?null:{schemaVersion:1,updatedAt:stamp,stores:snapshot},
    diff:{schemaVersion:1,updatedAt:stamp,
      notice:"新規掲載は入荷・再入荷を保証しません。公式商品一覧の表示範囲だけを監視しています。",
      stores:diff},
    history:{schemaVersion:1,lastComparedAt:stamp,retentionDays:30,
      events:all},
    observed:{schemaVersion:1,startedAt:migrating?stamp:observed.startedAt,
      warmupHours:24,stores:seenStores},
    addedCount:newEvents.length,
    pageMovementCount:pageMovement,newObservations,
    migrating,changed:!unchanged
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
  const observed=fs.existsSync(observedPath)?read(observedPath):null;
  const result=build({input,previous,history,observed,storeMap});
  if(!input.stores.length){console.log("No approved product records; no publication.");return;}
  if(result.snapshot)fs.writeFileSync(snapshotPath,JSON.stringify(result.snapshot,null,2)+"\n");
  fs.writeFileSync(diffPath,JSON.stringify(result.diff,null,2)+"\n");
  fs.writeFileSync(historyPath,JSON.stringify(result.history,null,2)+"\n");
  fs.writeFileSync(observedPath,JSON.stringify(result.observed,null,2)+"\n");
  console.log("PRODUCT_LINK_DIFF:",
    result.addedCount,"new unseen links;",
    result.newObservations,"first observations;",
    result.pageMovementCount,"front-page rotations;",
    result.migrating?"FIRST_BASELINE_NO_ALERTS":"known URL ledger active");
}
if(require.main===module){
  try{main()}catch(error){console.error(error);process.exitCode=1;}
}
module.exports={build,validItem,uniqueEvents};
