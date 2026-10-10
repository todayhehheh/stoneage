import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/application\/json|\bsrc=/.test(script[1])) continue;
  new Script(script[2]);
}
const match = html.match(/<script\s+type="application\/json"\s+id="pet-data">([\s\S]*?)<\/script>/);
if (!match) throw new Error('pet-data missing');
const pets = JSON.parse(match[1]);
const rankMatch = html.match(/<script\s+type="application\/json"\s+id="rank-compare-data">([\s\S]*?)<\/script>/);
if (!rankMatch) throw new Error('rank-compare-data missing');
const rankCompare = JSON.parse(rankMatch[1]);
const snapshot = JSON.parse(await readFile(path.join(root, 'data', 'petinfo-update.json'), 'utf8'));
const initialCorrections = JSON.parse(await readFile(path.join(root, 'data', 'pet-initial-corrections.json'), 'utf8'));
if (pets.length < snapshot.length) throw new Error('Merged catalog lost pets');
if (new Set(pets.map(pet => pet.id)).size !== pets.length) throw new Error('Duplicate pet IDs');
if (new Set(pets.map(pet => pet.name)).size !== pets.length) throw new Error('Duplicate pet names');
if (!html.includes('k*(2*v0+20*v1+2*v2+v3)/2000')) throw new Error('Exact integer calculation missing');
if (!html.includes('data-sort="total"') || !html.includes("let sortKey = ''")) throw new Error('Growth sorting controls missing');
if (html.includes('게임에 표시된 레벨 1 수치를 입력하세요')) throw new Error('Removed input helper copy returned');
if (!html.includes('<title>오르서버 환각 계산기</title>')) throw new Error('Site title missing');
if (!html.includes(`전체 ${pets.length}종`)) throw new Error('Updated pet count badge missing');
if (html.includes('첨부 자료 기준') || html.includes('첨부 기준')) throw new Error('Source boilerplate returned');
if (!html.includes('color-scheme:light') || !html.includes('width:192px;height:192px')) throw new Error('Light theme or reduced portraits missing');
if (!html.includes('총성장률') || !html.includes('growthS.slice(1)')) throw new Error('Total growth rate missing');
if (html.includes('입력값과 일치하는 경우의 비율')) throw new Error('Removed distribution helper copy returned');
if (!html.includes('환생포인트 계산기') || !html.includes('id="savedPanel"')) throw new Error('Rebirth or saved tab missing');
if (!html.includes("const STORAGE_KEY='ohr_rebirth_saves_v1'")) throw new Error('Saved calculations storage missing');

function verifyRebirthStage({ base, level, stats, quest, totalLevel, stage, leftovers = [0, 0, 0, 0] }) {
  const totalStat = base + Math.max(0, level - 1) * 3;
  const remaining = totalStat - stats.reduce((sum, value) => sum + value, 0);
  const actualTotal = stats.reduce((sum, value, index) => sum + value + leftovers[index], remaining);
  const formula = Math.floor(actualTotal / 12 + quest / 4 + (totalLevel - stage * 85) / 4);
  const calculated = stats.map((value, index) => Math.trunc((((value + leftovers[index]) / actualTotal) * formula + 0.5) * 100) / 100);
  const final = calculated.reduce((sum, value) => sum + Math.floor(value), 0) + stage * 10;
  return { totalStat, remaining, formula, calculated, final };
}
const rebirthRegression = verifyRebirthStage({ base: 20, level: 85, stats: [100, 60, 60, 52], quest: 10, totalLevel: 85, stage: 1 });
if (JSON.stringify(rebirthRegression) !== JSON.stringify({ totalStat: 272, remaining: 0, formula: 25, calculated: [9.69, 6.01, 6.01, 5.27], final: 36 })) {
  throw new Error(`Rebirth regression: ${JSON.stringify(rebirthRegression)}`);
}

