import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const catalogPath = process.argv[2];
if (!catalogPath) throw new Error('Usage: node scripts/import-client-catalog.mjs <dictionary_catalog.csv>');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'data', 'client-catalog-supplement.json');
const currentHtml = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
const currentMatch = currentHtml.match(/<script type="application\/json" id="pet-data">([\s\S]*?)<\/script>/);
if (!currentMatch) throw new Error('Current calculator pet data was not found');
const existingNames = new Set(JSON.parse(currentMatch[1]).map(pet => pet.name));

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(value); value = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); value = '';
      if (row.some(item => item !== '')) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const header = rows.shift().map(item => item.replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function growthFor(origin) {
  const sum = origin.reduce((total, value) => total + value, 0);
  const rankIndex = sum >= 100 ? 0 : sum >= 95 ? 1 : sum >= 90 ? 2 : sum >= 85 ? 3 : sum >= 80 ? 4 : 5;
  const factor = 0.0475 + 0.002 * rankIndex;
  const [hp, attack, defense, agility] = origin;
  return [
    factor * (4 * hp + attack + defense + agility + 31.5),
    factor * (0.1 * hp + attack + 0.1 * defense + 0.05 * agility + 5.625),
    factor * (0.1 * hp + 0.1 * attack + defense + 0.05 * agility + 5.625),
    factor * (agility + 4.5),
  ].map(value => Number(value.toFixed(3)));
}

function initialFor(origin, k) {
  const [hp, attack, defense, agility] = origin;
  return [
    k * (4 * hp + attack + defense + agility + 31.5) / 100,
    k * (0.1 * hp + attack + 0.1 * defense + 0.05 * agility + 5.625) / 100,
    k * (0.1 * hp + 0.1 * attack + defense + 0.05 * agility + 5.625) / 100,
    k * (agility + 4.5) / 100,
  ].map(Math.floor);
}

const elements = ['지', '수', '화', '풍'];
const rows = parseCsv(await readFile(path.resolve(catalogPath), 'utf8'));
const supplements = rows.filter(row => !existingNames.has(row.name)).map(row => {
  const origin = [9, 10, 11, 12].map(index => Number(row[`int${index}`]));
  const k = Number(row.int8);
  const attrs = [4, 5, 6, 7]
    .map((index, element) => [elements[element], Number(row[`int${index}`]) / 10])
    .filter(([, amount]) => amount > 0);
  return {
    id: String(row.int1),
    name: row.name,
    attr: attrs.map(([element, amount]) => `${element}${amount}`).join(''),
    attrs,
    obtain: row.text2,
    growthS: growthFor(origin),
    initS: initialFor(origin, k),
    imageUrl: `https://sa000001.com/sa2/info/img/${row.int2 || row.int1}.gif`,
    imageFallbackUrl: `https://sa000001.com/sa2/info/img/${row.int2 || row.int1}.png`,
    externalImage: true,
    rideable: false,
    clientCatalog: { index: Number(row.index), sourceId: Number(row.int2), grade: row.text3, capture: row.text4 },
  };
});

await writeFile(outputPath, JSON.stringify(supplements, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ catalog: rows.length, existing: existingNames.size, added: supplements.length, outputPath }));
