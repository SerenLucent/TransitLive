const names='시청,을지로입구,을지로3가,을지로4가,동대문역사문화공원,신당,상왕십리,왕십리,한양대,뚝섬,성수,건대입구,구의,강변,잠실나루,잠실,잠실새내,종합운동장,삼성,선릉,역삼,강남,교대,서초,방배,사당,낙성대,서울대입구,봉천,신림,신대방,구로디지털단지,대림,신도림,문래,영등포구청,당산,합정,홍대입구,신촌,이대,아현,충정로'.split(',');
const map=document.querySelector('#map'),stations=document.querySelector('#stations'),trains=document.querySelector('#trains');
let selected=21,paused=false,elapsed=0,last=performance.now(),points=[],segments=[];
const offsets=[0,7.4,14.6,22,30.5,37.2];
const trainIcon='<img src="assets/train-line2-mini.png" alt="" draggable="false">';
offsets.forEach((_,i)=>{const el=document.createElement('div');el.className='train';el.innerHTML=trainIcon;el.setAttribute('aria-hidden','true');trains.append(el)});
names.forEach((name,i)=>{const button=document.createElement('button');button.className='station';button.innerHTML='<span class="node"></span><span>'+name+'</span>';button.setAttribute('aria-label',name+'역 실시간 도착정보');button.onclick=()=>select(i);stations.append(button)});
function layout(){
  const w=map.clientWidth,h=map.clientHeight,left=90,right=w-60,top=65,step=(h-140)/3;
  const counts=[11,11,11,10];
  points=[];
  counts.forEach((count,row)=>{for(let col=0;col<count;col++)points.push({x:row%2?right-col*(right-left)/(count-1):left+col*(right-left)/(count-1),y:top+row*step})});
  segments=points.map((a,i)=>{
    const b=points[(i+1)%points.length];
    if(i===points.length-1)return {a,b,c:{x:0,y:a.y},d:{x:0,y:b.y}};
    if(a.y!==b.y){const bend=a.x===right?35:-35;return {a,b,c:{x:a.x+bend,y:a.y},d:{x:b.x+bend,y:b.y}}}
    return {a,b};
  });
  const route='M '+points[0].x+' '+points[0].y+segments.map(({b,c,d})=>c?' C '+c.x+' '+c.y+','+d.x+' '+d.y+','+b.x+' '+b.y:' L '+b.x+' '+b.y).join('')+' Z';
  document.querySelector('#tracks').innerHTML='<path d="'+route+'" fill="none" stroke="#e3f3e9" stroke-width="15"/><path d="'+route+'" fill="none" stroke="#19a66a" stroke-width="5" stroke-linejoin="round"/>';
  [...stations.children].forEach((el,i)=>{el.style.left=points[i].x+'px';el.style.top=(points[i].y+13)+'px'});
}
function select(i,scroll=false){selected=i;[...stations.children].forEach((el,n)=>{el.classList.toggle('selected',n===i);el.setAttribute('aria-pressed',n===i?'true':'false')});renderDetail();if(window.selectLive)window.selectLive();if(scroll)stations.children[i].scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})}
function renderDetail(){if(window.renderLive)window.renderLive()}
function positionAt(p){
  const {a,b,c,d}=segments[Math.floor(p)%43],t=p%1,u=1-t;
  if(!c)return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  return {x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};
}
function frame(now){if(!document.hidden&&!paused&&window.paintLive)window.paintLive(now);requestAnimationFrame(frame)}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'▷ 움직임 재개':'Ⅱ 움직임 멈추기';renderDetail()};
const search=document.querySelector('#search'),results=document.querySelector('#results');search.addEventListener('input',()=>{const q=search.value.trim().replace(/역$/,'');results.hidden=!q;if(!q)return;const matches=names.map((n,i)=>({n,i})).filter(x=>x.n.includes(q));results.replaceChildren();if(!matches.length){const e=document.createElement('div');e.className='empty';e.textContent='2호선 본선에서 역을 찾을 수 없어요.';results.append(e)}matches.forEach(({n,i})=>{const b=document.createElement('button');b.textContent='② '+n;b.onclick=()=>{select(i,true);results.hidden=true;search.value=n;search.focus()};results.append(b)})});search.addEventListener('keydown',e=>{if(e.key==='Escape')results.hidden=true;if(e.key==='Enter'){const b=results.querySelector('button');if(b)b.click()}});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))results.hidden=true});document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();search.focus()}});document.addEventListener('visibilitychange',()=>{last=performance.now()});
function clock(){document.querySelector('#clock').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())}layout();select(21);clock();setInterval(()=>{clock();if(!paused&&!document.hidden)renderDetail()},1000);window.addEventListener('resize',layout);requestAnimationFrame(frame);




