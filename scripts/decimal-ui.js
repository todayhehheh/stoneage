const pets=JSON.parse(document.getElementById('pet-data').textContent);
const labels=['내구력','공격력','방어력','순발력'];
const panel=document.createElement('section');
panel.className='card decimal-panel';
panel.style.marginTop='20px';
panel.innerHTML='<div id="decimalOutput" aria-live="polite"></div>';
const detail=document.querySelector('.pd-name')?.closest('.pet-detail')?.parentElement;
if(!detail) return;
// Outside the grade result container: also usable when grade calculation has no matches.
const results=document.getElementById('resultsCard');
(results||detail).insertAdjacentElement('afterend',panel);
let currentName='';
function loadPet(){
  const name=detail.querySelector('.pd-name')?.textContent;
  if(!name||name===currentName)return;
  currentName=name;
  const pet=pets.find(p=>p.name===name);if(!pet)return;
  calculateDecimal(pet);
}
new MutationObserver(loadPet).observe(detail,{childList:true,subtree:true});
loadPet();
function calculateDecimal(pet){
  const output=panel.querySelector('#decimalOutput');
  try{
    const result=decimalCalculate(pet.initS,pet.growthS.map(value=>Number(value.toFixed(2))));
    const format=value=>{
      const [integer,fraction]=value.toFixed(7).replace(/0+$/,'').replace(/\.$/,'').split('.');
      return '<span>'+integer+'</span>'+(fraction?'<span class="decimal-fraction">.'+fraction+'</span>':'');
    };
    output.innerHTML='<div class="decimal-stats">'+labels.map((label,i)=>'<section class="decimal-stat" data-stat="'+i+'"><h3>'+label+'</h3><dl><div><dt>초기치 소수점</dt><dd class="mono">'+format(result.initial[i])+'</dd></div><div><dt>성장률 소수점</dt><dd class="mono">'+format(result.growth[i])+'</dd></div></dl></section>').join('')+'</div>';
  }catch(error){output.textContent=error.message;}
}
