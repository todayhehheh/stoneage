import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL = 'https://stoneage-calculator.pages.dev/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'dist', 'index.html');
const updateDataPath = path.join(root, 'data', 'petinfo-update.json');
const obtainDataPath = path.join(root, 'data', 'pet-obtain-details.json');

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Reference download failed: ${response.status}`);
let html = await response.text();
const cachedImages = new Map();
try {
  const previous = await readFile(outputPath, 'utf8');
  const previousMatch = previous.match(/<script\s+type="application\/json"\s+id="pet-data">([\s\S]*?)<\/script>/);
  if (previousMatch) {
    for (const pet of JSON.parse(previousMatch[1])) {
      if (pet.img && pet.imageUrl) cachedImages.set(pet.imageUrl, { img: pet.img, imageMime: pet.imageMime });
    }
  }
} catch (_error) {
  // A first build has no local image cache yet.
}

function replaceRequired(search, replacement, label) {
  if (!html.includes(search)) throw new Error(`Reference structure changed: ${label}`);
  html = html.replace(search, replacement);
}

function replacePattern(pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Reference structure changed: ${label}`);
  html = html.replace(pattern, replacement);
}

const petDataPattern = /(<script\s+type="application\/json"\s+id="pet-data">)([\s\S]*?)(<\/script>)/;
const rankDataPattern = /(<script\s+type="application\/json"\s+id="rank-compare-data">)([\s\S]*?)(<\/script>)/;
const petMatch = html.match(petDataPattern);
if (!petMatch) throw new Error('pet-data was not found');
const pets = JSON.parse(petMatch[2]);
const rankMatch = html.match(rankDataPattern);
if (!rankMatch) throw new Error('rank-compare-data was not found');
const rankCompare = JSON.parse(rankMatch[2]);
const beropori = pets.find(pet => String(pet.id) === '35');
const katarkas = pets.find(pet => String(pet.id) === '50');
if (!beropori || !katarkas || pets.length !== 184) throw new Error('Unexpected reference dataset');
beropori.approx = true;
beropori.dataNote = '성장률 역산 신뢰도가 낮아 원본계수와 등급 확률을 참고용으로만 제공합니다.';
katarkas.referenceFeasible = false;
katarkas.dataNote = '표시된 S급 참고 초기치는 이론값이며, 정수 10P 배분 조합으로는 정확히 만들 수 없습니다.';
const rideableNames = new Set(['하르가','노르곤','흑기린','카르곤','고루루','페루루','성호','포포','바우트','히파','가가로스','호르쿠','쿠쿠','카키','도르도르','기라노','샤크론','카우거','갈푸스','푸룡','골로스','모가로스','오르곤','오가로스','리비노','얀기로','반보로','부르돈','반기노','프라키토스','프리토스','다이노스','무이','베르가','베루루','고르고르','노르노르','고르고','고르돈','카타르카스','쿠로로','라고고','돌북이','환생얼룩우리','얼룩우리']);
for(const pet of pets) pet.rideable = rideableNames.has(pet.name);
if(pets.filter(pet=>pet.rideable).length!==45) throw new Error('Unexpected rideable pet mapping');

const rankRanges = [[100, Infinity], [95, 99], [90, 94], [85, 89], [80, 84], [-Infinity, 79]];
function growthForRank(origin, rankIndex) {
  const factor = 0.0475 + 0.002 * rankIndex;
  const [hp, attack, defense, agility] = origin;
  return [
    factor * (4 * hp + attack + defense + agility + 31.5),
    factor * (0.1 * hp + attack + 0.1 * defense + 0.05 * agility + 5.625),
    factor * (0.1 * hp + 0.1 * attack + defense + 0.05 * agility + 5.625),
    factor * (agility + 4.5)
  ];
}
function solveOrigin(growth, rankIndex) {
  const factor = 0.0475 + 0.002 * rankIndex;
  const agility = Math.round(growth[3] / factor - 4.5);
  const matrix = [
    [4, 1, 1, growth[0] / factor - 31.5 - agility],
    [0.1, 1, 0.1, growth[1] / factor - 5.625 - 0.05 * agility],
    [0.1, 0.1, 1, growth[2] / factor - 5.625 - 0.05 * agility]
  ];
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let cell = column; cell < 4; cell++) matrix[column][cell] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const multiplier = matrix[row][column];
      for (let cell = column; cell < 4; cell++) matrix[row][cell] -= multiplier * matrix[column][cell];
    }
  }
  return [Math.round(matrix[0][3]), Math.round(matrix[1][3]), Math.round(matrix[2][3]), agility];
}
function inferOrigin(growth) {
  let best = null;
  for (let rankIndex = 0; rankIndex < 6; rankIndex++) {
    const origin = solveOrigin(growth, rankIndex);
    const sum = origin.reduce((total, value) => total + value, 0);
    const [low, high] = rankRanges[rankIndex];
    if (sum < low || sum > high) continue;
    const calculated = growthForRank(origin, rankIndex);
    const deviation = calculated.reduce((total, value, index) => total + Math.abs(value - growth[index]), 0);
    if (!best || deviation < best.deviation) best = { origin, rankIndex, calculated, deviation };
  }
  if (!best) throw new Error(`Could not infer origin for ${growth.join('/')}`);
  return best;
}
function initialRaw(origin, k) {
  const [hp, attack, defense, agility] = origin;
  return [
    k * (4 * hp + attack + defense + agility + 31.5) / 100,
    k * (0.1 * hp + attack + 0.1 * defense + 0.05 * agility + 5.625) / 100,
    k * (0.1 * hp + 0.1 * attack + defense + 0.05 * agility + 5.625) / 100,
    k * (agility + 4.5) / 100
  ];
}
function inferK(origin, target) {
  const candidates = [];
  let fallback = null;
  for (let k = 1; k <= 100; k++) {
    const raw = initialRaw(origin, k);
    const residual = raw.reduce((total, value, index) => total + Math.abs(value - target[index] - 0.5), 0);
    if (!fallback || residual < fallback.residual) fallback = { k, residual, exact: false };
    if (raw.every((value, index) => Math.floor(value) === target[index])) {
      candidates.push({ k, residual, exact: true });
    }
  }
  if (!candidates.length) return fallback;
  candidates.sort((a, b) => a.residual - b.residual);
  return candidates[0];
}
function confidenceFromDeviation(deviation) {
  return Math.max(0, Math.min(99.99, 100 - deviation * 1.5));
}
function makeRankComparison(update, production) {
  const ranks = {};
  for (let rankIndex = 0; rankIndex < 6; rankIndex++) {
    const origin = solveOrigin(update.growthS, rankIndex);
    const calculated = growthForRank(origin, rankIndex);
    const growthDeviation = calculated.reduce((total, value, index) => total + Math.abs(value - update.growthS[index]), 0);
    const kResult = inferK(origin, update.initS);
    const raw = initialRaw(origin, kResult.k);
    const sum = origin.reduce((total, value) => total + value, 0);
    const [low, high] = rankRanges[rankIndex];
    ranks[String(rankIndex + 1)] = {
      origin,
      growth_dev: growthDeviation,
      bracket_ok: sum >= low && sum <= high,
      growth_calc: calculated,
      k: kResult.k,
      k_exact: kResult.exact,
      initCalc: raw,
      resid: raw.reduce((total, value, index) => total + Math.abs(value - update.initS[index] - 0.5), 0)
    };
  }
  return {
    name: update.name,
    growthS: update.growthS,
    initS: update.initS,
    prodOrigin: production.origin,
    prodK: production.k,
    prodApprox: production.approx,
    ranks
  };
}

