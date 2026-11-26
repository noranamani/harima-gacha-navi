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
 assert.equal(fs.existsSync(path.join(out,"_routes.json")),false);
 assert.equal(fs.existsSync(path.join(root,"functions/data/[file].js")),false);
 const redirects=fs.readFileSync(path.join(out,"_redirects"),"utf8").trim().split("\n");
 assert.deepEqual(redirects,["page-status.json","product-links-history.json"].map(f=>"/data/"+f+" https://raw.githubusercontent.com/noranamani/harima-gacha-navi/main/data/"+f+" 302"));

});
