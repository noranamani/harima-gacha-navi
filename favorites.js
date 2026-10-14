"use strict";
(function(){
const key="harima-gacha-favorites-v1";
const valid=new Set((window.HARIMA_STORES||[]).map(s=>s.name));
let saved=[];
try{const data=JSON.parse(localStorage.getItem(key)||"[]");if(Array.isArray(data))saved=data.filter(v=>typeof v==="string"&&valid.has(v))}catch(_){}
const favorites=new Set(saved);
function persist(){try{localStorage.setItem(key,JSON.stringify([...favorites]))}catch(_){}}
window.HARIMA_FAVORITES={
has:name=>favorites.has(name),
toggle:name=>{if(!valid.has(name))return false;if(favorites.has(name))favorites.delete(name);else favorites.add(name);persist();document.dispatchEvent(new Event("harima:favorites"));return favorites.has(name)},
count:()=>favorites.size
};
})();
