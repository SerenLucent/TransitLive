// Static operating patterns; never infer a stop merely because a train passes a station.
let expressDayOverride=null;
function expressServiceDay(){
  if(expressDayOverride)return expressDayOverride;
  const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date());
  return day==='Sat'||day==='Sun'?'holiday':'weekday';
}
function expressTrainKey(value){return String(value||'').replace(/^[KS]/i,'').replace(/^0+(?=\d)/,'')}
function expressPattern(line,row){
  const data=EXPRESS_DATA[line],pattern=data?.[expressServiceDay()]?.[expressTrainKey(row.btrainNo||row.trainNo)];
  if(!pattern)return null;
  const terminal=normalizeStation(String(row.bstatnNm||row.statnTnm||'').replace(/행$/,''));
  return terminal&&terminal!==pattern.terminal?null:pattern;
}
function expressStopInfo(line,row,station){
  const data=EXPRESS_DATA[line],pattern=expressPattern(line,row);
  const express=!!pattern||/급행|특급/.test(row.trainLineNm||'')||['1','2'].includes(String(row.directAt))||/^\d{5}.+[12]$/.test(row.ordkey||'');
  if(!express)return {express:false,stops:true,pattern:null};
  const terminal=normalizeStation(String(row.bstatnNm||row.statnTnm||'').replace(/행$/,''));
  if(terminal===station)return {express:true,stops:true,pattern};
  if(Number(line)===9)return {express:true,stops:data.stations.includes(station),pattern:null};
  return {express:true,stops:pattern?pattern.stops.includes(station):null,pattern};
}
function updateExpressMap(){
  const supported=!!EXPRESS_DATA[currentLine.number];
  const picker=document.querySelector('#express-day');
  picker.value=expressServiceDay();
  document.querySelector('#express-controls').hidden=!supported;
  document.querySelector('#express-legend').hidden=!supported;
}
document.querySelector('#express-day').onchange=e=>{
  expressDayOverride=e.target.value;updateExpressMap();if(window.renderLive)window.renderLive();
};
