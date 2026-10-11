// pet.exe (SHA256 501AF5CC...) click bytecode: factors 575..475,
// integer origin recovery, growth comparison at 2 decimals, last HP match wins.
export function decimalCalculate(initial, growth) {
  if (initial.length !== 4 || growth.length !== 4 || [...initial, ...growth].some(v => !Number.isFinite(v) || v < 0) || initial.some(v => !Number.isInteger(v))) {
    throw new Error('초기치는 0 이상의 정수, 성장률은 0 이상의 숫자로 입력해 주세요.');
  }
  const mix = ([a,b,c,d]) => [4*a+b+c+d, .1*a+b+.1*c+.05*d, .1*a+.1*b+c+.05*d, d];
  const roundEven = v => {
    const lo = Math.floor(v), fraction = v-lo;
    return Math.abs(fraction-.5)<1e-9 ? (lo%2 === 0 ? lo : lo+1) : Math.round(v);
  };
  let found;
  for (const factor of [575,555,535,515,495,475]) {
    const matrix = [[4,1,1,0], [.1,1,.1,0], [.1,.1,1,0]];
    const d = growth[3]*10000/factor;
    matrix[0][3]=growth[0]*10000/factor-d;
    matrix[1][3]=growth[1]*10000/factor-.05*d;
    matrix[2][3]=growth[2]*10000/factor-.05*d;
    for (let col=0;col<3;col++) {
      const divisor=matrix[col][col];
      for(let k=col;k<4;k++) matrix[col][k]/=divisor;
      for(let row=0;row<3;row++) if(row!==col) {
        const multiple=matrix[row][col];
        for(let k=col;k<4;k++) matrix[row][k]-=multiple*matrix[col][k];
      }
    }
    const origin=[...matrix.map(row=>roundEven(row[3]-2.5)),roundEven(d-2.5)];
    const exactGrowth=mix(origin.map(v=>(v+2.5)*factor/10000));
    if(exactGrowth.every((v,i)=>Math.abs(roundEven(v*100)/100-growth[i])<1e-8)) found={origin,factor,growth:exactGrowth};
  }
  if(!found) throw new Error('입력한 성장률과 일치하는 조합이 없습니다. 성장률은 소수 둘째 자리 기준으로 입력해 주세요.');
  let exactInitial;
  for(let coefficient=1;coefficient<100;coefficient++) {
    const values=mix(found.origin.map(v=>coefficient*(v+2.5)/100));
    if(Math.floor(values[0])===initial[0]) exactInitial=values;
  }
  if(!exactInitial) throw new Error('입력한 내구력 초기치와 일치하는 조합이 없습니다.');
  return {...found, initial:exactInitial, allStatsMatch:exactInitial.every((v,i)=>Math.floor(v)===initial[i])};
}
