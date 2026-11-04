// 엔카 그랜저·카니발 HEV 리스/렌트 승계 수집 — GitHub Actions용 (브라우저 불필요, 외부 패키지 없음)
// 사용: node scripts/collect.mjs            → watch.html, watch_history.json, report.json, report.md 생성
//       node scripts/collect.mjs --render   → 수집 없이 기존 watch_data.json 으로 페이지·보고만 다시 생성
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const KST = () => new Date(Date.now() + 9 * 3600e3);
const TODAY = KST().toISOString().slice(0, 10);
const NOW = new Date();
const NOWM = KST().getUTCFullYear() * 12 + KST().getUTCMonth() + 1;

const H = {
  'User-Agent': 'encar-lease-watch/1.0 (+https://github.com/operationer-star/encar-lease; personal weekly lease-takeover monitor)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};
const DIAG = { done: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 404) return null;
      const t = await r.text();
      if (!DIAG.done) { DIAG.done = true; log('첫 응답 진단: HTTP', r.status, 'content-type', r.headers.get('content-type'), 'body', JSON.stringify(t.slice(0, 300))); }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 120)}`);
      return t ? JSON.parse(t) : null;
    } catch (e) {
      if (i === tries - 1) { log('FAIL', url.slice(0, 120), String(e)); return null; }
      await sleep(1500 * (i + 1));
    }
  }
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };
const writeJson = (f, o) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o), 'utf8');

// ───────── 1. 수집: 국산 리스·렌트 승계 전체 목록 ─────────
// 원래 루틴은 브라우저의 performance 엔트리에서 q 를 뽑았음. 여기서는 후보 q 를 순서대로 시도해 Count>0 인 첫 것을 쓴다.
// 환경변수 ENCAR_Q 가 있으면 그것을 최우선으로 쓴다 (브라우저 개발자도구 Network 탭 → premium?...&q=<값> 복사).
const Q_CANDIDATES = [
  process.env.ENCAR_Q,
  '(And.Hidden.N._.CarType.Y._.AttributeType.Lease.)', // 2026-11-04 브라우저에서 확인한 국산 리스·렌트 승계 목록 q (약 2,750건)
  '(And.Hidden.N._.CarType.Y._.(Or.SellType.리스._.SellType.렌트.))',
].filter(Boolean);

async function fetchList() {
  const FIELDS = 'Id,Manufacturer,Model,Badge,Year,Mileage,FuelType,OfficeCityState,SellType,LeaseType,Price,FormYear';
  let q = null, total = 0;
  for (const c of Q_CANDIDATES) {
    const u = `https://api.encar.com/search/car/list/premium?count=true&q=${encodeURIComponent(c)}&sr=${encodeURIComponent('|ModifiedDate|0|1')}`;
    const j = await getJson(u);
    const n = j?.Count ?? 0;
    log('q 후보', c, '→ Count', n);
    if (n > 0) { q = c; total = n; break; }
    await sleep(500);
  }
  if (!q) throw new Error('승계 목록 q 를 찾지 못함 — ENCAR_Q 환경변수(저장소 Variables)에 브라우저에서 복사한 q 를 넣어주세요');
  const all = [];
  for (let off = 0; off < total; off += 100) {
    const u = `https://api.encar.com/search/car/list/premium?count=true&q=${encodeURIComponent(q)}&sr=${encodeURIComponent(`|ModifiedDate|${off}|100`)}&inav=`;
    const j = await getJson(u);
    const rs = j?.SearchResults || [];
    all.push(...rs);
    if (!rs.length) break;
    await sleep(500);
  }
  log('승계 목록 전체', all.length, '/', total);
  return all;
}

const isTarget = (r) => {
  const nm = `${r.Model || ''} ${r.Badge || ''} ${r.BadgeDetail || ''}`;
  if (/그랜저/.test(nm) && /하이브리드/.test(nm)) return 'G';
  if (/카니발/.test(nm) && /(HEV|가솔린\+전기|하이브리드)/.test(nm)) return 'C';
  if (/카니발/.test(nm) && /(하이브리드|전기)/.test(r.FuelType || '')) return 'C';
  return null;
};

