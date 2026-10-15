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
    const response = await fetch(url, {method: "HEAD", redirect: "follow", signal: controller.signal,
      headers: {"User-Agent": "HarimaGachaNavi-MetadataCheck/1.0"}});
    if (!response.ok) return null;
    const lastModified = response.headers.get("last-modified");
    const etag = response.headers.get("etag");
    // Only use an explicit server-supplied metadata value; no guessing from check time.
    return {etag: etag || null, lastModified: lastModified && !Number.isNaN(Date.parse(lastModified)) ? lastModified : null};
  } catch { return null; } finally { clearTimeout(timer); }
}
(async () => {
  for (const store of stores) {
    if (!store.inventory) continue;
    const url = store.inventory;
    const old = previous.pages?.[url] || {};
    const metadata = await inspect(url);
    const entry = {...old, name: store.name};
    if (metadata && (metadata.etag || metadata.lastModified)) {
      entry.checkedAt = now;
      entry.metadata = metadata;
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