const updatePets = JSON.parse(await readFile(updateDataPath, 'utf8'));
// Explicit user corrections take precedence over imported reference values.
const initialCorrections = JSON.parse(await readFile(path.join(root, 'data', 'pet-initial-corrections.json'), 'utf8'));
for (const [name, initS] of Object.entries(initialCorrections)) {
  const update = updatePets.find(pet => pet.name === name);
  if (!update) throw new Error(`Corrected pet missing: ${name}`);
  update.initS = initS;
}
const obtainDetails = JSON.parse(await readFile(obtainDataPath, 'utf8'));
const saleGrades = JSON.parse(await readFile(path.join(root, 'data', 'pet-sale-grades.json'), 'utf8'));
const imageResults = new Map();
let imageIndex = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (imageIndex < updatePets.length) {
    const update = updatePets[imageIndex++];
    const cached = cachedImages.get(update.imageUrl);
    if (cached?.imageMime) { imageResults.set(update.id, cached); continue; }
    const response = await fetch(update.imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Image download failed for ${update.name}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const imageMime = bytes.subarray(0, 3).toString() === 'GIF' ? 'image/gif'
      : bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG' ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!imageMime) throw new Error(`Not an image: ${update.name}`);
    imageResults.set(update.id, { img: bytes.toString('base64'), imageMime });
  }
}));
const additionalPets = JSON.parse(await readFile(path.join(root, 'data', 'additional-pets.json'), 'utf8'));
const missingPortrait = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><text x="96" y="100" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#7b6b5e">이미지 미등록</text></svg>';
for (const pet of additionalPets) {
  if (updatePets.some(item => item.id === pet.id || item.name === pet.name)) throw new Error(`Duplicate additional pet: ${pet.name}`);
  updatePets.push(pet);
  if (pet.imageFile) {
    const imagePath = path.resolve(root, pet.imageFile);
    if (!imagePath.startsWith(root + path.sep)) throw new Error(`Image path outside project: ${pet.name}`);
    const bytes = await readFile(imagePath);
    if (bytes.subarray(0, 3).toString() !== 'GIF') throw new Error(`Expected GIF: ${pet.name}`);
    imageResults.set(pet.id, { img: bytes.toString('base64'), imageMime: 'image/gif' });
  } else {
    imageResults.set(pet.id, { img: Buffer.from(missingPortrait).toString('base64'), imageMime: 'image/svg+xml' });
  }
}
let addedPets = 0;
for (const update of updatePets) {
  const existing = pets.find(pet => String(pet.id) === update.id || pet.name === update.name);
  const image = imageResults.get(update.id);
  if (existing && !Object.hasOwn(initialCorrections, update.name) && JSON.stringify(existing.growthS) === JSON.stringify(update.growthS)
      && JSON.stringify(existing.initS) === JSON.stringify(update.initS)) {
    Object.assign(existing, { ...update, id: existing.id, ...image });
    continue;
  }
  const inferred = inferOrigin(update.growthS);
  const kResult = inferK(inferred.origin, update.initS);
  const k = kResult.k;
  const confidence = confidenceFromDeviation(inferred.deviation);
  const pet = {
    ...(existing || {}),
    ...update,
    id: existing ? existing.id : update.id,
    origin: inferred.origin,
    k,
    ok: true,
    approx: false,
    referenceFeasible: kResult.exact,
    ...image,
    confMain: confidence,
    originDevMain: inferred.deviation,
    devFlagMain: inferred.deviation > 0.05,
    originAlt: inferred.origin,
    kAlt: k,
    approxAlt: false,
    confAlt: confidence,
    originDevAlt: inferred.deviation,
    devFlagAlt: inferred.deviation > 0.05
  };
  if (existing) Object.assign(existing, pet);
  else { pets.unshift(pet); addedPets++; }
  if (Object.hasOwn(initialCorrections, update.name)) {
    delete pet.dataNote;
    if (existing) delete existing.dataNote;
  }
  rankCompare[pet.id] = makeRankComparison(update, pet);
}
if (new Set(pets.map(pet => pet.id)).size !== pets.length) throw new Error('Duplicate merged IDs');
if (new Set(pets.map(pet => pet.name)).size !== pets.length) throw new Error('Duplicate merged names');
const petCount = pets.length;
const rideableCount = pets.filter(pet => pet.rideable).length;
pets.sort((left, right) => {
  const leftNumeric = /^\d+$/.test(left.id);
  const rightNumeric = /^\d+$/.test(right.id);
  if (leftNumeric && rightNumeric) return Number(right.id) - Number(left.id);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.id.localeCompare(right.id);
});
for (const pet of pets) pet.obtainDetail = obtainDetails[pet.name] || pet.obtain;
for (const pet of pets) pet.saleGrade = pet.saleGrade || saleGrades[pet.name] || null;
html = html.replace(petDataPattern, `$1${JSON.stringify(pets)}$3`);
html = html.replace(rankDataPattern, `$1${JSON.stringify(rankCompare)}$3`);
html = html.replaceAll('data:image/webp;base64,${p.img}', 'data:${p.imageMime||\'image/webp\'};base64,${p.img}');

replaceRequired(
  '<title>스톤에이지 환각 계산기</title>',
  `<title>오르서버 환각 계산기</title>\n<meta name="description" content="${petCount}마리 펫의 초기치를 178,750가지 조합과 정확한 정수식으로 대조하는 오르서버 환각 계산기">\n<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%230b1220%27/%3E%3Cpath d=%27M14 38 25 18l7 12 7-12 11 20-18 12z%27 fill=%27%232dd4bf%27/%3E%3Ccircle cx=%2732%27 cy=%2735%27 r=%276%27 fill=%27%23fbbf24%27/%3E%3C/svg%3E">`,
  'document metadata'
);

replaceRequired(
  '<h1>스톤에이지 환각 계산기</h1>\n      <p>겉으로 보이는 초기치만으로는 알 수 없는 펫의 진짜 등급을, 178,750가지 경우의 수를 모두 대조해 확률로 감정합니다.</p>',
  '<h1>오르서버 환각 계산기</h1>\n      <p>보이는 초기치를 정확한 정수식으로 역산해 가능한 등급과 환각 확률을 찾습니다.</p>',
  'masthead copy'
);
replaceRequired(
  '<div class="method-badge">RANK 역산 · 등급 -8 ~ +8</div>',
  `<div class="method-badge">전체 ${petCount}종</div>`,
  'method badge'
);

const rebirthMarkup = `
  <nav class="app-switcher" role="tablist" aria-label="계산기 선택">
    <button type="button" class="app-tab is-active" data-app-tab="hallucination" role="tab" aria-selected="true">환각 계산기</button>
    <button type="button" class="app-tab" data-app-tab="rebirth" role="tab" aria-selected="false">환생포인트</button>
    <button type="button" class="app-tab" data-app-tab="saved" role="tab" aria-selected="false">저장 목록 <b id="savedCount">0</b></button>
  </nav>
  <section class="app-panel" id="hallucinationPanel">`;
replaceRequired('  <div class="layout">', rebirthMarkup + '\n  <div class="layout">', 'app navigation');

const rebirthPanels = `
  </section>
  <section class="app-panel" id="rebirthPanel" hidden>
    <div class="rebirth-shell">
      <div class="workspace-head">
        <div><h2>환생포인트 계산기</h2><p>각 환생 직전의 레벨과 분배 스탯을 순서대로 입력하세요.</p></div>
        <button type="button" class="quiet-btn" id="rebirthReset">입력 초기화</button>
      </div>
      <div class="rebirth-stages" id="rebirthStages"></div>
      <div class="save-strip">
        <label><span>저장 이름</span><input type="text" id="saveName" maxlength="30" placeholder="예: 푸이토 3환 준비"></label>
        <button type="button" id="saveRebirth">현재 계산 저장</button>
      </div>
      <p class="storage-note">저장 기록은 현재 기기의 브라우저에 보관됩니다.</p>
    </div>
  </section>
  <section class="app-panel" id="savedPanel" hidden>
    <div class="saved-shell">
      <div class="workspace-head"><div><h2>저장 목록</h2><p>저장한 환생 계산을 다시 불러오거나 정리할 수 있습니다.</p></div></div>
      <div class="saved-list" id="savedList"></div>
    </div>
  </section>`;
replaceRequired('  </div>\n\n  <div class="modal-backdrop"', '  </div>\n' + rebirthPanels + '\n\n  <div class="modal-backdrop"', 'rebirth and saved panels');

replaceRequired(
  `  // ---- tabs ----
  let activeTab = 'calc';`,
  `  // ---- tabs ----
  let activeTab = 'calc';
  let compareRenderedId = null;`,
  'lazy compare state'
);
replaceRequired(
  `      document.getElementById('calcView').hidden = activeTab!=='calc';
      document.getElementById('compareView').hidden = activeTab!=='compare';`,
  `      document.getElementById('calcView').hidden = activeTab!=='calc';
      document.getElementById('compareView').hidden = activeTab!=='compare';
      if(activeTab==='compare' && selectedId && compareRenderedId!==selectedId){
        renderCompare(findPet(selectedId));
        compareRenderedId=selectedId;
      }`,
  'lazy compare rendering'
);

replaceRequired(
  `    calcMethod = 'main';
    renderGrid();
    renderDetail(p);
    if(p.ok){ runCalc(); } else { renderUnsupportedResult(p); }
    renderCompare(p);`,
  `    calcMethod = 'main';
    els.grid.querySelectorAll('.pet-card-main').forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.id===id)));
    renderDetail(p);
    if(p.ok){
      const requestedId=id;
      els.results.innerHTML='<div class="result-loading"><span></span> 등급 조합을 계산하고 있어요</div>';
      requestAnimationFrame(()=>{ if(selectedId===requestedId) runCalc(); });
    } else { renderUnsupportedResult(p); }
    compareRenderedId = null;
    if(activeTab==='compare'){ renderCompare(p); compareRenderedId=id; }`,
  'fast pet selection'
);

replaceRequired(
  `  function runCalc(){
    const p = findPet(selectedId);
    if(!p || !p.ok) return;
    const useAlt = calcMethod==='alt' && hasAltMethod(p);
    const origin = useAlt ? p.originAlt : p.origin;
    const k = useAlt ? p.kAlt : p.k;
    const {counts, matches, total} = computeGradeDist(origin, k, statVals);`,
  `  const calculationCache = new Map();
  function runCalc(){
    const p = findPet(selectedId);
    if(!p || !p.ok) return;
    const useAlt = calcMethod==='alt' && hasAltMethod(p);
    const origin = useAlt ? p.originAlt : p.origin;
    const k = useAlt ? p.kAlt : p.k;
    const cacheKey = p.id+'|'+(useAlt?'alt':'main')+'|'+statVals.join(',');
    let calculated = calculationCache.get(cacheKey);
    if(!calculated){
      calculated = computeGradeDist(origin, k, statVals);
      calculationCache.set(cacheKey, calculated);
      if(calculationCache.size>32) calculationCache.delete(calculationCache.keys().next().value);
    }
    const {counts, matches, total} = calculated;`,
  'calculation cache'
);

replaceRequired(
  `<div class="chips">
          <button type="button" class="chip fav-toggle" id="favToggle" aria-pressed="false">★ 즐겨찾기만</button>
        </div>`,
  `<div class="sort-wrap">
          <span class="sort-label">성장률 순</span>
          <div class="sort-buttons" role="group" aria-label="성장률 정렬">
            <button type="button" class="sort-btn" data-sort="total" aria-pressed="false">총성장</button>
            <button type="button" class="sort-btn" data-sort="0" aria-pressed="false">내구</button>
            <button type="button" class="sort-btn" data-sort="1" aria-pressed="false">공격</button>
            <button type="button" class="sort-btn" data-sort="2" aria-pressed="false">방어</button>
            <button type="button" class="sort-btn" data-sort="3" aria-pressed="false">순발</button>
          </div>
        </div>
        <div class="list-modes" role="group" aria-label="펫 목록 선택">
          <button type="button" class="mode-btn" data-mode="all" aria-pressed="true">전체</button>
          <button type="button" class="mode-btn" data-mode="ride" aria-pressed="false">탑승 가능 <b id="rideableCount">${rideableCount}</b></button>
          <button type="button" class="mode-btn" data-mode="fav" aria-pressed="false">즐겨찾기</button>
        </div>`,
  'pet list modes'
);