// ───────── 2. 권위 보정: 승계 조건(월료·잔여·인수금·지원금·보증금 …) ─────────
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; };
const toMan = (v) => { const n = +v; if (!isFinite(n)) return 0; return n > 100000 ? Math.round(n / 10000) : n; }; // 원 단위면 만원으로

async function fetchSuccession(ids) {
  const out = {};
  let dumped = false;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const j = await getJson(`https://api.encar.com/legacy/usedcar/lease/car/succession?carIds=${chunk.join(',')}`);
    const arr = Array.isArray(j) ? j : (j?.list || j?.data || []);
    for (const s of arr) { const id = String(pick(s, 'carId', 'id', 'CarId')); if (id) out[id] = { ...s, _st: '리스' }; }
    await sleep(350);
    const miss = chunk.filter((id) => !out[id]);
    if (miss.length) {
      const j2 = await getJson(`https://api.encar.com/legacy/usedcar/rent/car/succession?carIds=${miss.join(',')}`);
      const arr2 = Array.isArray(j2) ? j2 : (j2?.list || j2?.data || []);
      for (const s of arr2) { const id = String(pick(s, 'carId', 'id', 'CarId')); if (id) out[id] = { ...s, _st: '렌트' }; }
      await sleep(350);
    }
    if (!dumped && Object.keys(out).length) { dumped = true; const s = Object.values(out)[0]; log('succession 응답 필드 예시:', Object.keys(s).join(',')); }
  }
  return out;
}

function parseSucc(s) {
  const fee = toMan(pick(s, 'monthLeaseFee', 'monthRentFee'));
  const n = +pick(s, 'leaseResidualMonthCount', 'rentResidualMonthCount') || 0;
  const tot = +pick(s, 'totalLeaseMonthCount', 'totalRentMonthCount') || 0;
  const inc = (s.includeTax || []).map((x) => x.sbnm || x).join('/');
  const mat = (s.maturity || []).map((x) => x.sbnm || x).join('/');
  return {
    fee, n, tot,
    acq: toMan(pick(s, 'acquisitionCost')), su: toMan(pick(s, 'succession', 'successionCost')),
    rv: toMan(pick(s, 'residualValue')),
    dep: toMan(pick(s, 'depositAmt', 'deposit', 'leaseDeposit', 'rentDeposit', 'depositAmount')), // 실제 필드명 depositAmt (2026-11-04 확인)
    from: String(pick(s, 'leaseTermFrom', 'rentTermFrom') || ''), co: s.company?.companyNm || s.companyNm || '',
    inc, mat, el: tot && n ? tot - n : null, st: s._st,
  };
}

// ───────── 3. 상세: 광고일·조회·판매자·색·트림·옵션 ─────────
const optCache = new Map();
async function optionNames(modelCd, gradeCd, id) {
  const key = `${modelCd}_${gradeCd}`;
  if (optCache.has(key)) return optCache.get(key);
  const j = await getJson(`https://api.encar.com/v1/readside/vehicles/car/${id}/options/choice`);
  const m = {};
  const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if (x.optionCd && x.optionName) m[x.optionCd] = x.optionName; Object.values(x).forEach(walk); };
  walk(j);
  optCache.set(key, m);
  return m;
}
async function fetchDetail(id) {
  const v = await getJson(`https://api.encar.com/v1/readside/vehicle/${id}`);
  if (!v) return null;
  const codes = v.options?.choice || [];
  let opts = [];
  if (codes.length) {
    const names = await optionNames(v.category?.modelCd, v.category?.gradeCd, id);
    opts = codes.map((c) => names[c] || (typeof c === 'string' && !/^\d+$/.test(c) ? c : null)).filter(Boolean)
      .map((s) => s.replace(/\(.*?\)/g, '').replace(/외장컬러|내장컬러/g, '').trim())
      .filter((s) => s && !/컬러|색상|페인트/.test(s));
    opts = [...new Set(opts)];
  }
  return {
    first: v.manage?.firstAdvertisedDateTime || null, view: v.manage?.viewCount ?? null, ut: v.contact?.userType || '',
    color: v.spec?.colorName || '', trim: v.category?.gradeName || v.category?.gradeDetailName || '',
    ym: +String(v.category?.yearMonth || '').slice(0, 6) || null, km: v.spec?.mileage ?? null,
  };
}
async function pool(items, worker, conc, gap) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { const k = i++; res[k] = await worker(items[k], k); await sleep(gap); } }));
  return res;
}

