const API_URL = 'https://script.google.com/macros/s/AKfycbywd2G3p28QAjvitir-FBqcOX8up43T_N8LUA--QKCOKC7m7Bheq5TDLPlj6lraKWIOnA/exec';
const LIVE_REFRESH_MS = 10000;
const MISSING_TRAIN_GRACE_MS = 30000;
const live = {positions:null, arrivals:new Map(), lastPositions:new Map(), error:'', arrivalError:'', busy:false, timer:null, nextRefreshAt:0, models:[], pending:new Map(), destination:null,revision:0,expandedArrivals:new Set(),diagnostics:[]};
const esc = v => String(v == null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wrap = p => currentRoute.loop?(p%names.length+names.length)%names.length:Math.max(0,Math.min(names.length-1,p));
const arrivalKey=()=>currentLine.number+':'+names[selected];
const stamp = t => new Date(t).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
function requestLive(action, station='') {
  const line=currentLine.number,lineName=currentLine.name;
  const id=line+':'+action+station;
  if(live.pending.has(id))return live.pending.get(id);
  const promise=new Promise((resolve,reject)=>{
    const cb='transitLive_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const clean=()=>{clearTimeout(timer);delete window[cb];script.remove()};
    const timer=setTimeout(()=>{clean();reject(new Error('연결 시간 초과 · 배포 권한을 확인해주세요'))},20000);
    window[cb]=data=>{clean();if(data.ok&&data.line!==lineName){reject(new Error('Apps Script를 다중 호선 버전으로 업데이트해주세요'));return}if(!data.ok)reject(new Error(({DAILY_LIMIT:'오늘의 API 호출 한도에 도달했어요',MISSING_KEY:'Apps Script 인증키 설정을 확인해주세요',UPSTREAM_UNAVAILABLE:'서울시 데이터 응답을 확인할 수 없어요',BUSY:'다른 요청 처리 중 · 잠시 후 재시도합니다'})[data.error]||'데이터를 가져오지 못했어요'));else {recordLiveResponse(action,line,station,data);resolve(data)}};
    script.onerror=()=>{clean();reject(new Error('Apps Script에 연결할 수 없어요'))};
    const url=new URL(API_URL);url.searchParams.set('action',action);url.searchParams.set('callback',cb);url.searchParams.set('line',line);if(station)url.searchParams.set('station',station);script.src=url.href;document.head.append(script);
  }).finally(()=>live.pending.delete(id));
  live.pending.set(id,promise);return promise;
}
function recordLiveResponse(action,line,station,data){
  const fields=['trainNo','btrainNo','statnNm','statnTnm','bstatnNm','updnLine','trainSttus','arvlCd','arvlMsg2','arvlMsg3','barvlDt','ordkey','recptnDt'];
  live.diagnostics.push({receivedAt:Date.now(),action,line,station,updatedAt:data.updatedAt,stale:data.stale,items:(data.items||[]).map(r=>Object.fromEntries(fields.filter(k=>r[k]!=null).map(k=>[k,r[k]])))});
  if(live.diagnostics.length>30)live.diagnostics.shift();
}
// Local, bounded observation history for investigating jumps. Never sent to a server.
window.transitLiveDiagnostics=()=>JSON.stringify({version:'20261106-last-observation',events:live.diagnostics},null,2);
function installPositions(data){
  if(live.positions&&data.updatedAt<live.positions.updatedAt)return;
  const previousRows=new Map((live.positions?.items||[]).map(r=>[positionKey(r),r]));
  data={...data,items:(data.items||[]).map(r=>{const previous=previousRows.get(positionKey(r));return previous&&observationTime(previous)>observationTime(r)?previous:r})};
  live.positions=data;rebuildPositionModels();
}
function rebuildPositionModels(){
  const now=performance.now();
  const previous=new Map(live.models.map(m=>[m.id,m]));
  live.models=sharedPositionRows(true).flatMap(r=>{
    if(r.locationUncertain)return [];
    const location=mapLocation(r);if(!location)return [];
    const {sign,target}=location;
    const id=positionKey(r);
    return [{id,row:r,sign,from:target,delta:0,since:now}];
  });
  live.models.forEach(m=>{
    const express=expressStopInfo(currentLine.number,m.row,names[selected]).express;
    const existing=previous.get(m.id),el=existing?.el||document.createElement('div');
    previous.delete(m.id);
    el.className='train '+(express?'express-train ':'')+(String(m.row.updnLine)==='0'?'train-up':'train-down')+(terminalInfo(m.row.statnTnm).shortTurn?' short-turn':'');
    if(!existing||existing.express!==express){
      el.innerHTML=trainIcon+'<span class="train-direction-arrow"></span>'+(express?'<span class="map-express-badge">급행</span>':'');
    }
    el.setAttribute('aria-hidden','true');m.el=el;m.express=express;
    if(!existing)trains.append(el);
  });
  previous.forEach(m=>m.el.remove());
  window.paintLive(now);
}
function mapLocation(row){
  const index=names.indexOf(positionStation(row));if(index<0)return null;
  let sign=currentRoute.oneWay?1:String(row.updnLine)===(currentLine.number===2&&currentRoute.loop?'0':'1')?1:-1;
  const terminal=names.indexOf(terminalInfo(row.statnTnm).name);
  if(!currentRoute.loop&&terminal>=0&&terminal!==index)sign=terminal>index?1:-1;
  return {sign,target:wrap(index+sign*positionStateOffset(row.trainSttus))};
}
function positionStateOffset(status){return ({'0':-.25,'1':0,'2':.25,'3':-.75,'moving':.5})[String(status)]??0}
function modelPosition(m,now){return wrap(m.from+m.delta*Math.min(1,Math.max(0,(now-m.since)/2500)))}
function terminalInfo(raw){
  const name=normalizeStation(String(raw||'').replace(/종착$/,'').replace(/행$/,''));
  const index=names.indexOf(name);
  return {name,index,shortTurn:!currentRoute.loop&&index>0&&index<names.length-1};
}
function pathToTerminus(terminus,origin=names[selected]){
  const graph=new Map();
  const add=(a,b)=>{if(!graph.has(a))graph.set(a,new Set());graph.get(a).add(b)};
  for(const r of currentLine.routes||[]){
    for(let i=1;i<r.names.length;i++){add(r.names[i-1],r.names[i]);if(!r.oneWay)add(r.names[i],r.names[i-1])}
    if(r.loop){add(r.names.at(-1),r.names[0]);if(!r.oneWay)add(r.names[0],r.names.at(-1))}
  }
  const queue=[[origin]],seen=new Set([origin]);
  for(let i=0;i<queue.length;i++){
    const path=queue[i],last=path.at(-1);if(last===terminus)return path;
    for(const next of graph.get(last)||[]){if(!seen.has(next)){seen.add(next);queue.push([...path,next])}}
  }
  return null;
}
function trainJourney(row,direction){
  const terminal=terminalInfo(row.bstatnNm);
  let reaches=null;
  if(live.destination!==null&&live.destination!==selected&&terminal.index>=0){
    const sign=direction==='내선'||direction==='하행'||direction==='순환'?1:-1;
    if(currentRoute.loop){
      const distance=to=>(sign*(to-selected)+names.length)%names.length;
      reaches=distance(live.destination)>0&&distance(live.destination)<=distance(terminal.index);
    } else {
      const destinationDistance=sign*(live.destination-selected),terminalDistance=sign*(terminal.index-selected);
      reaches=destinationDistance>0&&terminalDistance>=destinationDistance;
    }
  } else if(live.destination!==null&&live.destination!==selected&&!currentRoute.loop&&terminal.name){
    const path=pathToTerminus(terminal.name);
    if(path)reaches=path.includes(names[live.destination]);
  }
  if(reaches===true&&live.destination!==null){
    const stop=expressStopInfo(currentLine.number,row,names[live.destination]);
    if(stop.express&&stop.stops!==true)reaches=false;
  }
  return {...terminal,reaches};
}
window.paintLive=now=>{
  live.models.forEach(m=>{
    m.el.hidden=!usableObservation(m.row)||(m.row.missingUntil!=null&&Date.now()>=m.row.missingUntil);
    m.el.title='열차 '+m.row.trainNo+' · '+positionStation(m.row)+' · '+observationAge(m.row)+(oldObservation(m.row)?' · 현재 위치 확인 필요':'');
    const p=modelPosition(m,now),q=positionAt(p),a=positionAt(wrap(p+m.sign*.015)),angle=Math.atan2(a.y-q.y,a.x-q.x);
    m.el.style.setProperty?.('--badge-rotation',(-angle*180/Math.PI)+'deg');
    m.el.style.left=q.x+'px';m.el.style.top=(q.y+(m.sign>0?-13:13))+'px';m.el.style.transform=`translate(-50%,-50%) rotate(${angle*180/Math.PI}deg)`;m.el.firstElementChild.style.transform=Math.cos(angle)<0?'scaleY(-1)':'none';
  });
};
function dataOld(data){return data && (data.stale||Date.now()-data.updatedAt>90000)}
function updateStatus(){
  const arrivalOnly=currentLine.positions===false;
  const data=arrivalOnly?live.arrivals.get(arrivalKey()):live.positions;
  document.querySelector('.demo').textContent=paused?'갱신 일시정지':live.error?'연결 확인 필요':!data?'실시간 연결 중':dataOld(data)?'이전 수신 정보':arrivalOnly?'도착정보 전용':'실시간 데이터';
  const countdown=paused?'갱신 일시정지':document.hidden?'화면 대기 중':live.busy?'갱신 중…':live.nextRefreshAt?`자동갱신 ${Math.max(0,Math.ceil((live.nextRefreshAt-Date.now())/1000))}초 후`:'연결 대기 중';
  const status=arrivalOnly?(data?'도착정보 갱신 '+stamp(data.updatedAt):'도착정보를 불러오는 중…'):data?`${dataOld(data)?'이전 정보':'위치 수신'} ${stamp(data.updatedAt)} · 표시 ${live.models.length}대${live.models.some(m=>oldObservation(m.row))?' · 이전 관측 '+live.models.filter(m=>oldObservation(m.row)).length+'대':''}`:'실제 열차 위치를 불러오는 중…';
  document.querySelector('.map-description span').innerHTML=`${esc(status)} <span class="refresh-countdown">· ${esc(countdown)}</span>${live.error?' · '+esc(live.error):''}`;
}
function destinationRoute(origin, destination){
  if(destination===null||destination===origin)return null;
  if(!currentRoute.loop)return {direction:destination>origin?'하행':'상행',stops:Math.abs(destination-origin)};
  const inner=(destination-origin+names.length)%names.length;
  const outer=(origin-destination+names.length)%names.length;
  return {direction:currentRoute.oneWay?'순환':inner===outer?'양방향':inner<outer?'내선':'외선',stops:currentRoute.oneWay?inner:Math.min(inner,outer)};
}
// Keep trains at the platform ahead of approaching trains; remove only confirmed departures.
function upcomingArrivals(items){
  const latest=new Map();
  items.forEach((r,i)=>{const id=expressTrainKey(r.btrainNo),key=id?id+':'+directionCode(r.updnLine)+':'+(r.bstatnNm||''):'missing:'+i,prior=latest.get(key);if(!prior||observationTime(r)>observationTime(prior))latest.set(key,r)});
  const rank=r=>String(r.arvlCd)==='1'?0:String(r.arvlCd)==='0'?1:2;
  const distance=r=>platformDistance(r,r.updnLine)??(/^\d{5}/.test(String(r.ordkey||''))?Number(String(r.ordkey).slice(2,5)):Infinity);
  return [...latest.values()].filter(r=>String(r.arvlCd)!=='2').sort((a,b)=>distance(a)-distance(b)||Number(oldObservation(a))-Number(oldObservation(b))||rank(a)-rank(b)||String(a.ordkey||'').localeCompare(String(b.ordkey||''),undefined,{numeric:true}));
}
function observationTime(row){const text=String(row.recptnDt||'').trim().replace(' ','T');return text?Date.parse(text+(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)?'':'+09:00'))||0:0}
function recentPosition(position){
  const received=observationTime(position);
  return received>0&&Date.now()-received<=90000&&received-Date.now()<=10000;
}
function usableObservation(row){
  const time=observationTime(row);if(!time||time>Date.now()+10000)return false;
  // Keep the current operating day's observations, including trains after midnight.
  const day=t=>new Date(t+5*3600000).toISOString().slice(0,10);
  return day(time)===day(Date.now());
}
function oldObservation(row){
  const time=row.positionReceivedAt?observationTime({recptnDt:row.positionReceivedAt}):observationTime(row);
  return !!row.snapshotStale||(time>0&&Date.now()-time>90000);
}
function observationAge(row){
  const time=observationTime({recptnDt:row.positionReceivedAt||row.recptnDt});
  if(!time)return '관측 시각 미제공';
  const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));
  return (seconds>=60?Math.floor(seconds/60)+'분 ':'')+(seconds%60||seconds===0?seconds%60+'초 ':'')+'전 정보';
}
function availablePositionRows(data=live.positions){
  if(!data)return [];
  return (data.items||[]).filter(usableObservation).map(r=>({...r,snapshotStale:!!data.stale}));
}
function positionStation(position){
  const canonical=currentLine.stations.find(s=>s.id&&s.id===position.statnId);
  return canonical?canonical.name:normalizeStation(position.statnNm);
}
function directionCode(value){
  const text=String(value??'');
  return text==='1'||/하행|외선/.test(text)?'1':text==='0'||/상행|내선|순환/.test(text)?'0':null;
}
function positionKey(row){
  return [currentLine.number,expressTrainKey(row.trainNo||row.btrainNo),directionCode(row.updnLine),terminalInfo(row.statnTnm||row.bstatnNm).name].join(':');
}
function sharedPositionRows(remember=false){
  if(currentLine.positions===false)return [];
  return keepLastPositions(availablePositionRows(),remember);
}
// Keep the latest accepted observation across gaps in either feed. After the
// short display grace, retain its timestamp so an older cached row cannot return.
function keepLastPositions(rows,remember){
  const now=Date.now(),prefix=currentLine.number+':',available=new Map();
  for(const row of rows){
    const key=positionKey(row),previous=available.get(key);
    if(!previous||observationTime(row)>observationTime(previous))available.set(key,row);
  }
  for(const [key,entry] of live.lastPositions){
    if(!usableObservation(entry.row)){if(remember)live.lastPositions.delete(key);continue;}
    if(!key.startsWith(prefix))continue;
    const row=available.get(key);
    if(row&&!row.locationUncertain&&observationTime(row)>=observationTime(entry.row))continue;
    const missingUntil=entry.missingUntil??now+MISSING_TRAIN_GRACE_MS;
    if(remember)entry.missingUntil=missingUntil;
    const atTerminus=positionStation(entry.row)===terminalInfo(entry.row.statnTnm).name&&['1','2'].includes(String(entry.row.trainSttus));
    const reassigned=rows.some(next=>positionKey(next)!==key&&expressTrainKey(next.trainNo)===expressTrainKey(entry.row.trainNo)&&observationTime(next)>observationTime(entry.row));
    if(now<missingUntil&&!atTerminus&&!reassigned)available.set(key,{...entry.row,snapshotStale:true,missingUntil});
    else if(!row?.locationUncertain)available.delete(key);
  }
  if(remember)for(const [key,row] of available){
    if(!row.locationUncertain&&row.missingUntil==null&&expressTrainKey(row.trainNo))live.lastPositions.set(key,{row});
  }
  return [...available.values()];
}
function exactArrivalMatch(position,row){
  const train=expressTrainKey(position.trainNo),direction=directionCode(position.updnLine),terminal=terminalInfo(position.statnTnm).name;
  return !!train&&direction!==null&&!!terminal&&train===expressTrainKey(row.btrainNo)&&direction===directionCode(row.positionDirection??row.updnLine)&&terminal===terminalInfo(row.bstatnNm).name;
}
function reportedEta(row){
  if(!row||row.snapshotStale||!recentPosition(row)||['0','1','2'].includes(String(row.arvlCd)))return '';
  const text=String(row.arvlMsg2||'').match(/(?:\d+\s*분(?:\s*\d+\s*초)?|\d+\s*초)\s*후/);
  const seconds=Number(row.barvlDt);
  return text?.[0]||(Number.isFinite(seconds)&&seconds>0?(Math.floor(seconds/60)?Math.floor(seconds/60)+'분 ':'')+(seconds%60?seconds%60+'초 ':'')+'후':'');
}
function positionArrivalRows(items,direction){
  const positions=sharedPositionRows();
  const arrivals=items.filter(r=>(direction==='순환'||directionCode(r.updnLine)===directionCode(direction))&&(!observationTime(r)||usableObservation(r)));
  const consumed=new Set();
  const rows=[];
  for(const position of positions){
    if(!expressTrainKey(position.trainNo))continue;
    const up=String(position.updnLine)==='0';
    if(direction!=='순환'&&up!==(direction==='상행'||direction==='내선'))continue;
    const matching=arrivals.filter(r=>exactArrivalMatch(position,r)).sort((a,b)=>observationTime(b)-observationTime(a));
    const stop=expressStopInfo(currentLine.number,position,names[selected]);
    if(stop.stops!==true){
      if(stop.stops===false)for(const row of matching)consumed.add(row);
      continue;
    }
    const origin=positionStation(position);
    const terminal=terminalInfo(position.statnTnm).name;
    if(!origin||!terminal)continue;
    let path;
    if(currentRoute.loop){
      const start=names.indexOf(origin),end=names.indexOf(terminal);
      if(start<0||end<0)continue;
      const sign=currentRoute.oneWay||up?1:-1;
      path=[origin];
      for(let i=1;i<names.length;i++){
        const next=names[(start+sign*i+names.length)%names.length];path.push(next);if(next===terminal)break;
      }
    }else{
      path=pathToTerminus(terminal,origin);
    }
    if(!path)continue;
    for(const row of matching)consumed.add(row);
    const distance=path.indexOf(names[selected]);
    if(distance<0)continue;
    const status=String(position.trainSttus);
    if(distance===0&&!['0','1','3'].includes(status))continue;
    const code=distance===0?(status==='1'?'1':status==='3'?'3':'0'):'99';
    const eta=matching.length&&matching.filter(r=>observationTime(r)===observationTime(matching[0])).every(r=>reportedEta(r)===reportedEta(matching[0]))?reportedEta(matching[0]):'';
    rows.push({eta,positionOffMap:!mapLocation(position),positionDirection:position.updnLine,updnLine:direction,btrainNo:position.trainNo,bstatnNm:position.statnTnm,arvlCd:code,
      arvlMsg2:distance===0?(status==='1'?'도착 · 정차 중':status==='3'?'전역 출발':'역 진입'):distance+'개 역 전',
      arvlMsg3:origin,positionStationName:origin,positionReceivedAt:position.recptnDt,positionDistance:distance,positionStatus:status,positionBased:true,isExpress:stop.express,directAt:position.directAt,positionWarning:position.locationWarning,locationUncertain:position.locationUncertain,snapshotStale:!!position.snapshotStale});
  }
  for(const arrival of arrivals){
    if(consumed.has(arrival))continue;
    const info=expressStopInfo(currentLine.number,arrival,names[selected]);
    if(info.stops===false)continue;
    rows.push({...arrival,isExpress:info.express,locationUnknown:true,eta:reportedEta(arrival)});
  }
  return rows;
}
function platformDistance(row){
  return Number.isFinite(row.positionDistance)?row.positionDistance:null;
}
function endsAtSelectedStation(row){
  return terminalInfo(row.bstatnNm).name===names[selected];
}
// Schematic progress from reported states; these fractions are not GPS positions.
function platformTrackDistance(row){
  const distance=platformDistance(row);
  return distance===null?null:Math.max(0,distance-positionStateOffset(row.positionStatus));
}
function hideTerminatingMarker(row,direction){
  if(!endsAtSelectedStation(row))return false;
  const distance=platformTrackDistance(row,direction);
  const stationDistance=platformDistance(row,direction);
  const status=String(row.positionStatus??''),code=String(row.arvlCd??'');
  // Previous-station departure stays visible in the gap; hide only on entry/arrival.
  return (stationDistance===0&&(status?status==='0'||status==='1':code==='0'||code==='1'))||distance===0;
}
function onwardArrivals(rows){
  return rows.filter(row=>!endsAtSelectedStation(row));
}
function platformMessage(r,direction){
  if(r.locationUnknown)return {main:r.eta?'<em>'+esc(r.eta)+'</em> 도착':'위치 미확인',sub:r.eta?'위치 미확인':'도착시간 미제공',distance:null};
  if(oldObservation(r)){const distance=platformDistance(r,direction);return {main:'마지막 관측'+(distance!==null?' · '+distance+'역 전':''),sub:observationAge(r)+' · 현재 위치 확인 필요',distance};}
  if(r.locationUncertain)return {main:'위치 확인 중',sub:'같은 시각의 위치정보가 서로 달라요',distance:null};
  const raw=String(r.arvlMsg2||''),code=String(r.arvlCd),distance=platformDistance(r,direction);
  const prefix=distance===0?'':distance===1?'전역 ':distance===2?'전전역 ':'';
  const observed=r.positionStatus==='1'?(distance===0?'도착 · 정차 중':prefix+'정차 중'):r.positionStatus==='2'?prefix+'출발':r.positionStatus==='0'?prefix+'진입':r.positionStatus==='3'?(distance===0?'전역 출발':distance===1?'전전역 출발':'이동 중'):'';
  const state=observed||({0:'역 진입',1:'도착 · 정차 중',3:'전역 출발',4:'전역 진입',5:'전역 정차 중'}[code])||(/전전역.*출발/.test(raw)?'전전역 출발':/전역.*출발/.test(raw)?'전역 출발':/전전역.*(?:정차|도착|진입)/.test(raw)?'전전역 정차':/전역.*(?:정차|도착|진입)/.test(raw)?'전역 정차':/출발/.test(raw)?(distance===1?'전역 출발':distance===2?'전전역 출발':'이동 중'):/정차|도착/.test(raw)&&!/[분초].*후/.test(raw)?(distance===1?'전역 정차':'이동 중'):'이동 중');
  const eta=['0','1','2'].includes(code)?'':r.eta;
  const distanceText=distance!==null?'('+distance+'역 전)':'';
  return {main:eta?`<em>${esc(eta)}</em> 도착`:distance>0?`<em>${distanceText}</em> ${esc(state)}`:esc(state),sub:eta?[distanceText,state!=='이동 중'?state:''].filter(Boolean).join(' '):'',distance};
}
function platformDestination(r,direction){
  const journey=trainJourney(r,direction);
  return `${r.isExpress?'<span class="express-tag">급행</span>':''}<span class="platform-destination">${esc(journey.name?journey.name+'행':'행선지 미제공')}</span>`;
}
function platformNotes(r,direction,route){
  const journey=trainJourney(r,direction);
  const terminal=journey.name===names[selected]?'이 역 종착 · '+journey.name+' 종착':journey.shortTurn?'중간 종착 · '+journey.name+' 종착':'';
  const coverage=route?(journey.reaches===true?'목적지까지 운행':journey.reaches===false?'목적지까지 가지 않아요':'목적지 운행 여부 확인 필요'):'';
  const ageNote=oldObservation(r)?'<span class="platform-age-note">'+esc(observationAge(r))+' · 현재 위치 확인 필요</span>':'';
  const warning=r.positionWarning?'<span class="platform-location-warning">위치정보 차이 · 최신 관측 기준</span>':'';
  const location=r.positionStationName?`<span class="platform-location">${oldObservation(r)?'마지막 위치':'현재위치'} ${esc(r.positionStationName)}${r.positionReceivedAt?' · '+esc(stamp(observationTime({recptnDt:r.positionReceivedAt})))+' 관측':''}</span>`:'';
  return `${terminal?`<b class="platform-terminal">${esc(terminal)}</b>`:''}${coverage?`<span class="coverage-label ${journey.reaches===false?'does-not-reach':''}">${esc(coverage)}</span>`:''}${location}${warning}${ageNote}`;
}
function diagramTrackDistance(row,direction){
  if(row.locationUnknown||row.positionOffMap)return null;
  const models=live.models.filter(m=>exactArrivalMatch(m.row,row));
  if(models.length===1){
    const model=models[0],position=modelPosition(model,performance.now());
    let distance=(selected-position)*model.sign;
    if(currentRoute.loop)distance=(distance+names.length)%names.length;
    return distance>=0?distance:null;
  }
  return platformTrackDistance(row,direction);
}
function platformDiagram(rows,direction){
  const left=['상행','내선','순환'].includes(direction),sign=['내선','순환','하행'].includes(direction)?1:-1;
  const terminalStations=new Set(rows.map(r=>terminalInfo(r.bstatnNm).name).filter(Boolean));
  const endsHere=terminalStations.has(names[selected]);
  const stations=Array.from({length:5},(_,i)=>{
    const distance=left?i:4-i,offset=distance,index=selected-sign*distance;
    const valid=currentRoute.loop||index>=0&&index<names.length;
    return {name:valid?names[(index%names.length+names.length)%names.length]:'',selected:offset===0};
  });
  const slots=[];
  const through=onwardArrivals(rows);
  const firstFresh=through.find(r=>!oldObservation(r)),orderUncertain=!!firstFresh&&through.some(r=>oldObservation(r)&&(platformDistance(r,direction)??Infinity)<=(platformDistance(firstFresh,direction)??Infinity));
  const outside=[];
  const candidates=rows.filter(r=>!hideTerminatingMarker(r,direction)).map(r=>({row:r,distance:diagramTrackDistance(r,direction)})).filter(x=>x.distance!==null&&x.distance>=0);
  for(const {row:r,distance} of candidates.filter(x=>x.distance>4).slice(0,2)){outside.push(`<span class="platform-outside-train" data-outside-train="${esc(r.btrainNo||'')}"><img src="assets/train-line2-short.png" alt="열차" class="${left?'faces-left':''}"><span>#${esc(r.btrainNo||'')} · ${esc(r.positionStationName||'위치 미제공')} · ${platformDistance(r,direction)}역 전<br>그림 범위 밖${oldObservation(r)?' · '+esc(observationAge(r)):''}</span></span>`);}
  const markers=candidates.filter(x=>x.distance<=4).map(({row:r,distance},i)=>{
    const slot=left?distance:4-distance;
    const overlap=slots.includes(slot);slots.push(slot);
    const terminating=endsAtSelectedStation(r);
    const label=oldObservation(r)?'이전 위치':terminating?names[selected]+' 종착':through.indexOf(r)===0?(orderUncertain?'확인':'이번'):through.indexOf(r)===1?(orderUncertain?'후속':'다음'):'#'+(r.btrainNo||'');
    return `<div class="platform-train ${left?'faces-left':''} train-slot-${i}${overlap?' same-station':''}${terminating?' terminating-train':''}${oldObservation(r)?' observation-old':''}" data-train="${esc(r.btrainNo||'')}" style="left:${10+slot*20}%"><span>${label}${r.isExpress?' · 급행':''}${distance>4?' · '+platformDistance(r,direction)+'역 전':''}</span><img src="assets/train-line2-short.png" alt="${label} 열차${left?' 왼쪽':' 오른쪽'} 방향"></div>`;
  }).join('');
  return `<div class="platform-diagram" aria-label="${left?'왼쪽':'오른쪽'}으로 운행하는 열차 위치"><div class="platform-rail"></div>${stations.map((s,i)=>{const terminal=s.name&&terminalStations.has(s.name);return `<div class="platform-station ${s.selected?'is-current':''}${terminal?' has-terminus':''}" ${terminal?`aria-label="${esc(s.name)} · 일부 열차 종착역"`:''} style="left:${10+i*20}%"><i></i><span>${esc(s.name||'—')}</span>${s.selected?`<b class="selected-station-tag${terminal?' terminal-station-tag':''}">${terminal?'선택·종착':'선택역'}</b>`:terminal?'<b class="terminal-station-tag">종착</b>':''}</div>`}).join('')}${markers}</div>${outside.length?`<p class="platform-outside">${outside.join('<br>')}</p>`:''}${endsHere?`<p class="platform-terminal-legend"><i aria-hidden="true"></i>${esc(names[selected])} 종착 열차는 이 역 진입부터 그림에서 숨겨요.</p>`:''}`;
}
window.renderLive=()=>{
  const name=names[selected],data=live.arrivals.get(arrivalKey()),old=dataOld(data);
  const expired=old||(data?.items||[]).some(r=>observationTime(r)&&!recentPosition(r))||(live.positions?.items||[]).some(r=>observationTime(r)&&!recentPosition(r));
  const route=destinationRoute(selected,live.destination);
  document.querySelector('#selected-station-title').textContent=name+' 역';
  document.querySelector('#selected-station-number').textContent=currentLine.name+' · '+currentRoute.name;
  const input=document.querySelector('#destination');
  const typed=input?input.value.trim():'';
  document.querySelector('#route-summary').textContent=route?`${name} → ${names[live.destination]} · ${route.direction}${currentLine.number===2&&currentRoute.loop?'순환':''} ${route.stops}개 역 이동`:live.destination===selected?'현재 선택한 역과 목적지가 같아요.':typed?'현재 구간의 자동완성에서 역을 선택해주세요.':'목적지를 고르면 더 적은 역을 지나는 방향을 표시해요.';
  const directions=currentRoute.oneWay?['순환']:currentLine.number===2&&currentRoute.loop?['내선','외선']:['상행','하행'];
  let hasPositionArrivals=false,hasTerminatingArrivals=false;
  const cards=directions.map(direction=>{
    const reported=(data?.items||[]).map(r=>({...r,snapshotStale:!!data?.stale})).filter(r=>direction==='순환'||String(r.updnLine).includes(direction)||((direction==='상행'||direction==='하행')&&String(r.updnLine).includes(direction==='상행'?'내선':'외선')));
    const records=upcomingArrivals(positionArrivalRows(reported,direction));
    const unlocated=records.filter(r=>r.locationUnknown);
    const approaching=records.filter(r=>!r.locationUnknown);
    const allRows=onwardArrivals(approaching),oldRows=allRows.filter(oldObservation),rows=allRows;
    if(allRows.length<approaching.length)hasTerminatingArrivals=true;
    if(rows.some(r=>r.positionBased))hasPositionArrivals=true;
    const recommended=route&&(route.direction===direction||route.direction==='양방향');
    const moreKey=arrivalKey()+':'+direction;
    const directionName=direction+(directions[0]==='내선'?'순환':'');
    const extra=rows.slice(2,6),first=rows[0],next=rows[1];
    const orderUncertain=!!first&&oldRows.some(r=>(platformDistance(r,direction)??Infinity)<=(platformDistance(first,direction)??Infinity));
    const proximityNotice=first&&oldObservation(first)?'<p class="platform-nearby-note">마지막으로 받은 위치에 열차를 표시하고 있어요. 새 정보가 오면 바로 반영해요.</p>':orderUncertain?'<p class="platform-nearby-note">더 가까운 열차의 최신 위치를 확인 중이에요. 아래 이전 관측도 확인해주세요.</p>':'';
    const moreLabel=directionName+' 열차 ';
    const up=['상행','내선','순환'].includes(direction);
    const firstMessage=first?platformMessage(first,direction):null;
    const boardHeader=`<div class="platform-board-header"><h3><i class="detail-direction-triangle ${up?'direction-up':'direction-down'}" aria-hidden="true"></i>${directionName} <span aria-hidden="true">${up?'←':'→'}</span></h3>${first?`<span class="platform-current-label">${oldObservation(first)?'마지막 관측 열차':orderUncertain?'확인된 열차':'이번 열차'} <small>#${esc(first.btrainNo||'번호 미제공')}</small></span><div class="platform-badges">${platformDestination(first,direction)}</div>`:''}</div>`;
    const main=first?`<div class="platform-main-status"><strong>${firstMessage.main}</strong>${firstMessage.sub?`<p>${esc(firstMessage.sub)}</p>`:''}<div class="platform-main-notes">${platformNotes(first,direction,route)}</div></div>`:`<p class="platform-empty">${esc(live.arrivalError||(unlocated.length?'도착정보는 아래 목록에서 확인하세요.':data?(oldRows.length?'이전 관측 열차가 있어요. 아래에서 마지막 위치를 확인하세요.':approaching.length?'이 역 종착 열차를 제외한 도착정보가 없어요.':expired?'최신 위치정보를 확인할 수 없어요.':'현재 제공되는 도착정보가 없어요.'):'도착정보를 불러오는 중…'))}</p>`;
    const nextRow=next?`<div class="platform-next-row"><span class="platform-next-label">${oldObservation(next)?'마지막 관측 열차':orderUncertain||oldObservation(first)?'확인된 열차':'다음 열차'} <small>#${esc(next.btrainNo||'번호 미제공')}</small></span><div class="platform-next-status"><strong>${platformMessage(next,direction).main}</strong>${platformMessage(next,direction).sub?`<small>${esc(platformMessage(next,direction).sub)}</small>`:''}</div><div class="platform-badges">${platformDestination(next,direction)}</div><div class="platform-next-notes">${platformNotes(next,direction,route)}</div></div>`:first?'<div class="platform-next-row platform-no-next">다음 열차 정보가 아직 없어요.</div>':'';
    const more=extra.length?`<details class="arrival-more" data-label="${esc(moreLabel)}" data-key="${esc(moreKey)}" data-count="${extra.length}" ${live.expandedArrivals.has(moreKey)?'open':''}><summary>${moreLabel}${live.expandedArrivals.has(moreKey)?'접기':'더 보기'} (${extra.length}대) <small>· 최대 4대</small></summary><div class="arrival-extra-grid">${extra.map((r,i)=>{const message=platformMessage(r,direction);return `<div class="arrival platform-extra-card"><div class="platform-extra-header"><b><i class="detail-direction-triangle ${up?'direction-up':'direction-down'}" aria-hidden="true"></i>${directionName} · ${oldObservation(r)?'이전 관측':(i+3)+'번째 열차'}</b><small>#${esc(r.btrainNo||'번호 미제공')}</small><div class="platform-badges">${platformDestination(r,direction)}</div></div><strong class="platform-extra-status">${message.main}</strong>${message.sub?`<p>${esc(message.sub)}</p>`:''}<p class="platform-extra-location">${oldObservation(r)?'마지막 위치':'현재위치'} ${esc(r.positionStationName||r.arvlMsg3||'정보 미제공')}</p><div class="platform-extra-notes">${platformNotes(r,direction,route)}</div></div>`}).join('')}</div></details>`:'';
    const unknown=unlocated.length?`<div class="platform-unlocated"><strong>위치 미확인 열차 (${unlocated.length}대)</strong><div class="arrival-extra-grid">${unlocated.map(r=>{const message=platformMessage(r,direction);return `<div class="arrival platform-extra-card"><div class="platform-extra-header"><small>#${esc(r.btrainNo||'번호 미제공')}</small><div class="platform-badges">${platformDestination(r,direction)}</div></div><strong class="platform-extra-status">${message.main}</strong><p>${esc(message.sub)}</p></div>`}).join('')}</div></div>`:'';
    return `<section class="direction-group platform-group ${up?'platform-up':'platform-down'}${recommended?' recommended':''}" aria-label="${directionName}${recommended?' · 목적지 추천 방향':''}"><div class="platform-board">${recommended?'<span class="platform-search-flag">검색한 구간</span>':''}${boardHeader}${proximityNotice}${main}${currentLine.positions===false?'':platformDiagram(approaching,direction)}${nextRow}</div>${more}${unknown}</section>`;
  }).join('');
  document.querySelector('#detail').innerHTML=`<div class="direction-grid">${cards}</div><p class="detail-caption">${live.arrivalError?esc(live.arrivalError)+'<br>':''}${data?'수신 '+stamp(data.updatedAt)+' · '+(old?'이전 정보 · 현재 상태와 다를 수 있어요':'서울시 제공 메시지 기준'):'연결 대기 중'}${expired?'<br>오래된 관측은 마지막 위치로 남겨두며, 현재 위치·도착시간은 확인이 필요해요.':''}${hasPositionArrivals?'<br>위치정보 기준 · 도착시간 미제공 열차는 역 수로 안내하며, 급행 추월 등으로 실제 도착 순서와 다를 수 있어요.':''}${hasTerminatingArrivals?'<br>이 역 종착 열차는 이번·다음 열차의 도착시간에서 제외해요.':''}${route?'<br>방향은 역 수 기준 · 열차별 종착역까지 확인해 안내합니다. 다른 구간 종착은 별도 확인이 필요해요.':''}</p><div class="detail-bottom">${paused?'갱신 일시정지 · ':''}실제 운행정보 · 10초 간격 확인</div>`;
  updateStatus();
};
document.querySelector('#detail').addEventListener('click',event=>{
  const summary=event.target.closest('details.arrival-more > summary');
  if(!summary)return;
  const details=summary.parentElement;
  // Record intent synchronously, before the next clock refresh can rebuild cards.
  if(details.open)live.expandedArrivals.delete(details.dataset.key);else live.expandedArrivals.add(details.dataset.key);
});
document.querySelector('#detail').addEventListener('toggle',event=>{
  const details=event.target;
  if(!details.isConnected||!details.matches('details.arrival-more'))return;
  if(details.open)live.expandedArrivals.add(details.dataset.key);else live.expandedArrivals.delete(details.dataset.key);
  details.querySelector('summary').textContent=(details.dataset.label||'열차 ')+(details.open?'접기':'더 보기')+' ('+details.dataset.count+'대)';
},true);
function installArrivals(key,data){
  const previous=live.arrivals.get(key);
  if(previous&&data.updatedAt<previous.updatedAt)return;
  const old=new Map((previous?.items||[]).map(r=>[expressTrainKey(r.btrainNo)+':'+directionCode(r.updnLine)+':'+r.bstatnNm,r]));
  const items=(data.items||[]).map(r=>{const prior=old.get(expressTrainKey(r.btrainNo)+':'+directionCode(r.updnLine)+':'+r.bstatnNm);return prior&&observationTime(prior)>observationTime(r)?prior:r});
  live.arrivals.set(key,{...data,items});
}