replaceRequired(
  `  let favorites = loadFavorites();
  let favOnly = false;`,
  `  let favorites = loadFavorites();
  let favOnly = false;
  let browseMode = 'all';
  let sortKey = '';
  let sortDirection = -1;`,
  'browse mode state'
);

replaceRequired(
  `  document.getElementById('favToggle').addEventListener('click', (e)=>{
    favOnly = !favOnly;
    e.currentTarget.setAttribute('aria-pressed', String(favOnly));
    renderGrid();
  });`,
  `  document.querySelector('.list-modes').addEventListener('click', (e)=>{
    const btn=e.target.closest('.mode-btn');
    if(!btn) return;
    browseMode=btn.dataset.mode;
    favOnly=browseMode==='fav';
    document.querySelectorAll('.mode-btn').forEach(item=>item.setAttribute('aria-pressed',String(item===btn)));
    renderGrid();
  });`,
  'browse mode controls'
);

replaceRequired(
  `  function matchesFilter(p, q){`,
  `  document.querySelector('.sort-buttons').addEventListener('click',(e)=>{
    const btn=e.target.closest('.sort-btn');
    if(!btn)return;
    if(sortKey===btn.dataset.sort) sortDirection*=-1;
    else {sortKey=btn.dataset.sort;sortDirection=-1;}
    document.querySelectorAll('.sort-btn').forEach(item=>{
      const active=item===btn;
      item.setAttribute('aria-pressed',String(active));
      item.dataset.direction=active?(sortDirection<0?'desc':'asc'):'';
    });
    renderGrid();
  });

  function matchesFilter(p, q){`,
  'growth sorting behavior'
);

replaceRequired(
  `    const list = PETS.filter(p=>matchesFilter(p,q));`,
  `    const list = PETS.filter(p=>matchesFilter(p,q));
    if(sortKey){
      const metric=p=>sortKey==='total'?p.growthS.slice(1).reduce((sum,value)=>sum+value,0):p.growthS[+sortKey];
      list.sort((a,b)=>(metric(a)-metric(b))*sortDirection || a.name.localeCompare(b.name,'ko'));
    }`,
  'growth sorting application'
);

replaceRequired(
  `    if(favOnly && !favorites.has(p.id)) return false;`,
  `    if(favOnly && !favorites.has(p.id)) return false;
    if(browseMode==='ride' && !p.rideable) return false;`,
  'rideable filter'
);

replaceRequired(
  `          <span class="pname">\${p.name}</span>`,
  `          <span class="pname">\${p.name}</span>
          <span class="pet-attr-mini">\${(p.attrs||[]).map(([name,value])=>'<i data-attr="'+name+'">'+name+' '+value+'</i>').join('')}</span>
          \${p.rideable ? '<span class="ride-tag">탑승</span>' : ''}`,
  'rideable badge'
);

replacePattern(
  /  function renderDetail\(p\)\{[\s\S]*?\n  \}\n\n  const GRADES =/,
  `  function renderDetail(p){
    const growthLabels=['내구','공격','방어','순발'];
    els.detail.innerHTML = \`
      <div class="pet-detail">
        <div class="pet-portrait"><img src="data:\${p.imageMime||'image/webp'};base64,\${p.img}" alt="\${p.name}"></div>
        <div class="pet-identity">
          <span class="detail-eyebrow">선택한 페트</span>
          <h2 class="pd-name">\${p.name}</h2>
          <div class="pd-meta">
            <span class="pet-attr-detail">\${(p.attrs||[]).map(([name,value])=>'<i data-attr="'+name+'">'+name+' '+value+'</i>').join('')}</span>
            \${p.rideable?'<span class="tag">탑승 가능</span>':''}
            \${p.approx?'<span class="tag warn">추정 데이터</span>':(!p.ok?'<span class="tag warn">계산 미지원</span>':'')}
          </div>
          <div class="obtain-card"><span>획득 방법</span><strong>\${p.obtainDetail||p.obtain}</strong></div>
          <div class="sale-info"><span>판매 등급</span><strong>\${p.saleGrade||'미확인'}</strong></div>
        </div>
      </div>
      <div class="growth-panel">
        <div class="panel-heading"><strong>S급 참고 성장률</strong></div>
        <div class="growth-grid">\${p.growthS.map((value,i)=>\`<div><span>\${growthLabels[i]}</span><b class="mono">\${value.toFixed(3)}</b></div>\`).join('')}<div class="growth-total"><span>총성장률</span><b class="mono">\${p.growthS.slice(1).reduce((sum,value)=>sum+value,0).toFixed(3)}</b></div></div>
      </div>
      \${p.approx?\`<p class="approx-note">⚠ \${p.dataNote||'성장률 역산값이 불확실해 결과는 참고용입니다.'}</p>\`:''}
      <div class="stat-grid" id="statGrid"></div>
      <div class="calc-row"><button class="calc-btn" id="calcBtn" \${p.ok?'':'disabled'}>등급 계산</button></div>
    \`;
    const grid=document.getElementById('statGrid');
    grid.innerHTML=STAT_LABELS.map((lbl,i)=>\`
      <label class="stat-box"><span class="slabel">\${lbl}</span>
        <div class="stat-stepper"><button type="button" data-i="\${i}" data-d="-1" aria-label="\${lbl} 감소">−</button>
        <input type="number" inputmode="numeric" id="stat-\${i}" value="\${statVals[i]}" \${p.ok?'':'disabled'}>
        <button type="button" data-i="\${i}" data-d="1" aria-label="\${lbl} 증가">+</button></div>
      </label>\`).join('');
    grid.addEventListener('click',e=>{const btn=e.target.closest('button[data-i]');if(!btn)return;const i=+btn.dataset.i;statVals[i]=Math.max(0,statVals[i]+(+btn.dataset.d));document.getElementById('stat-'+i).value=statVals[i];});
    grid.querySelectorAll('input').forEach((inp,i)=>inp.addEventListener('change',()=>{const v=Math.max(0,Math.round(+inp.value||0));statVals[i]=v;inp.value=v;}));
    document.getElementById('calcBtn').addEventListener('click',runCalc);
  }

  const GRADES =`,
  'simplified pet detail'
);

replacePattern(
  /    const rows = GRADES\.filter\(g=>counts\[g\]\)[\s\S]*?\n    \}\);\n  \}\n\n  \/\/ RANK별 보정계수/,
  `    els.results.innerHTML=\`
      <div class="result-hero">
        <div class="primary-result"><span>최고 가능 등급</span><strong class="mono">\${topGrade}<small>등급</small></strong></div>
        <div class="primary-result probability"><span>+8 환각 확률</span><strong class="mono">\${eightPct.toFixed(2)}<small>%</small></strong></div>
      </div>
      \${(isApprox||devFlag)?'<p class="result-caution">추정 데이터가 포함된 펫으로 결과는 참고용입니다.</p>':''}
    \`;
  }

  // RANK별 보정계수`,
  'simplified results'
);

const oldCalculation = `              const v0=G0+D[0], v1=G1+D[1], v2=G2+D[2], v3=G3+D[3];
              const a0=k*v0/100, a1=k*v1/100, a2=k*v2/100, a3=k*v3/100;
              const raw0 = 4*a0+a1+a2+a3;
              const p0 = Math.floor(raw0);
              if(p0!==target[0]) continue;
              const raw3 = a3;
              const p3 = Math.floor(raw3);
              if(p3!==target[3]) continue;
              const raw1 = 0.1*a0+a1+0.1*a2+0.05*a3;
              const p1 = Math.floor(raw1);
              if(p1!==target[1]) continue;
              const raw2 = 0.1*a0+0.1*a1+a2+0.05*a3;
              const p2 = Math.floor(raw2);`;
const exactCalculation = `              const v0=G0+D[0], v1=G1+D[1], v2=G2+D[2], v3=G3+D[3];
              // 판정은 정수 분자식으로 처리한다. 부동소수점 9.999999... 내림 오류를 방지한다.
              const p0 = Math.floor(k*(4*v0+v1+v2+v3)/100);
              if(p0!==target[0]) continue;
              const p3 = Math.floor(k*v3/100);
              if(p3!==target[3]) continue;
              const p1 = Math.floor(k*(2*v0+20*v1+2*v2+v3)/2000);
              if(p1!==target[1]) continue;
              const p2 = Math.floor(k*(2*v0+2*v1+20*v2+v3)/2000);
              const a0=k*v0/100, a1=k*v1/100, a2=k*v2/100, a3=k*v3/100;
              const raw0=4*a0+a1+a2+a3, raw1=0.1*a0+a1+0.1*a2+0.05*a3;
              const raw2=0.1*a0+0.1*a1+a2+0.05*a3, raw3=a3;`;
replaceRequired(oldCalculation, exactCalculation, 'grade calculation');

replaceRequired(
  "<div class=\"empty-state\">입력하신 초기치(${statVals.join('/')})와 일치하는 조합이 없습니다. 스탯을 다시 확인해주세요.</div>",
  "<div class=\"empty-state\">${statVals.every((v,i)=>v===p.initS[i]) ? '표시된 S급 참고 초기치와 일치하는 조합이 현재 계산식에서 발견되지 않았습니다. 참고 초기치는 실제 개체의 수치와 다를 수 있습니다. 레벨 1 실제 초기치를 입력해 주세요.' : `입력한 초기치(${statVals.join('/')})와 현재 계산식이 일치하는 조합을 찾지 못했습니다. 레벨 1 수치를 확인해 주세요. 실제 수치가 맞다면 이 펫의 역산 계수 또는 계산 모델 확인이 필요합니다.`}</div>",
  'zero-result explanation'
);

