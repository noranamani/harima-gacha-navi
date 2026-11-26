"use strict";
// Separate build output: GitHub Pages and its existing URLs remain untouched.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),out=path.join(root,"dist-cloudflare");
const {execFileSync}=require("node:child_process");
execFileSync(process.execPath,[path.join(root,"scripts/generate-city-pages.cjs")],{cwd:root,stdio:"inherit"});
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files=["index.html","product-updates.html","guide.html","about.html","privacy.html","style.css","stores.js","app.js","favorites.js","store-card-gachas.js","city-gacha-cards.js","product-updates.js","recent-products.js","x-embed.js","timeline-board.js","robots.txt","sitemap.xml"];
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(out,file));
fs.cpSync(path.join(root,"city"),path.join(out,"city"),{recursive:true});
// Production Pages URLs are self-canonical; GitHub Pages stays available.
const production=process.argv.includes("--production");
const oldBase="https://noranamani.github.io/harima-gacha-navi/",base=production?"https://harima-gacha-navi.pages.dev/":oldBase;
const cityDirs=fs.readdirSync(path.join(out,"city"),{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(out,"city",d.name,"index.html"))).map(d=>d.name);
const paths=["index.html","product-updates.html","guide.html","about.html","privacy.html",...cityDirs.map(d=>"city/"+d+"/index.html")];
const urls=[];
for(const file of paths){
 const suffix=file==="index.html"?"":file.endsWith("/index.html")?file.slice(0,-"index.html".length):file.replace(/\.html$/,"");
 const url=base+(production?suffix:(file.endsWith(".html")&&!file.endsWith("index.html")?file:suffix));urls.push(url);
 const p=path.join(out,file);let html=fs.readFileSync(p,"utf8");
 if(!/<link rel="canonical" href="[^"]+">/.test(html))throw Error("Missing canonical: "+file);
 html=html.replace(/<link rel="canonical" href="[^"]+">/,'<link rel="canonical" href="'+url+'">');
 // Leave all existing relative paths working; append visible navigation.
 const prefix=file.startsWith("city/")?"../../":"";
 if(!html.includes('href="'+prefix+'privacy.html"'))html=html.replace("</footer>",'<div class="wrap"><a href="'+prefix+'guide.html">使い方</a> · <a href="'+prefix+'about.html">運営・お問い合わせ</a> · <a href="'+prefix+'privacy.html">プライバシーポリシー</a></div></footer>');
 fs.writeFileSync(p,html);
}
fs.writeFileSync(path.join(out,"sitemap.xml"),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'<url><loc>'+u+'</loc></url>').join("\n")+'\n</urlset>\n');
// Only data routes consume Functions requests.
fs.writeFileSync(path.join(out,"_routes.json"),JSON.stringify({version:1,include:["/data/page-status.json","/data/product-links-history.json"],exclude:[]},null,2)+"\n");
// Production is indexable; immutable deployment URLs are handled by Pages.
fs.writeFileSync(path.join(out,"_headers"),(production?"/data/*":"/*")+"\n  X-Robots-Tag: noindex\n");
fs.writeFileSync(path.join(out,"robots.txt"),"User-agent: *\nAllow: /\nSitemap: "+base+"sitemap.xml\n");
console.log("Cloudflare "+(production?"production":"preview")+" build: "+urls.length+" canonical URLs.");
