"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function stores() {
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync("stores.js","utf8"), sandbox, {timeout:1000});
  return sandbox.window.HARIMA_STORES;
}
const corrected=new Map([
 ["TOYS SPOT PALO 姫路大津店","https://www.fantasy.co.jp/shoplist/shop-5052031/"],
 ["TOYS SPOT PALO 明石店","https://www.fantasy.co.jp/shoplist/shop-5991031/"],
 ["TOYS SPOT PALO 姫路大津2号店","https://www.fantasy.co.jp/shoplist/shop-5052032/"],
 ["TOYS SPOT PALO 明石2号店","https://www.fantasy.co.jp/shoplist/shop-5991032/"],
 ["GiGOイオンモール姫路リバーシティー","https://www.gigo.co.jp/shops/a-himeji"],
]);
test("Five 404-prone entries use the matching store operator URL",()=>{
 const entries=stores();
 for(const [name,link] of corrected){
  const matches=entries.filter(s=>s.name===name);
  assert.equal(matches.length,1,"expected one store: "+name);
  assert.equal(matches[0].official,link);
  assert.equal(new URL(link).protocol,"https:");
 }
});
test("Every monitored store retains its name and a unique stable identity",()=>{
 const entries=stores();
 assert.ok(entries.length>=27);
 assert.equal(entries.length,new Set(entries.map(s=>s.name)).size);
 for(const s of entries){
  assert.ok(typeof s.name==="string" && typeof s.city==="string");
 }
});

test("Kobe Nishi has four distinct officially sourced stores",()=>{
 const rows=stores().filter(s=>s.city==="神戸市西区");
 assert.equal(rows.length,4);
 for(const s of rows){assert.ok(s.address.startsWith("兵庫県神戸市西区"));assert.equal(new URL(s.official).protocol,"https:");}
});
