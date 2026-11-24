"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {decision,HOUR_MS}=require("./reduce-noop-page-commits.cjs");
const base=new Date("2026-11-24T05:00:00.000Z");
const future=new Date(base.getTime()+15*60*1000);
function files(){
  return {
    "data/page-status.json":{
      schemaVersion:1,lastCheckedAt:base.toISOString(),
      pages:{"https://official.example/item/":{
        name:"公式店",status:"OBSERVED",checkedAt:base.toISOString(),
        lastAttemptAt:base.toISOString(),lastSuccessAt:base.toISOString(),
        metadata:{etag:"abc",lastModified:null,publishedUpdate:null},
        lastErrorCode:null,consecutiveUnavailable:0
      }}
    },
    "data/product-links-input.json":{
      schemaVersion:1,publicationApproved:true,
      stores:[{name:"公式店",inventory:"https://official.example/item/",
               items:[{name:"既存A",url:"https://official.example/a"}]}]
    },
    "data/product-links-snapshot.json":{
      schemaVersion:1,updatedAt:base.toISOString(),stores:[]
    },
    "data/product-links-diff.json":{
      schemaVersion:1,updatedAt:base.toISOString(),stores:[]
    },
    "data/product-links-history.json":{
      schemaVersion:1,lastComparedAt:base.toISOString(),events:[]
    },
    "data/product-links-observed.json":{
      schemaVersion:1,startedAt:"2026-11-05T05:00:00.000Z",stores:[]
    }
  };
}
const copy=x=>JSON.parse(JSON.stringify(x));
function tick(old){
  const next=copy(old);
  next["data/page-status.json"].lastCheckedAt=future.toISOString();
  const entry=next["data/page-status.json"].pages["https://official.example/item/"];
  entry.lastAttemptAt=future.toISOString();
  entry.lastSuccessAt=future.toISOString();
  next["data/product-links-history.json"].lastComparedAt=future.toISOString();
  next["data/product-links-diff.json"].updatedAt=future.toISOString();
  return next;
}
test("no real changes suppress a 15-minute timestamp-only deploy",()=>{
  const old=files(),next=tick(old);
  assert.equal(decision(old,next,future),"ONLY_VOLATILE_TIMESTAMPS_OR_KNOWN_URL_ROTATION");
});
test("previously known URL rotation is not confused with a new product",()=>{
  const old=files(),next=tick(old);
  next["data/product-links-input.json"].stores[0].items=[{name:"既存B",url:"https://official.example/b"}];
  next["data/product-links-snapshot.json"].stores=[{name:"公式店",items:[]}];
  next["data/product-links-diff.json"].stores=[{name:"公式店",added:[],removedCount:2}];
  assert.equal(decision(old,next,future),"ONLY_VOLATILE_TIMESTAMPS_OR_KNOWN_URL_ROTATION");
});
test("new unseen observed product URL immediately triggers a commit",()=>{
  const old=files(),next=tick(old);
  next["data/product-links-observed.json"].stores=[{name:"公式店",items:[{name:"新商品",url:"https://official.example/new"}]}];
  assert.equal(decision(old,next,future),"FIRST_SEEN_PRODUCT_URL");
});
test("newly published product event immediately triggers a commit",()=>{
  const old=files(),next=tick(old);
  next["data/product-links-history.json"].events=[{
    name:"新商品",store:"公式店",detectedAt:future.toISOString(),
    url:"https://official.example/new"
  }];
  assert.equal(decision(old,next,future),"PUBLIC_NEW_EVENT_OR_HISTORY_CHANGED");
});
test("official metadata and availability changes immediately trigger commits",()=>{
  const old=files(),next=tick(old);
  next["data/page-status.json"].pages["https://official.example/item/"].status="UNAVAILABLE";
  assert.equal(decision(old,next,future),"OFFICIAL_METADATA_CHANGED");
});
test("meaningful source terms/approval definition change is immediate",()=>{
  const old=files(),next=tick(old);
  next["data/product-links-input.json"].publicationApproved=false;
  assert.equal(decision(old,next,future),"APPROVED_STORE_DEFINITION_CHANGED");
});
test("one heartbeat every 60 minutes even if otherwise unchanged",()=>{
  const old=files(),next=tick(old);
  const hour=new Date(base.getTime()+HOUR_MS);
  assert.equal(decision(old,next,hour),"HOURLY_HEARTBEAT");
});
test("no decision if old clock or state is malformed",()=>{
  const old=files(),next=tick(old);
  old["data/page-status.json"].lastCheckedAt="not-a-date";
  assert.throws(()=>decision(old,next,future),/HEARTBEAT_INVALID/);
});
test("unknown product history schema prevents suppression",()=>{
  const old=files(),next=tick(old);
  next["data/product-links-history.json"].schemaVersion=2;
  assert.throws(()=>decision(old,next,future),/PRODUCT_HISTORY_INVALID/);
});
