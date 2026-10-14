"use strict";
(function(){
const button=document.getElementById("show-board"),board=document.getElementById("timeline-board"),city=document.getElementById("board-city"),onlyFavorites=document.getElementById("board-favorites"),count=document.getElementById("board-count");
if(!button||!board||!city||!onlyFavorites)return;
const stores=(window.HARIMA_STORES||[]).filter(store=>store.x);
for(const name of [...new Set(stores.map(s=>s.city))].sort()){const option=document.createElement("option");option.value=name;option.textContent=name;city.append(option)}
function selected(){return stores.filter(s=>(!city.value||s.city===city.value)&&(!onlyFavorites.checked||window.HARIMA_FAVORITES?.has(s.name)))}
function render(){
const matches=selected();if(count)count.textContent="表示対象: "+matches.length+"店舗";
if(button.getAttribute("aria-expanded")!=="true")return;
board.replaceChildren();
if(!matches.length){const empty=document.createElement("p");empty.textContent="該当する公式Xアカウントがありません。お気に入り登録や市町村を確認してください。";board.append(empty);return}
for(const account of matches){
const item=document.createElement("article");item.className="timeline-item";
const heading=document.createElement("h3");heading.textContent=account.name;
const link=document.createElement("a");link.className="twitter-timeline";link.href=account.x;link.textContent="公式Xで投稿を確認";link.setAttribute("data-height","430");
item.append(heading,link);board.append(item)
}
if(window.twttr?.widgets?.load){window.twttr.widgets.load(board)}
else if(!document.querySelector('script[data-x-widgets]')){const script=document.createElement("script");script.src="https://platform.twitter.com/widgets.js";script.async=true;script.dataset.xWidgets="true";document.head.append(script)}
}
button.addEventListener("click",()=>{const open=button.getAttribute("aria-expanded")==="true";button.setAttribute("aria-expanded",String(!open));button.textContent=open?"公式Xをまとめて表示":"まとめ表示を閉じる";board.hidden=open;if(open)board.replaceChildren();else render()});
city.addEventListener("change",render);onlyFavorites.addEventListener("change",render);document.addEventListener("harima:favorites",render);render();
})();
