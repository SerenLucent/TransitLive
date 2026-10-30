const API_URL = 'https://script.google.com/macros/s/AKfycbywd2G3p28QAjvitir-FBqcOX8up43T_N8LUA--QKCOKC7m7Bheq5TDLPlj6lraKWIOnA/exec';
const LIVE_REFRESH_MS = 10000;
const live = {positions:null, arrivals:new Map(), error:'', arrivalError:'', busy:false, timer:null, nextRefreshAt:0, models:[], pending:new Map(), destination:null,revision:0,expandedArrivals:new Set()};
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
    window[cb]=data=>{clean();if(data.ok&&data.line!==lineName){reject(new Error('Apps Script를 다중 호선 버전으로 업데이트해주세요'));return}if(!data.ok)reject(new Error(({DAILY_LIMIT:'오늘의 API 호출 한도에 도달했어요',MISSING_KEY:'Apps Script 인증키 설정을 확인해주세요',UPSTREAM_UNAVAILABLE:'서울시 데이터 응답을 확인할 수 없어요',BUSY:'다른 요청 처리 중 · 잠시 후 재시도합니다'})[data.error]||'데이터를 가져오지 못했어요'));else resolve(data)};
    script.onerror=()=>{clean();reject(new Error('Apps Script에 연결할 수 없어요'))};
    const url=new URL(API_URL);url.searchParams.set('action',action);url.searchParams.set('callback',cb);url.searchParams.set('line',line);if(station)url.searchParams.set('station',station);script.src=url.href;document.head.append(script);
  }).finally(()=>live.pending.delete(id));
  live.pending.set(id,promise);return promise;
}
function installPositions(data){
  const old=new Map(live.models.map(m=>[m.id,m]));
  live.positions=data;const now=performance.now();
  live.models=freshPositionRows(data).flatMap(r=>{
    const canonical=currentLine.stations.find(s=>s.id&&s.id===r.statnId);
    const i=names.indexOf(canonical?canonical.name:normalizeStation(r.statnNm));if(i<0)return [];
    // Along the listed station order, inner-circle trains advance; outer reverse.
    let sign=currentRoute.oneWay?1:String(r.updnLine)===(currentLine.number===2&&currentRoute.loop?'0':'1')?1:-1;
    const terminus=names.indexOf(normalizeStation(r.statnTnm));
    if(!currentRoute.loop&&terminus>=0&&terminus!==i)sign=terminus>i?1:-1;
    const status=String(r.trainSttus);
    const target=wrap(i+(status==='0'?-sign*.15:status==='2'?sign*.15:status==='3'?-sign*.65:0));
    const id=String(r.trainNo)+':'+r.updnLine,previous=old.get(id);
    const from=previous?modelPosition(previous,now):target;
    let delta=currentRoute.loop?(target-from+names.length*1.5)%names.length-names.length/2:target-from;
    if(Math.abs(delta)>1.5||data.stale)delta=0;
    return [{id,row:r,sign,from:delta===0?target:from,delta,since:now}];
  });
  trains.replaceChildren();
  live.models.forEach(m=>{const express=expressStopInfo(currentLine.number,m.row,names[selected]).express;const el=document.createElement('div');el.className='train '+(express?'express-train ':'')+(String(m.row.updnLine)==='0'?'train-up':'train-down')+(terminalInfo(m.row.statnTnm).shortTurn?' short-turn':'');el.innerHTML=trainIcon+'<span class="train-direction-arrow"></span>'+(express?'<span class="map-express-badge">급행</span>':'');el.setAttribute('aria-hidden','true');el.title=(express?'급행 ':'')+'열차 '+m.row.trainNo+' · '+m.row.statnNm+' · '+(m.row.statnTnm||'종착역 미제공');m.el=el;trains.append(el)});
}
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
    m.el.hidden=dataOld(live.positions)||!recentPosition(m.row);
    const p=modelPosition(m,now),q=positionAt(p),a=positionAt(wrap(p+m.sign*.015)),angle=Math.atan2(a.y-q.y,a.x-q.x);
    m.el.style.setProperty('--badge-rotation',(-angle*180/Math.PI)+'deg');
    m.el.style.left=q.x+'px';m.el.style.top=(q.y+(m.sign>0?-13:13))+'px';m.el.style.transform=`translate(-50%,-50%) rotate(${angle*180/Math.PI}deg)`;m.el.firstElementChild.style.transform=Math.cos(angle)<0?'scaleY(-1)':'none';
  });
};
function dataOld(data){return data && (data.stale||Date.now()-data.updatedAt>90000)}
function updateStatus(){
  const arrivalOnly=currentLine.positions===false;
  const data=arrivalOnly?live.arrivals.get(arrivalKey()):live.positions;
  document.querySelector('.demo').textContent=paused?'갱신 일시정지':live.error?'연결 확인 필요':!data?'실시간 연결 중':dataOld(data)?'이전 수신 정보':arrivalOnly?'도착정보 전용':'실시간 데이터';
  const countdown=paused?'갱신 일시정지':document.hidden?'화면 대기 중':live.busy?'갱신 중…':live.nextRefreshAt?`자동갱신 ${Math.max(0,Math.ceil((live.nextRefreshAt-Date.now())/1000))}초 후`:'연결 대기 중';
  const status=arrivalOnly?(data?'도착정보 갱신 '+stamp(data.updatedAt):'도착정보를 불러오는 중…'):data?`${dataOld(data)?'이전 정보':'위치 갱신'} ${stamp(data.updatedAt)} · 현재 구간 ${live.models.length}대`:'실제 열차 위치를 불러오는 중…';
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
  const seen=new Set();
  const rank=r=>String(r.arvlCd)==='1'?0:String(r.arvlCd)==='0'?1:2;
  const distance=r=>r.positionDistance??(/^\d{5}/.test(String(r.ordkey||''))?Number(String(r.ordkey).slice(2,5)):Infinity);
  return items.filter(r=>String(r.arvlCd)!=='2').slice().sort((a,b)=>rank(a)-rank(b)||distance(a)-distance(b)||String(a.ordkey||'').localeCompare(String(b.ordkey||''),undefined,{numeric:true})).filter(r=>{const id=r.btrainNo;if(!id)return true;if(seen.has(String(id)))return false;seen.add(String(id));return true});
}
function recentPosition(position){
  const received=Date.parse(String(position.recptnDt||'').replace(' ','T')+'+09:00');
  return Number.isFinite(received)&&Date.now()-received<=300000&&received-Date.now()<=60000;
}
function freshPositionRows(data=live.positions){
  if(!data||dataOld(data))return [];
  return (data.items||[]).filter(recentPosition);
}
function positionStation(position){
  const canonical=currentLine.stations.find(s=>s.id&&s.id===position.statnId);
  return canonical?canonical.name:normalizeStation(position.statnNm);
}
function stoppingArrivals(items){
  const positions=new Map(freshPositionRows().map(p=>[expressTrainKey(p.trainNo),p]));
  return items.flatMap(r=>{
    const info=expressStopInfo(currentLine.number,r,names[selected]);
    if(info.express&&info.stops!==true)return [];
    const position=positions.get(expressTrainKey(r.btrainNo));
    const rowTime=Date.parse(String(r.recptnDt||'').replace(' ','T')+'+09:00');
    const posTime=position?Date.parse(String(position.recptnDt||'').replace(' ','T')+'+09:00'):0;
    let row={...r,isExpress:info.express};
    if(position&&(!Number.isFinite(rowTime)||posTime>=rowTime)){
      const origin=positionStation(position),status=String(position.trainSttus);
      if(origin===names[selected]){
        if(status==='2')return [];
        if(status==='3')return [{...row,positionStatus:status,positionDistance:0,arvlCd:'3',arvlMsg2:'전역 출발',arvlMsg3:origin}];
        if(['0','1'].includes(status))return [{...row,positionStatus:status,positionDistance:0,arvlCd:status==='1'?'1':'0',arvlMsg2:status==='1'?'도착 · 정차 중':'역 진입',arvlMsg3:origin}];
      }else if(!currentRoute.loop){
        const terminal=terminalInfo(position.statnTnm).name;
        const path=terminal?pathToTerminus(terminal,origin):null;
        if(path&&!path.includes(names[selected]))return [];
        const distance=path?path.indexOf(names[selected]):-1;
        if(distance>0)row={...row,positionStatus:status,positionDistance:distance};
        const reportedDistance=/^\d{5}/.test(r.ordkey||'')?Number(r.ordkey.slice(2,5)):null;
        if(distance>0&&reportedDistance!==null&&distance!==reportedDistance){
          return [{...row,arvlCd:'99',arvlMsg2:distance+'개 역 전',arvlMsg3:origin,positionBased:true}];
        }
      }else{
        const originIndex=names.indexOf(origin);
        if(originIndex>=0){
          const sign=String(position.updnLine)==='0'?1:-1;
          row={...row,positionStatus:status,positionDistance:(sign*(selected-originIndex)+names.length)%names.length};
        }
      }
    }
    return [row];
  });
}
function positionArrivalRows(items,direction){
  if(!live.positions||dataOld(live.positions)||currentLine.positions===false)return items;
  const trainKey=expressTrainKey;
  const known=new Set(items.map(r=>trainKey(r.btrainNo)).filter(Boolean));
  const rows=items.slice();
  for(const position of freshPositionRows()){
    const id=trainKey(position.trainNo);
    if(!id||known.has(id))continue;
    const up=String(position.updnLine)==='0';
    if(direction!=='순환'&&up!==(direction==='상행'||direction==='내선'))continue;
    const stop=expressStopInfo(currentLine.number,position,names[selected]);
    if(stop.stops!==true)continue;
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
    const distance=path?path.indexOf(names[selected]):-1;
    if(distance<0)continue;
    const status=String(position.trainSttus);
    if(distance===0&&!['0','1','3'].includes(status))continue;
    const code=distance===0?(status==='1'?'1':status==='3'?'3':'0'):'99';
    rows.push({updnLine:direction,btrainNo:position.trainNo,bstatnNm:position.statnTnm,arvlCd:code,
      arvlMsg2:distance===0?(status==='1'?'도착 · 정차 중':status==='3'?'전역 출발':'역 진입'):distance+'개 역 전',
      arvlMsg3:origin,positionDistance:distance,positionStatus:status,positionBased:true,isExpress:stop.express,directAt:position.directAt});
    known.add(id);
  }
  return rows;
}
function platformDistance(r,direction){
  if(Number.isFinite(r.positionDistance))return r.positionDistance;
  if(['0','1'].includes(String(r.arvlCd)))return 0;
  if(['3','4'].includes(String(r.arvlCd)))return 1;
  if(['5','6'].includes(String(r.arvlCd)))return 2;
  const sign=['내선','순환','하행'].includes(direction)?1:-1;
  const index=names.indexOf(normalizeStation(r.arvlMsg3||'').trim());
  if(index>=0){const distance=(selected-index)*sign;return currentRoute.loop?(distance+names.length)%names.length:distance>=0?distance:null}
  const match=String(r.arvlMsg2||'').match(/(\d+)\s*(?:개\s*)?역\s*전/);
  return match?Number(match[1]):null;
}
function endsAtSelectedStation(row){
  return terminalInfo(row.bstatnNm).name===names[selected];
}
// This is a schematic half-station position, not an invented GPS coordinate.
function platformTrackDistance(row,direction){
  const distance=platformDistance(row,direction),status=String(row.positionStatus??''),code=String(row.arvlCd??'');
  if(distance===null)return null;
  if(status==='1')return distance;
  if(status==='2')return Math.max(0,distance-.5);
  if(status==='0'||status==='3')return distance+.5;
  if(code==='1')return 0;
  if(code==='0'||code==='3')return .5;
  if(code==='4'||code==='5')return 1.5;
  if(/출발|이동\s*중/.test(String(row.arvlMsg2||'')))return Math.max(0,distance-.5);
  return distance;
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
  const raw=String(r.arvlMsg2||''),code=String(r.arvlCd),distance=platformDistance(r,direction);
  const prefix=distance===0?'':distance===1?'전역 ':distance===2?'전전역 ':'';
  const observed=r.positionStatus==='1'?(distance===0?'도착 · 정차 중':prefix+'정차 중'):r.positionStatus==='2'?prefix+'출발':r.positionStatus==='0'?prefix+'진입':r.positionStatus==='3'?(distance===0?'전역 출발':distance===1?'전전역 출발':'이동 중'):'';
  const state=observed||({0:'역 진입',1:'도착 · 정차 중',3:'전역 출발',4:'전역 진입',5:'전전역 출발',6:'전전역 진입'}[code])||(/전전역.*출발/.test(raw)?'전전역 출발':/전역.*출발/.test(raw)?'전역 출발':/전전역.*(?:정차|도착|진입)/.test(raw)?'전전역 정차':/전역.*(?:정차|도착|진입)/.test(raw)?'전역 정차':/출발/.test(raw)?(distance===1?'전역 출발':distance===2?'전전역 출발':'이동 중'):/정차|도착/.test(raw)&&!/[분초].*후/.test(raw)?(distance===1?'전역 정차':'이동 중'):'이동 중');
  const time=raw.match(/(?:\d+\s*분(?:\s*\d+\s*초)?|\d+\s*초)\s*후/);
  const seconds=Number(r.barvlDt);
  const eta=!r.positionBased&&!['0','1'].includes(code)?time?.[0]||(seconds>0?(Math.floor(seconds/60)?Math.floor(seconds/60)+'분 ':'')+(seconds%60?seconds%60+'초 ':'')+'후':''):'';
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
  return `${terminal?`<b class="platform-terminal">${esc(terminal)}</b>`:''}${coverage?`<span class="coverage-label ${journey.reaches===false?'does-not-reach':''}">${esc(coverage)}</span>`:''}`;
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
  const markers=rows.filter(r=>!hideTerminatingMarker(r,direction)).slice(0,2).map((r,i)=>{
    const distance=platformTrackDistance(r,direction);
    if(distance===null||distance<0)return '';
    const slot=left?Math.min(4,distance):4-Math.min(4,distance);
    const overlap=slots.includes(slot);slots.push(slot);
    const terminating=endsAtSelectedStation(r);
    const label=terminating?names[selected]+' 종착':through.indexOf(r)===0?'이번':'다음';
    return `<div class="platform-train ${left?'faces-left':''} train-slot-${i}${overlap?' same-station':''}${terminating?' terminating-train':''}" data-train="${esc(r.btrainNo||'')}" style="left:${10+slot*20}%"><span>${label}${r.isExpress?' · 급행':''}${distance>4?' · '+platformDistance(r,direction)+'역 전':''}</span><img src="assets/train-line2-short.png" alt="${label} 열차${left?' 왼쪽':' 오른쪽'} 방향"></div>`;
  }).join('');
  return `<div class="platform-diagram" aria-label="${left?'왼쪽':'오른쪽'}으로 운행하는 열차 위치"><div class="platform-rail"></div>${stations.map((s,i)=>{const terminal=s.name&&terminalStations.has(s.name);return `<div class="platform-station ${s.selected?'is-current':''}${terminal?' has-terminus':''}" ${terminal?`aria-label="${esc(s.name)} · 일부 열차 종착역"`:''} style="left:${10+i*20}%"><i></i><span>${esc(s.name||'—')}</span>${s.selected?`<b class="selected-station-tag${terminal?' terminal-station-tag':''}">${terminal?'선택·종착':'선택역'}</b>`:terminal?'<b class="terminal-station-tag">종착</b>':''}</div>`}).join('')}${markers}</div>${endsHere?`<p class="platform-terminal-legend"><i aria-hidden="true"></i>${esc(names[selected])} 종착 열차는 이 역 진입부터 그림에서 숨겨요.</p>`:''}`;
}
window.renderLive=()=>{
  const name=names[selected],data=live.arrivals.get(arrivalKey()),old=dataOld(data);
  const route=destinationRoute(selected,live.destination);
  document.querySelector('#selected-station-title').textContent=name+' 역';
  document.querySelector('#selected-station-number').textContent=currentLine.name+' · '+currentRoute.name;
  const input=document.querySelector('#destination');
  const typed=input?input.value.trim():'';
  document.querySelector('#route-summary').textContent=route?`${name} → ${names[live.destination]} · ${route.direction}${currentLine.number===2&&currentRoute.loop?'순환':''} ${route.stops}개 역 이동`:live.destination===selected?'현재 선택한 역과 목적지가 같아요.':typed?'현재 구간의 자동완성에서 역을 선택해주세요.':'목적지를 고르면 더 적은 역을 지나는 방향을 표시해요.';
  const directions=currentRoute.oneWay?['순환']:currentLine.number===2&&currentRoute.loop?['내선','외선']:['상행','하행'];
  let hasPositionArrivals=false,hasTerminatingArrivals=false;
  const cards=directions.map(direction=>{
    const reported=(data?.items||[]).filter(r=>direction==='순환'||String(r.updnLine).includes(direction)||((direction==='상행'||direction==='하행')&&String(r.updnLine).includes(direction==='상행'?'내선':'외선')));
    const approaching=upcomingArrivals(positionArrivalRows(stoppingArrivals(reported),direction));
    const rows=onwardArrivals(approaching);
    if(rows.length<approaching.length)hasTerminatingArrivals=true;
    if(rows.some(r=>r.positionBased))hasPositionArrivals=true;
    const recommended=route&&(route.direction===direction||route.direction==='양방향');
    const moreKey=arrivalKey()+':'+direction;
    const directionName=direction+(directions[0]==='내선'?'순환':'');
    const extra=rows.slice(2,6),first=rows[0],next=rows[1];
    const moreLabel=directionName+' 열차 ';
    const up=['상행','내선','순환'].includes(direction);
    const firstMessage=first?platformMessage(first,direction):null;
    const boardHeader=`<div class="platform-board-header"><h3><i class="detail-direction-triangle ${up?'direction-up':'direction-down'}" aria-hidden="true"></i>${directionName} <span aria-hidden="true">${up?'←':'→'}</span></h3>${first?`<span class="platform-current-label">이번 열차 <small>#${esc(first.btrainNo||'번호 미제공')}</small></span><div class="platform-badges">${platformDestination(first,direction)}</div>`:''}</div>`;
    const main=first?`<div class="platform-main-status"><strong>${firstMessage.main}</strong>${firstMessage.sub?`<p>${esc(firstMessage.sub)}</p>`:''}<div class="platform-main-notes">${platformNotes(first,direction,route)}</div></div>`:`<p class="platform-empty">${esc(live.arrivalError||(data?(approaching.length?'이 역 종착 열차를 제외한 도착정보가 없어요.':'현재 제공되는 도착정보가 없어요.'):'도착정보를 불러오는 중…'))}</p>`;
    const nextRow=next?`<div class="platform-next-row"><span class="platform-next-label">다음 열차 <small>#${esc(next.btrainNo||'번호 미제공')}</small></span><div class="platform-next-status"><strong>${platformMessage(next,direction).main}</strong>${platformMessage(next,direction).sub?`<small>${esc(platformMessage(next,direction).sub)}</small>`:''}</div><div class="platform-badges">${platformDestination(next,direction)}</div><div class="platform-next-notes">${platformNotes(next,direction,route)}</div></div>`:first?'<div class="platform-next-row platform-no-next">다음 열차 정보가 아직 없어요.</div>':'';
    const more=extra.length?`<details class="arrival-more" data-label="${esc(moreLabel)}" data-key="${esc(moreKey)}" data-count="${extra.length}" ${live.expandedArrivals.has(moreKey)?'open':''}><summary>${moreLabel}${live.expandedArrivals.has(moreKey)?'접기':'더 보기'} (${extra.length}대) <small>· 최대 4대</small></summary><div class="arrival-extra-grid">${extra.map((r,i)=>{const message=platformMessage(r,direction);return `<div class="arrival platform-extra-card"><div class="platform-extra-header"><b><i class="detail-direction-triangle ${up?'direction-up':'direction-down'}" aria-hidden="true"></i>${directionName} · ${i+3}번째 열차</b><small>#${esc(r.btrainNo||'번호 미제공')}</small><div class="platform-badges">${platformDestination(r,direction)}</div></div><strong class="platform-extra-status">${message.main}</strong>${message.sub?`<p>${esc(message.sub)}</p>`:''}<p class="platform-extra-location">현재위치 ${esc(r.arvlMsg3||'정보 미제공')}</p><div class="platform-extra-notes">${platformNotes(r,direction,route)}</div></div>`}).join('')}</div></details>`:'';
    return `<section class="direction-group platform-group ${up?'platform-up':'platform-down'}${recommended?' recommended':''}" aria-label="${directionName}${recommended?' · 목적지 추천 방향':''}"><div class="platform-board">${recommended?'<span class="platform-search-flag">검색한 구간</span>':''}${boardHeader}${main}${platformDiagram(approaching,direction)}${nextRow}</div>${more}</section>`;
  }).join('');
  document.querySelector('#detail').innerHTML=`<div class="direction-grid">${cards}</div><p class="detail-caption">${live.arrivalError?esc(live.arrivalError)+'<br>':''}${data?'수신 '+stamp(data.updatedAt)+' · '+(old?'이전 정보 · 현재 상태와 다를 수 있어요':'서울시 제공 메시지 기준'):'연결 대기 중'}${hasPositionArrivals?'<br>위치정보 기준 · 도착시간 미제공 열차는 역 수로 안내하며, 급행 추월 등으로 실제 도착 순서와 다를 수 있어요.':''}${hasTerminatingArrivals?'<br>이 역 종착 열차는 이번·다음 열차의 도착시간에서 제외해요.':''}${route?'<br>방향은 역 수 기준 · 열차별 종착역까지 확인해 안내합니다. 다른 구간 종착은 별도 확인이 필요해요.':''}</p><div class="detail-bottom">${paused?'갱신 일시정지 · ':''}실제 운행정보 · 10초 간격 확인</div>`;
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
async function loadArrivals(){
  if(document.hidden||paused)return;
  const name=names[selected],key=arrivalKey(),revision=live.revision,station=stationFor(name),cached=live.arrivals.get(key);
  if(cached&&Date.now()-cached.updatedAt<LIVE_REFRESH_MS){live.arrivalError='';renderDetail();return}
  try{const data=await requestLive('arrivals',station?station.api:name);if(revision!==live.revision)return;live.arrivals.set(key,data);if(arrivalKey()===key)live.arrivalError=''}catch(e){if(revision===live.revision&&arrivalKey()===key)live.arrivalError=e.message}
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