// ───────── 3b. 예상 만기시세: 같은 모델 일반매물 회귀 (가격 ~ 경과개월 + 주행) ─────────
async function fetchMarket(model) {
  // 같은 세대 일반(SellType.일반) 하이브리드 매물만: 그랜저 GN7 하이브리드 / 카니발 4세대 HEV
  const q = model === 'G'
    ? '(And.Hidden.N._.CarType.Y._.SellType.일반._.FuelType.가솔린+전기._.(C.Manufacturer.현대._.ModelGroup.그랜저.))'
    : '(And.Hidden.N._.CarType.Y._.SellType.일반._.FuelType.가솔린+전기._.(C.Manufacturer.기아._.ModelGroup.카니발.))';
  const sameGen = (r) => model === 'G' ? /GN7/.test(r.Model || '') : /4세대/.test(r.Model || '');
  const rows = [];
  for (let off = 0; off < 1500; off += 100) {
    const j = await getJson(`https://api.encar.com/search/car/list/premium?count=true&q=${encodeURIComponent(q)}&sr=${encodeURIComponent(`|ModifiedDate|${off}|100`)}`);
    const rs = j?.SearchResults || [];
    rows.push(...rs); if (rs.length < 100) break; await sleep(400);
  }
  const pts = rows.filter((r) => isTarget(r) === model && sameGen(r) && r.SellType === '일반' && r.Price > 500 && r.Mileage > 0 && r.FormYear)
    .map((r) => ({ age: Math.max(1, NOWM - (Math.floor(+r.Year / 100) * 12 + (+r.Year % 100 || 6))), km: +r.Mileage, p: +r.Price }));
  log(`일반매물 회귀 표본 ${model}:`, pts.length);
  if (pts.length < 15) return null;
  // 최소제곱: p = a + b*age + c*km
  let Sa = 0, Sk = 0, Sp = 0, Saa = 0, Skk = 0, Sak = 0, Sap = 0, Skp = 0; const N = pts.length;
  for (const { age, km, p } of pts) { Sa += age; Sk += km; Sp += p; Saa += age * age; Skk += km * km; Sak += age * km; Sap += age * p; Skp += km * p; }
  const ma = Sa / N, mk = Sk / N, mp = Sp / N;
  const caa = Saa - N * ma * ma, ckk = Skk - N * mk * mk, cak = Sak - N * ma * mk, cap = Sap - N * ma * mp, ckp = Skp - N * mk * mp;
  const det = caa * ckk - cak * cak; if (Math.abs(det) < 1e-9) return null;
  const b = (cap * ckk - ckp * cak) / det, c = (ckp * caa - cap * cak) / det, a = mp - b * ma - c * mk;
  return { a, b, c, n: N, predict: (age, km) => Math.max(300, Math.round(a + b * age + c * km)) };
}

