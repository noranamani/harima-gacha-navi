"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const inputPath="data/product-links-input.json",snapshotPath="data/product-links-snapshot.json",diffPath="data/product-links-diff.json";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const source=fs.readFileSync("stores.js","utf8"),ctx={window:{}};
vm.runInNewContext(source,ctx,{timeout:1000});
const stores=Array.from(ctx.window.HARIMA_STORES).filter(s=>s.inventory);
const storeMap=new Map(stores.map(s=>[s.name,s]));
let input=read(inputPath);
assert.equal(input.schemaVersion,1);
if(input.publicationApproved!==true) {console.log("Product-link processing disabled until source/usage approval.");process.exit(0);}
assert(Array.isArray(input.stores));
const previous=fs.existsSync(snapshotPath)?read(snapshotPath):null;
const old=new Map((previous?.stores||[]).map(s=>[s.name,s]));
const now=new Date().toISOString();
const seen=new Set(),snap=[],diff=[];
for(const entry of input.stores){
  assert(entry&&typeof entry.name==="string"&&storeMap.has(entry.name),"Unknown store");
  assert(!seen.has(entry.name),"Duplicate store");seen.add(entry.name);
  assert(Array.isArray(entry.items)&&entry.items.length<=1000);
  const unique=new Set(),items=[];
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
  const before=old.get(entry.name);
  const beforeUrls=new Set((before?.items||[]).map(i=>i.url));
  const added=before?items.filter(i=>!beforeUrls.has(i.url)):[];
  const removed=before?(before.items||[]).filter(i=>!unique.has(i.url)):[];
  snap.push({name:entry.name,items});
  diff.push({name:entry.name,inventory:storeMap.get(entry.name).inventory,initialBaseline:!before,added,removedCount:removed.length});
}
if(!snap.length) {console.log("No approved product records; no publication.");process.exit(0);}
fs.writeFileSync(snapshotPath,JSON.stringify({schemaVersion:1,updatedAt:now,stores:snap},null,2)+"\n");
fs.writeFileSync(diffPath,JSON.stringify({schemaVersion:1,updatedAt:now,notice:"新規掲載は入荷・再入荷を保証しません。",stores:diff},null,2)+"\n");
console.log("Processed approved store snapshots:",snap.length);
