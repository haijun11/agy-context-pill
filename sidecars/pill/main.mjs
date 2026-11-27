import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_CODE = readFileSync(join(HERE, 'widget.js'), 'utf8');

const LS_ADDR = process.env.ANTIGRAVITY_LS_ADDRESS || '';
const LS_CSRF = process.env.ANTIGRAVITY_CSRF_TOKEN || '';

function resolveDevToolsPortFile() {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'DevToolsActivePort');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity', 'DevToolsActivePort');
}

const DEVTOOLS_PORT_FILE = resolveDevToolsPortFile();

const MODEL_WINDOWS = [
  [/claude|sonnet|opus|haiku/i, 200_000],
  [/gpt-oss/i, 128_000],
  [/gemini/i, 1_000_000],
];

let modelLabels = new Map();
let geminiQuota = null;
let lastModelsFetchAt = 0;
const trajectoryCache = new Map(); // id -> { modified, dateKey, item, daily }
const sockets = new Map();

async function lsPost(method, body = {}) {
  if (!LS_ADDR || !LS_CSRF) return null;
  try {
    const res = await fetch(`http://${LS_ADDR}/exa.language_server_pb.LanguageServerService/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': LS_CSRF,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshModelLabels() {
  if (Date.now() - lastModelsFetchAt < 20_000 && modelLabels.size > 0) return;
  const [data, summary] = await Promise.all([
    lsPost('GetUserStatus', {}),
    lsPost('RetrieveUserQuotaSummary', {}),
  ]);
  const configs = data?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
  const next = new Map();
  const families = new Map();
  let primary = null;

  if (Array.isArray(configs)) {
    for (const c of configs) {
      const id = c?.modelOrAlias?.model;
      const label = c?.label || '';
      if (id && label) next.set(id, label);
      if (!c?.disabled && /gemini/i.test(label) && typeof c?.quotaInfo?.remainingFraction === 'number') {
        const pct = Math.max(0, Math.min(100, c.quotaInfo.remainingFraction * 100));
        const resetTime = c.quotaInfo.resetTime || null;
        const family = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (!families.has(family)) {
          families.set(family, { name: family, pct, resetTime });
        }
        if (!primary) primary = { pct, resetTime };
      }
    }
  }
  if (next.size > 0) {
    modelLabels = next;
    lastModelsFetchAt = Date.now();
  }

  const groups = summary?.response?.groups;
  const geminiGroup = Array.isArray(groups)
    ? groups.find((g) => /gemini/i.test(g?.displayName || ''))
    : null;
  const buckets = Array.isArray(geminiGroup?.buckets) ? geminiGroup.buckets : [];
  const fiveH = buckets.find((b) => b?.window === '5h' || /5h/i.test(b?.bucketId || ''));
  const weekly = buckets.find((b) => b?.window === 'weekly' || /weekly/i.test(b?.bucketId || ''));

  const fivePct = typeof fiveH?.remainingFraction === 'number'
    ? Math.max(0, Math.min(100, fiveH.remainingFraction * 100))
    : primary?.pct ?? null;
  const weeklyPct = typeof weekly?.remainingFraction === 'number'
    ? Math.max(0, Math.min(100, weekly.remainingFraction * 100))
    : null;

  if (fivePct !== null || weeklyPct !== null) {
    geminiQuota = {
      pct: fivePct,
      resetTime: fiveH?.resetTime || primary?.resetTime || null,
      weeklyPct,
      weeklyResetTime: weekly?.resetTime || null,
      families: [...families.values()],
    };
  }
}

function resolveWindow(modelId, label) {
  const hay = `${label || ''} ${modelId || ''}`;
  for (const [re, size] of MODEL_WINDOWS) {
    if (re.test(hay)) return size;
  }
  return 1_000_000;
}

function parseSeconds(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val !== 'string') return 0;
  const m = val.match(/^([\d.]+)s$/);
  return m ? parseFloat(m[1]) : 0;
}

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameLocalDay(isoString, todayKey) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return localDateKey(d) === todayKey;
}

function computeTrajectoryEntry(id, meta, tr, todayKey) {
  const gens = tr?.trajectory?.generatorMetadata;
  const steps = tr?.trajectory?.steps || [];
  if (!Array.isArray(gens) || gens.length === 0) return null;

  let lastGen = null;
  let totalSessionRead = 0;
  let totalSessionInput = 0;
  let sessionTotalTokens = 0;
  let sessionRequests = 0;
  const dailyContrib = { totalTokens: 0, cacheRead: 0, uncached: 0, output: 0, requests: 0 };

  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    const u = g?.chatModel?.usage;
    if (!u) continue;
    const inp = Number(u.inputTokens || 0);
    const read = Number(u.cacheReadTokens || 0);
    const write = Number(u.cacheCreationInputTokens || 0);
    const out = Number(u.outputTokens || 0);
    if (inp <= 0 && read <= 0 && write <= 0 && out <= 0) continue;

    sessionRequests++;
    totalSessionRead += read;
    totalSessionInput += inp + read + write;
    sessionTotalTokens += inp + read + write + out;
    lastGen = g;

    const stepIdx = Array.isArray(g.stepIndices) ? g.stepIndices[0] : undefined;
    const ts =
      (stepIdx !== undefined && (steps[stepIdx]?.metadata?.createdAt || steps[stepIdx]?.metadata?.completedAt)) ||
      meta?.lastModifiedTime;
    if (isSameLocalDay(ts, todayKey)) {
      dailyContrib.cacheRead += read;
      dailyContrib.uncached += inp + write;
      dailyContrib.output += out;
      dailyContrib.totalTokens += inp + read + write + out;
      dailyContrib.requests++;
    }
  }

  if (!lastGen) return null;
  const lastUsage = lastGen.chatModel.usage;
  const inputTokens = Number(lastUsage.inputTokens || 0);
  const cacheReadTokens = Number(lastUsage.cacheReadTokens || 0);
  const cacheWriteTokens = Number(lastUsage.cacheCreationInputTokens || 0);
  const outputTokens = Number(lastUsage.outputTokens || 0);
  const usedTokens = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens;

  const turnTotalInput = inputTokens + cacheReadTokens + cacheWriteTokens;
  const cacheHitPct = turnTotalInput > 0 ? (cacheReadTokens / turnTotalInput) * 100 : null;
  const sessionCacheHitPct = totalSessionInput > 0 ? (totalSessionRead / totalSessionInput) * 100 : null;

  const streamSec = parseSeconds(lastGen.chatModel?.streamingDuration);
  const ttftSec = parseSeconds(lastGen.chatModel?.timeToFirstToken);
  const tps = streamSec > 0.1 && outputTokens > 0 ? outputTokens / streamSec : null;

  const modelId = lastUsage.model || '';
  const modelLabel = lastGen.chatModel?.modelDisplayName || modelLabels.get(modelId) || modelId || 'Model';
  const maxTokens = resolveWindow(modelId, modelLabel);
  const percent = maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : 0;

  const item = {
    id: id.toLowerCase(),
    usedTokens,
    maxTokens,
    percent,
    modelLabel,
    cacheReadTokens,
    uncachedTokens: inputTokens + cacheWriteTokens,
    outputTokens,
    cacheHitPct,
    sessionCacheHitPct,
    sessionTotalTokens,
    sessionRequests,
    tps,
    ttftSec: ttftSec > 0 ? ttftSec : null,
  };
  return { modified: String(meta?.lastModifiedTime || ''), dateKey: todayKey, item, daily: dailyContrib };
}

async function collectContextMetrics() {
  await refreshModelLabels();
  const list = await lsPost('GetAllCascadeTrajectories', {});
  const summaries = list?.trajectorySummaries;
  if (!summaries || typeof summaries !== 'object') return null;

  const todayKey = localDateKey();
  const sorted = Object.entries(summaries).sort((a, b) =>
    String(b[1]?.lastModifiedTime || '').localeCompare(String(a[1]?.lastModifiedTime || ''))
  );

  const targetEntries = [];
  for (const entry of sorted) {
    if (targetEntries.length < 6 || isSameLocalDay(entry[1]?.lastModifiedTime, todayKey)) {
      if (targetEntries.length < 25) targetEntries.push(entry);
    }
  }

  const byId = {};
  let latest = null;
  const daily = { totalTokens: 0, cacheRead: 0, uncached: 0, output: 0, requests: 0 };

  for (const [id, meta] of targetEntries) {
    const modified = String(meta?.lastModifiedTime || '');
    let cached = trajectoryCache.get(id);
    if (!cached || cached.modified !== modified || cached.dateKey !== todayKey) {
      const tr = await lsPost('GetCascadeTrajectory', { cascadeId: id });
      const computed = computeTrajectoryEntry(id, meta, tr, todayKey);
      if (computed) {
        trajectoryCache.set(id, computed);
        cached = computed;
      } else {
        continue;
      }
    }

    byId[cached.item.id] = cached.item;
    if (!latest) latest = cached.item;
    daily.totalTokens += cached.daily.totalTokens;
    daily.cacheRead += cached.daily.cacheRead;
    daily.uncached += cached.daily.uncached;
    daily.output += cached.daily.output;
    daily.requests += cached.daily.requests;
  }

  return { byId, latest, daily, geminiQuota };
}

function readDebugPort() {
  try {
    const raw = readFileSync(DEVTOOLS_PORT_FILE, 'utf8').trim();
    const port = Number(raw.split(/\r?\n/)[0]);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

async function getRendererTargets(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const targets = await res.json();
    if (!Array.isArray(targets)) return [];
    return targets.filter(
      (t) =>
        t?.type === 'page' &&
        typeof t.webSocketDebuggerUrl === 'string' &&
        !String(t.url || '').startsWith('devtools://')
    );
  } catch {
    return [];
  }
}

function cdpEval(conn, expression) {
  if (!conn.ready || conn.ws.readyState !== WebSocket.OPEN) return;
  const id = ++conn.idSeq;
  conn.ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, silent: true } }));
}

function syncConnections(targets) {
  const activeUrls = new Set(targets.map((t) => t.webSocketDebuggerUrl));
  for (const [url, conn] of sockets.entries()) {
    if (!activeUrls.has(url)) {
      try { conn.ws.close(); } catch {}
      sockets.delete(url);
    }
  }
  for (const url of activeUrls) {
    if (sockets.has(url)) continue;
    try {
      const ws = new WebSocket(url);
      const conn = { ws, ready: false, idSeq: 0 };
      ws.addEventListener('open', () => {
        conn.ready = true;
        cdpEval(conn, WIDGET_CODE);
      });
      ws.addEventListener('close', () => sockets.delete(url));
      ws.addEventListener('error', () => sockets.delete(url));
      sockets.set(url, conn);
    } catch {}
  }
}

async function tick() {
  const port = readDebugPort();
  if (!port) return;
  const targets = await getRendererTargets(port);
  syncConnections(targets);
  if (sockets.size === 0) return;

  const payload = await collectContextMetrics();
  const json = JSON.stringify(payload);
  for (const conn of sockets.values()) {
    cdpEval(conn, `if (window.__agCtxPillVersion !== 16) { ${WIDGET_CODE} } window.__agCtxPillUpdate?.(${json});`);
  }
}

const timer = setInterval(() => {
  void tick().catch(() => {});
}, 1500);
void tick().catch(() => {});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    clearInterval(timer);
    for (const conn of sockets.values()) {
      try { conn.ws.close(); } catch {}
    }
    process.exit(0);
  });
}