// ───────── 4~6. 블랙리스트·메모·히스토리·페이지 ─────────
function build(rows) {
  const black = new Set((readJson('blacklist.json', []) || []).map(String));
  const NOTES = readJson('watch_notes.json', {}) || {};
  rows = rows.filter((r) => !black.has(r.id) && !(r.sellerHash && black.has('S:' + r.sellerHash)));
  const hist = readJson('watch_history.json', []) || [];
  const prev = hist.find((h) => h.d !== TODAY);
  const ids = rows.map((r) => r.id);
  const prevIds = new Set(prev?.ids || []);
  const newIds = prev ? ids.filter((id) => !prevIds.has(id)) : [];
  const nh = [{ d: TODAY, ids }, ...hist.filter((h) => h.d !== TODAY)].slice(0, 60);
  writeJson('watch_history.json', nh);
  const W = { date: TODAY, prevDate: prev?.d || null, newIds, rows };
  writeJson('watch_data.json', W);
  const tpl = fs.readFileSync(path.join(ROOT, 'watch_tpl.html'), 'utf8');
  const html = tpl.replace('__WATCH__', () => JSON.stringify(W)).replace('__NOTES__', () => JSON.stringify(NOTES));
  if (!html.startsWith('<!DOCTYPE')) throw new Error('template broken');
  fs.writeFileSync(path.join(ROOT, 'watch.html'), html, 'utf8');
  return { W, NOTES };
}

// ───────── 7. 보고 ─────────
function report(W, NOTES) {
  const calc = (o) => {
    const y = +o.ym; const age = y ? Math.max(1, NOWM - (Math.floor(y / 100) * 12 + y % 100)) : null;
    const pm = age ? Math.round(o.km / age) : null; const low = age >= 6 && pm < 400;
    const base = o.fee * o.n + (o.acq || 0) - (o.su || 0) - (o.dep || 0);
    const eff = o.n > 0 ? base / o.n : 999; const inc = o.inc || '';
    const add = (/보험/.test(inc) ? 0 : 10) + (/세금/.test(inc) ? 0 : 2.5) + (/정비/.test(inc) ? 0 : 3);
    const allin = Math.round((eff + add) * 10) / 10;
    const hda = (o.opts || []).some((s) => /스마트\s*센스\s*(II|Ⅱ|2)|드라이브\s*와이즈|하이웨이 드라이빙/.test(s)) || (o.model === 'G' && /캘리그래피|아너스/.test(o.trim || ''));
    const days = o.first ? Math.round((NOW - new Date(o.first)) / 864e5) : null;
    return { ...o, allin, hda, days, low, pm };
  };
  const rows = W.rows.map(calc);
  const hold = Object.entries(NOTES).filter(([, v]) => v.st === '보류').map(([id]) => id);
  const out = { date: W.date, prevDate: W.prevDate, total: rows.length, models: {}, holdMissing: hold.filter((id) => !rows.some((r) => r.id === id)), newHda: [] };
  const lines = [`# 엔카 HEV 승계 감시 ${W.date} (직전 ${W.prevDate || '-'})`, ''];
  const fmt = (r) => `${r.id} ${r.trim} ${String(r.ym).slice(0, 4)}.${String(r.ym).slice(4)} ${r.km.toLocaleString()}km · ${r.fee}×${r.n}개월 · 지원 ${r.su || 0}${r.dep ? ' · 보증금 ' + r.dep : ''} · **월총 ${r.allin}**${r.hda ? ' 🚗' : ''} · ${r.ut === 'CLIENT' ? '개인' : r.ut === 'DEALER' ? '딜러' : '업자'} · 광고 ${r.days ?? '-'}일`;
  for (const m of ['G', 'C']) {
    const mr = rows.filter((r) => r.model === m);
    const real = mr.filter((r) => r.el != null && r.el >= 2 && !r.low && (NOTES[r.id] || {}).st !== '폐기').sort((a, b) => a.allin - b.allin);
    const nc = mr.filter((r) => r.el != null && r.el <= 1).length;
    const top = real.slice(0, 5);
    const newH = real.filter((r) => W.newIds.includes(r.id) && r.hda);
    out.models[m] = { total: mr.length, real: real.length, newContract: nc, new: mr.filter((r) => W.newIds.includes(r.id)).length, top: top.map(({ opts, ...r }) => r), newHda: newH.map((r) => r.id) };
    out.newHda.push(...newH.map((r) => `${m}:${r.id}`));
    lines.push(`## ${m === 'G' ? '그랜저 HEV' : '카니발 HEV'} — 전체 ${mr.length} · 진짜승계 ${real.length} · 🆕신규계약 ${nc} · NEW ${out.models[m].new}`);
    top.forEach((r, i) => lines.push(`${i + 1}. ${fmt(r)}${W.newIds.includes(r.id) ? ' 🆕NEW' : ''}`));
    if (newH.length) lines.push(`- ★ 이번 주 새로 등장한 🚗 매물: ${newH.map((r) => r.id).join(', ')}`);
    lines.push('');
  }
  if (hold.length) lines.push(`보류 매물 상태: ${hold.map((id) => `${id} ${rows.some((r) => r.id === id) ? '유지' : '**사라짐**'}`).join(' / ')}`);
  const head = out.newHda.length ? `새 🚗 매물 ${out.newHda.join(', ')}` : out.holdMissing.length ? `보류 매물 사라짐 ${out.holdMissing.join(', ')}` : '새 🚗 매물·보류 변동 없음';
  out.headline = head; lines.splice(1, 0, `**${head}**`, '');
  writeJson('report.json', out);
  fs.writeFileSync(path.join(ROOT, 'report.md'), lines.join('\n'), 'utf8');
  log(lines.join('\n'));
}

