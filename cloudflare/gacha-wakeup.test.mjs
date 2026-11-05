import test from "node:test";
import assert from "node:assert/strict";
import {safeWakeup} from "./gacha-wakeup.mjs";
const CRON="7,22,37,52 * * * *";
const T=Date.parse("2026-11-05T12:07:00.000Z");
const valid={GACHA_WAKEUP_ENABLED:"true",GACHA_GITHUB_TOKEN:"placeholder_test_only"};
const record=(when,event="schedule")=>({
  head_branch:"main",event,
  created_at:new Date(when).toISOString()
});
function mock(rows=[]) {
  const seen=[];
  const fetcher=async (url,opts)=>{
    seen.push({url,opts});
    if(opts.method==="GET")return {status:200,json:async()=>({workflow_runs:rows})};
    return {status:204};
  };
  return {fetcher,seen};
}
test("default disabled never reads or writes GitHub",async()=>{
  const f=mock();
  assert.deepEqual(await safeWakeup({env:{},nowMs:T,cron:CRON,fetcher:f.fetcher}),
    {status:"disabled"});
  assert.equal(f.seen.length,0);
});
test("wrong scheduled cron and missing token fail closed",async()=>{
  const f=mock();
  assert.equal((await safeWakeup({env:valid,nowMs:T,cron:"* * * * *",fetcher:f.fetcher})).status,
    "unexpected_cron");
  await assert.rejects(safeWakeup({env:{GACHA_WAKEUP_ENABLED:"true"},
    nowMs:T,cron:CRON,fetcher:f.fetcher}),/TOKEN_MISSING/);
  assert.equal(f.seen.length,0);
});
test("recent schedule or dispatch, including failure, prevents duplicate",async()=>{
  for(const ev of ["schedule","workflow_dispatch"]){
    const f=mock([record(T-3*60000,ev)]);
    assert.equal((await safeWakeup({env:valid,nowMs:T,cron:CRON,
      fetcher:f.fetcher})).status,"existing_recent_run");
    assert.equal(f.seen.length,1);
  }
});
test("stale runs trigger existing workflow only; hourly minute refreshes products",async()=>{
  const f=mock([record(T-15*60000)]);
  const x=await safeWakeup({env:valid,nowMs:T,cron:CRON,fetcher:f.fetcher});
  assert.deepEqual(x,{status:"requested",product_refresh:true});
  assert.equal(f.seen.length,2);
  assert.match(f.seen[1].url,/page-updates.yml\/dispatches$/);
  assert.equal(f.seen[1].opts.method,"POST");
  assert.deepEqual(JSON.parse(f.seen[1].opts.body),{
    ref:"main",inputs:{trigger_source:"cloudflare_backup",product_refresh:"true"}
  });
  const second=mock();
  const t=Date.parse("2026-11-05T12:22:00Z");
  assert.equal((await safeWakeup({env:valid,nowMs:t,cron:CRON,
    fetcher:second.fetcher})).product_refresh,false);
  assert.equal(JSON.parse(second.seen[1].opts.body).inputs.product_refresh,"false");
});
test("invalid, unavailable or unauthorized GitHub run list never dispatches",async()=>{
  for (const response of [
    {status:401},{status:200,json:async()=>({})}
  ]){
    const seen=[];
    await assert.rejects(safeWakeup({env:valid,nowMs:T,cron:CRON,
      fetcher:async (url,opts)=>{seen.push(opts.method);return response;}}));
    assert.deepEqual(seen,["GET"]);
  }
});
test("failed POST surfaces error without reissuing another request",async()=>{
  const f=mock();
  const called=[];
  await assert.rejects(safeWakeup({env:valid,nowMs:T,cron:CRON,
    fetcher:async(url,opts)=>{
      called.push(opts.method);
      return opts.method==="GET"?{status:200,json:async()=>({workflow_runs:[]})}:{status:403};
    }}),/DISPATCH_HTTP_403/);
  assert.deepEqual(called,["GET","POST"]);
});
