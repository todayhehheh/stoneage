const pets=JSON.parse(document.getElementById('pet-data').textContent);
const labels=['내구력','공격력','방어력','순발력'];
const panel=document.createElement('section');
panel.className='card growth-panel';
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
    output.innerHTML=[0,1].map(row=>'<div class="panel-heading" style="margin-top:'+(row?'20':'0')+'px"><strong>'+(row?'성장률 소수점':'초기치 소수점')+'</strong></div><div class="growth-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">'+result[row?'growth':'initial'].map((value,i)=>'<div><span>'+labels[i]+'</span><b class="mono" style="font-size:clamp(12px,2vw,20px);overflow-wrap:anywhere">'+value.toFixed(7).replace(/0+$/,'').replace(/\.$/,'')+'</b></div>').join('')+'</div>').join('');
  }catch(error){output.textContent=error.message;}
}