replaceRequired(
  `  // ---- init ----
  renderGrid();
  renderEmptyState();`,
  `  // ---- init ----
  renderGrid();
  selectPet('192');

  // 지원 브라우저에서는 화면과 같은 계산 동작을 구조화된 도구로도 제공한다.
  const modelContext = document.modelContext;
  if(modelContext?.registerTool){
    try{
      void Promise.resolve(modelContext.registerTool({
        name:'calculate_pet_grade',
        title:'펫 등급 계산',
        description:'펫 이름과 레벨 1 초기치를 입력해 가능한 최고 등급과 +8 환각 확률을 계산합니다.',
        inputSchema:{
          type:'object',
          properties:{
            petName:{type:'string'}, hp:{type:'integer',minimum:0}, attack:{type:'integer',minimum:0},
            defense:{type:'integer',minimum:0}, agility:{type:'integer',minimum:0}
          },
          required:['petName','hp','attack','defense','agility'],additionalProperties:false
        },
        annotations:{readOnlyHint:true,untrustedContentHint:false},
        execute(input){
          const pet=PETS.find(item=>item.name===input.petName);
          if(!pet) throw new Error('등록되지 않은 펫 이름입니다.');
          const values=[input.hp,input.attack,input.defense,input.agility];
          if(values.some(value=>!Number.isSafeInteger(value)||value<0)) throw new Error('초기치는 0 이상의 정수여야 합니다.');
          selectPet(pet.id);
          statVals=values;
          values.forEach((value,index)=>{const field=document.getElementById('stat-'+index);if(field)field.value=value;});
          runCalc();
          const grades=GRADES.filter(grade=>lastCounts[grade]);
          const total=Object.values(lastCounts).reduce((sum,count)=>sum+count,0);
          return {pet:pet.name,input:values,totalMatches:total,topGrade:grades[0]??null,eightPercent:total?((lastCounts[8]||0)/total*100):0};
        }
      })).catch(()=>{});
    }catch(_error){}
  }`,
  'initial useful selection'
);

