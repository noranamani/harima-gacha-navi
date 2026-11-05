"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {extractOfficialProducts,updateApprovedProducts}=require("./official-product-links.cjs");
const {build}=require("./build-product-link-diff.cjs");
const INVENTORY="https://bandainamco-am.co.jp/others/gashapon-bandai-officialshop/store/sample/item/";
const item=id=>"https://bandainamco-am.co.jp/others/gashapon-bandai-officialshop/item/item_details.html?product_code="+id;
const link=(id,title)=>'<a href="'+item(id)+'">'+title+"</a>";
const initial={schemaVersion:1,publicationApproved:true,stores:[{
  name:"公式テスト店",items:[{name:"商品A",url:item("111")},{name:"商品B",url:item("222")},
  {name:"商品C",url:item("333")},{name:"商品D",url:item("444")},{name:"商品E",url:item("555")}]
}]};
const catalog=new Map([["公式テスト店",{inventory:INVENTORY}]]);
const prev={schemaVersion:1,stores:[{name:"公式テスト店",items:initial.stores[0].items}]};

test("extract factual product name + canonical official product URL only",()=>{
 const html=link("111","商品A 300 円(税込)")+
   link("333","商品C")+"<a href='https://evil.example/item_details.html?product_code=5'>偽商品</a>"+
   "<a href='javascript:alert(1)'>危険</a>"+
   link("111","商品A")+"<a href='"+item("123")+"&utm_source=foo'>新商品</a>";
 const result=extractOfficialProducts(html,INVENTORY);
 assert.equal(result.length,3);
 assert.deepEqual(result.map(x=>x.name),["商品A","商品C","新商品"]);
 assert.equal(result[2].url,item("123"));
 assert.equal(extractOfficialProducts(html,"https://evil.example/store/").length,0);
});
test("failed or truncated official listing leaves approved old sample untouched",()=>{
 const unknown=new Map();
 assert.equal(updateApprovedProducts(initial,unknown).updated,0);
 const partial=new Map([["公式テスト店",[{name:"商品A",url:item("111")}]]]);
 const res=updateApprovedProducts(initial,partial);
 assert.equal(res.skipped,1);
 assert.deepEqual(res.config,initial);
});
test("successive observed snapshots create one new-link event, not initial-baseline noise",()=>{
 const result=extractOfficialProducts(link("111","商品A")+link("222","商品B")+
   link("333","商品C")+link("666","商品F"),INVENTORY);
 const updated=updateApprovedProducts(initial,new Map([["公式テスト店",result]]));
 assert.equal(updated.updated,1);
 const now=new Date("2026-11-05T00:15:00Z");
 const baseline={schemaVersion:1,startedAt:"2026-11-03T00:00:00Z",
   warmupHours:24,stores:[{name:"公式テスト店",items:initial.stores[0].items}]};
 const diff=build({input:updated.config,previous:prev,observed:baseline,storeMap:catalog,now});
 assert.equal(diff.addedCount,1);
 assert.equal(diff.diff.stores[0].added[0].name,"商品F");
 assert.equal(diff.history.events[0].url,item("666"));
 assert.equal(diff.history.events[0].store,"公式テスト店");
 const again=build({input:updated.config,previous:diff.snapshot,history:diff.history,
   observed:diff.observed,storeMap:catalog,now:new Date("2026-11-05T00:30:00Z")});
 assert.equal(again.addedCount,0);
 assert.equal(again.history.events.length,1);
 assert.equal(again.snapshot,null);
 const first=build({input:updated.config,previous:null,storeMap:catalog,now});
 assert.equal(first.addedCount,0);
 assert.equal(first.diff.stores[0].initialBaseline,true);
 assert.equal(first.migrating,true);
 assert.equal(first.history.events.length,0);
});
test("30-day window prunes stale history and retains current verified events",()=>{
 const events=[{detectedAt:"2026-09-01T00:00:00Z",name:"過去"}];
 const history={schemaVersion:1,events};
 const x=build({input:initial,previous:prev,history,storeMap:catalog,
   now:new Date("2026-11-05T00:00:00Z")});
 assert.equal(x.history.events.length,0);
 assert.equal(x.addedCount,0);
});
test("reject unknown store, untrusted item URL, corrupt history and no approval",()=>{
 const bad={...initial,stores:[{...initial.stores[0],name:"偽の店舗"}]};
 assert.throws(()=>build({input:bad,previous:prev,storeMap:catalog}),/Unknown store/);
 const poisoned={...initial,stores:[{...initial.stores[0],items:[{name:"偽商品",url:"https://evil.example/"}]}]};
 assert.throws(()=>build({input:poisoned,previous:prev,storeMap:catalog}));
 assert.throws(()=>build({input:initial,previous:prev,history:{},storeMap:catalog}),
   /PRODUCT_DIFF_INPUT_INVALID/);
 assert.throws(()=>updateApprovedProducts({...initial,publicationApproved:false},new Map()),
   /CONFIG_INVALID/);
});


