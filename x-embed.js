"use strict";
(function(){
  const container=document.getElementById("stores");
  if(!container)return;
  container.addEventListener("click",function(event){
    const button=event.target.closest(".embed-toggle");
    if(!button)return;
    const card=button.closest(".card");
    const holder=card.querySelector(".embed-holder");
    if(!holder)return;
    const open=button.getAttribute("aria-expanded")==="true";
    if(open){holder.replaceChildren();holder.hidden=true;button.setAttribute("aria-expanded","false");button.textContent="公式Xの投稿を表示";return;}
    const url=button.dataset.url;
    if(!/^https:\/\/x\.com\/[A-Za-z0-9_]+$/.test(url||""))return;
    holder.hidden=false;
    const link=document.createElement("a");link.className="twitter-timeline";link.href=url;link.textContent="公式Xを開く";link.setAttribute("data-height","420");
    holder.append(link);button.setAttribute("aria-expanded","true");button.textContent="投稿表示を閉じる";
    if(window.twttr&&window.twttr.widgets){window.twttr.widgets.load(holder);}
    else if(!document.querySelector('script[data-x-widgets]')){const script=document.createElement("script");script.src="https://platform.twitter.com/widgets.js";script.async=true;script.dataset.xWidgets="true";document.head.append(script);}
  });
})();
