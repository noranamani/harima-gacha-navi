"use strict";
// Separate build output: GitHub Pages and its existing URLs remain untouched.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),out=path.join(root,"dist-cloudflare");
const {execFileSync}=require("node:child_process");
execFileSync(process.execPath,[path.join(root,"scripts/generate-city-pages.cjs")],{cwd:root,stdio:"inherit"});
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files=["index.html","product-updates.html","style.css","stores.js","app.js","favorites.js","store-card-gachas.js","city-gacha-cards.js","product-updates.js","recent-products.js","x-embed.js","timeline-board.js","robots.txt","sitemap.xml"];
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(out,file));
fs.cpSync(path.join(root,"city"),path.join(out,"city"),{recursive:true});
// Live JSON is delivered by the two narrowly routed Pages Functions, never
// baked into the static build. Keep the old canonical until migration approval.
fs.writeFileSync(path.join(out,"_routes.json"),JSON.stringify({version:1,include:["/data/page-status.json","/data/product-links-history.json"],exclude:[]},null,2)+"\n");
fs.writeFileSync(path.join(out,"_headers"),"/*\n  X-Robots-Tag: noindex\n");
fs.writeFileSync(path.join(out,"robots.txt"),"User-agent: *\nAllow: /\n");
console.log("Cloudflare parallel preview prepared; indexing intentionally disabled.");
