// Run with: node scripts/generate-city-pages.cjs
// The catalog is maintained in stores.js. No external data is collected.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,"stores.js"),"utf8"),sandbox,{timeout:1000});
const stores=Array.from(sandbox.window.HARIMA_STORES||[]);
const slugs={"姫路市":"himeji","加古川市":"kakogawa","明石市":"akashi","高砂市":"takasago"};
const base="https://noranamani.github.io/harima-gacha-navi/";
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,'&quot;');
const cities=[...new Set(stores.map(s=>s.city))].filter(city=>slugs[city]).sort();
for(const city of cities){
 const slug=slugs[city],items=stores.filter(s=>s.city===city),url=base+"city/"+slug+"/";
 const cards=items.map(s=>'<article class="card"><span class="city">'+esc(city)+'</span><h3>'+esc(s.name)+'</h3><div class="links">'+(s.x?'<a href="'+esc(s.x)+'" target="_blank" rel="noopener noreferrer">公式X</a>':'')+(s.official?'<a href="'+esc(s.official)+'" target="_blank" rel="noopener noreferrer">公式サイト</a>':'')+'</div></article>').join("");
 const others=cities.filter(c=>c!==city).map(c=>'<a href="../'+slugs[c]+'/">'+esc(c)+'</a>').join(" ・ ");
 const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(city)+'のガチャガチャ店舗・公式X情報 | 播磨ガチャ入荷ナビ</title><meta name="description" content="'+esc(city)+'のガチャガチャ・カプセルトイ店舗'+items.length+'件の公式情報リンク。入荷情報は公式発信で確認できます。"><link rel="canonical" href="'+url+'"><link rel="stylesheet" href="../../style.css"></head><body><header><div class="wrap"><p class="eyebrow">HARIMA GACHA NAVI</p><h1>'+esc(city)+'のガチャガチャ店舗</h1><p>公式X・公式店舗情報へのリンク集</p></div></header><main class="wrap"><p><a href="../../">← トップへ戻る</a></p><section class="intro"><h2>'+esc(city)+'の掲載店舗 '+items.length+'件</h2><p>本サイトは非公式で、在庫・入荷を保証しません。</p><p><a href="../../?city='+encodeURIComponent(city)+'">店舗検索・お気に入り・Xまとめ表示を使う</a></p></section><section class="grid">'+cards+'</section><section class="notice"><h2>他の地域</h2><p>'+others+'</p></section></main><footer><div class="wrap">播磨ガチャ入荷ナビ · 非公式リンク集</div></footer></body></html>\n';
 const dir=path.join(root,"city",slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"index.html"),html);
}
const urls=[base,...cities.map(c=>base+"city/"+slugs[c]+"/")];
fs.writeFileSync(path.join(root,"sitemap.xml"),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'<url><loc>'+u+'</loc></url>').join("\n")+'\n</urlset>\n');
