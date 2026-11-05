"use strict";
/** Gacha monitoring audit: runner success != actual 15-minute coverage.
 * Uses read-only evidence from committed page-status.json and workflow runs.
 */
const fs = require("node:fs");
const path = require("node:path");
const HOUR = 3600000, DAY = 24 * HOUR;
const WHO = "Check official page metadata";
function millis(value) {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : null;
}
function hours(value) {return Math.round(value / HOUR * 10) / 10;}
function audit({status, runs, now = new Date()} = {}) {
  if (!status || status.schemaVersion !== 1 || !status.pages ||
      !runs || !Array.isArray(runs.workflow_runs) ||
      !(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new Error("GACHA_MONITOR_INPUT_INVALID");
  const nowMs = now.getTime(), since = nowMs - DAY;
  const raw = runs.workflow_runs.filter(r => r.name === WHO &&
    r.head_branch === "main" && ["schedule", "workflow_dispatch"].includes(r.event) &&
    millis(r.created_at) !== null && millis(r.created_at) <= nowMs &&
    millis(r.created_at) >= since);
  const inspected = raw.filter(r => r.conclusion === "success");
  const ordered = inspected.map(r => millis(r.created_at)).sort((a, b) => a - b);
  const marks = [since, ...ordered, nowMs];
  const largestGapMinutes = Math.round(Math.max(...marks.slice(1).map((t, i) => (t - marks[i]) / 60000)));
  const lastRunAgeMinutes = ordered.length ? Math.round((nowMs - ordered.at(-1)) / 60000) : 1440;
  const statusAt = millis(status.lastCheckedAt);
  const statusAgeHours = statusAt !== null && statusAt <= nowMs ? hours(nowMs - statusAt) : null;
  const unavailable = Object.entries(status.pages).filter(([, p]) => p.status === "UNAVAILABLE")
    .map(([url, p]) => ({
      name: p.name || url, url, code: p.lastErrorCode || "UNKNOWN",
      failures: Number(p.consecutiveUnavailable) || 0,
      hours: millis(p.firstUnavailableAt) !== null ?
        hours(Math.max(0, nowMs - millis(p.firstUnavailableAt))) : null
    }));
  const persistent = unavailable.filter(x => x.failures >= 4 && x.hours !== null && x.hours >= 6);
  const gaps = [
    ...(inspected.length < 48 ? ["ONLY_" + inspected.length + "_SUCCESSFUL_CHECKS_IN_24H"] : []),
    ...(largestGapMinutes > 90 ? ["LARGEST_GAP_" + largestGapMinutes + "_MIN"] : []),
    ...(lastRunAgeMinutes > 90 ? ["LAST_SUCCESS_" + lastRunAgeMinutes + "_MIN_AGO"] : []),
    ...(statusAgeHours === null || statusAgeHours > 3 ? ["PAGE_STATUS_STALE_OR_INVALID"] : [])
  ];
  return {
    schemaVersion: 1,
    observedAt: now.toISOString(),
    periodHours: 24,
    targetPerDay: 96,
    successfulInspections: inspected.length,
    totalRunStarts: raw.length,
    largestGapMinutes,
    lastRunAgeMinutes,
    pageStatusAgeHours: statusAgeHours,
    pageCount: Object.keys(status.pages).length,
    unavailableCount: unavailable.length,
    unavailable,
    persistentUnavailable: persistent,
    warnings: gaps,
    alert: gaps.length > 0 || persistent.length > 0
  };
}
function markdown(report) {
  const parts = [
    "# ガチャ公式ページ・巡回稼働監査",
    "",
    "監査日時: " + report.observedAt,
    "実行数（直近24時間）: 成功 " + report.successfulInspections +
      " / 理想 96（予定した15分刻み）",
    "直近24時間の最大空白: " + report.largestGapMinutes + "分",
    "最後の正常巡回から: " + report.lastRunAgeMinutes + "分",
    "対象公式ページ: " + report.pageCount + " / 取得不能: " + report.unavailableCount,
    "監査結果: " + (report.alert ? "**要対応**" : "**正常**"),
    "",
    "## 起動漏れ・データ鮮度",
    ...(report.warnings.length ? report.warnings.map(x => "- " + x) : ["- 重大な異常は検出されませんでした"]),
    "",
    "## 連続取得不能（6時間以上・4回以上）",
    ...(report.persistentUnavailable.length ? report.persistentUnavailable.map(x =>
      "- " + x.name + " / " + x.code + " / " + x.failures +
      "回 / " + x.hours + "時間 / " + x.url
    ) : ["- 条件に該当するページはありません"]),
    "",
    "判定はGitHub実行記録とHTTP観測結果に基づきます。" +
    "取得不能は閉店を意味しません。アクセス制限を回避せず、公式URLを維持します。"
  ];
  return parts.join("\n") + "\n";
}
function main() {
  if (process.argv.length !== 6)
    throw new Error("USAGE: node scripts/page-monitor-audit.cjs <status.json> <runs.json> <report.json> <report.md>");
  const [, , statusPath, runsPath, outJson, outMd] = process.argv;
  const result = audit({
    status: JSON.parse(fs.readFileSync(statusPath, "utf8")),
    runs: JSON.parse(fs.readFileSync(runsPath, "utf8"))
  });
  fs.mkdirSync(path.dirname(outJson), {recursive:true});
  fs.mkdirSync(path.dirname(outMd), {recursive:true});
  fs.writeFileSync(outJson, JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(outMd, markdown(result));
  console.log("GACHA_MONITOR: " + JSON.stringify({
    alert:result.alert, checks:result.successfulInspections,
    maxGapMin:result.largestGapMinutes,
    unavailable:result.unavailableCount, persistent:result.persistentUnavailable.length
  }));
}
if (require.main === module) {
  try {main();} catch (e) {console.error("GACHA_MONITOR_INPUT_ERROR: " + e.message);process.exitCode = 1;}
}
module.exports = {audit, markdown};