const beropori = pets.find(pet => String(pet.id) === '35');
const katarkas = pets.find(pet => String(pet.id) === '50');
if (!beropori?.approx || !beropori.dataNote) throw new Error('Beropori quality warning missing');
if (!katarkas?.ok) throw new Error('Katarkas calculation missing');
const rideable = pets.filter(pet => pet.rideable);
if (!html.includes(`<b id="rideableCount">${rideable.length}</b>`)) throw new Error('Rideable count does not match actual data');
if (!rideable.length) throw new Error('Rideable pet data missing');
for (const update of snapshot) {
  const pet=pets.find(item => item.id===update.id || item.name===update.name);
  if (!pet) throw new Error(`Snapshot pet missing: ${update.name}`);
  for (const key of ['name','growthS','initS','attrs','rideable','imageUrl']) {
    const expectedValue = key === 'initS' && initialCorrections[update.name] ? initialCorrections[update.name] : update[key];
    if (JSON.stringify(pet[key])!==JSON.stringify(expectedValue)) throw new Error(`Snapshot mismatch: ${update.name} ${key}`);
  }
  if (!pet.obtainDetail) throw new Error(`Obtain method missing: ${pet.name}`);
  const bytes=Buffer.from(pet.img,'base64');
  if (pet.imageMime==='image/gif' && bytes.subarray(0,3).toString()!=='GIF') throw new Error(`Wrong GIF bytes: ${pet.name}`);
  if (!/^image\/(gif|png|jpeg|webp)$/.test(pet.imageMime||'')) throw new Error(`Image MIME missing: ${pet.name}`);
}
if (html.includes('data:image/webp;base64,${p.img}')) throw new Error('GIF images mislabeled as WebP');
for (const name of ['하르가', '흑기린', '카타르카스', '얼룩우리']) {
  if (!rideable.some(pet => pet.name === name)) throw new Error(`Rideable mapping missing: ${name}`);
}
for (const [id, name] of [['241', '토라'], ['240', '불카노스'], ['220', '메모스'], ['200', '노스키']]) {
  const pet = pets.find(item => item.id === id);
  if (!pet || pet.name !== name) throw new Error(`Updated pet missing: ${id} ${name}`);
  if (!rankCompare[id]) throw new Error(`Updated rank comparison missing: ${id}`);
}
for (const id of ['240', '220', '199', '17']) {
  const pet = pets.find(item => item.id === id);
  if (!pet?.obtainDetail || pet.obtainDetail.length < pet.obtain.length) {
    throw new Error(`Detailed obtain method missing: ${id}`);
  }
}
if (!html.includes('class="pet-portrait"') || !html.includes('class="obtain-card"')) {
  throw new Error('Selected pet showcase layout missing');
}
if (!html.includes('Keep the requested three-column catalog')) throw new Error('Three-column catalog override missing');
if (!html.includes('역산 계수 또는 계산 모델 확인이 필요합니다.')) throw new Error('Calculation failure explanation missing');

const distributions = Array.from({ length: 11 }, () => []);
for (let a = 0; a <= 10; a++) {
  for (let b = 0; b <= 10 - a; b++) {
    for (let c = 0; c <= 10 - a - b; c++) distributions[a].push([a, b, c, 10 - a - b - c]);
  }
}
const bonusDistributions = distributions.flat();
if (bonusDistributions.length !== 286) throw new Error('Bonus distribution count is not 286');

function matchesFor(pet, target = pet.initS) {
  let total = 0;
  const counts = {};
  for (let d0 = -2; d0 <= 2; d0++) for (let d1 = -2; d1 <= 2; d1++) {
    for (let d2 = -2; d2 <= 2; d2++) for (let d3 = -2; d3 <= 2; d3++) {
      for (const bonus of bonusDistributions) {
        const values = [
          pet.origin[0] + d0 + bonus[0], pet.origin[1] + d1 + bonus[1],
          pet.origin[2] + d2 + bonus[2], pet.origin[3] + d3 + bonus[3]
        ];
        const k = pet.k;
        const shown = [
          Math.floor(k * (4 * values[0] + values[1] + values[2] + values[3]) / 100),
          Math.floor(k * (2 * values[0] + 20 * values[1] + 2 * values[2] + values[3]) / 2000),
          Math.floor(k * (2 * values[0] + 2 * values[1] + 20 * values[2] + values[3]) / 2000),
          Math.floor(k * values[3] / 100)
        ];
        if (shown.every((value, index) => value === target[index])) {
          const grade = d0 + d1 + d2 + d3;
          counts[grade] = (counts[grade] || 0) + 1;
          total++;
        }
      }
    }
  }
  return { total, counts };
}

const expected = {
  '192': { total: 56, eight: 10 },
  '191': { total: 205, eight: 25 },
  '184': { total: 467, eight: 10 },
};
for (const [id, result] of Object.entries(expected)) {
  const pet = pets.find(item => String(item.id) === id);
  const actual = matchesFor(pet);
  if (actual.total !== result.total || (actual.counts[8] || 0) !== result.eight) {
    throw new Error(`${pet.name} regression: ${JSON.stringify(actual)}`);
  }
}

const correctedResults = Object.keys(initialCorrections).map(name => {
  const pet = pets.find(item => item.name === name);
  const result = matchesFor(pet);
  return { name, initS: pet.initS, k: pet.k, matches: result.total, eight: result.counts[8] || 0 };
});

console.log(JSON.stringify({
  pets: pets.length,
  casesPerCalculation: 625 * bonusDistributions.length,
  exactIntegerEngine: true,
  rideablePets: rideable.length,
  dataWarnings: [beropori.name],
  correctedResults,
  regressionCases: Object.keys(expected).length,
  rebirthRegression: true
}, null, 2));
