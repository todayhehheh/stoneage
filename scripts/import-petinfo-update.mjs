import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node scripts/import-petinfo-update.mjs <petinfo.html>');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'data', 'petinfo-update.json');
const obtainOutputPath = path.join(root, 'data', 'pet-obtain-details.json');
const html = await readFile(path.resolve(inputPath), 'utf8');
const starts = [...html.matchAll(/<div class="pet_card_item pet_obj"([^>]*)>/g)];
const pets = [];
const obtainDetails = {};

for (let index = 0; index < starts.length; index++) {
  const match = starts[index];
  const attributes = Object.fromEntries(
    [...match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]])
  );
  const id = Number(attributes['wr-id']);
  const end = index + 1 < starts.length ? starts[index + 1].index : html.length;
  const card = html.slice(match.index, end);
  const obtainMatch = card.match(/<div><b>획득:<\/b>\s*([^<]+)<\/div>/);
  if (attributes.name && obtainMatch) obtainDetails[attributes.name] = obtainMatch[1].trim();
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid pet ID');

  const stats = card.match(/<td class="val_red">[\d.]+<\/td><td>\d+<\/td><td>([^<]+)<\/td><td>(\d+)\s+(\d+)\s+(\d+)\s+(\d+)<\/td>/);
  if (!stats) throw new Error(`Initial stats were not found for pet ${id}`);

  const attrs = [...card.matchAll(/attr_label_tag\s+[^">]+">([^<]+)\s+\((\d+)\)/g)]
    .map(item => [item[1].trim(), Number(item[2])]);

  pets.push({
    id: String(id),
    name: attributes.name,
    attr: attributes.attr,
    attrs,
    obtain: attributes.obtain,
    growthS: [Number(attributes.hp), Number(attributes.atk), Number(attributes.def), Number(attributes.agi)],
    initS: [Number(stats[5]), Number(stats[2]), Number(stats[3]), Number(stats[4])],
    imageUrl: attributes.img,
    rideable: stats[1].trim() === '탑승가능'
  });
}

if (pets.length < 200) throw new Error(`Incomplete pet snapshot: ${pets.length}`);
if (new Set(pets.map(pet => pet.id)).size !== pets.length) throw new Error('Duplicate snapshot IDs');
if (new Set(pets.map(pet => pet.name)).size !== pets.length) throw new Error('Duplicate snapshot names');
for (const pet of pets) {
  if (![...pet.growthS, ...pet.initS].every(value => Number.isFinite(value) && value >= 0)) throw new Error(`Invalid stats: ${pet.name}`);
  if (!/^https:\/\/ohrsa\.net\/data\/file\/petinfo\//.test(pet.imageUrl)) throw new Error(`Unexpected image source: ${pet.name}`);
}
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(pets, null, 2) + '\n', 'utf8');
await writeFile(obtainOutputPath, JSON.stringify(obtainDetails, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ inputPath: path.resolve(inputPath), outputPath, obtainOutputPath, pets: pets.length, obtainDetails: Object.keys(obtainDetails).length }));
