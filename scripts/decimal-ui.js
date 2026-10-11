const pets=JSON.parse(document.getElementById('pet-data').textContent);
const labels=['내구력','공격력','방어력','순발력'];
const panel=document.createElement('section');
panel.className='card growth-panel';
panel.style.marginTop='20px';
panel.innerHTML='<div class="panel-heading"><strong>소수점 계산기</strong></div><p>선택한 펫의 등록 초기치·성장률로 자동 계산합니다.</p><div id="decimalOutput" aria-live="polite"></div><details style="margin-top:16px"><summary>입력값 확인·직접 수정</summary><form id="decimalForm"><div id="decimalInputs"></div><button class="calc-btn" type="submit">다시 계산</button></form><p>원본 계산 방식에 맞춰 성장률은 소수 둘째 자리로 반올림해 사용합니다.</p></details>';
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
  panel.querySelector('#decimalInputs').innerHTML=['S급 초기치','S급 성장률'].map((title,row)=>
    '<fieldset style="border:0;padding:0;margin:12px 0"><legend>'+title+'</legend><div class="growth-grid">'+labels.map((label,i)=>'<label><span>'+label+'</span><input aria-label="'+title+' '+label+'" type="number" required min="0" step="'+(row?'0.01':'1')+'" data-row="'+row+'" style="width:100%;box-sizing:border-box" value="'+(row?pet.growthS[i].toFixed(2):pet.initS[i])+'"></label>').join('')+'</div></fieldset>').join('');
  calculateDecimal();
}
new MutationObserver(loadPet).observe(detail,{childList:true,subtree:true});
loadPet();
function calculateDecimal(){
  const output=panel.querySelector('#decimalOutput');
  try{
    const read=row=>Array.from(panel.querySelectorAll('input[data-row="'+row+'"]'),input=>Number(input.value));
    const result=decimalCalculate(read(0),read(1));
    output.innerHTML=[0,1].map(row=>'<div class="panel-heading" style="margin-top:16px"><strong>'+(row?'성장률 소수점':'초기치 소수점')+'</strong></div><div class="growth-grid">'+result[row?'growth':'initial'].map((value,i)=>'<div><span>'+labels[i]+'</span><b class="mono">'+value.toFixed(7).replace(/0+$/,'').replace(/\.$/,'')+'</b></div>').join('')+'</div>').join('')+'<p>초기치 역산은 원본과 동일하게 내구력을 기준으로 합니다.'+(result.allStatsMatch?'':' 입력한 공격·방어·순발력과는 일치하지 않습니다.')+'</p>';
  }catch(error){output.textContent=error.message;}
}
panel.querySelector('form').addEventListener('submit',event=>{
  event.preventDefault();
  calculateDecimal();
});
panel.querySelector('form').addEventListener('input',calculateDecimal);
