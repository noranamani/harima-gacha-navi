#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const source = fs.readFileSync("stores.js", "utf8");
const sandbox = {window: {}};
vm.runInNewContext(source, sandbox, {timeout: 1000});
const stores = sandbox.window.HARIMA_STORES;
const file = "data/page-status.json";
let previous = {pages: {}};
try { previous = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
const pages = {};
const now = new Date().toISOString();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function extractText(html) {
  // Strip volatile scripts, styles, comments and markup. Avoid tracking counters, tokens and query strings.
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return main.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 150000);
}
async function inspect(url, monitorContent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {method: "GET", redirect: "follow", signal: controller.signal,
      headers: {"User-Agent": "HarimaGachaNavi-MetadataCheck/1.0"}});
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 500000);
    const match = html.match(/最終更新日[：:\s\u00a0]*(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    const publishedUpdate = match ? [match[1], match[2].padStart(2,"0"), match[3].padStart(2,"0")].join("-") + " " + match[4].padStart(2,"0") + ":" + match[5] : null;
    const lastModified = response.headers.get("last-modified");
    const etag = response.headers.get("etag");
    const content = monitorContent ? extractText(html) : "";
    const contentHash = content.length >= 80 ? crypto.createHash("sha256").update(content).digest("hex") : null;
    return {etag: etag || null, lastModified: lastModified && !Number.isNaN(Date.parse(lastModified)) ? lastModified : null, publishedUpdate, contentHash};
  } catch { return null; } finally { clearTimeout(timer); }
}
(async () => {
  const targets = new Map();
  for (const store of stores) {
    const url = store.inventory || store.official;
    if (!url || !/^https:\/\//.test(url)) continue;
    // Shared chain directory pages are not store-specific: their changes cannot be attributed to a store.
    if (!store.inventory && /\/shoplist\/?(?:\?.*)?$/.test(url)) continue;
    if (!targets.has(url)) targets.set(url, {names: [], monitorContent: !store.inventory});
    targets.get(url).names.push(store.name);
  }
  for (const [url, target] of targets) {
    const old = previous.pages?.[url] || {};
    const metadata = await inspect(url, target.monitorContent);
    const entry = {...old, name: target.names.join(" / ")};
    if (metadata && (metadata.publishedUpdate || metadata.etag || metadata.lastModified || metadata.contentHash)) {
      const nextPublished = metadata.publishedUpdate || null;
      const {contentHash, ...headers} = metadata;
      const changed = !!(target.monitorContent && old.contentHash && contentHash && old.contentHash !== contentHash);
      const newObservation = old.status !== "OBSERVED" || old.publishedUpdate !== nextPublished ||
        ["etag", "lastModified"].some(key => (old.metadata?.[key] || null) !== (headers[key] || null)) ||
        (!!target.monitorContent && old.contentHash !== contentHash);
      if (newObservation) {
        entry.checkedAt = now;
        entry.metadata = headers;
        entry.publishedUpdate = nextPublished;
        if (target.monitorContent) {
          entry.contentHash = contentHash;
          if (changed) entry.contentChangedAt = now;
        }
      }
      if (!target.monitorContent && old.metadata && ["etag", "lastModified"].some(key => old.metadata[key] && headers[key] && old.metadata[key] !== headers[key])) {
        entry.metadataChangedAt = now;
      }
      entry.status = "OBSERVED";
    } else {
      entry.status = "UNAVAILABLE";
    }
    pages[url] = entry;
    console.log(entry.status + " " + url);
    await pause(400);
  }
  fs.mkdirSync("data", {recursive: true});
  fs.writeFileSync(file, JSON.stringify({schemaVersion: 1, lastCheckedAt: now, pages}, null, 2) + "\n");
})().catch(error => {console.error(error); process.exitCode = 1;});
