"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {byStore,attach,safeOfficialProductUrl}=require("../store-card-gachas.js");

const NOW=Date.parse("2026-11-05T02:30:00Z");
const productUrl=id=>"https://bandainamco-am.co.jp/others/gashapon-bandai-officialshop/item/item_details.html?product_code="+id;
const event=(store,id,when=NOW-60000)=>({
  store,name:"ガチャ "+id,url:productUrl(id),detectedAt:new Date(when).toISOString()
});

class Node{
  constructor(tag){this.tag=tag;this.children=[];this.props={};this.textContent="";}
  append(...children){this.children.push(...children);}
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
    this.children.splice(index,0,node);
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
 const card=new Node("article"),links=new Node("div");links.className="links";card.append(links);
 const moments=[
   Date.parse("2026-11-05T14:59:00Z"), // JST 2026/11/05 23:59
   Date.parse("2026-11-05T15:02:00Z"), // JST 2026/11/06 00:02
   Date.parse("2026-11-05T15:15:00Z"),
   Date.parse("2026-11-05T15:30:00Z")
 ];
 assert.equal(attach(card,moments.map((when,i)=>event("同じ店舗",i+1,when)),doc),true);
 const labels=[];
 walk(card.querySelector(".card-new-gachas"),node=>{
   if(node.tag==="small"&&node.textContent.includes("検出"))labels.push(node.textContent);
 });
 assert.deepEqual(labels,[
   "2026/11/05 23:59 検出",
   "2026/11/06 00:02 検出",
   "2026/11/06 00:15 検出",
   "2026/11/06 00:30 検出"
 ]);
});
