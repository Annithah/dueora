// Builds the progress page and the install landing page from repo data.
// Usage: npm run progress            (reuse docs/progress/test-results.json)
//        npm run progress -- --run-tests   (run backend + mobile tests first and record the counts)
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Status = 'Done' | 'In progress' | 'Not started' | 'Blocked';
type Area = 'backend' | 'mobile' | 'ai' | 'notifications' | 'release';

interface Feature {
  name: string;
  part: number;
  area: Area;
  status: Status;
  proof: string;
}
interface Commit {
  hash: string;
  date: string;
  subject: string;
}
interface SuiteResult {
  passed: number;
  failed: number;
  total: number;
  failedTests: string[];
  error?: string;
}
interface TestResults {
  ranAt: string | null;
  source: string;
  backend: SuiteResult | null;
  mobile: SuiteResult | null;
}
interface Release {
  version: string;
  published: boolean;
  releaseUrl: string;
  apkUrl: string;
  easBuildUrl: string | null;
  easBuildId: string | null;
}
interface Group {
  key: string;
  label: string;
  done: number;
  total: number;
  percent: number;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'progress');
const REPO = 'Annithah/dueora';
const PAGES = 'https://annithah.github.io/dueora';

const STATUSES: Status[] = ['Done', 'In progress', 'Not started', 'Blocked'];
const AREAS: Area[] = ['backend', 'mobile', 'ai', 'notifications', 'release'];
const PARTS: Record<number, string> = {
  1: 'Bills (rename, reference numbers)',
  2: 'Companies and access',
  3: 'Categories and custom fields',
  4: 'Fixed and variable amounts',
  5: 'Tracking views',
  6: 'Reports and exports',
  7: 'Notifications',
  8: 'AI, verification and release',
};
const ICON: Record<Status, string> = { Done: '✅', 'In progress': '🔄', 'Not started': '⏳', Blocked: '⛔' };
const WEIGHT: Record<Status, number> = { Done: 1, 'In progress': 0.5, 'Not started': 0, Blocked: 0 };

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson<T>(rel: string, fallback: T): T {
  const file = path.join(ROOT, rel);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}

export function parseFeatures(md: string): Feature[] {
  const rows: Feature[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [name, partCell, areaCell, statusCell, proof] = cells;
    const part = Number(partCell);
    const status = STATUSES.find((s) => s.toLowerCase() === statusCell.toLowerCase());
    const area = AREAS.find((a) => a === areaCell.toLowerCase());
    if (!Number.isInteger(part) || !status || !area) continue;
    rows.push({ name, part, area, status, proof });
  }
  return rows;
}

export function parseWaiting(md: string): string[] {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,3}\s+Waiting on Anii/i.test(l));
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    const m = /^\s*(?:[-*]|\d+\.)\s+(?:\[[ x~]\]\s+)?(.+)$/.exec(line);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function group(features: Feature[], key: (f: Feature) => string, label: (k: string) => string, keys: string[]): Group[] {
  return keys
    .map((k) => {
      const list = features.filter((f) => key(f) === k);
      const done = list.reduce((sum, f) => sum + WEIGHT[f.status], 0);
      return { key: k, label: label(k), done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
    })
    .filter((g) => g.total > 0);
}

function commits(): Commit[] {
  try {
    const out = execSync('git log -10 --format=%h%x09%cI%x09%s', { cwd: ROOT, encoding: 'utf8' });
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, date, ...rest] = l.split('\t');
        return { hash, date, subject: rest.join('\t') };
      });
  } catch {
    return [];
  }
}

