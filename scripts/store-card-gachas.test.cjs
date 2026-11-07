"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const {byStore,attach,safeOfficialProductUrl}=require("../store-card-gachas.js");

const NOW=Date.now(); // General attachment tests must use fresh data at execution time.
const productUrl=id=>"https://bandainamco-am.co.jp/others/gashapon-bandai-officialshop/item/item_details.html?product_code="+id;
const event=(store,id,when=NOW-60000)=>({
  store,name:"ガチャ "+id,url:productUrl(id),detectedAt:new Date(when).toISOString()
});

class Node{
  constructor(tag){this.tag=tag;this.children=[];this.props={};this.textContent="";this.parentNode=null;}
  get isConnected(){return this.parentNode?this.parentNode.isConnected:this.tag==="article";}
  append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children){
    for(const child of this.children)child.parentNode=null;
    this.children=[];
    this.append(...children);
  }
  remove(){
    if(!this.parentNode)return;
    const parent=this.parentNode,index=parent.children.indexOf(this);
    if(index>=0)parent.children.splice(index,1);
    this.parentNode=null;
  }
  setAttribute(name,value){this.props[name]=value;}
  querySelector(selector){
    const cls=selector.startsWith(".")?selector.slice(1):"";
    if(this.className?.split(" ").includes(cls))return this;
    for(const child of this.children){
      const found=child.querySelector?.(selector);
      if(found)return found;
    }
    return null;
  }
  insertBefore(node,before){
    const index=this.children.indexOf(before);
    if(index<0)throw Error("not a child");
    node.parentNode=this;this.children.splice(index,0,node);
  }
}
const doc={createElement:tag=>new Node(tag)};
function walk(node,fn){
  fn(node);
  for(const child of node.children)walk(child,fn);
}

test("recent history groups by exact store and ignores untrusted, old and future entries",()=>{
 const events=[
  event("未来屋書店加古川店",1,NOW-60000),
  event("未来屋書店明石店",2,NOW-120000),
  event("未来屋書店加古川店",1,NOW-240000), // identical link: once per card
  event("未来屋書店加古川店",3,NOW-31*86400000),
  event("未来屋書店加古川店",4,NOW+60000),
  {...event("未来屋書店加古川店",5),url:"javascript:alert(1)"},
  {...event("未来屋書店加古川店",6),url:"https://bandainamco-am.co.jp.evil.example/item_details.html?product_code=6"},
  {...event("未来屋書店加古川店",7),url:"https://bandainamco-am.co.jp/other/"}
 ];
 const grouped=byStore({schemaVersion:1,events},NOW);
 assert.deepEqual([...grouped.keys()],["未来屋書店加古川店","未来屋書店明石店"]);
 assert.deepEqual(grouped.get("未来屋書店加古川店").map(x=>x.name),["ガチャ 1"]);
 assert.equal(grouped.get("未来屋書店明石店")[0].name,"ガチャ 2");
 assert.equal(safeOfficialProductUrl(productUrl(10)),true);
 assert.equal(safeOfficialProductUrl("https://evil.example/item_details.html?product_code=10"),false);
});
test("invalid history does not fabricate card data",()=>{
 assert.throws(()=>byStore({schemaVersion:1},NOW),/HISTORY_INVALID/);
 assert.throws(()=>byStore({schemaVersion:2,events:[]},NOW),/HISTORY_INVALID/);
 assert.deepEqual([...byStore({schemaVersion:1,events:[]},NOW)],[]);
});
test("one to three product names appear as official links directly inside the correct card",()=>{
 const card=new Node("article");
 const heading=new Node("h3");heading.textContent="未来屋書店加古川店";
 const links=new Node("div");links.className="links";
 card.append(heading,links);
 assert.equal(attach(card,[event("未来屋書店加古川店",1),event("未来屋書店加古川店",2)],doc),true);
 const group=card.querySelector(".card-new-gachas");
 assert(group);
 assert.equal(card.children.indexOf(group)<card.children.indexOf(links),true);
 const names=[];let linksCount=0;
 walk(group,n=>{if(n.tag==="a"){names.push(n.textContent);assert.equal(n.rel,"noopener noreferrer");assert.equal(n.target,"_blank");assert.equal(n.href.startsWith("https://bandainamco-am.co.jp/"),true);linksCount++;}});
 assert.deepEqual(names,["ガチャ 1","ガチャ 2"]);
 assert.equal(linksCount,2);
 assert.equal(group.children.some(n=>n.tag==="details"),false);
 assert.equal(attach(card,[event("未来屋書店加古川店",1)],doc),false);
});
test("more than three product names are expandable within the same card",()=>{
 const card=new Node("article"),links=new Node("div");links.className="links";card.append(links);
 assert.equal(attach(card,[1,2,3,4,5].map(id=>event("同じ店舗",id)),doc),true);
 const group=card.querySelector(".card-new-gachas");
 const details=group.children.find(n=>n.tag==="details");
 assert(details);
 assert.match(details.children[0].textContent,/ほか 2件を表示/);
 let count=0;walk(group,n=>{if(n.tag==="a")count++;});
 assert.equal(count,5);
});
test("empty data never creates a fake new-products section",()=>{
 const card=new Node("article");
 assert.equal(attach(card,[],doc),false);
 assert.equal(card.querySelector(".card-new-gachas"),null);
});
test("new product cards show both date and detection time in JST including midnight rollover",()=>{
 const script=fs.readFileSync(path.resolve(__dirname,"../store-card-gachas.js"),"utf8");
 const frozen=Date.parse("2026-11-05T15:50:00Z");
 class TestClock extends Date{static now(){return frozen;}}
 const fakeWindow={setTimeout:()=>1};
 vm.runInNewContext(script,{window:fakeWindow,Date:TestClock,Intl,URL});
 const card=new Node("article"),links=new Node("div");links.className="links";card.append(links);
 const moments=[
   Date.parse("2026-11-05T14:59:00Z"), // JST 2026/11/05 23:59
   Date.parse("2026-11-05T15:02:00Z"), // JST 2026/11/06 00:02
   Date.parse("2026-11-05T15:15:00Z"),
   Date.parse("2026-11-05T15:30:00Z")
 ];
 assert.equal(fakeWindow.HARIMA_GACHA_CARDS.attach(card,moments.map((when,i)=>event("同じ店舗",i+1,when)),doc),true);
 const labels=[];
 walk(card.querySelector(".card-new-gachas"),node=>{
   if(node.tag==="small"&&node.textContent.endsWith(" 検出"))labels.push(node.textContent);
 });
 assert.deepEqual(labels,[
   "2026/11/05 23:59 検出",
   "2026/11/06 00:02 検出",
   "2026/11/06 00:15 検出",
   "2026/11/06 00:30 検出"
 ]);
});

