"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
test("Cloudflare output includes city and product pages but not internal files or stale JSON",()=>{
 execFileSync(process.execPath,["scripts/build-cloudflare-pages.cjs"],{cwd:root});
 assert.match(fs.readFileSync(path.join(root,"dist-cloudflare/_headers"),"utf8"),/^\/\*\n/);
 execFileSync(process.execPath,["scripts/build-cloudflare-pages.cjs","--production"],{cwd:root});
 const out=path.join(root,"dist-cloudflare");
 for(const f of ["index.html","city/kobe-nishi/index.html","product-updates.html","stores.js","app.js","sitemap.xml","guide.html","about.html","privacy.html"])assert.ok(fs.existsSync(path.join(out,f)),f);
 assert.equal(fs.existsSync(path.join(out,"data")),false);
 assert.equal(fs.existsSync(path.join(out,".github")),false);
 assert.equal(fs.existsSync(path.join(out,"cloudflare")),false);
 assert.equal(fs.readFileSync(path.join(out,"_headers"),"utf8"),"/data/*\n  X-Robots-Tag: noindex\n".replace(/\n/g,"\n"));
 assert.match(fs.readFileSync(path.join(out,"index.html"),"utf8"),/rel="canonical" href="https:\/\/harima-gacha-navi\.pages\.dev\/"/);
 assert.match(fs.readFileSync(path.join(out,"city/kobe-nishi/index.html"),"utf8"),/harima-gacha-navi\.pages\.dev\/city\/kobe-nishi\//);
 assert.match(fs.readFileSync(path.join(out,"index.html"),"utf8"),/href="privacy.html"/);
 const sitemap=fs.readFileSync(path.join(out,"sitemap.xml"),"utf8");
 assert.ok(sitemap.includes("https://harima-gacha-navi.pages.dev/guide"));
 assert.ok(!sitemap.includes("github.io"));
 assert.match(fs.readFileSync(path.join(out,"robots.txt"),"utf8"),/harima-gacha-navi\.pages\.dev\/sitemap\.xml/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,"_routes.json"),"utf8")).include,["/data/page-status.json","/data/product-links-history.json"]);
});
test("live JSON proxy only permits two public files and reports upstream failures",async()=>{
 const src=fs.readFileSync(path.join(root,"functions/data/[file].js"),"utf8");
 const {onRequest}=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
 const orig=global.fetch;let calls=[];
 const invoke=(file,method="GET")=>onRequest({request:new Request("https://example.test/data/"+file,{method}),params:{file}});
 try{
   global.fetch=async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({schemaVersion:1,pages:{},events:[],lastCheckedAt:new Date().toISOString(),lastComparedAt:new Date().toISOString()}));};
   assert.equal((await invoke("private.json")).status,404);
   assert.equal((await invoke("page-status.json","POST")).status,405);
   assert.equal(calls.length,0);
   const r=await invoke("page-status.json");
   assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"public, max-age=60");
   assert.equal(calls[0].url,"https://raw.githubusercontent.com/noranamani/harima-gacha-navi/main/data/page-status.json");
   assert.equal((await invoke("product-links-history.json")).status,200);
   assert.equal(await (await invoke("page-status.json","HEAD")).text(),"");
   global.fetch=async(url)=>url.startsWith("https://raw.")?new Response("rate limited",{status:429}):new Response(JSON.stringify({schemaVersion:1,pages:{},lastCheckedAt:new Date().toISOString()}));
   assert.equal((await invoke("page-status.json")).status,200);
   global.fetch=async()=>new Response("not json");
   assert.equal((await invoke("page-status.json")).status,503);
   global.fetch=async()=>new Response("rate limited",{status:429});
   const failure=await invoke("product-links-history.json");assert.equal(failure.status,503);assert.equal(failure.headers.get("cache-control"),"no-store");
 }finally{global.fetch=orig;}
});
