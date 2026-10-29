import {readFile} from 'node:fs/promises';
import {Script, createContext} from 'node:vm';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const PETS=JSON.parse(html.match(/id="pet-data">([\s\S]*?)<\/script>/)[1]);
const source=html.match(/  function variantTabs\(p\)\{[\s\S]*?\n  \}/)[0];
const context=createContext({PETS});
new Script(source+';globalThis.compare=variantTabs;').runInContext(context);
const groups=new Map();
for(const pet of PETS){if(!groups.has(pet.name))groups.set(pet.name,[]);groups.get(pet.name).push(pet);}
let compared=0;
for(const group of groups.values()){
  if(group.length<2)continue;
  for(const pet of group){
    const result=context.compare(pet);
    if(!result.includes('aria-selected="true"')||!result.includes('data-variant-id="'+pet.id+'"'))throw Error('Variant tab failed: '+pet.displayName);
    if(!group.some(item=>item.variant==='일반') && result.includes('일반 형태 대비 차이'))throw Error('Invented baseline');
  }
  compared++;
}
const tiger=PETS.filter(pet=>pet.name==='성호');
if(!['일반','환생','진화'].every(variant=>tiger.some(pet=>pet.variant===variant)))throw Error('Tiger variants lost');
if(tiger.find(pet=>pet.variant==='진화').rideable || !tiger.find(pet=>pet.variant==='환생').rideable)throw Error('Variant rideability lost');
console.log(JSON.stringify({pets:PETS.length,comparedNames:compared,tiger:tiger.map(({id,variant,growthS,rideable})=>({id,variant,growthS,rideable}))},null,2));