test("migration never republishes unreliable new-link events; all seen URLs become baseline",()=>{
 const now=new Date("2026-11-05T03:53:00Z");
 const history={schemaVersion:1,events:[
  {store:"公式テスト店",name:"商品F",url:item("666"),detectedAt:"2026-11-05T03:23:00Z"},
  {store:"公式テスト店",name:"商品F",url:item("666"),detectedAt:"2026-11-05T03:38:00Z"}
 ]};
 const latest={...initial,stores:[{name:"公式テスト店",
  items:[...initial.stores[0].items.slice(0,4),{name:"商品G",url:item("777")}]}]};
 const first=build({input:latest,previous:prev,history,storeMap:catalog,now});
 assert.equal(first.addedCount,0);
 assert.equal(first.history.events.length,0);
 assert.equal(first.observed.stores[0].items.length,7); // A-E, F, G
 assert.equal(first.migrating,true);
 const rotatedBack=build({input:initial,previous:first.snapshot,observed:first.observed,
  history:first.history,storeMap:catalog,now:new Date("2026-11-05T04:08:00Z")});
 assert.equal(rotatedBack.addedCount,0);
 assert.equal(rotatedBack.observed.stores[0].items.length,7);
 assert.equal(rotatedBack.history.events.length,0);
});
test("warmup absorbs unseen rotating first-page links, but later brand-new URLs are announced once",()=>{
 const first=build({input:initial,previous:prev,storeMap:catalog,
   now:new Date("2026-11-05T03:00:00Z")});
 const altered={...initial,stores:[{name:"公式テスト店",items:[
  ...initial.stores[0].items.slice(0,4),{name:"ページ移動A",url:item("999")}
 ]}]};
 const within=build({input:altered,previous:prev,history:first.history,
   observed:first.observed,storeMap:catalog,now:new Date("2026-11-05T03:15:00Z")});
 assert.equal(within.addedCount,0);
 assert.equal(within.pageMovementCount,1);
 assert.equal(within.observed.stores[0].items.length,6);
 const tomorrow=build({input:altered,previous:within.snapshot,
   history:within.history,observed:within.observed,storeMap:catalog,
   now:new Date("2026-11-06T04:00:00Z")});
 assert.equal(tomorrow.addedCount,0); // reappearing historical page product
 const newProduct={...initial,stores:[{name:"公式テスト店",
  items:[...initial.stores[0].items.slice(0,4),{name:"新しい公式商品",url:item("12345")}]}]};
 const detected=build({input:newProduct,previous:within.snapshot,
   history:tomorrow.history,observed:tomorrow.observed,storeMap:catalog,
   now:new Date("2026-11-06T04:15:00Z")});
 assert.equal(detected.addedCount,1);
 assert.deepEqual(detected.diff.stores[0].added.map(x=>x.name),["新しい公式商品"]);
 const again=build({input:altered,previous:detected.snapshot,
   history:detected.history,observed:detected.observed,storeMap:catalog,
   now:new Date("2026-11-06T04:30:00Z")});
 assert.equal(again.addedCount,0);
 const returned=build({input:newProduct,previous:again.snapshot,
   history:again.history,observed:again.observed,storeMap:catalog,
   now:new Date("2026-11-06T04:45:00Z")});
 assert.equal(returned.addedCount,0);
 assert.equal(returned.history.events.length,1);
});
test("damaged observed URLs and future baseline fail closed",()=>{
 assert.throws(()=>build({input:initial,previous:prev,storeMap:catalog,
  observed:{schemaVersion:1,startedAt:"2026-11-06T00:00:00Z",stores:[]},
  now:new Date("2026-11-05T00:00:00Z")}),/PRODUCT_OBSERVED_STATE_INVALID/);
 assert.throws(()=>build({input:initial,previous:prev,storeMap:catalog,
  observed:{schemaVersion:1,startedAt:"2026-11-03T00:00:00Z",stores:[]},
  now:new Date("2026-11-05T00:00:00Z")}),/PRODUCT_OBSERVED_STORE_MISSING/);
});
