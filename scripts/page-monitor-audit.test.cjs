"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {audit, markdown} = require("./page-monitor-audit.cjs");
const NOW = new Date("2026-11-05T12:00:00.000Z");
const sample = (status = "OBSERVED", extras = {}) => ({
  schemaVersion:1,lastCheckedAt: NOW.toISOString(),
  pages:{"https://official.example/item/":{name:"公式テスト店",status,...extras}}
});
function runs(count = 96, stepMins = 15) {
  return {workflow_runs: Array.from({length: count}, (_, i) => ({
    name:"Check official page metadata",head_branch:"main",
    event:"schedule",conclusion:"success",
    created_at:new Date(NOW.getTime() - (count - i - 1)*stepMins*60000).toISOString()
  }))};
}
test("complete quarter-hour runs and observed page are healthy", () => {
  const x = audit({status:sample(),runs:runs(),now:NOW});
  assert.equal(x.successfulInspections, 96);
  assert.equal(x.largestGapMinutes,15);
  assert.equal(x.alert,false);
  assert.equal(x.persistentUnavailable.length,0);
  assert.match(markdown(x),/正常/);
});
test("seven green runs in 24 hours must not be declared 15-minute coverage", () => {
  const x=audit({status:sample(),runs:runs(7,180),now:NOW});
  assert.equal(x.alert,true);
  assert.match(x.warnings.join(" "),/ONLY_7_SUCCESSFUL_CHECKS/);
  assert(x.largestGapMinutes>90);
});
test("repeated unavailable page triggers independent alert", () => {
  const x=audit({status:sample("UNAVAILABLE",{
    firstUnavailableAt:"2026-11-05T04:00:00Z",consecutiveUnavailable:8,
    lastErrorCode:"HTTP_403"}),runs:runs(),now:NOW});
  assert.equal(x.alert,true);
  assert.equal(x.persistentUnavailable.length,1);
  assert.equal(x.persistentUnavailable[0].code,"HTTP_403");
});
test("first unavailable attempt should not alert even if last successful metadata was weeks ago", () => {
  const x=audit({status:sample("UNAVAILABLE",{consecutiveUnavailable:1,
    firstUnavailableAt:"2026-11-05T11:50:00Z"}),runs:runs(),now:NOW});
  assert.equal(x.alert,false);
});
test("stale source, wrong branch, skipped runs and malformed report are not healthy", () => {
  const a=runs();a.workflow_runs.forEach(r => {r.conclusion="skipped";r.head_branch="feature";});
  const x=audit({status:{...sample(),lastCheckedAt:"2026-11-05T02:00:00Z"},runs:a,now:NOW});
  assert.equal(x.successfulInspections,0);
  assert.match(x.warnings.join(" "),/PAGE_STATUS_STALE/);
  assert.throws(()=>audit({status:null,runs:a,now:NOW}),/INPUT_INVALID/);
});
