#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
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
async function inspect(url) {
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
    // Only use an explicit server-supplied metadata value; no guessing from check time.
    return {etag: etag || null, lastModified: lastModified && !Number.isNaN(Date.parse(lastModified)) ? lastModified : null, publishedUpdate};
  } catch { return null; } finally { clearTimeout(timer); }
}
(async () => {
  for (const store of stores) {
    if (!store.inventory) continue;
    const url = store.inventory;
    const old = previous.pages?.[url] || {};
    const metadata = await inspect(url);
    const entry = {...old, name: store.name};
    if (metadata && (metadata.publishedUpdate || metadata.etag || metadata.lastModified)) {
      // Keep last successful observation when nothing meaningful changed to avoid commits every 15 minutes.
      const nextPublished = metadata.publishedUpdate || null;
      const newObservation = old.status !== "OBSERVED" || old.publishedUpdate !== nextPublished ||
        ["etag", "lastModified"].some(key => (old.metadata?.[key] || null) !== (metadata[key] || null));
      if (newObservation) {
        entry.checkedAt = now;
        entry.metadata = metadata;
        entry.publishedUpdate = nextPublished;
      }
      const oldMeta = old.metadata;
      if (oldMeta) {
        // Compare only fields available in both observations.
        const changed = ["etag", "lastModified"].some(key => oldMeta[key] && metadata[key] && oldMeta[key] !== metadata[key]);
        if (changed) entry.metadataChangedAt = now;
      }
      entry.status = "OBSERVED";
    } else {
      entry.status = "UNAVAILABLE";
      // Retain historical metadata but do not claim a fresh check.
    }
    pages[url] = entry;
    console.log(entry.status + " " + url);
    await pause(400);
  }
  fs.mkdirSync("data", {recursive: true});
  fs.writeFileSync(file, JSON.stringify({schemaVersion: 1, pages}, null, 2) + "\n");
})().catch(error => {console.error(error); process.exitCode = 1;});
