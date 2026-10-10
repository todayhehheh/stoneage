import { readFile, writeFile } from 'node:fs/promises';
const input = process.argv[2];
if (!input) throw new Error('Provide pet-info HTML path');
const html = await readFile(input, 'utf8');
const grades = {};
for (const card of html.split(/(?=<div class="pet_card_item pet_obj")/).slice(1)) {
  const name = card.match(/\bdata-name="([^"]+)"/)?.[1];
  const grade = card.match(/<b>판매:<\/b>\s*([^<]+)/)?.[1].trim();
  if (!name || !['일반등급', '상급', '최상급'].includes(grade)) throw new Error(`Invalid sale data: ${name}`);
  if (Object.hasOwn(grades, name)) throw new Error(`Duplicate sale data: ${name}`);
  grades[name] = grade;
}
if (Object.keys(grades).length !== 223) throw new Error('Expected 223 sale grades');
await writeFile(new URL('../data/pet-sale-grades.json', import.meta.url), JSON.stringify(grades, null, 2) + '\n', 'utf8');
console.log(`Imported ${Object.keys(grades).length} sale grades`);
