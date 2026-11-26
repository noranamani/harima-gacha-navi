// Read-only public data. Two fixed upstreams; never accept arbitrary URLs.
const allowed=new Set(["page-status.json","product-links-history.json"]);
const origins=["https://raw.githubusercontent.com/noranamani/harima-gacha-navi/main/data/","https://noranamani.github.io/harima-gacha-navi/data/"];
function valid(body,file){
 if(!body||typeof body!=="object"||Array.isArray(body)||body.schemaVersion!==1)return false;
 if(file==="page-status.json")return !!body.pages&&typeof body.pages==="object"&&!Array.isArray(body.pages)&&Number.isFinite(Date.parse(body.lastCheckedAt));
 return Array.isArray(body.events)&&Number.isFinite(Date.parse(body.lastComparedAt));
}
export async function onRequest({request,params}){
 const file=params.file;
 if(!allowed.has(file))return new Response("Not found",{status:404});
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
 const headers={"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex"};
 const failures=[];
 for(const origin of origins){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   // Standard fetch and AbortController avoid runtime-specific fetch options.
   const response=await fetch(origin+file,{method:"GET",redirect:"error",signal:controller.signal});
   if(!response.ok){failures.push("upstream_http_"+response.status);continue;}
   const text=await response.text();
   if(text.length>8*1024*1024){failures.push("oversized");continue;}
   let body;
   try{body=JSON.parse(text);}catch{failures.push("invalid_json");continue;}
   if(!valid(body,file)){failures.push("invalid_schema");continue;}
   const timestamp=Date.parse(file==="page-status.json"?body.lastCheckedAt:body.lastComparedAt);
   if(Date.now()-timestamp>60*60000||timestamp>Date.now()+5*60000){failures.push("stale_or_future");continue;}
   return new Response(request.method==="HEAD"?null:text,{headers:{...headers,"Cache-Control":"public, max-age=60"}});
  }catch(e){failures.push(e?.name==="AbortError"?"timeout":"network_error");}
  finally{clearTimeout(timer);}
 }
 return new Response(JSON.stringify({error:"live_data_unavailable",reasons:failures}),{status:503,headers:{...headers,"Cache-Control":"no-store","Retry-After":"60"}});
}
