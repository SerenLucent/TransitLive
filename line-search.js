// Global station discovery; no API calls until a line is selected.
const networkInput=document.querySelector('#network-search');
const networkResults=document.querySelector('#network-results');
const stationKey=value=>normalizeStation(String(value).trim().replace(/역$/,'')).replace(/\s/g,'');
const networkStations=[...new Set(Object.values(LINES).flatMap(l=>l.routes.flatMap(r=>r.names)))].sort((a,b)=>a.localeCompare(b,'ko'));
let networkStation=null,networkChosen=null;
function matchedLines(station){return Object.values(LINES).filter(l=>l.routes.some(r=>r.names.some(n=>stationKey(n)===stationKey(station)))).map(l=>l.number)}
function closeNetworkResults(){networkResults.hidden=true;networkInput.setAttribute('aria-expanded','false')}
window.updateLineMatches=()=>{
  const matches=networkStation?matchedLines(networkStation):[];
  document.querySelectorAll('[data-line]').forEach(b=>b.classList.toggle('line-match',matches.includes(Number(b.dataset.line))&&networkChosen!==Number(b.dataset.line)));
  const hint=document.querySelector('#network-search-hint');
  hint.textContent=networkStation?`${networkStation==='서울'?'서울역':networkStation+'역'} · ${matches.map(n=>LINES[n].name).join(' / ')} · 노선을 선택하세요`:networkInput.value.trim()?'자동완성에서 역을 선택해주세요.':'역을 검색하면 해당 노선들을 표시해요.';
};
function setNetworkStation(name){networkStation=name;networkChosen=null;networkInput.value=name==='서울'?'서울역':name+'역';closeNetworkResults();window.updateLineMatches()}
function showNetworkResults(){
  const q=stationKey(networkInput.value);networkStation=null;networkChosen=null;networkResults.replaceChildren();
  if(!q){closeNetworkResults();window.updateLineMatches();return}
  const exact=networkStations.find(n=>stationKey(n)===q);if(exact)networkStation=exact;
  const matches=networkStations.filter(n=>stationKey(n).includes(q)).sort((a,b)=>(stationKey(b)===q)-(stationKey(a)===q)).slice(0,12);
  networkResults.hidden=false;networkInput.setAttribute('aria-expanded','true');
  if(!matches.length){const p=document.createElement('p');p.className='empty';p.textContent='지원 노선에서 찾을 수 없는 역이에요.';networkResults.append(p)}
  matches.forEach(name=>{const b=document.createElement('button');b.type='button';const title=document.createElement('strong');title.textContent=name==='서울'?'서울역':name+'역';const small=document.createElement('small');small.textContent=matchedLines(name).map(n=>LINES[n].name).join(' · ');b.append(title);b.append(small);b.onclick=()=>setNetworkStation(name);networkResults.append(b)});
  window.updateLineMatches();
}
networkInput.addEventListener('input',showNetworkResults);
networkInput.addEventListener('focus',()=>{if(networkInput.value.trim())showNetworkResults()});
networkInput.addEventListener('keydown',e=>{if(e.key==='Escape')closeNetworkResults();if(e.key==='Enter'){const first=networkResults.querySelector('button');if(first){e.preventDefault();first.click()}}if(e.key==='ArrowDown'){const first=networkResults.querySelector('button');if(first){e.preventDefault();first.focus()}}});
networkResults.addEventListener('keydown',e=>{const buttons=[...networkResults.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){closeNetworkResults();networkInput.focus();closeNetworkResults()}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length];if(next)next.focus()}});
document.addEventListener('click',e=>{if(!e.target.closest('.network-search'))closeNetworkResults()});
document.querySelector('#clear-network-search').onclick=()=>{networkInput.value='';networkStation=null;networkChosen=null;closeNetworkResults();window.updateLineMatches();networkInput.focus()};
window.chooseLineFromSearch=number=>{
  networkChosen=number;const line=LINES[number];
  const routeIndex=networkStation?line.routes.findIndex(r=>r.names.some(n=>stationKey(n)===stationKey(networkStation))):-1;
  const station=routeIndex>=0?line.routes[routeIndex].names.find(n=>stationKey(n)===stationKey(networkStation)):null;
  changeLine(number,Math.max(0,routeIndex),station);closeNetworkResults();
};
window.updateLineMatches();