function runSuite(cwd: string, kind: 'vitest' | 'jest'): SuiteResult {
  const file = path.join(tmpdir(), `dueora-${kind}-${Date.now()}.json`);
  const args = kind === 'vitest' ? ['vitest', 'run', '--reporter=json', `--outputFile=${file}`] : ['jest', '--json', `--outputFile=${file}`];
  spawnSync('npx', args, { cwd: path.join(ROOT, cwd), stdio: 'inherit', shell: process.platform === 'win32' });
  if (!existsSync(file)) return { passed: 0, failed: 0, total: 0, failedTests: [], error: 'The test run produced no report' };
  const r = JSON.parse(readFileSync(file, 'utf8')) as {
    numPassedTests: number;
    numFailedTests: number;
    numTotalTests: number;
    testResults: { name: string; assertionResults: { status: string; fullName: string }[] }[];
  };
  rmSync(file, { force: true });
  const failedTests = r.testResults.flatMap((s) =>
    s.assertionResults.filter((a) => a.status === 'failed').map((a) => `${path.basename(s.name)} › ${a.fullName}`),
  );
  return { passed: r.numPassedTests, failed: r.numFailedTests, total: r.numTotalTests, failedTests };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const code = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

const STYLE = `
:root{--bg:#f6f8f8;--card:#fff;--fg:#14201f;--muted:#5b6b69;--line:#dfe6e5;--accent:#0f5c5c;--accent-soft:#e3f1f0;--bar:#e6ecec;--warn:#8a5a00;--warn-soft:#fff4dc;--bad:#a12a2a;--good:#1d6b3a}
[data-theme=dark]{--bg:#0e1615;--card:#162120;--fg:#e6efee;--muted:#9db0ad;--line:#26403d;--accent:#5cc2b8;--accent-soft:#16312f;--bar:#22302f;--warn:#f3c36b;--warn-soft:#2e2614;--bad:#ff8f8f;--good:#7ed39c}
*{box-sizing:border-box}html{color-scheme:light}[data-theme=dark]{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 16px}
h1{font-size:1.4rem;margin:0}h2{font-size:1.05rem;margin:0 0 10px}
.muted{color:var(--muted)}.small{font-size:.85rem}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 14px}
button.theme{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:8px 14px;font:inherit;cursor:pointer;min-height:40px}
.big{font-size:2.6rem;font-weight:700;line-height:1}
.bar{height:12px;background:var(--bar);border-radius:999px;overflow:hidden;margin:8px 0}
.bar>span{display:block;height:100%;background:var(--accent);border-radius:999px}
.row{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.grid{display:grid;gap:12px}
.waiting{background:var(--warn-soft);border-color:var(--warn)}
.waiting h2{color:var(--warn)}
ol,ul{margin:0;padding-left:20px}li{margin:4px 0}
.links{display:flex;flex-wrap:wrap;gap:8px}
.links a{display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border-radius:10px;background:var(--accent-soft);color:var(--accent);text-decoration:none;font-weight:600}
a{color:var(--accent)}
.tests{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tests div{border:1px solid var(--line);border-radius:10px;padding:10px}
.ok{color:var(--good)}.bad{color:var(--bad)}
table{width:100%;border-collapse:collapse}td{padding:8px 4px;border-top:1px solid var(--line);vertical-align:top}
td.st{white-space:nowrap;width:1%}
code{font-size:.85em;background:var(--bar);padding:1px 4px;border-radius:4px;word-break:break-word}
.commit{display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line)}.commit:first-child{border-top:0}
.commit code{flex:none}
img.qr{width:180px;height:180px;background:#fff;padding:8px;border-radius:10px;border:1px solid var(--line)}
.cta{display:block;text-align:center;font-size:1.1rem;padding:14px;border-radius:12px;background:var(--accent);color:#fff!important;text-decoration:none;font-weight:700}
[data-theme=dark] .cta{color:#0e1615!important}
.cta[aria-disabled=true]{opacity:.55;pointer-events:none}
`;

const THEME_SCRIPT = `<script>
(function(){var k='dueora-theme',r=document.documentElement,t='light';try{t=localStorage.getItem(k)||'light'}catch(e){}
r.setAttribute('data-theme',t);
window.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('theme');if(!b)return;
function label(){var d=r.getAttribute('data-theme')==='dark';b.textContent=d?'☀️ Light':'🌙 Dark';b.setAttribute('aria-label',d?'Switch to light mode':'Switch to dark mode')}
label();b.addEventListener('click',function(){var n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem(k,n)}catch(e){}label()})})})();
</script>`;

function page(title: string, body: string, relRoot: string): string {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="${relRoot}install-qr.png">
<style>${STYLE}</style>
${THEME_SCRIPT}
</head>
<body><main>${body}</main></body>
</html>
`;
}

function bar(percent: number, label: string): string {
  return `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

function groupList(groups: Group[]): string {
  return `<div class="grid">${groups
    .map(
      (g) =>
        `<div><div class="row"><span>${esc(g.label)}</span><span class="muted small">${g.percent}% · ${g.done % 1 ? g.done.toFixed(1) : g.done}/${g.total}</span></div>${bar(g.percent, g.label)}</div>`,
    )
    .join('')}</div>`;
}

function suite(name: string, s: SuiteResult | null): string {
  if (!s) return `<div><strong>${name}</strong><br><span class="muted">Not run yet</span></div>`;
  if (s.error) return `<div><strong>${name}</strong><br><span class="bad">⚠️ ${esc(s.error)}</span></div>`;
  const failed = s.failed
    ? `<br><span class="bad">✕ ${s.failed} failing</span><ul class="small">${s.failedTests.slice(0, 5).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : `<br><span class="ok">✓ none failing</span>`;
  return `<div><strong>${name}</strong><br><span class="ok">✓ ${s.passed} passing</span> <span class="muted">of ${s.total}</span>${failed}</div>`;
}

function main() {
  const runTests = process.argv.includes('--run-tests');
  const features = parseFeatures(read('docs/FEATURE_STATUS.md'));
  if (!features.length) throw new Error('No feature rows found in docs/FEATURE_STATUS.md');
  const waiting = parseWaiting(read('PROGRESS.md'));
  const version = (JSON.parse(read('mobile/app.json')) as { expo: { version: string } }).expo.version;
  const tag = `v${version}`;
  const release = readJson<Release>('docs/progress/release.json', {
    version,
    published: false,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${tag}`,
    apkUrl: `https://github.com/${REPO}/releases/download/${tag}/DueOra-${tag}.apk`,
    easBuildUrl: null,
    easBuildId: null,
  });

  let tests = readJson<TestResults>('docs/progress/test-results.json', { ranAt: null, source: 'none', backend: null, mobile: null });
  if (runTests) {
    tests = { ranAt: new Date().toISOString(), source: process.env.CI ? 'GitHub Actions' : 'local run', backend: runSuite('backend', 'vitest'), mobile: runSuite('mobile', 'jest') };
  }

  const done = features.reduce((s, f) => s + WEIGHT[f.status], 0);
  const overall = Math.round((done / features.length) * 100);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, features.filter((f) => f.status === s).length])) as Record<Status, number>;
  const byPart = group(features, (f) => String(f.part), (k) => `Part ${k} — ${PARTS[Number(k)] ?? ''}`, Object.keys(PARTS));
  const byArea = group(features, (f) => f.area, (k) => k[0].toUpperCase() + k.slice(1), AREAS);
  const log = commits();
  const updatedAt = new Date().toISOString();

  mkdirSync(OUT, { recursive: true });
  const data = { updatedAt, version, overall, counts, byPart, byArea, waiting, features, commits: log, tests, release, links: { progress: `${PAGES}/progress/`, install: `${PAGES}/`, qr: `${PAGES}/install-qr.png` } };
  writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data, null, 2) + '\n');
  writeFileSync(path.join(OUT, 'test-results.json'), JSON.stringify(tests, null, 2) + '\n');

  const apkLink = release.published
    ? `<a href="${esc(release.apkUrl)}">⬇️ Download APK ${esc(tag)}</a>`
    : `<a href="${esc(release.releaseUrl)}" title="Not published yet">⬇️ APK ${esc(tag)} (not published yet)</a>`;
  const featureRows = Object.keys(PARTS)
    .map((p) => {
      const list = features.filter((f) => f.part === Number(p));
      if (!list.length) return '';
      return `<tr><td colspan="2"><strong>Part ${p} — ${esc(PARTS[Number(p)])}</strong></td></tr>${list
        .map((f) => `<tr><td class="st">${ICON[f.status]} <span class="small">${f.status}</span></td><td>${code(f.name)}<br><span class="muted small">${esc(f.area)} · ${code(f.proof)}</span></td></tr>`)
        .join('')}`;
    })
    .join('');

  const progressBody = `
<header><div><h1>DueOra progress</h1><div class="muted small">Version ${esc(version)} · updated ${fmtDate(updatedAt)}</div></div><button id="theme" class="theme" type="button">🌙 Dark</button></header>
${waiting.length ? `<section class="waiting"><h2>⚠️ Waiting on Anii (${waiting.length})</h2><ol>${waiting.map((w) => `<li>${code(w)}</li>`).join('')}</ol></section>` : ''}
<section><div class="row"><h2>Overall</h2><span class="muted small">${features.length} features</span></div>
<div class="big">${overall}%</div>${bar(overall, 'Overall progress')}
<div class="small">✅ ${counts.Done} done · 🔄 ${counts['In progress']} in progress · ⏳ ${counts['Not started']} not started · ⛔ ${counts.Blocked} blocked</div></section>
<section><h2>Install and links</h2><div class="links">${apkLink}<a href="../">📱 Install page</a><a href="../install-qr.png">🔳 QR code</a>${release.easBuildUrl ? `<a href="${esc(release.easBuildUrl)}">🏗️ EAS build</a>` : ''}<a href="data.json">{ } data.json</a></div></section>
<section><h2>Tests</h2><div class="tests">${suite('Backend', tests.backend)}${suite('Mobile', tests.mobile)}</div>
<p class="muted small">${tests.ranAt ? `Ran ${fmtDate(tests.ranAt)} (${esc(tests.source)})` : 'No test run recorded yet'}</p></section>
<section><h2>By part</h2>${groupList(byPart)}</section>
<section><h2>By area</h2>${groupList(byArea)}</section>
<section><h2>Features</h2><table>${featureRows}</table></section>
<section><h2>Last ${log.length} commits</h2>${log.map((c) => `<div class="commit"><code>${esc(c.hash)}</code><div>${esc(c.subject)}<br><span class="muted small">${fmtDate(c.date)}</span></div></div>`).join('')}</section>
<p class="muted small">Generated by <code>npm run progress</code> from <code>docs/FEATURE_STATUS.md</code>, <code>PROGRESS.md</code> and git.</p>`;
  writeFileSync(path.join(OUT, 'index.html'), page('DueOra progress', progressBody, '../'));

  const installBody = `
<header><div><h1>DueOra</h1><div class="muted small">Your dues, on time · Android ${esc(tag)}</div></div><button id="theme" class="theme" type="button">🌙 Dark</button></header>
<section><a class="cta" href="${esc(release.published ? release.apkUrl : release.releaseUrl)}"${release.published ? '' : ' aria-disabled="true"'}>⬇️ ${release.published ? `Download DueOra ${esc(tag)}` : `DueOra ${esc(tag)} — coming soon`}</a>
${release.published ? '' : '<p class="muted small">The Android app is being prepared. This button turns on as soon as it is ready.</p>'}</section>
<section><h2>Scan on your phone</h2><img class="qr" src="install-qr.png" alt="QR code linking to the DueOra APK download"></section>
<section><h2>How to install</h2><ol>
<li>Open the link on your Android phone and download DueOra.</li>
<li>When asked, allow your browser to <strong>Install unknown apps</strong>.</li>
<li>If Play Protect warns you, tap <strong>More details → Install anyway</strong> (normal for apps not on the Play Store).</li>
<li>Open DueOra, create an account, then add your company and bills.</li></ol></section>
<section><div class="links"><a href="progress/">📊 Progress ${overall}%</a><a href="legal/privacy.html">Privacy</a><a href="legal/terms.html">Terms</a></div></section>`;
  writeFileSync(path.join(ROOT, 'docs', 'index.html'), page('Install DueOra', installBody, ''));

  writeQr(release.apkUrl).finally(() => {
    process.stdout.write(`Progress ${overall}% · ${features.length} features · ${waiting.length} waiting · written to docs/progress/\n`);
  });
}

async function writeQr(url: string): Promise<void> {
  try {
    const QRCode = (await import('qrcode')).default;
    await QRCode.toFile(path.join(ROOT, 'docs', 'install-qr.png'), url, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
  } catch (err) {
    process.stderr.write(`QR code not written (run npm install at the repo root): ${(err as Error).message}\n`);
  }
}

main();