async function loadArrivals(){
  if(document.hidden||paused)return;
  const name=names[selected],key=arrivalKey(),revision=live.revision,station=stationFor(name),cached=live.arrivals.get(key);
  if(cached&&Date.now()-cached.updatedAt<LIVE_REFRESH_MS){live.arrivalError='';renderDetail();return}
  try{const data=await requestLive('arrivals',station?station.api:name);if(revision!==live.revision)return;installArrivals(key,data);if(arrivalKey()===key)live.arrivalError=''}catch(e){if(revision===live.revision&&arrivalKey()===key)live.arrivalError=e.message}
  if(revision===live.revision&&arrivalKey()===key)renderDetail();
}
window.selectLive=()=>{live.arrivalError='';clearTimeout(live.selectTimer);live.selectTimer=setTimeout(loadArrivals,350)};
async function pollLive(){
  clearTimeout(live.timer);
  if(document.hidden||paused||live.busy)return;
  const revision=live.revision;
  live.busy=true;live.nextRefreshAt=0;updateStatus();
  if(currentLine.positions!==false){try{const data=await requestLive('positions');if(revision!==live.revision)return;installPositions(data);live.error=''}catch(e){if(revision!==live.revision)return;live.error=e.message}}
  await loadArrivals();if(revision!==live.revision)return;live.busy=false;
  if(!document.hidden&&!paused){live.nextRefreshAt=Date.now()+LIVE_REFRESH_MS;live.timer=setTimeout(pollLive,LIVE_REFRESH_MS)}
  renderDetail();
}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'▷ 실시간 갱신 재개':'Ⅱ 실시간 갱신 멈추기';clearTimeout(live.timer);live.nextRefreshAt=0;if(!paused)pollLive();renderDetail()};
document.addEventListener('visibilitychange',()=>{clearTimeout(live.timer);clearTimeout(live.selectTimer);live.nextRefreshAt=0;if(!document.hidden&&!paused)pollLive();updateStatus()});
const destinationInput=document.querySelector('#destination');
const destinationResults=document.querySelector('#destination-results');
function closeDestinationResults(){destinationResults.hidden=true;destinationInput.setAttribute('aria-expanded','false')}
function updateDestinationOptions(){closeDestinationResults();destinationResults.replaceChildren()}
function chooseDestination(index){live.destination=index;destinationInput.value=names[index]==='서울'?'서울역':names[index]+'역';closeDestinationResults();renderDetail()}
function renderDestinationResults(){
  const query=destinationInput.value.trim().replace(/역$/,'');
  const index=names.indexOf(query);live.destination=index<0?null:index;
  destinationResults.replaceChildren();
  if(!query){closeDestinationResults();renderDetail();return}
  const matches=names.map((name,index)=>({name,index})).filter(s=>s.name.includes(query)).slice(0,12);
  destinationResults.hidden=false;destinationInput.setAttribute('aria-expanded','true');
  if(!matches.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='현재 구간에서 찾을 수 없는 역이에요.';destinationResults.append(empty)}
  matches.forEach(({name,index})=>{const button=document.createElement('button');button.type='button';const title=document.createElement('strong');title.textContent=name==='서울'?'서울역':name+'역';const caption=document.createElement('small');caption.textContent=currentLine.name+' · '+currentRoute.name;button.append(title);button.append(caption);button.onclick=()=>chooseDestination(index);destinationResults.append(button)});
  renderDetail();
}
updateDestinationOptions();
destinationInput.addEventListener('input',renderDestinationResults);
destinationInput.addEventListener('focus',()=>{if(destinationInput.value.trim())renderDestinationResults();else closeDestinationResults()});
destinationInput.addEventListener('keydown',e=>{if(e.key==='Escape')closeDestinationResults();if(e.key==='Enter'){const b=destinationResults.hidden?null:destinationResults.querySelector('button');if(b){e.preventDefault();b.click()}}if(e.key==='ArrowDown'){const b=destinationResults.hidden?null:destinationResults.querySelector('button');if(b){e.preventDefault();b.focus()}}});
destinationResults.addEventListener('keydown',e=>{const buttons=[...destinationResults.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(e.key==='Escape'){destinationInput.focus();closeDestinationResults()}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()}});
document.addEventListener('click',e=>{if(!e.target.closest('.destination-search'))closeDestinationResults()});
document.querySelector('#clear-destination').onclick=()=>{destinationInput.value='';live.destination=null;closeDestinationResults();renderDetail();destinationInput.focus()};
window.changeLiveLine=()=>{live.revision++;clearTimeout(live.timer);clearTimeout(live.selectTimer);live.busy=false;live.positions=null;live.models=[];live.error='';live.arrivalError='';live.destination=null;live.nextRefreshAt=0;destinationInput.value='';updateDestinationOptions();trains.replaceChildren();renderDetail();pollLive()};
trains.replaceChildren();renderDetail();pollLive();