const uiOverrides = `
/* 2026 rebuild — neon field guide */
:root{color-scheme:dark;--bg:#050812;--surface:#0b1020;--surface-2:#111a30;--surface-3:#192541;--text:#f5f8ff;--text-muted:#91a0bd;--border:#263452;--accent:#35e0c1;--accent-ink:#031512;--accent2:#ffbd4a;--danger:#ff718d;--danger-bg:#321526;--shadow:0 24px 70px -38px rgba(0,0,0,.95)}
html,body{overflow-x:hidden}body{background:radial-gradient(circle at 8% 4%,rgba(53,224,193,.13),transparent 28rem),radial-gradient(circle at 92% 16%,rgba(113,78,255,.14),transparent 30rem),linear-gradient(160deg,#050812 0%,#08101d 54%,#050812 100%);font-family:Inter,"Pretendard Variable","Noto Sans KR","Malgun Gothic",sans-serif}
.app,.layout,.layout>*,.sidebar,.main,.card,.pet-detail,.stat-grid,.stat-grid>*{min-width:0;max-width:100%}.app{width:100%;max-width:1540px;padding:20px clamp(14px,3vw,42px) 64px}
.masthead{align-items:center;margin-bottom:14px;padding:8px 2px}.masthead .title-block h1{font-family:inherit;font-size:clamp(28px,3vw,44px);font-weight:900;letter-spacing:-.055em;background:linear-gradient(110deg,#fff 15%,#88f8e4 60%,#ffcf78);-webkit-background-clip:text;color:transparent}.masthead .title-block p{font-size:15px;max-width:68ch}.method-badge{color:var(--accent)!important;border-color:rgba(53,224,193,.38)!important;background:rgba(53,224,193,.06)!important;box-shadow:inset 0 0 18px rgba(53,224,193,.04)}.live-dot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.tabbar{gap:18px;margin-bottom:14px}.tab-btn{font-family:inherit;font-size:14px;padding:11px 2px}.tab-btn[aria-selected="true"]{text-shadow:0 0 18px rgba(53,224,193,.35)}
.layout{grid-template-columns:minmax(300px,348px) minmax(0,1fr);gap:18px}.sidebar{position:sticky;top:14px;max-height:calc(100vh - 28px);display:flex;flex-direction:column;background:rgba(9,15,29,.88);backdrop-filter:blur(20px);border-radius:20px}.search-wrap{padding:14px}.search-input{height:44px;background:#0f192c;border-color:#2a3b5a;font-size:14px}.search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(53,224,193,.10);outline:none}.chip{font-size:12px;background:#101a2c}.chip[aria-pressed="true"]{box-shadow:0 5px 20px -10px var(--accent)}
.pet-grid{width:100%;max-height:none;flex:1;grid-template-columns:repeat(3,minmax(0,1fr))}.pet-card{background:#0b1221;contain:layout paint}.pet-card-main{min-width:0;min-height:88px;transition:background .16s ease,transform .16s ease}.pet-card-main:hover{background:#141f35;transform:translateY(-1px)}.pet-card-main img{width:50px;height:50px;background:linear-gradient(145deg,#1b2942,#111a2c);filter:drop-shadow(0 5px 8px rgba(0,0,0,.35))}.pet-card-main .pname{max-width:100%;font-size:12px;font-weight:700;overflow-wrap:anywhere}.pet-card-main[aria-pressed="true"]{background:linear-gradient(145deg,#1d806f,#176456);color:#fff;box-shadow:inset 0 0 0 1px rgba(100,255,227,.45)}
.main{gap:14px}.card{background:linear-gradient(145deg,rgba(15,23,42,.97),rgba(9,15,28,.97));backdrop-filter:blur(18px);border-color:#273552;border-radius:20px}.pet-detail img{border:1px solid #314261;box-shadow:0 14px 34px -18px #000}.pet-detail .pd-name{font-family:inherit;font-weight:900;letter-spacing:-.03em}.stat-box{transition:transform .18s ease,border-color .18s ease}.stat-box:focus-within{transform:translateY(-2px);border-color:var(--accent)}.stat-stepper input{font-size:17px}
.calc-btn{min-height:50px;background:linear-gradient(110deg,#27d6b7,#63edd4);box-shadow:0 14px 32px -18px var(--accent);transition:transform .18s ease,filter .18s ease}.calc-btn:hover{transform:translateY(-2px);filter:brightness(1.06)}
.result-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.result-summary .rs-item{padding:14px 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px}.result-summary .rs-item .rv{font-size:clamp(22px,2.4vw,32px)}.result-summary .rs-item:nth-child(2){border-color:rgba(53,224,193,.42);background:linear-gradient(145deg,rgba(53,224,193,.12),var(--surface-2))}.fun-banner{background:linear-gradient(100deg,rgba(113,78,255,.12),rgba(53,224,193,.07))}.gfill{background:linear-gradient(90deg,#7457ff,var(--accent),var(--accent2))!important}.approx-note{border-left-width:4px}
.result-loading{display:flex;align-items:center;justify-content:center;gap:10px;min-height:130px;color:var(--text-muted);font-weight:700}.result-loading span{width:18px;height:18px;border:2px solid #314261;border-top-color:var(--accent);border-radius:50%;animation:spin .65s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:860px){.sidebar{position:static;max-height:none;width:100%;overflow:hidden}.pet-grid{max-height:390px}.layout{width:100%;grid-template-columns:minmax(0,1fr)}.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.result-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:560px){body{width:100%}.app{width:100%;padding:12px 10px 40px}.masthead{align-items:flex-start}.masthead .title-block{min-width:0}.masthead .title-block p{font-size:14px;overflow-wrap:anywhere}.method-badge{font-size:10px}.card{padding:16px 14px}.pet-grid{width:100%;grid-template-columns:repeat(3,minmax(0,1fr));max-height:310px;overflow-x:hidden}.pet-card-main{min-height:76px;padding:7px 3px}.pet-card-main img{width:40px;height:40px}.pet-card-main .pname{font-size:11px}.stat-stepper{min-width:0}.result-summary{grid-template-columns:minmax(0,1fr)}.calc-row{position:sticky;bottom:8px;z-index:5;max-width:100%;background:rgba(9,15,28,.92);padding:8px;border:1px solid var(--border);border-radius:13px;backdrop-filter:blur(14px)}.calc-btn{width:100%}}

/* 2026 information architecture rebuild — calm working surface */
:root{color-scheme:dark;--bg:#11151b;--surface:#191f27;--surface-2:#202832;--surface-3:#28323e;--text:#edf1f5;--text-muted:#a5b0bc;--border:#35414e;--accent:#8ab4d8;--accent-ink:#101820;--accent2:#c7a86b;--danger:#e49aa8;--danger-bg:#36252a;--shadow:0 10px 28px rgba(0,0,0,.18)}
html,body{background:#11151b}body{font-size:16px;line-height:1.55}.app{max-width:1400px;padding:18px 24px 48px}.masthead{margin:0 0 16px;padding:0}.masthead .title-block h1{font-size:25px;letter-spacing:-.035em;background:none;color:var(--text)}.masthead .title-block p,.method-badge,.tabbar{display:none}.layout{grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:20px;align-items:start}
.sidebar{top:18px;max-height:calc(100vh - 36px);border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:none;backdrop-filter:none}.search-wrap{padding:16px;border-bottom:1px solid var(--border)}.search-input{height:48px;padding:0 14px;background:#141a21;border:1px solid var(--border);border-radius:10px;font-size:15px}.search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(138,180,216,.12)}.chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}.chip{width:100%;min-width:0;padding:8px 4px;background:transparent;border-color:var(--border);font-size:14px}.chip[aria-pressed="true"]{background:#33485b;border-color:#4f708b;box-shadow:none}.list-modes{display:grid;grid-template-columns:1fr 1.45fr 1.15fr;gap:6px;margin-top:12px;padding:4px;background:#11171e;border-radius:10px}.mode-btn{min-height:38px;padding:6px 8px;border:0;border-radius:7px;background:transparent;color:var(--text-muted);font:inherit;font-size:14px;cursor:pointer}.mode-btn b{font-weight:700;color:inherit}.mode-btn[aria-pressed="true"]{background:var(--surface-3);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.22)}
.sort-wrap{margin-top:13px;padding-top:12px;border-top:1px solid var(--border)}.sort-label{display:block;margin-bottom:7px;color:var(--text-muted);font-size:12px;font-weight:700}.sort-buttons{display:grid;grid-template-columns:1.25fr repeat(4,1fr);gap:5px}.sort-btn{position:relative;min-height:34px;padding:5px 3px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--text-muted);font:inherit;font-size:12px;cursor:pointer}.sort-btn:hover{background:#222a34;color:var(--text)}.sort-btn[aria-pressed="true"]{padding-right:14px;background:#304252;border-color:#56728a;color:#fff}.sort-btn[aria-pressed="true"]::after{content:'↓';position:absolute;right:5px}.sort-btn[data-direction="asc"]::after{content:'↑'}.list-modes{margin-top:10px}
.pet-count{padding:10px 16px;font-size:13px;color:var(--text-muted);border-bottom:1px solid var(--border)}.pet-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:0;background:transparent;overflow-y:auto}.pet-card{border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:transparent;contain:layout paint}.pet-card:nth-child(2n){border-right:0}.pet-card-main{min-height:76px;padding:10px 7px;background:transparent;transform:none!important}.pet-card-main:hover{background:#222a34}.pet-card-main[aria-pressed="true"]{background:#30485a;color:#fff;box-shadow:inset 3px 0 0 var(--accent)}.pet-card-main img{width:42px;height:42px;background:#151b22;filter:none}.pet-card-main .pname{font-size:14px;line-height:1.25}.ride-tag{padding:2px 6px;border:1px solid #6c879d;border-radius:99px;color:#b9d4e8;font-size:11px;line-height:1}.fav-star{top:5px;right:5px}
.main{gap:14px}.card{padding:22px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:none;backdrop-filter:none}.pet-detail{padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid var(--border)}.pet-detail img{width:70px;height:70px;border:0;box-shadow:none;background:#141a21}.pet-detail .pd-name{font-size:26px}.stat-box{background:#151b22;border-color:var(--border);border-radius:10px}.stat-box:focus-within{transform:none;border-color:var(--accent)}.stat-stepper input{font-size:18px}.calc-btn{min-height:50px;background:#91b9da;color:#101820;box-shadow:none;border-radius:10px}.calc-btn:hover{transform:none;filter:brightness(1.06)}.result-summary{gap:8px}.result-summary .rs-item{padding:14px;background:#171d24;border-color:var(--border);border-radius:10px}.result-summary .rs-item:nth-child(2){background:#1d2b36;border-color:#476177}.fun-banner{display:none}.gfill{background:#8ab4d8!important}.calc-note{color:var(--text-muted)}.approx-note{background:#2d2921;border-color:#8d774d}.results{margin-top:14px}
.growth-panel{display:grid;grid-template-columns:minmax(130px,.55fr) minmax(0,2.6fr);align-items:center;gap:16px;padding:15px 17px;margin-bottom:16px;background:#141a21;border:1px solid var(--border);border-radius:11px}.panel-heading,.distribution-heading{display:flex;flex-direction:column;gap:2px}.panel-heading strong,.distribution-heading strong{font-size:15px}.panel-heading span,.distribution-heading span{font-size:13px;color:var(--text-muted)}.growth-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.growth-grid>div{display:flex;flex-direction:column;align-items:center;padding:9px 4px;background:var(--surface-2);border-radius:8px}.growth-grid .growth-total{background:#29333d;border:1px solid #415263}.growth-grid span{font-size:12px;color:var(--text-muted)}.growth-grid b{font-size:16px;color:#c7d9e8}.growth-grid .growth-total b{color:#d8c58f}.stat-grid{gap:10px}.calc-row{display:block;margin-top:14px}.calc-btn{width:100%}
.result-hero{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.primary-result{min-height:158px;padding:24px;display:flex;flex-direction:column;justify-content:space-between;background:#18212a;border:1px solid #425466;border-radius:13px}.primary-result>span{color:var(--text-muted);font-weight:700}.primary-result strong{font-size:clamp(52px,7vw,86px);line-height:1;color:#b7d3e9;letter-spacing:-.05em}.primary-result strong small{margin-left:7px;font:700 20px/1 inherit;letter-spacing:-.02em}.primary-result.probability{background:#20251f;border-color:#555d48}.primary-result.probability strong{color:#d7c38d}.result-caution{margin:12px 0 0;padding:10px 12px;color:#dbc88f;background:#2b2921;border-radius:8px;font-size:14px}.distribution-heading{margin:24px 0 10px}.grade-list.simple{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 18px}.grade-simple{display:grid;grid-template-columns:58px minmax(0,1fr) 54px;align-items:center;gap:9px;padding:8px 10px;background:#151b22;border-radius:8px}.grade-simple.is-top{background:#1e2c37}.grade-simple .glabel{font-weight:700}.grade-simple .gtrack{height:8px}.grade-simple .gpct{text-align:right;font-size:14px;color:#d6e0e8}
@media(max-width:860px){.app{padding:14px 14px 40px}.layout{grid-template-columns:minmax(0,1fr);gap:14px}.sidebar{max-height:none}.pet-grid{max-height:330px}.masthead .title-block h1{font-size:22px}.card{padding:18px}.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.app{padding:12px 10px 32px}.search-wrap{padding:12px}.list-modes{grid-template-columns:1fr 1.5fr 1.2fr}.mode-btn{font-size:13px}.pet-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:300px}.pet-card:nth-child(2n){border-right:0}.pet-card-main{min-height:72px}.card{padding:15px}.pet-detail .pd-name{font-size:22px}.growth-panel{grid-template-columns:1fr;gap:10px;padding:13px}.growth-grid{gap:5px}.growth-grid b{font-size:14px}.result-hero{grid-template-columns:1fr 1fr;gap:7px}.primary-result{min-height:118px;padding:16px 12px}.primary-result strong{font-size:40px}.primary-result strong small{font-size:15px}.grade-list.simple{grid-template-columns:1fr}.result-summary{grid-template-columns:1fr}.calc-row{position:static;padding:0;border:0;background:transparent;backdrop-filter:none}.calc-btn{width:100%}}

/* compact three-column browser + visible elemental attributes */
.masthead .title-block{width:100%;text-align:center}.masthead .title-block h1{text-align:center}
.layout{grid-template-columns:minmax(390px,470px) minmax(0,1fr);gap:16px}
.pet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.pet-card{border-right:1px solid var(--border)}.pet-card:nth-child(2n){border-right:1px solid var(--border)}.pet-card:nth-child(3n){border-right:0}
.pet-card-main{min-height:88px;padding:8px 4px}.pet-card-main img{width:38px;height:38px}.pet-card-main .pname{font-size:12px}
.pet-attr-mini,.pet-attr-detail{display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:wrap}.pet-attr-mini i,.pet-attr-detail i{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:99px;font-style:normal;font-weight:800;line-height:1;white-space:nowrap}.pet-attr-mini i{padding:3px 5px;font-size:10px;background:#141a21}.pet-attr-detail{justify-content:flex-start}.pet-attr-detail i{padding:5px 8px;font-size:12px;background:#141a21}.pet-attr-mini i[data-attr="지"],.pet-attr-detail i[data-attr="지"]{color:#9bc58f}.pet-attr-mini i[data-attr="수"],.pet-attr-detail i[data-attr="수"]{color:#91c8ee}.pet-attr-mini i[data-attr="화"],.pet-attr-detail i[data-attr="화"]{color:#efa08e}.pet-attr-mini i[data-attr="풍"],.pet-attr-detail i[data-attr="풍"]{color:#e1c96e}
.main{gap:10px}.card{padding:17px}.pet-detail{gap:13px;padding-bottom:12px;margin-bottom:12px}.pet-detail img{width:62px;height:62px}.pet-detail .pd-name{font-size:24px;margin-bottom:3px}.pet-detail .pd-meta{gap:5px}.growth-panel{gap:11px;padding:11px 13px;margin-bottom:11px}.growth-grid{gap:5px}.growth-grid>div{padding:7px 3px}.stat-grid{gap:7px}.calc-row{margin-top:10px}.results{margin-top:10px}.result-hero{gap:8px}.primary-result{min-height:132px;padding:18px}.distribution-heading{margin:17px 0 8px}.grade-list.simple{gap:6px 12px}.grade-simple{padding:7px 9px}
@media(max-width:860px){.layout{grid-template-columns:minmax(0,1fr)}.pet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.pet-card:nth-child(2n){border-right:1px solid var(--border)}.pet-card:nth-child(3n){border-right:0}}
@media(max-width:520px){.masthead .title-block h1{font-size:22px}.pet-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pet-card:nth-child(3n){border-right:1px solid var(--border)}.pet-card:nth-child(2n){border-right:0}.pet-card-main{min-height:84px}.pet-attr-mini i{font-size:9px;padding:3px 4px}.card{padding:14px}.growth-panel{padding:10px}.growth-grid>div{padding:6px 2px}}

.app-switcher{display:flex;justify-content:center;gap:5px;width:max-content;max-width:100%;margin:0 auto 16px;padding:5px;background:#0d1218;border:1px solid var(--border);border-radius:12px}.app-tab{min-height:42px;padding:8px 18px;border:0;border-radius:8px;background:transparent;color:var(--text-muted);font:700 14px/1 inherit;cursor:pointer}.app-tab:hover{color:var(--text);background:#1c242d}.app-tab.is-active{color:#f7fbff;background:#30485a;box-shadow:0 1px 4px rgba(0,0,0,.28)}.app-tab b{display:inline-flex;min-width:20px;height:20px;margin-left:5px;padding:0 5px;align-items:center;justify-content:center;border-radius:99px;background:#111820;color:#bcd0e0;font-size:11px}.app-panel[hidden]{display:none!important}
.rebirth-shell,.saved-shell{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:14px}.workspace-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.workspace-head h2{margin:0 0 3px;font-size:22px;letter-spacing:-.025em}.workspace-head p{margin:0;color:var(--text-muted);font-size:14px}.quiet-btn{min-height:38px;padding:8px 13px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);font:700 13px/1 inherit;cursor:pointer}.quiet-btn:hover{background:var(--surface-2)}
.rebirth-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.rebirth-stage{min-width:0;padding:12px;background:#141a21;border:1px solid var(--border);border-radius:11px}.rebirth-stage.is-latest{border-color:#60798e;background:#18232c}.stage-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.stage-title strong{font-size:15px}.stage-title span{color:var(--text-muted);font-size:11px}.rebirth-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px}.rebirth-field{display:flex;flex-direction:column;gap:4px;min-width:0}.rebirth-field.full{grid-column:1/-1}.rebirth-field span{color:var(--text-muted);font-size:11px;font-weight:700}.rebirth-field input{width:100%;height:38px;padding:0 8px;border:1px solid var(--border);border-radius:7px;background:#202832;color:var(--text);font:700 14px/1 inherit;text-align:center;outline:none}.rebirth-field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(138,180,216,.1)}.rebirth-field input[readonly]{color:#aab6c2;background:#10161c}.rebirth-output{margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}.rebirth-output-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.rebirth-output-grid div{padding:6px 4px;text-align:center;background:#202832;border-radius:6px}.rebirth-output-grid span{display:block;color:var(--text-muted);font-size:10px}.rebirth-output-grid b{font-size:13px}.rebirth-total{display:flex;align-items:end;justify-content:space-between;margin-top:7px;padding:9px;background:#25291f;border:1px solid #515842;border-radius:7px}.rebirth-total span{font-size:11px;color:#c8c9ad}.rebirth-total strong{font-size:21px;color:#dfca8a}.rebirth-warning{min-height:18px;margin:6px 0 0;color:#e7a7a7;font-size:11px}.save-strip{display:flex;align-items:end;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}.save-strip label{display:flex;flex-direction:column;gap:4px;width:min(320px,100%)}.save-strip label span{font-size:12px;color:var(--text-muted);font-weight:700}.save-strip input{height:42px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:#141a21;color:var(--text);font:inherit}.save-strip button{height:42px;padding:0 17px;border:0;border-radius:8px;background:#91b9da;color:#101820;font-weight:800;cursor:pointer}.storage-note{margin:8px 0 0;text-align:right;color:var(--text-muted);font-size:12px}
.saved-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.saved-empty{grid-column:1/-1;padding:54px 18px;text-align:center;color:var(--text-muted);background:#141a21;border:1px dashed var(--border);border-radius:11px}.saved-card{padding:15px;background:#141a21;border:1px solid var(--border);border-radius:11px}.saved-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.saved-card h3{margin:0;font-size:16px}.saved-card time{display:block;margin-top:3px;color:var(--text-muted);font-size:11px}.saved-card-summary{display:flex;gap:6px;margin:13px 0}.saved-card-summary span{flex:1;padding:8px;text-align:center;background:#202832;border-radius:7px;color:var(--text-muted);font-size:11px}.saved-card-summary b{display:block;margin-top:2px;color:var(--text);font-size:16px}.saved-card-actions{display:grid;grid-template-columns:1fr auto;gap:6px}.saved-card-actions button{min-height:36px;border:1px solid var(--border);border-radius:7px;background:#202832;color:var(--text);font-weight:700;cursor:pointer}.saved-card-actions .delete-save{padding:0 11px;color:#e6a0aa}.save-feedback{position:fixed;left:50%;bottom:24px;z-index:30;transform:translate(-50%,20px);padding:10px 15px;border:1px solid #60798e;border-radius:9px;background:#17232c;color:#eef6fb;box-shadow:0 12px 28px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:.2s}.save-feedback.show{opacity:1;transform:translate(-50%,0)}
@media(max-width:1080px){.rebirth-stages{grid-template-columns:repeat(3,minmax(0,1fr))}.saved-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.app-switcher{width:100%}.app-tab{flex:1;padding:8px 5px;font-size:13px}.rebirth-shell,.saved-shell{padding:14px}.workspace-head{align-items:center}.workspace-head h2{font-size:19px}.workspace-head p{font-size:13px}.rebirth-stages{display:flex;gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.rebirth-stage{flex:0 0 min(82vw,300px);scroll-snap-align:start}.saved-list{grid-template-columns:1fr}.save-strip{align-items:stretch;flex-direction:column}.save-strip label{width:100%}.storage-note{text-align:left}}

/* selected pet showcase */
.main>.card:first-child{padding:20px}
.pet-detail{display:grid;grid-template-columns:190px minmax(0,1fr);gap:24px;align-items:stretch;padding:0 0 20px;margin:0 0 18px}
.pet-portrait{display:grid;place-items:center;min-height:190px;padding:14px;border:1px solid #405061;border-radius:16px;background:radial-gradient(circle at 50% 42%,#2b3948 0%,#182029 68%,#121820 100%);overflow:hidden}
.pet-detail .pet-portrait img{width:160px;height:160px;max-width:100%;object-fit:contain;border:0;background:transparent;box-shadow:none;image-rendering:auto;filter:drop-shadow(0 16px 18px rgba(0,0,0,.4))}
.pet-identity{display:flex;min-width:0;flex-direction:column;justify-content:center;padding:4px 0}
.detail-eyebrow{margin-bottom:4px;color:var(--accent);font-size:13px;font-weight:800;letter-spacing:.08em}
.pet-detail .pd-name{margin:0 0 9px;font-size:clamp(30px,4vw,44px);line-height:1.08}
.pet-detail .pd-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.obtain-card{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;align-items:center;margin-top:18px;padding:14px 16px;border:1px solid #46596b;border-radius:11px;background:#141b23}
.obtain-card span{color:var(--text-muted);font-size:14px;font-weight:700}
.obtain-card strong{font-size:16px;line-height:1.45;color:#f2f6fa;overflow-wrap:anywhere}
@media(min-width:1180px){.layout{grid-template-columns:minmax(390px,450px) minmax(620px,1fr)}.pet-detail{grid-template-columns:210px minmax(0,1fr)}.pet-portrait{min-height:210px}.pet-detail .pet-portrait img{width:180px;height:180px}}
@media(max-width:620px){.main>.card:first-child{padding:14px}.pet-detail{grid-template-columns:132px minmax(0,1fr);gap:14px;padding-bottom:15px}.pet-portrait{min-height:132px;padding:8px;border-radius:13px}.pet-detail .pet-portrait img{width:116px;height:116px}.detail-eyebrow{font-size:12px}.pet-detail .pd-name{font-size:27px}.obtain-card{grid-template-columns:1fr;gap:3px;margin-top:12px;padding:11px 12px}.obtain-card span{font-size:12px}.obtain-card strong{font-size:14px}.pet-attr-detail i{font-size:11px;padding:4px 7px}}
@media(max-width:390px){.pet-detail{grid-template-columns:108px minmax(0,1fr);gap:11px}.pet-portrait{min-height:108px}.pet-detail .pet-portrait img{width:96px;height:96px}.pet-detail .pd-name{font-size:23px}.pet-detail .pd-meta{gap:4px}}
/* Larger animated source portraits; search stays compact. */
.pet-detail{grid-template-columns:240px minmax(0,1fr);gap:22px}
.pet-portrait{min-height:240px;background:radial-gradient(circle at 50% 45%,#35495d,#17212c 72%)}
.pet-detail .pet-portrait img{width:220px;height:220px;image-rendering:pixelated}
.pet-card-main .pname{font-size:14px}.pet-source{margin:12px 0 0;font-size:14px;line-height:1.5;color:var(--text-muted)}
.pet-source a{color:var(--accent);text-underline-offset:3px}
@media(min-width:1180px){.pet-detail{grid-template-columns:260px minmax(0,1fr)}.pet-portrait{min-height:260px}.pet-detail .pet-portrait img{width:240px;height:240px}}
@media(max-width:760px){.pet-detail{grid-template-columns:1fr;gap:16px}.pet-portrait{min-height:220px}.pet-detail .pet-portrait img{width:210px;height:210px}.pet-identity{padding:0}.pet-detail .pd-name{font-size:30px}.obtain-card{grid-template-columns:1fr;gap:6px;margin-top:12px}.obtain-card span{font-size:14px}.obtain-card strong{font-size:16px}}
/* Light, refined workspace. Portraits retain their source animation at 80% size. */
:root{color-scheme:light;--bg:#f5f7fb;--surface:#fff;--surface-2:#f1f5fb;--surface-3:#e8eef9;--text:#20304a;--text-muted:#64748b;--border:#dfe6f0;--accent:#4169dc;--accent-ink:#fff;--accent2:#b47716;--danger:#bc4259;--danger-bg:#fff1f4;--shadow:0 8px 28px rgba(32,48,74,.05)}
html,body{background:var(--bg)}body{background:linear-gradient(180deg,#eef3ff 0,#f7f9fc 280px);color:var(--text)}
.app{max-width:1440px;padding:28px 28px 56px}.masthead{padding:0 2px;margin-bottom:22px}.masthead .title-block{text-align:left}.masthead .title-block h1{color:#20304a;font-size:30px;font-weight:800;letter-spacing:-.05em}.method-badge{display:block!important;color:#64748b!important;border-color:var(--border)!important;background:#fff!important;box-shadow:none!important;font-size:14px;padding:8px 12px;border-radius:99px}
.app-switcher{margin:0 0 20px;padding:5px;background:#fff;border-color:var(--border);box-shadow:var(--shadow)}.app-tab{min-height:44px;padding:10px 20px;color:var(--text-muted)}.app-tab:hover{background:#f1f5fb;color:var(--text)}.app-tab.is-active{background:var(--accent);color:#fff;box-shadow:0 3px 8px rgba(65,105,220,.16)}.app-tab b{background:#edf2ff;color:#4169dc;font-size:12px}.app-tab.is-active b{background:rgba(255,255,255,.2);color:#fff}
.layout{grid-template-columns:minmax(320px,360px) minmax(0,1fr);gap:22px}.sidebar{background:#fff;border-radius:18px;box-shadow:var(--shadow)}.card{background:#fff;border-color:var(--border);border-radius:18px;box-shadow:var(--shadow)}.search-wrap{padding:16px}.search-input{background:#f7f9fc;color:var(--text);border-color:var(--border);font-size:16px}.search-input:focus{box-shadow:0 0 0 3px rgba(65,105,220,.12)}
.chip{background:#fff;color:var(--text-muted);border-color:var(--border)}.chip[aria-pressed="true"]{background:#edf2ff;border-color:#bdcdf8;color:#345ac3}.list-modes{background:#f0f3f9}.mode-btn[aria-pressed="true"]{background:#fff;color:#345ac3;box-shadow:0 2px 6px rgba(32,48,74,.08)}.sort-label,.sort-btn{font-size:14px}.sort-btn:hover{background:#f3f6fc;color:var(--text)}.sort-btn[aria-pressed="true"]{background:#edf2ff;border-color:#bdcdf8;color:#345ac3}
.pet-count{font-size:14px}.pet-grid{padding:10px;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.pet-card,.pet-card:nth-child(2n),.pet-card:nth-child(3n){background:#fff;border:1px solid var(--border);border-radius:12px}.pet-card-main{min-height:86px;border-radius:11px}.pet-card-main:hover{background:#f5f8ff}.pet-card-main[aria-pressed="true"]{background:#edf3ff;color:#2749a7;box-shadow:inset 0 0 0 1px #9cb6f6}.pet-card-main img{width:34px;height:34px;background:transparent;border:0}.pet-card-main .pname{font-size:14px}.ride-tag{background:#f0f6ff;border-color:#c6d8ee;color:#426b97}.fav-star{color:#7a889b}.fav-star:hover{background:#fff5d9}.fav-star[aria-pressed="true"]{color:#b77a14}
.main>.card:first-child{padding:24px}.pet-detail{grid-template-columns:200px minmax(0,1fr);gap:24px}.pet-portrait{min-height:200px;padding:10px;border-color:#e1e9f5;border-radius:16px;background:radial-gradient(circle at 50% 40%,#fff 0,#edf3fd 100%)}.pet-detail .pet-portrait img{width:176px;height:176px;image-rendering:auto;filter:drop-shadow(0 8px 9px rgba(55,77,112,.12));background:transparent}.detail-eyebrow{font-size:14px;letter-spacing:.04em}.pet-detail .pd-name{font-size:clamp(28px,3vw,38px);color:#20304a}.obtain-card{background:#f4f7fe;border-color:#dee7f8;border-radius:12px;padding:14px 16px}.obtain-card strong{color:#334766}.pet-attr-detail i{font-size:14px}
.growth-panel{background:#f8fafd;border-color:var(--border);padding:16px}.panel-heading span,.distribution-heading span,.growth-grid span{font-size:14px}.growth-grid>div{background:#edf2f9}.growth-grid b{color:#3d5c82}.growth-grid .growth-total{background:#e9efff;border-color:#cddafa}.growth-grid .growth-total b{color:#345ac3}
.stat-box{background:#f8fafd;border-color:var(--border)}.stat-stepper input{background:transparent;color:var(--text)}.stat-stepper button{background:#eaf0f9;color:#4e6282;border-color:var(--border)}.stat-label{color:var(--text-muted)}.calc-btn,.save-strip button{background:var(--accent);color:#fff;box-shadow:0 4px 12px rgba(65,105,220,.14)}.calc-btn:hover{filter:brightness(1.04)}.calc-row{background:transparent;backdrop-filter:none}.approx-note,.result-caution{background:#fff7e8;border-color:#ead6ac;color:#8b6421}
.primary-result{background:linear-gradient(135deg,#f3f6ff,#fff);border-color:#d5dff8}.primary-result strong{color:#345ac3}.primary-result.probability{background:linear-gradient(135deg,#effaf6,#fff);border-color:#cde9de}.primary-result.probability strong{color:#27846b}.grade-simple{background:#f4f7fb}.grade-simple.is-top{background:#eaf0ff}.grade-simple .gpct{color:#4c617f}.gtrack{background:#e1e8f3}.gfill{background:#6888e7!important}.result-summary .rs-item{background:#f6f8fc}.result-summary .rs-item:nth-child(2){background:#edf3ff;border-color:#cbdaf8}
.rebirth-shell,.saved-shell{background:#fff}.rebirth-stage{background:#f8fafd;border-color:var(--border);border-radius:14px}.rebirth-stage.is-latest{background:#f1f5ff;border-color:#b4c8f5}.rebirth-field span,.rebirth-output-grid span,.rebirth-total span,.save-strip label span,.storage-note,.saved-card time,.saved-card-summary span{font-size:14px}.stage-title span{font-size:14px}.rebirth-field input,.save-strip input{background:#fff;border-color:var(--border);color:var(--text)}.rebirth-field input[readonly]{background:#edf1f7;color:#64748b}.rebirth-output-grid div{background:#eef3fa}.rebirth-total{background:#eaf0ff;border-color:#cbd9f8}.rebirth-total span{color:#536b99}.rebirth-total strong{color:#345ac3}.rebirth-warning{font-size:14px;color:#bc4259}.saved-empty,.saved-card{background:#f8fafd;border-color:var(--border)}.saved-card-summary span,.saved-card-actions button{background:#edf2fa}.saved-card-actions .delete-save{color:#bc4259}.save-feedback{background:#fff;color:#345ac3;border-color:#b9cbf5;box-shadow:var(--shadow)}
.modal-backdrop{background:rgba(24,40,68,.3);backdrop-filter:blur(5px)}.modal{background:#fff;color:var(--text);border-color:var(--border);box-shadow:0 20px 60px rgba(24,40,68,.18)}.modal input,.modal select{background:#f8fafd;color:var(--text);border-color:var(--border)}.modal th,.modal td{border-color:var(--border)}.modal th{background:#eef3fa;color:#4e6282}.modal tr:hover td{background:#f3f6fc}
button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #4169dc;outline-offset:3px}
@media(min-width:1180px){.layout{grid-template-columns:360px minmax(0,1fr)}.pet-detail{grid-template-columns:216px minmax(0,1fr)}.pet-portrait{min-height:216px}.pet-detail .pet-portrait img{width:192px;height:192px}}
@media(max-width:980px){.layout{grid-template-columns:minmax(0,1fr)}.sidebar{position:static;max-height:none}.pet-grid{max-height:300px;grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.app{padding:20px 14px 36px}.masthead .title-block h1{font-size:25px}.app-switcher{width:100%}.app-tab{flex:1;padding:10px 6px;font-size:14px}.main>.card:first-child{padding:18px}.pet-detail{grid-template-columns:1fr;gap:16px}.pet-portrait{min-height:184px}.pet-detail .pet-portrait img{width:168px;height:168px}.pet-detail .pd-name{font-size:30px}.growth-panel{grid-template-columns:1fr}.obtain-card{grid-template-columns:1fr;gap:6px}.method-badge{padding:6px 9px;font-size:14px}.calc-row{position:static;padding:0;border:0}.result-hero{gap:10px}.primary-result{padding:18px}}
@media(max-width:520px){.masthead{gap:8px}.masthead .title-block h1{font-size:22px}.pet-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.growth-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.result-hero,.grade-list.simple{grid-template-columns:1fr}.primary-result{min-height:130px}.rebirth-shell,.saved-shell{padding:16px}.sort-buttons{gap:4px}.sort-btn{font-size:14px}}
/* Keep the requested three-column catalog at every viewport. */
.pet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.pet-card-main{padding:10px 4px}.pet-card-main .pname{line-height:1.4;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
`;
const warmTheme = await readFile(path.join(root, 'styles', 'warm-workspace.css'), 'utf8');
replaceRequired('</style>', `${uiOverrides}\n${warmTheme}\n</style>`, 'style block');

