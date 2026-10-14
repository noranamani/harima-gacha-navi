"use strict";
(function(){
const button=document.getElementById("show-board"),board=document.getElementById("timeline-board");
if(!button||!board)return;
const accounts=[
{name:"#C-pla ピオレ姫路店",url:"https://x.com/cpla_piolehime"},
{name:"TSUTAYA姫路広峰店",url:"https://x.com/GBO_t_hiromine"}
];
button.addEventListener("click",function(){
const expanded=button.getAttribute("aria-expanded")==="true";
if(expanded){board.replaceChildren();board.hidden=true;button.setAttribute("aria-expanded","false");button.textContent="公式Xをまとめて表示";return}
board.hidden=false;
for(const account of accounts){
const item=document.createElement("article");item.className="timeline-item";
const heading=document.createElement("h3");heading.textContent=account.name;
const link=document.createElement("a");link.className="twitter-timeline";link.href=account.url;link.textContent="公式Xで投稿を確認";link.setAttribute("data-height","430");
item.append(heading,link);board.append(item);
}
button.setAttribute("aria-expanded","true");button.textContent="まとめ表示を閉じる";
if(window.twttr?.widgets?.load){window.twttr.widgets.load(board)}
else if(!document.querySelector('script[data-x-widgets]')){const script=document.createElement("script");script.src="https://platform.twitter.com/widgets.js";script.async=true;script.dataset.xWidgets="true";document.head.append(script)}
});
})();
