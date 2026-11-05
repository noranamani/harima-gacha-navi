/* Cloudflare Workers Free cron fallback for the gacha 15-minute GitHub job.
 * Not a second collector. No official webpages are fetched by this Worker.
 * A single, least-privilege fine-grained GitHub token must be stored as an
 * encrypted Worker secret. Default disabled, fail closed.
 */
const OWNER = "noranamani";
const REPO = "harima-gacha-navi";
const WORKFLOW = "page-updates.yml";
const CRON = "7,22,37,52 * * * *";
const FRESH_MS = 8 * 60 * 1000;
const API = "https://api.github.com/repos/" + OWNER + "/" + REPO +
  "/actions/workflows/" + WORKFLOW;

export async function safeWakeup({
  env, nowMs, cron, fetcher = fetch
} = {}) {
  if (!env || env.GACHA_WAKEUP_ENABLED !== "true")
    return {status:"disabled"};
  if (cron !== CRON)
    return {status:"unexpected_cron"};
  if (!Number.isFinite(nowMs))
    throw Error("GACHA_WAKEUP_CLOCK_INVALID");
  const token = env.GACHA_GITHUB_TOKEN;
  if (!token || typeof token !== "string")
    throw Error("GACHA_WAKEUP_TOKEN_MISSING");

  const headers = {
    "Accept":"application/vnd.github+json",
    "Authorization":"Bearer " + token,
    "User-Agent":"HarimaGachaCronBackup/1.0",
    "X-GitHub-Api-Version":"2022-11-28"
  };
  const response = await fetcher(API + "/runs?branch=main&per_page=20", {
    method:"GET",headers
  });
  if (!response || response.status !== 200)
    throw Error("GACHA_WAKEUP_READ_HTTP_" + (response?.status ?? "UNKNOWN"));
  const data = await response.json();
  if (!data || !Array.isArray(data.workflow_runs))
    throw Error("GACHA_WAKEUP_READ_INVALID");

  // A run started recently counts even when failed: never blindly retry an
  // unknown read/write result. Missing GitHub schedule is the only reason to
  // request an external wakeup.
  const recent = data.workflow_runs.some(r => {
    if (r.head_branch !== "main" ||
        !["schedule","workflow_dispatch"].includes(r.event))return false;
    const t=Date.parse(r.created_at||"");
    return Number.isFinite(t) && nowMs >= t && nowMs-t < FRESH_MS;
  });
  if (recent)return {status:"existing_recent_run"};
  // Always ask the original GitHub workflow to execute. It alone fetches and
  // validates official metadata and commits the approved change.
  const minute = new Date(nowMs).getUTCMinutes();
  const includeProducts = minute === 7;
  const result = await fetcher(API + "/dispatches", {
    method:"POST",headers:{
      ...headers,"Content-Type":"application/json"
    },
    body:JSON.stringify({
      ref:"main",
      inputs:{
        trigger_source:"cloudflare_backup",
        product_refresh:includeProducts?"true":"false"
      }
    })
  });
  if (!result || result.status !== 204)
    throw Error("GACHA_WAKEUP_DISPATCH_HTTP_" + (result?.status ?? "UNKNOWN"));
  return {status:"requested",product_refresh:includeProducts};
}

export default {
  async scheduled(event, env, ctx) {
    try {
      const result=await safeWakeup({
        env,nowMs:event.scheduledTime,cron:event.cron
      });
      console.log("GACHA_WAKEUP:",result.status,
        result.product_refresh===undefined?"":result.product_refresh);
    } catch(error) {
      // Never print the token, response body or HTTP request options.
      console.error("GACHA_WAKEUP_BLOCKED:",error.message);
      throw error;
    }
  },
  async fetch() {
    // No unauthenticated/manual web endpoints: only the Cron Trigger operates.
    return new Response("Scheduled Worker only", {status:404});
  }
};
