let currentLine=LINES[2],currentRoute=currentLine.routes[0],names=currentRoute.names.slice();
const normalizeStation = value => String(value||'').replace(/\(.*\)/g,'').replace(/^서울역$/,'서울').replace(/^응암순환$/,'응암').replace(/^뚝섬유원지$/,'자양').replace(/^지제$/,'평택지제');
function stationFor(name){return currentLine.stations.find(s=>s.name===name)}
const map=document.querySelector('#map'),stations=document.querySelector('#stations'),trains=document.querySelector('#trains');
let selected=21,paused=false,elapsed=0,last=performance.now(),points=[],segments=[];
const offsets=[0,7.4,14.6,22,30.5,37.2];
const trainIcon='<img src="assets/train-line2-short.png" alt="" draggable="false">';
function rebuildStations(){
  stations.replaceChildren();
  names.forEach((name,i)=>{const button=document.createElement('button');button.className='station';button.innerHTML='<span class="node"></span><span>'+name+'</span>';button.setAttribute('aria-label',name+'역 실시간 도착정보');button.onclick=()=>select(i,true);stations.append(button)});
}
function changeLine(number,routeIndex=0,stationName=null){
  currentLine=LINES[number];document.title='Transit Live · '+currentLine.name;currentRoute=currentLine.routes[routeIndex];names=currentRoute.names.slice();selected=Math.max(0,names.indexOf(stationName));
  document.documentElement.style.setProperty('--green',currentLine.color);
  document.querySelectorAll('[data-line]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.line)===number);b.setAttribute('aria-pressed',Number(b.dataset.line)===number?'true':'false')});
  document.querySelector('#route-picker').replaceChildren();currentLine.routes.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent=r.name;document.querySelector('#route-picker').append(option)});document.querySelector('#route-picker').value=routeIndex;
  document.querySelector('#map-line-title').textContent=currentLine.name;
  document.querySelector('#map-line-badge').textContent=currentLine.badge;
  const arrivalOnly=currentLine.positions===false;
  document.querySelector('#position-notice').hidden=!arrivalOnly;
  document.querySelector('#position-notice').textContent=arrivalOnly?currentLine.name+'은 실시간 열차 위치를 표시하지 않습니다. 역을 선택하면 도착정보를 확인할 수 있어요.':'';
  document.querySelector('#train-legend').hidden=arrivalOnly;
  document.querySelector('#route-station-count').textContent=names.length+'개 역';
  document.querySelector('#legend-line-name').textContent=currentLine.name;
  document.querySelector('.loop-note').textContent=currentRoute.oneWay?'→ 응암 순환 구간 · 한 방향 운행':currentRoute.loop?'↻ 끝과 끝이 이어지는 순환 노선':'선택 구간: '+currentRoute.name;
  document.querySelector('#search').value='';document.querySelector('#results').hidden=true;
  rebuildStations();layout();select(selected);
  if(window.updateLineMatches)window.updateLineMatches();
  if(window.changeLiveLine)window.changeLiveLine();
}
Object.values(LINES).forEach(line=>{const b=document.createElement('button');b.type='button';b.dataset.line=line.number;b.dataset.extended=line.number>9?'true':'false';b.setAttribute('aria-label',line.name);b.style.setProperty('--tab-color',line.color);b.innerHTML='<b>'+line.badge+'</b><span>'+line.name+'</span>';b.onclick=()=>window.chooseLineFromSearch?window.chooseLineFromSearch(line.number):changeLine(line.number);document.querySelector('#line-buttons').append(b)});
document.querySelector('#route-picker').onchange=e=>changeLine(currentLine.number,Number(e.target.value));
function layout(){
  const w=map.clientWidth,compact=w<600,left=compact?46:80,right=w-(compact?30:50),top=compact?45:65;
  const capacity=Math.max(3,Math.min(11,Math.floor((right-left)/(compact?48:62))+1));
  // An even number of rows puts both loop endpoints on the left edge.
  let rows=Math.max(currentRoute.loop?2:1,Math.ceil(names.length/capacity));
  if(currentRoute.loop&&rows%2)rows++;
  const base=Math.floor(names.length/rows),extra=names.length%rows;
  const counts=Array.from({length:rows},(_,row)=>base+(row<extra?1:0));
  const h=compact?top+(rows-1)*88+60:Math.max(510,top+(rows-1)*100+65),step=rows>1?(h-top-(compact?60:65))/(rows-1):0;
  map.style.height=h+'px';
  map.style.setProperty('--station-width',Math.min(80,(right-left)/Math.max(1,Math.max(...counts)-1)-3)+'px');
  points=[];
  counts.forEach((count,row)=>{for(let col=0;col<count;col++)points.push({x:row%2?right-col*(right-left)/Math.max(1,count-1):left+col*(right-left)/Math.max(1,count-1),y:top+row*step})});
  segments=points.slice(0,currentRoute.loop?points.length:points.length-1).map((a,i)=>{
    const b=points[(i+1)%points.length];
    if(i===points.length-1)return {a,b,c:{x:0,y:a.y},d:{x:0,y:b.y}};
    if(a.y!==b.y){const bend=a.x===right?(compact?18:28):-(compact?18:28);return {a,b,c:{x:a.x+bend,y:a.y},d:{x:b.x+bend,y:b.y}}}
    return {a,b};
  });
  const route='M '+points[0].x+' '+points[0].y+segments.map(({b,c,d})=>c?' C '+c.x+' '+c.y+','+d.x+' '+d.y+','+b.x+' '+b.y:' L '+b.x+' '+b.y).join('')+(currentRoute.loop?' Z':'');
  document.querySelector('#tracks').innerHTML='<path d="'+route+'" fill="none" stroke="var(--green)" opacity=".13" stroke-width="15"/><path d="'+route+'" fill="none" stroke="var(--green)" stroke-width="5" stroke-linejoin="round"/>';
  [...stations.children].forEach((el,i)=>{el.style.left=points[i].x+'px';el.style.top=(points[i].y+13)+'px'});
}
function select(i,scroll=false){selected=i;[...stations.children].forEach((el,n)=>{el.classList.toggle('selected',n===i);el.setAttribute('aria-pressed',n===i?'true':'false')});renderDetail();if(window.selectLive)window.selectLive();if(scroll)document.querySelector('#station-panel').scrollIntoView({behavior:'smooth',block:'start'})}
function renderDetail(){if(window.renderLive)window.renderLive()}
function positionAt(p){
  if(!currentRoute.loop&&p>=names.length-1)return points.at(-1);
  const index=Math.max(0,Math.floor(p))%segments.length;
  const {a,b,c,d}=segments[index],t=p-Math.floor(p),u=1-t;
  if(!c)return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  return {x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};
}
function frame(now){if(!document.hidden&&!paused&&window.paintLive)window.paintLive(now);requestAnimationFrame(frame)}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'▷ 움직임 재개':'Ⅱ 움직임 멈추기';renderDetail()};
const search=document.querySelector('#search'),results=document.querySelector('#results');search.addEventListener('input',()=>{const q=search.value.trim().replace(/역$/,'');results.hidden=!q;if(!q)return;const matches=names.map((n,i)=>({n,i})).filter(x=>x.n.includes(q));results.replaceChildren();if(!matches.length){const e=document.createElement('div');e.className='empty';e.textContent='현재 선택 구간에서 역을 찾을 수 없어요.';results.append(e)}matches.forEach(({n,i})=>{const b=document.createElement('button');b.textContent=currentLine.name+' · '+(n==='서울'?'서울역':n);b.onclick=()=>{select(i,true);results.hidden=true;search.value=n;search.blur()};results.append(b)})});search.addEventListener('keydown',e=>{if(e.key==='Escape')results.hidden=true;if(e.key==='Enter'){const b=results.querySelector('button');if(b)b.click()}});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))results.hidden=true});document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();search.focus()}});document.addEventListener('visibilitychange',()=>{last=performance.now()});
function clock(){document.querySelector('#clock').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())}changeLine(2);select(21);clock();setInterval(()=>{clock();if(!paused&&!document.hidden)renderDetail()},1000);window.addEventListener('resize',layout);requestAnimationFrame(frame);