async function main() {
  if (ARGS.has('--render')) { const W = readJson('watch_data.json'); if (!W) throw new Error('watch_data.json 없음'); const NOTES = readJson('watch_notes.json', {}); const tpl = fs.readFileSync(path.join(ROOT, 'watch_tpl.html'), 'utf8'); fs.writeFileSync(path.join(ROOT, 'watch.html'), tpl.replace('__WATCH__', () => JSON.stringify(W)).replace('__NOTES__', () => JSON.stringify(NOTES)), 'utf8'); report(W, NOTES); return; }
  const list = await fetchList();
  const tg = list.map((r) => ({ r, m: isTarget(r) })).filter((x) => x.m);
  log('대상(그랜저HEV·카니발HEV)', tg.length, 'G', tg.filter((x) => x.m === 'G').length, 'C', tg.filter((x) => x.m === 'C').length);
  if (!tg.length) throw new Error('대상 매물 0건 — 목록 필드명/필터 확인 필요');
  const succ = await fetchSuccession(tg.map((x) => String(x.r.Id)));
  log('승계 조건 확보', Object.keys(succ).length);
  const base = [];
  for (const { r, m } of tg) {
    const s = succ[String(r.Id)]; if (!s) continue;
    const p = parseSucc(s); if (p.fee <= 1 || p.n === 0) continue;
    base.push({ id: String(r.Id), model: m, name: `${r.Model || ''} ${r.Badge || ''}`.trim(), ym: null, km: +r.Mileage || 0, lt: r.LeaseType || '', loc: r.OfficeCityState || '', st: r.SellType === '렌트' ? '렌트' : r.SellType === '리스' ? '리스' : p.st, ...p });
  }
  const det = await pool(base, (b) => fetchDetail(b.id), 3, 120);
  const reg = { G: await fetchMarket('G'), C: await fetchMarket('C') };
  const rows = base.map((b, i) => {
    const d = det[i] || {}; const o = { ...b, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== '')) };
    o.trim = o.trim || o.name; o.opts = d.opts || [];
    const y = +o.ym; const age = y ? Math.max(1, NOWM - (Math.floor(y / 100) * 12 + y % 100)) : 1;
    o.kmM = Math.round(o.km + o.n * 25000 / 12);
    o.mv = reg[o.model] ? reg[o.model].predict(age + o.n, o.kmM) : null;
    return o;
  });
  log('최종 rows', rows.length);
  const { W, NOTES } = build(rows);
  report(W, NOTES);
}
main().catch((e) => { console.error('ERROR', e); fs.writeFileSync(path.join(ROOT, 'report.json'), JSON.stringify({ date: TODAY, error: String(e) })); process.exit(1); });
