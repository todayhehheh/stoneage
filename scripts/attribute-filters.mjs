// Extend the calculator's own filter state, so every condition composes.
export function enhanceAttributeFilters(html, css) {
  function replace(before, after, label) {
    if (!html.includes(before)) throw new Error(`Attribute filter integration changed: ${label}`);
    html = html.replace(before, after);
  }
  replace('<div class="chips" id="attrChips"></div>', `
        <details class="attribute-filter">
          <summary><span>속성값 선택</span><small>펼치기</small></summary>
          <p class="filter-help">원하는 값을 체크하세요. 같은 속성은 여러 값 중 하나, 다른 속성은 모두 만족하는 펫을 찾아요.</p>
          <div class="attribute-range-grid" id="attributeRanges"></div>
        </details>
        <div class="filter-footer"><span id="filterSummary" role="status" aria-live="polite">모든 펫을 보고 있어요</span><button id="resetFilters" type="button" disabled>초기화</button></div>`, 'controls');
  replace('<input id="search"', '<label class="catalog-title" for="search">어떤 펫을 찾으세요?</label><input id="search"', 'search label');
  replace('<div class="pet-count" id="petCount"></div>', '<div class="pet-count" id="petCount" role="status" aria-live="polite"></div>', 'count');
  replace('<p>보이는 초기치를 정확한 정수식으로 역산해 가능한 등급과 환각 확률을 찾습니다.</p>', '<p>속성으로 펫을 찾고, 초기치로 환각 가능성을 확인하세요.</p>', 'intro');
  replace('  let activeAttrs = new Set();','', 'old attribute state');
  replace("    chips: document.getElementById('attrChips'),\n",'', 'old attribute element');
  const oldControls=/  \/\/ attribute chips[\s\S]*?\n  \}\);/;
  if(!oldControls.test(html))throw new Error('Attribute presence controls changed');
  html=html.replace(oldControls,'  // Attribute value controls');
  replace("    for(const a of activeAttrs){ if(!p.attr.includes(a)) return false; } // 교집합: 선택한 속성 전부 있어야 함\n",'', 'old attribute predicate');
  replace("  let browseMode = 'all';", "  const attributeValues = Object.fromEntries(['지','수','화','풍'].map(name=>[name,new Set()]));\n  let browseMode = 'all';", 'state');
  replace('  // Attribute value controls', `
  const rangeContainer = document.getElementById('attributeRanges');
  rangeContainer.innerHTML = ['지','수','화','풍'].map(name=>
    '<div class="attribute-range-row" data-element="'+name+'"><span class="element-label" data-attr="'+name+'">'+name+'</span>'+
    '<div class="attribute-values" role="group" aria-label="'+name+' 속성값">'+
    Array.from({length:11},(_,value)=>'<label class="attribute-value"><input type="checkbox" data-value-attr="'+name+'" value="'+value+'" aria-label="'+name+' 속성 '+value+'"><span>'+value+'</span></label>').join('')+'</div></div>'
  ).join('');
  rangeContainer.closest('details').addEventListener('toggle',event=>{
    event.currentTarget.querySelector('summary small').textContent=event.currentTarget.open?'접기':'펼치기';
  });
  rangeContainer.addEventListener('change',event=>{
    const input=event.target.closest('input[data-value-attr]');if(!input)return;
    const values=attributeValues[input.dataset.valueAttr],value=Number(input.value);
    if(input.checked)values.add(value);else values.delete(value);
    renderGrid();
  });
  function resetCatalogFilters(){
    els.search.value='';browseMode='all';favOnly=false;sortKey='';sortDirection=-1;
    for(const values of Object.values(attributeValues))values.clear();
    rangeContainer.querySelectorAll('input').forEach(input=>{input.checked=false;});
    document.querySelectorAll('.mode-btn').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode==='all')));
    document.querySelectorAll('.sort-btn').forEach(button=>{button.setAttribute('aria-pressed','false');button.dataset.direction='';});
    renderGrid();
  }
  document.getElementById('resetFilters').addEventListener('click',resetCatalogFilters);
  function updateFilterSummary(){
    const conditions=[];
    if(els.search.value.trim())conditions.push('이름 검색');
    for(const [name,values] of Object.entries(attributeValues)){
      if(values.size)conditions.push(name+' '+[...values].sort((a,b)=>a-b).join('·'));
    }
    if(browseMode!=='all')conditions.push(browseMode==='ride'?'탑승 가능':'즐겨찾기');
    document.getElementById('filterSummary').textContent=conditions.length?conditions.join(' · '):'모든 펫을 보고 있어요';
    document.getElementById('resetFilters').disabled=!conditions.length&&!sortKey;
    document.getElementById('filterSummary').parentElement.classList.toggle('is-idle',!conditions.length&&!sortKey);
    rangeContainer.querySelectorAll('.attribute-range-row').forEach(row=>{
      row.classList.toggle('is-filtered',attributeValues[row.dataset.element].size>0);
    });
  }
  // Attribute value controls`, 'events');
  replace('  function matchesFilter(p, q){', `  function matchesFilter(p, q){
    for(const [name,values] of Object.entries(attributeValues)){
      const value=(p.attrs||[]).find(entry=>entry[0]===name)?.[1]||0;
      if(values.size&&!values.has(value))return false;
    }`, 'predicate');
  replace('  function renderGrid(){', '  function renderGrid(){\n    updateFilterSummary();', 'summary');
  replace('    els.count.textContent =', `    const selectedPet=findPet(selectedId);
    if(list.length && selectedPet && !matchesFilter(selectedPet,q))selectPet(list[0].id);
    els.count.textContent =`, 'selection follows filters');
  replace("    if(list.length===0 && favOnly){", `    if(list.length===0 && (!favOnly||favorites.size>0)){
      els.grid.innerHTML='<div class="catalog-empty"><span aria-hidden="true">⌕</span><strong>조건에 맞는 펫이 없어요</strong><p>다른 속성값을 체크하거나 필터를 초기화해 보세요.</p></div>';
    }
    if(list.length===0 && favOnly && !favorites.size){`, 'empty state');
  replace('</head>', `<style id="attribute-workspace">${css}</style>\n</head>`, 'styles');
  return html;
}
