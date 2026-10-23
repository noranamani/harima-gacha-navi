"use strict";
const fs=require("node:fs"),vm=require("node:vm"),cp=require("node:child_process"),assert=require("node:assert/strict");
function fail(s){throw Error(s)}
const raw=fs.readFileSync("/tmp/candidate-body.txt","utf8");
if(raw.length>10000)fail("Candidate too large");
let c;try{c=JSON.parse(raw)}catch{fail("Body must be JSON")}
if(c.schemaVersion!==1||!c.store||typeof c.store!=="object")fail("Invalid schema");
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
if(c.dateJst!==today)fail("Candidate must be submitted on current JST day");
const store=c.store;
const allowed=["name","city","address","official","category","description","facility"];
if(Object.keys(store).some(k=>!allowed.includes(k)))fail("Unverified field");
for(const k of ["name","city","address","official","category"]){if(typeof store[k]!=="string"||store[k].length<2||store[k].length>250)fail("Invalid "+k)}
if(!store.address.startsWith("兵庫県")||!store.address.includes(store.city))fail("City and address mismatch");
for(const u of [store.official,c.evidenceUrl]){let x;try{x=new URL(u)}catch{fail("Invalid URL")}if(x.protocol!=="https:"||x.username||x.password||x.port||!x.hostname.includes("."))fail("Unsafe URL")}
if(c.evidenceUrl!==store.official)fail("Evidence URL mismatch");
if(typeof c.evidenceNote!=="string"||c.evidenceNote.length<30||!c.evidenceNote.includes(store.name))fail("Evidence note required");
const file="stores.js",old=fs.readFileSync(file,"utf8"),ctx={window:{}};
vm.runInNewContext(old,ctx,{timeout:1000});const all=Array.from(ctx.window.HARIMA_STORES||[]);
const norm=s=>String(s).normalize("NFKC").replace(/\s+/g,"").toLowerCase();
if(all.some(s=>norm(s.name)===norm(store.name)))fail("Duplicate store");
const gen="scripts/generate-city-pages.cjs",source=fs.readFileSync(gen,"utf8"),match=source.match(/const slugs=(\{[^\n]+\});/);
if(!match)fail("Missing slug config");
const slugs=JSON.parse(match[1]),isNew=!Object.hasOwn(slugs,store.city);
if(isNew){if(today.slice(-2)!=="01")fail("New city only allowed on JST first");if(typeof c.citySlug!=="string"||!/^[a-z][a-z0-9-]{2,30}$/.test(c.citySlug)||Object.values(slugs).includes(c.citySlug))fail("Invalid/duplicate city slug");slugs[store.city]=c.citySlug}
else if(c.citySlug!==undefined&&c.citySlug!==slugs[store.city])fail("Wrong slug");
const next=old.replace(/\n\];\s*$/,",\n"+JSON.stringify(store)+"\n];\n");
if(next===old)fail("Store catalog format changed");fs.writeFileSync(file,next);
if(isNew)fs.writeFileSync(gen,source.replace(match[0],"const slugs="+JSON.stringify(slugs)+";"));
cp.execFileSync("node",["--check",file]);cp.execFileSync("node",["--check",gen]);cp.execFileSync("node",[gen]);
const again={window:{}};vm.runInNewContext(fs.readFileSync(file,"utf8"),again,{timeout:1000});const latest=Array.from(again.window.HARIMA_STORES);
assert.equal(latest.length,all.length+1);
for(let i=0;i<all.length;i++)assert.deepEqual(JSON.parse(JSON.stringify(all[i])),JSON.parse(JSON.stringify(latest[i])));
assert.equal(new Set(latest.map(s=>norm(s.name))).size,latest.length);
const html=fs.readFileSync("city/"+slugs[store.city]+"/index.html","utf8"),sitemap=fs.readFileSync("sitemap.xml","utf8");
assert(html.includes(store.name.replace(/&/g,"&amp;").replace(/</g,"&lt;")));
assert(sitemap.includes("/city/"+slugs[store.city]+"/"));
console.log("VALID:",store.name,store.city,isNew?"new-city":"existing-city");