test("exact eight-hour visibility boundary, future stamps, and store-specific links",()=>{
 const h=3600000;
 const group=byStore({schemaVersion:1,events:[
   event("店舗A",1,NOW-8*h+1),
   event("店舗A",2,NOW-8*h),
   event("店舗A",3,NOW-8*h-1),
   event("店舗B",4,NOW-1),
   event("店舗B",5,NOW+1),
   event("店舗B",4,NOW-9*h) // older duplicate must not extend visibility
 ]},NOW);
 assert.deepEqual(group.get("店舗A").map(e=>e.name),["ガチャ 1"]);
 assert.deepEqual(group.get("店舗B").map(e=>e.name),["ガチャ 4"]);
 assert.equal(byStore({schemaVersion:1,events:[event("店舗A",1,NOW-8*h)]},NOW).size,0);
 const card=new Node("article");card.append(new Node("div"));
 assert.equal(attach(card,[event("店舗A",1,NOW-8*h)],doc),false);
 assert.equal(card.querySelector(".card-new-gachas"),null);
});

test("a card left open expires item by item, updates its count and eventually disappears",()=>{
 const script=fs.readFileSync(path.resolve(__dirname,"../store-card-gachas.js"),"utf8");
 const base=Date.parse("2026-11-07T00:00:00Z"),h=3600000;
 let now=base;
 class TestClock extends Date{static now(){return now;}}
 const timers=[],fakeWindow={setTimeout: (fn,delay)=>{timers.push({fn,delay});return timers.length;}};
 vm.runInNewContext(script,{window:fakeWindow,Date:TestClock,Intl,URL});
 const api=fakeWindow.HARIMA_GACHA_CARDS;
 const card=new Node("article"),links=new Node("div");links.className="links";card.append(links);
 const entries=[event("店舗A",1,base-7*h),event("店舗A",2,base-5.5*h)];
 assert.equal(api.attach(card,entries,doc),true);
 let group=card.querySelector(".card-new-gachas");
 assert.equal(group.children[0].textContent,"新規掲載のガチャ（2件）");
 assert.equal(timers.length,1);
 assert.equal(timers[0].delay,h+1);
 now=base+h+1;
 timers.shift().fn();
 assert.equal(group.children[0].textContent,"新規掲載のガチャ（1件）");
 const itemNames=[];walk(group,n=>{if(n.tag==="a")itemNames.push(n.textContent);});
 assert.deepEqual(itemNames,["ガチャ 2"]);
 assert.equal(timers.length,1);
 now=base+3*h;
 timers.shift().fn();
 assert.equal(card.querySelector(".card-new-gachas"),null);
 assert.equal(timers.length,0);
 assert.equal(api.attach(card,entries,doc),false); // older data cannot reappear
});
