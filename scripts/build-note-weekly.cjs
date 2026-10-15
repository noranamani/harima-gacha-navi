#!/usr/bin/env node
"use strict";
// Weekly store-list change digest. Does not scrape X, assert inventory or publish to note.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const latest = path.join(root, "note", "latest");
const stateFile = path.join(root, "note", "store-snapshot.json");
const script = fs.readFileSync(path.join(root, "stores.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(script, sandbox, {timeout: 1000});
const stores = Array.from(sandbox.window.HARIMA_STORES || []);
const clean = {};
for (const p of stores) {
  if (!p.name || !p.city || !String(p.official || "").startsWith("https://")) continue;
  const key = p.city + "|" + p.name;
  clean[key] = {name: p.name, city: p.city, official: p.official, facility: p.facility || ""};
}
const previous = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
const changes = previous ? Object.entries(clean).filter(([k, v]) => !previous[k] || JSON.stringify(previous[k]) !== JSON.stringify(v)) : [];
const now = new Date();
const jstDay = new Date(now.toLocaleString("en-US", {timeZone:"Asia/Tokyo"}));
const jan4 = new Date(Date.UTC(jstDay.getFullYear(), 0, 4));
const d = new Date(Date.UTC(jstDay.getFullYear(), jstDay.getMonth(), jstDay.getDate()));
const dow = (d.getUTCDay() + 6) % 7;
const thu = new Date(d.getTime() + (3 - dow) * 86400000);
const weekYear = thu.getUTCFullYear();
const firstThu = new Date(Date.UTC(weekYear,0,4));
const firstDow = (firstThu.getUTCDay()+6)%7;
const week = Math.round((thu - new Date(firstThu.getTime()+(3-firstDow)*86400000))/604800000)+1;
const issueKey = weekYear + "-W" + String(week).padStart(2,"0");
const ready = changes.length > 0;
fs.mkdirSync(latest, {recursive:true});
const title = `播磨ガチャ入荷ナビ｜店舗情報の更新まとめ（${issueKey}）`;
const manifest = {schema_version:1, site_id:"gacha", issue_key:issueKey, status:ready?"ready":"skip", title, article_path:"article.md", cover_path:null, source_url:"https://noranamani.github.io/harima-gacha-navi/", generated_at:now.toISOString()};
if (ready) {
  const lines = ["# "+title, "", "公式サイトの掲載情報に基づく店舗情報の変更をまとめました。商品入荷・在庫状況を確認したものではありません。", ""];
  for (const [key, store] of changes) {
    lines.push("## "+(previous[key]?"掲載情報の変更":"掲載店舗の追加")+"： "+store.name, "地域："+store.city, "施設："+(store.facility||"未確認"), "店舗公式ページ："+store.official, "");
  }
  lines.push("商品の入荷・在庫状況は各店舗の公式情報でご確認ください。", "", "店舗検索サイト："+manifest.source_url);
  fs.writeFileSync(path.join(latest,"article.md"), lines.join("\n")+"\n");
}
fs.writeFileSync(path.join(latest,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
fs.writeFileSync(stateFile,JSON.stringify(clean,null,2)+"\n");
console.log(manifest.status+": "+changes.length+" changes");
