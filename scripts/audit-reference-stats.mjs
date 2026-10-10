import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const pets = JSON.parse(html.match(/id="pet-data">([\s\S]*?)<\/script>/)[1]);
const verification = await readFile(new URL('./verify-site.mjs', import.meta.url), 'utf8');
const source = verification.slice(verification.indexOf('const distributions ='), verification.indexOf('const expected ='));
const context = createContext({ pets });
new Script(source + '\nresult = pets.filter(pet => matchesFor(pet).total === 0).map(({name, initS, originDevMain, referenceFeasible}) => ({name, initS, originDevMain, referenceFeasible}));').runInContext(context);
console.log(JSON.stringify({ unsupported: pets.filter(pet => !pet.ok).map(pet => pet.name), noReferenceMatches: context.result }, null, 2));
