"use strict";
// Read-only public endpoint verification. No Cloudflare credentials.
const assert=require("node:assert/strict");
const base="https://harima-gacha-navi.pages.dev/";
const raw="https://raw.githubusercontent.com/noranamani/harima-gacha-navi/main/data/";
const get=async url=>{
 const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{"Cache-Control":"no-cache"}});
 assert.equal(r.status,200,url);return r;
};
(async()=>{
 const production=process.argv.includes("--production");
 const main=await get(base);
 const html=await main.text();
 assert.match(html,/播磨ガチャ入荷ナビ/);
 const city=await get(base+"city/kobe-nishi/");
 assert.match(await city.text(),/神戸市西区/);
 for(const [name,key] of [["page-status.json","lastCheckedAt"],["product-links-history.json","lastComparedAt"]]){
  const source=await (await get(raw+name)).json();
  const redirect=await fetch(base+"data/"+name,{redirect:"manual",signal:AbortSignal.timeout(20000)});
  assert.equal(redirect.status,302,name+" not served by static redirect");
  assert.equal(redirect.headers.get("location"),raw+name,name+" unexpected destination");
  const response=await fetch(base+"data/"+name,{headers:{Origin:base.slice(0,-1)},signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,name+" live fetch");
  assert.ok(["*",base.slice(0,-1)].includes(response.headers.get("access-control-allow-origin")),name+" CORS is not available to site browsers");
  const live=await response.json();
  assert.equal(live.schemaVersion,1);
  assert.ok(name==="page-status.json"?live.pages&&typeof live.pages==="object":Array.isArray(live.events),name+" invalid structure");

  const a=Date.parse(source[key]),b=Date.parse(live[key]);
  assert.ok(Number.isFinite(a)&&Number.isFinite(b),name+" missing timestamp");
  const lag=(a-b)/60000;
  console.log(JSON.stringify({file:name,github:source[key],cloudflare:live[key],lagMinutes:lag}));
  assert.ok(Math.abs(lag)<=20,name+" differs by more than one expected quarter-hour update plus margin");
  assert.ok(Date.now()-b<60*60000,name+" live data older than 60 minutes");
 }
 if(production){
  assert.ok(!/noindex/i.test(main.headers.get("x-robots-tag")||""),"Production noindex still enabled");
  assert.ok(html.includes('rel="canonical" href="'+base+'"'),"Production canonical not deployed");
  assert.match(html,/privacy\.html/);
  for(const p of ["guide","about","privacy"])await get(base+p);
  const map=await (await get(base+"sitemap.xml")).text();
  assert.ok(map.includes(base+"city/kobe-nishi/")&&!map.includes("github.io"),"Production sitemap not deployed");
 }
 console.log("Cloudflare public read-only verification passed");
})().catch(e=>{console.error(e.message);process.exitCode=1;});
