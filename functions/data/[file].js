// The only dynamic Cloudflare routes. No secrets, no arbitrary proxy URLs,
// no official-store scraping and no note writes.
const allowed=new Set(["page-status.json","product-links-history.json"]);
const origin="https://raw.githubusercontent.com/noranamani/harima-gacha-navi/main/data/";
export async function onRequest({request,params}){
  const file=params.file;
  if(!allowed.has(file))return new Response("Not found",{status:404});
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const headers={"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex"};
  const fail=()=>new Response(JSON.stringify({error:"live_data_unavailable"}),{status:503,headers:{...headers,"Cache-Control":"no-store","Retry-After":"60"}});
  try{
    const r=await fetch(origin+file,{method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),cf:{cacheEverything:true,cacheTtlByStatus:{"200-299":60,"400-599":0}}});
    if(!r.ok)return fail();
    const text=await r.text();
    if(text.length>8*1024*1024)return fail();
    const body=JSON.parse(text);
    if(!body||typeof body!=="object"||Array.isArray(body))return fail();
    if(file==="page-status.json"&&(!body.pages||typeof body.pages!=="object"||Array.isArray(body.pages)))return fail();
    return new Response(request.method==="HEAD"?null:text,{headers:{...headers,"Cache-Control":"public, max-age=60"}});
  }catch{return fail();}
}
