"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),vm=require("node:vm"),assert=require("node:assert/strict");
const env=process.env,repo=env.REPO,branch=env.CI_BRANCH,sha=env.CI_SHA;
function gh(path){return JSON.parse(cp.execFileSync("gh",["api",path],{encoding:"utf8"}));}
function run(...args){return cp.execFileSync("git",args,{encoding:"utf8"}).trim();}
function fail(s){throw Error("AUTOMERGE BLOCKED: "+s);}
const match=/^auto\/candidate-issue-(\d+)$/.exec(branch||"");
if(!match||!(/^[0-9a-f]{40}$/.test(sha||"")))fail("Unexpected branch or SHA");
const issueNo=Number(match[1]);
const issue=gh("repos/"+repo+"/issues/"+issueNo);
if(issue.pull_request||issue.user.login!==repo.split("/")[0]||!issue.title.startsWith("[STORE CANDIDATE]"))fail("Candidate issue not authorized");
const prList=gh("repos/"+repo+"/pulls?state=open&per_page=100");
const found=prList.filter(p=>p.head.ref===branch&&p.base.ref==="main");
if(found.length!==1)fail("Expected exactly one open PR for branch");
const pr=gh("repos/"+repo+"/pulls/"+found[0].number);
if(pr.draft||pr.head.sha!==sha||pr.head.repo.full_name!==repo||pr.base.ref!=="main")fail("PR head does not match independent CI");
const tested=gh("repos/"+repo+"/actions/runs/"+env.CI_RUN);
if(tested.event!=="workflow_dispatch"||tested.status!=="completed"||tested.conclusion!=="success"||tested.head_sha!==sha||tested.head_branch!==branch||tested.name!=="Validate store catalog")fail("Independent workflow dispatch did not pass on head SHA");
let candidate;try{candidate=JSON.parse(issue.body||"")}catch{fail("Invalid candidate JSON")}
if(candidate.schemaVersion!==1||!candidate.store||candidate.evidenceUrl!==candidate.store.official)fail("Official evidence metadata mismatch");
const s=candidate.store;
if(!s.name||!s.city||!s.address||!/^https:\/\//.test(s.official)||typeof candidate.evidenceNote!=="string"||!candidate.evidenceNote.includes(s.name))fail("Missing candidate evidence");
run("fetch","origin","main",branch);
const main=run("rev-parse","origin/main"),head=run("rev-parse","origin/"+branch);
if(head!==sha)fail("Branch moved after CI");
const changed=run("diff","--name-only",main,head).split("\n").filter(Boolean);
if(changed.length===0||changed.some(p=>!["stores.js","scripts/generate-city-pages.cjs"].includes(p)))fail("Unexpected changed files");
function file(ref,path){return cp.execFileSync("git",["show",ref+":"+path],{encoding:"utf8"});}
function catalog(source){const ctx={window:{}};vm.runInNewContext(source,ctx,{timeout:1000});return Array.from(ctx.window.HARIMA_STORES||[]).map(x=>JSON.parse(JSON.stringify(x)));}
const before=catalog(file(main,"stores.js")),after=catalog(file(head,"stores.js"));
if(after.length!==before.length+1)fail("Unexpected store count");
for(let i=0;i<before.length;i++)assert.deepEqual(after[i],before[i],"Existing store changed");
assert.deepEqual(after[after.length-1],s,"New store differs from candidate");
const norm=x=>x.normalize("NFKC").replace(/\s+/g,"").toLowerCase();
if(new Set(after.map(x=>norm(x.name))).size!==after.length)fail("Duplicate store name");
const gs=file(head,"scripts/generate-city-pages.cjs");
const m=gs.match(/const slugs=(\{[^\n]+\});/);
if(!m||!Object.hasOwn(JSON.parse(m[1]),s.city))fail("City slug missing");
if(changed.includes("scripts/generate-city-pages.cjs")&&!String(candidate.dateJst||"").endsWith("-01"))fail("City expansion outside monthly date");
const current=gh("repos/"+repo+"/git/ref/heads/main").object.sha;
if(current!==main)fail("Main advanced; revalidate against newest main");
fs.appendFileSync(env.GITHUB_OUTPUT,"pr_number="+pr.number+"\nhead_sha="+sha+"\n");
console.log("Validated candidate issue #"+issueNo+", PR #"+pr.number+", CI "+env.CI_RUN+", SHA "+sha);
