const API_URL = 'https://script.google.com/macros/s/AKfycbywd2G3p28QAjvitir-FBqcOX8up43T_N8LUA--QKCOKC7m7Bheq5TDLPlj6lraKWIOnA/exec';
const live = {positions:null, arrivals:new Map(), error:'', arrivalError:'', busy:false, timer:null, models:[], pending:new Map()};
const esc = v => String(v == null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wrap = p => (p%43+43)%43;
const stamp = t => new Date(t).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
function requestLive(action, station='') {
  const id=action+station;
  if(live.pending.has(id))return live.pending.get(id);
  const promise=new Promise((resolve,reject)=>{
    const cb='transitLive_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const clean=()=>{clearTimeout(timer);delete window[cb];script.remove()};
    const timer=setTimeout(()=>{clean();reject(new Error('연결 시간 초과 · 배포 권한을 확인해주세요'))},20000);
    window[cb]=data=>{clean();if(!data.ok)reject(new Error(({DAILY_LIMIT:'오늘의 API 호출 한도에 도달했어요',MISSING_KEY:'Apps Script 인증키 설정을 확인해주세요',UPSTREAM_UNAVAILABLE:'서울시 데이터 응답을 확인할 수 없어요',BUSY:'다른 요청 처리 중 · 잠시 후 재시도합니다'})[data.error]||'데이터를 가져오지 못했어요'));else resolve(data)};
    script.onerror=()=>{clean();reject(new Error('Apps Script에 연결할 수 없어요'))};
    const url=new URL(API_URL);url.searchParams.set('action',action);url.searchParams.set('callback',cb);if(station)url.searchParams.set('station',station);script.src=url.href;document.head.append(script);
  }).finally(()=>live.pending.delete(id));
  live.pending.set(id,promise);return promise;
}
function installPositions(data){
  const old=new Map(live.models.map(m=>[m.id,m]));
  live.positions=data;const now=performance.now();
  live.models=data.items.flatMap(r=>{
    const i=names.indexOf(r.statnNm);if(i<0)return [];
    // Along the listed station order, inner-circle trains advance; outer reverse.
    const sign=String(r.updnLine)==='0'?1:-1,status=String(r.trainSttus);
    const target=wrap(i+(status==='0'?-sign*.15:status==='2'?sign*.15:status==='3'?-sign*.65:0));
    const id=String(r.trainNo)+':'+r.updnLine,previous=old.get(id);
    const from=previous?modelPosition(previous,now):target;
    let delta=(target-from+64.5)%43-21.5;
    if(Math.abs(delta)>1.5||data.stale)delta=0;
    return [{id,row:r,sign,from:delta===0?target:from,delta,since:now}];
  });
  trains.replaceChildren();
  live.models.forEach(m=>{const el=document.createElement('div');el.className='train';el.innerHTML=trainIcon;el.setAttribute('aria-hidden','true');el.title='열차 '+m.row.trainNo+' · '+m.row.statnNm;m.el=el;trains.append(el)});
}
function modelPosition(m,now){return wrap(m.from+m.delta*Math.min(1,Math.max(0,(now-m.since)/2500)))}
window.paintLive=now=>{
  live.models.forEach(m=>{
    const p=modelPosition(m,now),q=positionAt(p),a=positionAt(wrap(p+m.sign*.015)),angle=Math.atan2(a.y-q.y,a.x-q.x);
    m.el.style.left=q.x+'px';m.el.style.top=(q.y+(m.sign>0?-13:13))+'px';m.el.style.transform=`translate(-50%,-50%) rotate(${angle*180/Math.PI}deg)`;m.el.firstElementChild.style.transform=Math.cos(angle)<0?'scaleY(-1)':'none';
  });
};
function dataOld(data){return data && (data.stale||Date.now()-data.updatedAt>90000)}
function updateStatus(){
  const data=live.positions;
  document.querySelector('.demo').textContent=paused?'갱신 일시정지':live.error?'연결 확인 필요':!data?'실시간 연결 중':dataOld(data)?'이전 수신 정보':'실시간 데이터';
  document.querySelector('.map-description span').textContent=live.error||(data?`${dataOld(data)?'이전 정보':'위치 갱신'} ${stamp(data.updatedAt)} · 본선 ${live.models.length}대`:'실제 열차 위치를 불러오는 중…');
}
window.renderLive=()=>{
  const name=names[selected],data=live.arrivals.get(name),old=dataOld(data);
  const cards=['내선','외선'].map(direction=>{
    const rows=(data?.items||[]).filter(r=>String(r.updnLine).includes(direction)).sort((a,b)=>String(a.ordkey||'').localeCompare(String(b.ordkey||''))).slice(0,2);
    return `<div class="direction"><span>${direction}순환</span><span>${old?'이전 수신 정보':'서울시 도착 안내'}</span></div>`+(rows.length?rows.map((r,i)=>`<div class="arrival ${i?'secondary':''}"><div class="arrival-top"><b>${i?'다다음':'다음'} 열차</b><strong class="live-message">${esc(r.arvlMsg2||'시간 미제공')}</strong></div><p>열차 ${esc(r.btrainNo||'번호 미제공')} · ${esc(r.bstatnNm||'행선지 미제공')}행</p><p>${esc(r.arvlMsg3||r.trainLineNm||'')}</p></div>`).join(''):`<p class="detail-caption">${esc(live.arrivalError||(data?'현재 제공되는 도착정보가 없어요.':'도착정보를 불러오는 중…'))}</p>`);
  }).join('<div class="detail-divider"></div>');
  document.querySelector('#detail').innerHTML=`<p class="detail-eyebrow">역 도착 안내</p><span class="station-number">2호선 · ${201+selected}</span><h2 class="detail-title">${name} 역</h2><p class="english">순환선 본선</p><div class="detail-divider"></div>${cards}<p class="detail-caption">${live.arrivalError?esc(live.arrivalError)+'<br>':''}${data?'수신 '+stamp(data.updatedAt)+' · '+(old?'이전 정보 · 현재 상태와 다를 수 있어요':'서울시 제공 메시지 기준'):'연결 대기 중'}</p><div class="detail-bottom">${paused?'갱신 일시정지 · ':''}실제 운행정보 · 30초 간격 확인</div>`;
  updateStatus();
};
async function loadArrivals(){
  if(document.hidden||paused)return;
  const name=names[selected],cached=live.arrivals.get(name);
  if(cached&&Date.now()-cached.updatedAt<30000){live.arrivalError='';renderDetail();return}
  try{const data=await requestLive('arrivals',name);live.arrivals.set(name,data);if(names[selected]===name)live.arrivalError=''}catch(e){if(names[selected]===name)live.arrivalError=e.message}
  if(names[selected]===name)renderDetail();
}
window.selectLive=()=>{live.arrivalError='';clearTimeout(live.selectTimer);live.selectTimer=setTimeout(loadArrivals,350)};
async function pollLive(){
  clearTimeout(live.timer);
  if(document.hidden||paused||live.busy)return;
  live.busy=true;
  try{const data=await requestLive('positions');installPositions(data);live.error=''}catch(e){live.error=e.message}
  await loadArrivals();live.busy=false;renderDetail();
  if(!document.hidden&&!paused)live.timer=setTimeout(pollLive,30000);
}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'▷ 실시간 갱신 재개':'Ⅱ 실시간 갱신 멈추기';clearTimeout(live.timer);if(!paused)pollLive();renderDetail()};
document.addEventListener('visibilitychange',()=>{clearTimeout(live.timer);clearTimeout(live.selectTimer);if(!document.hidden&&!paused)pollLive()});
trains.replaceChildren();renderDetail();pollLive();
