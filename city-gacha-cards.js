"use strict";
/* Region pages contain pre-generated cards; attach the same store-specific
 * factual product names when the approved link history has additions.
 */
(async()=>{
  if(!window.HARIMA_GACHA_CARDS)return;
  try{
    const response=await fetch("../../data/product-links-history.json",{cache:"no-store"});
    if(!response.ok)return;
    const history=await response.json();
    const entries=window.HARIMA_GACHA_CARDS.byStore(history);
    for(const card of document.querySelectorAll(".card[data-store-name]")){
      const name=card.dataset.storeName;
      window.HARIMA_GACHA_CARDS.attach(card,entries.get(name)||[],document);
    }
  }catch{
    // A missing history must not prevent a city page from displaying stores.
  }
})();
