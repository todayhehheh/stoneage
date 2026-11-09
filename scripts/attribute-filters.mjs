// Extend the calculator's own filter state, so every condition composes.
export function enhanceAttributeFilters(html, css) {
  function replace(before, after, label) {
    if (!html.includes(before)) throw new Error(`Attribute filter integration changed: ${label}`);
    html = html.replace(before, after);
  }
  replace('<div class="chips" id="attrChips"></div>', `
        <div class="filter-heading"><span>포함할 속성</span><small>여러 개 선택 가능</small></div>
        <div class="chips" id="attrChips" role="group" aria-label="포함할 속성"></div>
        <details class="attribute-filter" open>
          <summary><span>속성값 범위</span><small>0–10</small></summary>
          <p class="filter-help">예: 지 8 이상 · 수 2 이하. 모든 조건을 함께 적용해요.</p>
          <div class="attribute-range-grid" id="attributeRanges"></div>
        </details>
        <div class="filter-footer"><span id="filterSummary" role="status" aria-live="polite">모든 펫을 보고 있어요</span><button id="resetFilters" type="button" disabled>초기화</button></div>`, 'controls');
  replace('<input id="search"', '<label class="catalog-title" for="search">어떤 펫을 찾으세요?</label><input id="search"', 'search label');
  replace('<div class="pet-count" id="petCount"></div>', '<div class="pet-count" id="petCount" role="status" aria-live="polite"></div>', 'count');
  replace('<p>보이는 초기치를 정확한 정수식으로 역산해 가능한 등급과 환각 확률을 찾습니다.</p>', '<p>속성으로 펫을 찾고, 초기치로 환각 가능성을 확인하세요.</p>', 'intro');
  replace("  let browseMode = 'all';", "  const attributeRanges = Object.fromEntries(['지','수','화','풍'].map(name=>[name,[0,10]]));\n  let browseMode = 'all';", 'state');
  replace('  // attribute chips', `
  const rangeContainer = document.getElementById('attributeRanges');
  rangeContainer.innerHTML = ['지','수','화','풍'].map(name=>
    '<div class="attribute-range-row" data-element="'+name+'"><span class="element-label" data-attr="'+name+'">'+name+'</span>'+
    '<label><span class="sr-only">'+name+' 속성 최솟값</span><select data-range-attr="'+name+'" data-bound="0">'+
    Array.from({length:11},(_,value)=>'<option value="'+value+'">'+value+' 이상</option>').join('')+'</select></label>'+
    '<span class="range-separator" aria-hidden="true">—</span><label><span class="sr-only">'+name+' 속성 최댓값</span><select data-range-attr="'+name+'" data-bound="1">'+
    Array.from({length:11},(_,value)=>'<option value="'+value+'"'+(value===10?' selected':'')+'>'+value+' 이하</option>').join('')+'</select></label></div>'
  ).join('');
  if(window.matchMedia('(max-width:860px)').matches)rangeContainer.closest('details').open=false;
  rangeContainer.addEventListener('change',event=>{
    const select=event.target.closest('select[data-range-attr]');if(!select)return;
    const range=attributeRanges[select.dataset.rangeAttr],bound=Number(select.dataset.bound);
    range[bound]=Number(select.value);
    if(range[0]>range[1]){
      range[1-bound]=range[bound];
      rangeContainer.querySelector('select[data-range-attr="'+select.dataset.rangeAttr+'"][data-bound="'+(1-bound)+'"]').value=String(range[bound]);
    }
    renderGrid();
  });
  function resetCatalogFilters(){
    els.search.value='';activeAttrs.clear();browseMode='all';favOnly=false;sortKey='';sortDirection=-1;
    for(const range of Object.values(attributeRanges)){range[0]=0;range[1]=10;}
    rangeContainer.querySelectorAll('select').forEach(select=>{select.value=select.dataset.bound==='0'?'0':'10';});
    els.chips.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));
    document.querySelectorAll('.mode-btn').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode==='all')));
    document.querySelectorAll('.sort-btn').forEach(button=>{button.setAttribute('aria-pressed','false');button.dataset.direction='';});
    renderGrid();
  }
  document.getElementById('resetFilters').addEventListener('click',resetCatalogFilters);
  function updateFilterSummary(){
    const conditions=[];
    if(els.search.value.trim())conditions.push('이름 검색');
    if(activeAttrs.size)conditions.push([...activeAttrs].join('·')+' 포함');
    for(const [name,[min,max]] of Object.entries(attributeRanges)){
      if(min!==0||max!==10)conditions.push(name+' '+(min===max?min:min===0?max+' 이하':max===10?min+' 이상':min+'–'+max));
    }
    if(browseMode!=='all')conditions.push(browseMode==='ride'?'탑승 가능':'즐겨찾기');
    document.getElementById('filterSummary').textContent=conditions.length?conditions.join(' · '):'모든 펫을 보고 있어요';
    document.getElementById('resetFilters').disabled=!conditions.length&&!sortKey;
    rangeContainer.querySelectorAll('.attribute-range-row').forEach(row=>{
      const range=attributeRanges[row.dataset.element];row.classList.toggle('is-filtered',range[0]!==0||range[1]!==10);
    });
  }
  // attribute chips`, 'events');
  replace('  function matchesFilter(p, q){', `  function matchesFilter(p, q){
    for(const [name,[min,max]] of Object.entries(attributeRanges)){
      const value=(p.attrs||[]).find(entry=>entry[0]===name)?.[1]||0;
      if(value<min||value>max)return false;
    }`, 'predicate');
  replace('  function renderGrid(){', '  function renderGrid(){\n    updateFilterSummary();', 'summary');
  replace('    els.count.textContent =', `    const selectedPet=findPet(selectedId);
    if(list.length && selectedPet && !matchesFilter(selectedPet,q))selectPet(list[0].id);
    els.count.textContent =`, 'selection follows filters');
  replace("    if(list.length===0 && favOnly){", `    if(list.length===0 && (!favOnly||favorites.size>0)){
      els.grid.innerHTML='<div class="catalog-empty"><span aria-hidden="true">⌕</span><strong>조건에 맞는 펫이 없어요</strong><p>속성값 범위를 넓히거나 필터를 초기화해 보세요.</p></div>';
    }
    if(list.length===0 && favOnly && !favorites.size){`, 'empty state');
  replace('</head>', `<style id="attribute-workspace">${css}</style>\n</head>`, 'styles');
  return html;
}