const rebirthScript = `
<script>
(function(){
  'use strict';
  const STORAGE_KEY='ohr_rebirth_saves_v1';
  const stages=document.getElementById('rebirthStages');
  const fields=['lv','hp','atk','def','agi','q'];
  const labels={lv:'레벨',hp:'체력',atk:'완력',def:'건강',agi:'순발',q:'환포퀘'};
  const defaults={lv:'',hp:'',atk:'',def:'',agi:'',q:''};
  let lastResults=[];

  function stageMarkup(i){
    const inputs=fields.map(function(field){
      const value=field==='q'?String((i+1)*10):defaults[field];
      return '<label class="rebirth-field '+(field==='lv'||field==='q'?'full':'')+'"><span>'+labels[field]+(field==='q'?' (누적)':'')+'</span><input type="number" inputmode="numeric" min="0" data-r-field="'+field+'" data-stage="'+i+'" value="'+value+'" placeholder="0"></label>';
    }).join('');
    return '<article class="rebirth-stage" data-stage-card="'+i+'"><div class="stage-title"><strong>'+i+'환 → '+(i+1)+'환</strong><span>'+String(i+1).padStart(2,'0')+'</span></div><div class="rebirth-fields"><label class="rebirth-field full"><span>초기 스탯</span><input type="number" data-r-base="'+i+'" value="'+(i===0?'20':'')+'" readonly></label>'+inputs+'</div><div class="rebirth-output"><div class="rebirth-output-grid"><div><span>체력</span><b data-out="hp">—</b></div><div><span>완력</span><b data-out="atk">—</b></div><div><span>건강</span><b data-out="def">—</b></div><div><span>순발</span><b data-out="agi">—</b></div></div><div class="rebirth-total"><span>총 환포</span><strong data-out="total">—</strong></div><p class="rebirth-warning" data-out="warning"></p></div></article>';
  }
  stages.innerHTML=[0,1,2,3,4].map(stageMarkup).join('');
  stages.querySelectorAll('.rebirth-stage').forEach(function(card){
    const details=document.createElement('div');
    details.className='rebirth-output-grid';
    details.innerHTML='<div><span>남은 스탯</span><b data-out="remaining">—</b></div><div><span>총 스탯</span><b data-out="totalStat">—</b></div><div><span>계산식</span><b data-out="formula">—</b></div><div><span>총 환포 · 소수점</span><b data-out="decimal">—</b></div>';
    card.querySelector('.rebirth-output').prepend(details);
  });
  const loadButton=document.createElement('button');
  loadButton.type='button';loadButton.id='loadRebirth';loadButton.className='quiet-btn';loadButton.textContent='불러오기';
  document.getElementById('saveRebirth').after(loadButton);

  function numberValue(field,i){
    const el=document.querySelector('[data-r-field="'+field+'"][data-stage="'+i+'"]');
    return Number(el.value)||0;
  }
  function trunc2(value){ const str=value.toFixed(4); return Number(str.substring(0,str.indexOf('.')+3)); }
  function clearStage(i){
    const card=document.querySelector('[data-stage-card="'+i+'"]');
    card.classList.remove('is-latest');
    card.querySelectorAll('[data-out]').forEach(function(el){el.textContent=el.dataset.out==='warning'?'':'—';});
  }
  function runRebirth(){
    let leftovers=[0,0,0,0], totalLevel=0, nextBase=20;
    lastResults=[];
    document.querySelectorAll('.rebirth-stage').forEach(function(card){card.classList.remove('is-latest');});
    for(let i=0;i<5;i++){
      const baseEl=document.querySelector('[data-r-base="'+i+'"]');
      baseEl.value=i===0?20:(nextBase==null?'':nextBase);
      let level=Math.min(140,Math.max(0,numberValue('lv',i)));
      if(!level || nextBase==null){ clearStage(i); nextBase=null; continue; }
      totalLevel+=level;
      const base=Number(baseEl.value)||0;
      const totalStat=base+Math.max(0,level-1)*3;
      const stats=['hp','atk','def','agi'].map(function(field){return numberValue(field,i);});
      const quest=numberValue('q',i);
      const remaining=totalStat-stats.reduce(function(sum,value){return sum+value;},0);
      const actualTotal=stats.reduce(function(sum,value,index){return sum+value+leftovers[index];},remaining);
      const formula=Math.floor(actualTotal/12+quest/4+(totalLevel-(i+1)*85)/4);
      const calculated=stats.map(function(value,index){return trunc2(((value+leftovers[index])/actualTotal)*formula+0.5);});
      leftovers=calculated.map(function(value){return Number((value%1).toFixed(2));});
      const final=calculated.reduce(function(sum,value){return sum+Math.floor(value);},0)+(i+1)*10;
      nextBase=final;
      const card=document.querySelector('[data-stage-card="'+i+'"]');
      ['hp','atk','def','agi'].forEach(function(field,index){card.querySelector('[data-out="'+field+'"]').textContent=Math.floor(calculated[index])+' · '+calculated[index].toFixed(2);});
      card.querySelector('[data-out="total"]').textContent=final;
      card.querySelector('[data-out="remaining"]').textContent=remaining;
      card.querySelector('[data-out="totalStat"]').textContent=totalStat;
      card.querySelector('[data-out="formula"]').textContent=formula;
      card.querySelector('[data-out="decimal"]').textContent=(calculated.reduce(function(sum,value){return sum+value;},0)+(i+1)*10).toFixed(2);
      card.querySelector('[data-out="warning"]').textContent=remaining<0?'분배 스탯이 총 스탯을 '+Math.abs(remaining)+' 초과했습니다.':'';
      lastResults.push({stage:i+1,base:base,level:level,totalStat:totalStat,remaining:remaining,formula:formula,stats:calculated,final:final,decimal:Number((calculated.reduce(function(sum,value){return sum+value;},0)+(i+1)*10).toFixed(2))});
    }
    if(lastResults.length){document.querySelector('[data-stage-card="'+(lastResults[lastResults.length-1].stage-1)+'"]').classList.add('is-latest');}
  }
  stages.addEventListener('input',runRebirth);

  function collectInputs(){
    const data={};
    fields.forEach(function(field){for(let i=0;i<5;i++){data[field+'_'+i]=document.querySelector('[data-r-field="'+field+'"][data-stage="'+i+'"]').value;}});
    return data;
  }
  function applyInputs(data){
    fields.forEach(function(field){for(let i=0;i<5;i++){const el=document.querySelector('[data-r-field="'+field+'"][data-stage="'+i+'"]');el.value=data[field+'_'+i]!==undefined?data[field+'_'+i]:(field==='q'?(i+1)*10:'');}});
    runRebirth();
  }
  function readSaves(){
    try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch(_error){return [];}
  }
  function writeSaves(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}
  function showFeedback(message){
    let el=document.querySelector('.save-feedback');
    if(!el){el=document.createElement('div');el.className='save-feedback';document.body.appendChild(el);}
    el.textContent=message;el.classList.add('show');clearTimeout(showFeedback.timer);showFeedback.timer=setTimeout(function(){el.classList.remove('show');},1800);
  }
  function renderSaved(){
    const list=document.getElementById('savedList');
    const saves=readSaves();
    document.getElementById('savedCount').textContent=saves.length;
    if(!saves.length){list.innerHTML='<div class="saved-empty">저장한 계산이 없습니다.<br>환생포인트 탭에서 계산한 뒤 저장해보세요.</div>';return;}
    list.innerHTML='';
    saves.forEach(function(item){
      const card=document.createElement('article');card.className='saved-card';card.dataset.saveId=item.id;
      card.innerHTML='<div class="saved-card-head"><div><h3></h3><time></time></div></div><div class="saved-card-summary"><span>계산 단계<b>'+(item.summary.stage||0)+'환</b></span><span>최종 환포<b>'+(item.summary.final==null?'—':item.summary.final)+'</b></span></div><div class="saved-card-actions"><button type="button" class="load-save">불러오기</button><button type="button" class="delete-save" aria-label="저장 기록 삭제">삭제</button></div>';
      card.querySelector('h3').textContent=item.name;
      card.querySelector('time').textContent=new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.createdAt));
      list.appendChild(card);
    });
  }
  function switchApp(tab){
    document.querySelectorAll('.app-tab').forEach(function(btn){const active=btn.dataset.appTab===tab;btn.classList.toggle('is-active',active);btn.setAttribute('aria-selected',String(active));});
    document.getElementById('hallucinationPanel').hidden=tab!=='hallucination';
    document.getElementById('rebirthPanel').hidden=tab!=='rebirth';
    document.getElementById('savedPanel').hidden=tab!=='saved';
    if(tab==='saved')renderSaved();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.querySelector('.app-switcher').addEventListener('click',function(event){const btn=event.target.closest('[data-app-tab]');if(btn)switchApp(btn.dataset.appTab);});
  loadButton.addEventListener('click',function(){switchApp('saved');});
  document.getElementById('rebirthReset').addEventListener('click',function(){
    fields.forEach(function(field){for(let i=0;i<5;i++){document.querySelector('[data-r-field="'+field+'"][data-stage="'+i+'"]').value=field==='q'?(i+1)*10:'';}});document.getElementById('saveName').value='';runRebirth();showFeedback('입력값을 초기화했습니다.');
  });
  document.getElementById('saveRebirth').addEventListener('click',function(){
    if(!lastResults.length){showFeedback('먼저 레벨과 스탯을 입력해주세요.');return;}
    const latest=lastResults[lastResults.length-1];
    const name=document.getElementById('saveName').value.trim()||latest.stage+'환 계산';
    const saves=readSaves();saves.unshift({id:String(Date.now()),name:name,createdAt:new Date().toISOString(),inputs:collectInputs(),summary:{stage:latest.stage,final:latest.final}});writeSaves(saves.slice(0,50));renderSaved();showFeedback('계산을 저장했습니다.');
  });
  document.getElementById('savedList').addEventListener('click',function(event){
    const card=event.target.closest('[data-save-id]');if(!card)return;const saves=readSaves();const item=saves.find(function(save){return save.id===card.dataset.saveId;});if(!item)return;
    if(event.target.closest('.load-save')){applyInputs(item.inputs);document.getElementById('saveName').value=item.name;switchApp('rebirth');showFeedback('저장된 계산을 불러왔습니다.');}
    if(event.target.closest('.delete-save')&&window.confirm('이 저장 기록을 삭제할까요?')){writeSaves(saves.filter(function(save){return save.id!==item.id;}));renderSaved();showFeedback('저장 기록을 삭제했습니다.');}
  });
  runRebirth();renderSaved();
})();
</script>`;
replaceRequired('</script>\n</body>', '</script>\n' + rebirthScript + '\n</body>', 'rebirth calculator behavior');

const decimalCode = (await readFile(path.join(root, 'scripts', 'decimal-calculator.mjs'), 'utf8')).replace('export function', 'function');
const decimalUi = await readFile(path.join(root, 'scripts', 'decimal-ui.js'), 'utf8');
const decimalCss = await readFile(path.join(root, 'scripts', 'decimal-ui.css'), 'utf8');
replaceRequired('</head>', '<style>\n'+decimalCss+'\n</style>\n</head>', 'decimal layout');
replaceRequired('</body>', '<script>\n(function(){\n'+decimalCode+'\n'+decimalUi+'\n})();\n</script>\n</body>', 'decimal calculator');
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');
console.log(JSON.stringify({ source: SOURCE_URL, outputPath, pets: pets.length, bytes: Buffer.byteLength(html) }));
