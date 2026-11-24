#!/usr/bin/env node
"use strict";
/* Keep the 15-minute actual GET schedule, but do not deploy identical public
 * information every time only lastChecked/lastComparedAt timestamps move.
 * First-seen products, approved-source metadata and availability changes still
 * commit immediately. One heartbeat commit per hour remains for public freshness.
 * All suppressed time-only changes are discarded from the runner WORKTREE ONLY.
 */
const fs=require("node:fs");
const child=require("node:child_process");

const FILES=[
  "data/page-status.json",
  "data/product-links-input.json",
  "data/product-links-snapshot.json",
  "data/product-links-diff.json",
  "data/product-links-history.json",
  "data/product-links-observed.json"
];
const HOUR_MS=60*60*1000;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stable=(value,omit)=>Object.fromEntries(
  Object.entries(value).filter(([key])=>!omit.includes(key)));
function statusCore(input){
  if(!input || input.schemaVersion!==1 || !input.pages)throw Error("PAGE_STATUS_INVALID");
  return {
    ...stable(input,["lastCheckedAt"]),
    pages:Object.fromEntries(Object.entries(input.pages).map(([url,row])=>[
      url,stable(row,["lastAttemptAt","lastSuccessAt"])
    ]))
  };
}
function catalogCore(input){
  if(!input || input.schemaVersion!==1 || !Array.isArray(input.stores))
    throw Error("PRODUCT_CATALOG_INVALID");
  return {...input,stores:input.stores.map(row=>stable(row,["items"]))};
}
function unchangedHistory(previous,current){
  if(previous?.schemaVersion!==1 || current?.schemaVersion!==1 ||
     !Array.isArray(previous.events) || !Array.isArray(current.events))
    throw Error("PRODUCT_HISTORY_INVALID");
  return equal(stable(previous,["lastComparedAt"]),
               stable(current,["lastComparedAt"]));
}
function decision(oldFiles,newFiles,now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("COMMIT_DECISION_CLOCK_INVALID");
  const original=oldFiles["data/page-status.json"],fresh=newFiles["data/page-status.json"];
  const last=Date.parse(original?.lastCheckedAt);
  if(!Number.isFinite(last) || last>now.getTime() || fresh?.schemaVersion!==1)
    throw Error("PAGE_STATUS_HEARTBEAT_INVALID");
  const age=now.getTime()-last;
  // Every 60 minutes, keep a heartbeat even with no actual changes so the
  // displayed "last checked" never pretends to be newer than the deployed data.
  if(age>=HOUR_MS)return "HOURLY_HEARTBEAT";
  if(!equal(statusCore(original),statusCore(fresh)))return "OFFICIAL_METADATA_CHANGED";
  if(!equal(catalogCore(oldFiles["data/product-links-input.json"]),
            catalogCore(newFiles["data/product-links-input.json"])))
    return "APPROVED_STORE_DEFINITION_CHANGED";
  if(!equal(oldFiles["data/product-links-observed.json"],
            newFiles["data/product-links-observed.json"]))
    return "FIRST_SEEN_PRODUCT_URL";
  if(!unchangedHistory(oldFiles["data/product-links-history.json"],
                       newFiles["data/product-links-history.json"]))
    return "PUBLIC_NEW_EVENT_OR_HISTORY_CHANGED";
  // Product snapshots/links may rotate among ALREADY OBSERVED official URLs.
  // They are still sampled every 15 min, but need not redeploy the whole site.
  return "ONLY_VOLATILE_TIMESTAMPS_OR_KNOWN_URL_ROTATION";
}
function oldBytes(path){
  return child.execFileSync("git",["show","HEAD:"+path],
                            {encoding:"utf8",maxBuffer:4*1024*1024});
}
function main(){
  const originals={},current={},bytes={};
  for(const path of FILES){
    bytes[path]=oldBytes(path);
    originals[path]=JSON.parse(bytes[path]);
    current[path]=JSON.parse(fs.readFileSync(path,"utf8"));
  }
  const changes=child.execFileSync("git",["diff","--name-only"],
                                  {encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
  const unrecognized=changes.filter(path=>!FILES.includes(path));
  if(unrecognized.length){
    console.log("GACHA_COMMIT_DECISION: OTHER_CHANGED_FILES_PRESERVED");
    return;
  }
  const why=decision(originals,current);
  if(why!=="ONLY_VOLATILE_TIMESTAMPS_OR_KNOWN_URL_ROTATION"){
    console.log("GACHA_COMMIT_DECISION: KEEP "+why);
    return;
  }
  for(const path of changes)fs.writeFileSync(path,bytes[path],"utf8");
  console.log("GACHA_COMMIT_DECISION: NOOP_SUPPRESSED; 15-minute GETs completed; "+
              "next heartbeat within 60 minutes");
}
if(require.main===module){
  try{main();}catch(e){console.error("GACHA_COMMIT_DECISION_ERROR: "+e.message);process.exitCode=1;}
}
module.exports={statusCore,catalogCore,unchangedHistory,decision,HOUR_MS};
