#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("stores.js", "utf8");
const sandbox = {window: {}};
vm.runInNewContext(source, sandbox, {timeout: 1000});
const stores = sandbox.window.HARIMA_STORES;
if (!Array.isArray(stores)) throw new Error("stores.js did not define HARIMA_STORES");
const urls = new Map();
for (const store of stores) {
  for (const field of ["x", "official", "inventory"]) {
    if (!store[field]) continue;
    const url = new URL(store[field]);
    if (url.protocol !== "https:") throw new Error("Non-HTTPS link: " + url.href);
    const refs = urls.get(url.href) || [];
    refs.push(store.name + " (" + field + ")");
    urls.set(url.href, refs);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function probe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {"User-Agent": "HarimaGachaNavi-LinkCheck/1.0 (weekly maintenance)"},
        signal: controller.signal
      });
      // X and some commercial sites block automated checks. Never mark these as broken.
      if ([401, 403, 405, 429].includes(response.status) || response.status >= 500) {
        return {status: "REVIEW", detail: "HTTP " + response.status + " (may block bots)"};
      }
      if (response.status === 404 || response.status === 410) {
        if (attempt === 0) { await sleep(1000); continue; }
        return {status: "BROKEN_CANDIDATE", detail: "HTTP " + response.status + " twice"};
      }
      if (!response.ok) return {status: "REVIEW", detail: "HTTP " + response.status};
      return {status: "OK", detail: "HTTP " + response.status};
    } catch (error) {
      if (attempt === 0) { await sleep(1000); continue; }
      return {status: "REVIEW", detail: error.name === "AbortError" ? "timeout" : String(error.message)};
    } finally {
      clearTimeout(timer);
    }
  }
}
function escapeCell(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
(async () => {
  const results = [];
  for (const [url, refs] of urls) {
    const result = await probe(url);
    results.push({url, refs, ...result});
    console.log(result.status + " " + result.detail + " " + url);
    await sleep(250);
  }
  const counts = Object.fromEntries(["OK", "REVIEW", "BROKEN_CANDIDATE"].map(s => [s, results.filter(r => r.status === s).length]));
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Weekly official link check — " + date,
    "",
    "Checks " + stores.length + " stores / " + results.length + " unique URLs. HTTP results are **not proof of closure or inventory**.",
    "",
    "- OK: " + counts.OK,
    "- Needs manual review (bot blocking, network issues, etc.): " + counts.REVIEW,
    "- Repeated 404/410 (candidate for manual review): " + counts.BROKEN_CANDIDATE,
    "",
    "| Status | Link | Used by | Detail |",
    "|---|---|---|---|"
  ];
  for (const r of results) {
    lines.push("| " + r.status + " | " + escapeCell(r.url) + " | " + escapeCell(r.refs.join(", ")) + " | " + escapeCell(r.detail) + " |");
  }
  fs.mkdirSync("reports", {recursive: true});
  fs.writeFileSync("reports/link-check-latest.md", lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  console.log(JSON.stringify(counts));
})().catch(error => {console.error(error); process.exitCode = 1;});
