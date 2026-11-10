const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();function element(){return {style:{setProperty(){}},children:[],value:'',innerHTML:'',textContent:'',setAttribute(){},remove(){},addEventListener(){},remove(){},append(e){this.children.push(e)},replaceChildren(){this.children=[]},firstElementChild:{style:{}}}}
const el=k=>{if(!nodes.has(k))nodes.set(k,element());return nodes.get(k)};
let ctx;const document={hidden:false,querySelector:el,addEventListener(){},createElement:element,head:{append(script){const u=new URL(script.src);queueMicrotask(()=>ctx.window[u.searchParams.get('callback')]({ok:true,line:ctx.currentLine.name,updatedAt:Date.now(),items:[]}))}}};
ctx={document,window:{},Date,URL,Math,Map,Set,Promise,performance:{now:()=>1000},setTimeout:()=>1,clearTimeout(){},paused:false,trainIcon:'<img>',trains:element(),normalizeStation:v=>String(v||'').replace(/^서울역$/,'서울'),stationFor:()=>null,positionAt:p=>({x:p,y:0}),renderDetail(){ctx.window.renderLive?.()}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('lines.js','utf8')+'\nthis.lineFixture=LINES[63];this.allLines=Object.values(LINES);',ctx);
ctx.currentLine=ctx.lineFixture;ctx.currentRoute=ctx.currentLine.routes[0];ctx.names=ctx.currentRoute.names;ctx.selected=ctx.names.indexOf('강매');
vm.runInContext(fs.readFileSync('express-data.js','utf8')+'\n'+fs.readFileSync('express.js','utf8')+'\nexpressDayOverride="weekday";\n'+fs.readFileSync('live.js','utf8'),ctx);
const time=seconds=>new Date(Date.now()+seconds*1000).toISOString();
const pos=(name,seconds=-30,extra={})=>({trainNo:'5045',updnLine:'1',statnNm:name,statnTnm:'용문',trainSttus:'1',recptnDt:time(seconds),directAt:'0',...extra});
const arrival=(name,seconds=-5,extra={})=>({btrainNo:'5045',updnLine:'하행',bstatnNm:'용문',arvlCd:'99',arvlMsg2:'4개 역 전',arvlMsg3:name,recptnDt:time(seconds),ordkey:'11004',...extra});
const models=()=>vm.runInContext('live.models',ctx);
setImmediate(()=>{
 const key='63:강매';
 ctx.installPositions({updatedAt:Date.now(),items:[pos('일산')]});
 assert.equal(models()[0].row.statnNm,'일산');
 const latest=arrival('곡산');ctx.installArrivals(key,{updatedAt:Date.now(),items:[latest]});
 assert.equal(models()[0].row.statnNm,'곡산','newer arrival moves whole map from old Ilsan to actual Goksan');
 const detail=ctx.stoppingArrivals([latest])[0];assert.equal(detail.positionStationName,'곡산');assert.equal(ctx.platformDistance(detail,'하행'),4);
 const previousArrival={btrainNo:'5099',updnLine:'하행',bstatnNm:'팔당',arvlCd:'5',arvlMsg2:'전역 도착',arvlMsg3:'행신',recptnDt:time(-1)};
 assert.equal(ctx.platformDistance(previousArrival,'하행'),1,'official code 5 is previous station ARRIVAL, not two stations away departure');
 assert.equal(ctx.platformTrackDistance(previousArrival,'하행'),1);
 assert.match(ctx.platformMessage(previousArrival,'하행').main,/전역 정차/);
 assert.equal(ctx.arrivalLocation(previousArrival,'강매').trainSttus,'1');
 assert.equal(ctx.reportedStation({arvlMsg3:'2분 후 (곡산)'}),'곡산','station name in message is extracted without dropping parentheses');
 assert.match(ctx.platformDiagram([detail],'하행'),/data-train="5045" style="left:10%"/,'actual four-station location remains on Goksan');
 assert.match(ctx.platformNotes(detail,'하행',null),/현재위치 곡산/);
 assert.equal(models()[0].from,ctx.names.indexOf('곡산'),'whole map uses exact same received station without animation lag');
 ctx.installPositions({updatedAt:Date.now()+1,items:[pos('일산',-20)]});assert.equal(models()[0].row.statnNm,'곡산','new fetch of old position does not overwrite newer arrival');
 const newest=pos('능곡',-1);ctx.installPositions({updatedAt:Date.now()+2,items:[newest]});assert.equal(models()[0].row.statnNm,'능곡');
 const resolved=ctx.stoppingArrivals([latest])[0];assert.equal(resolved.positionDistance,2);assert.equal(resolved.positionStationName,'능곡');assert.doesNotMatch(ctx.platformMessage(resolved,'하행').main,/4역/);
 const duplicated=ctx.upcomingArrivals([arrival('강매',-20,{btrainNo:'05045',arvlCd:'1'}),arrival('강매',-1,{arvlCd:'2'})]);
 assert.equal(duplicated.length,0,'newer departure removes an older duplicate arrival, including zero-padded train IDs');
 const oldOnly=ctx.stoppingArrivals([arrival('곡산',-100,{btrainNo:'old-only',barvlDt:'60',arvlMsg2:'1분 후'})])[0];assert(oldOnly,'old upstream arrival is retained');assert(ctx.oldObservation(oldOnly));assert.match(ctx.platformMessage(oldOnly,'하행').main,/마지막 관측/);assert.doesNotMatch(ctx.platformMessage(oldOnly,'하행').main,/1분 후/,'old ETA is not presented as current');
 ctx.installArrivals(key,{updatedAt:Date.now()+3,items:[arrival('일산',-60)]});assert.equal(models()[0].row.statnNm,'능곡','out-of-order arrival row is ignored');
 assert.equal(vm.runInContext('live.arrivals.get("63:강매").items[0].arvlMsg3',ctx),'곡산');
 assert.equal(ctx.sameService(pos('곡산'),arrival('곡산',-5,{updnLine:'상행'})),false,'opposite direction never merges');
 assert.equal(ctx.sameService(pos('곡산'),arrival('곡산',-5,{bstatnNm:'서울'})),false,'different terminal never merges');
 assert.equal(ctx.sameService(pos('곡산'),arrival('곡산',-5,{btrainNo:'05045'})),true,'leading-zero service IDs normalize');
 const equalTime=time(0);ctx.installPositions({updatedAt:Date.now()+4,items:[pos('일산',-2,{recptnDt:equalTime})]});ctx.installArrivals(key,{updatedAt:Date.now()+4,items:[arrival('곡산',-2,{recptnDt:equalTime})]});
 assert.equal(models()[0].row.statnNm,'일산','equal-time conflict retains the last displayed location');
 assert(ctx.oldObservation(models()[0].row),'the held location is not represented as current');
 const uncertain=ctx.stoppingArrivals([arrival('곡산',-2,{recptnDt:equalTime})])[0];assert.match(ctx.platformMessage(uncertain,'하행').main,/마지막 관측/);assert.equal(uncertain.positionStationName,'일산');
 const equivalentTime=time(1);ctx.installPositions({updatedAt:Date.now()+5,items:[pos('강매',1,{recptnDt:equivalentTime,trainSttus:'3'})]});ctx.installArrivals(key,{updatedAt:Date.now()+5,items:[arrival('행신',1,{recptnDt:equivalentTime,arvlCd:'3',arvlMsg2:'전역 출발'})]});
 assert.equal(models().length,1,'target station plus previous-departure equals previous station plus departure, not a conflict');
 assert.equal(models()[0].from,ctx.names.indexOf('강매')-.75);
 // Close approach: old broad position must never replace the newer station-specific state.
 ctx.installPositions({updatedAt:Date.now()+6,items:[pos('일산',-180,{trainNo:'near-001'})]});
 const closeTrain=arrival('행신',0,{btrainNo:'near-001'});
 for(const [i,code,station,offset] of [[0,'5','행신',1],[1,'3','행신',.75],[2,'0','강매',.25],[3,'1','강매',0],[4,'2','강매',-.25]]){
  const update={...closeTrain,arvlCd:code,arvlMsg3:station,recptnDt:time(i),arvlMsg2:({'5':'전역 도착','3':'전역 출발','0':'진입','1':'도착','2':'출발'})[code]};
  ctx.installArrivals(key,{updatedAt:Date.now()+10+i,items:[update,arrival('곡산',-180,{btrainNo:'old-only',barvlDt:'90'})]});
  const current=ctx.stoppingArrivals([update]);
  if(code==='2')assert.equal(ctx.upcomingArrivals(current).length,0,'departure removes only departed train');
  else{assert.equal(current.length,1);assert.equal(ctx.platformTrackDistance(current[0],'하행'),offset,'nearby approach state '+code);assert.equal(ctx.oldObservation(current[0]),false);}
  const model=models().find(m=>m.row.trainNo==='near-001');assert(model);assert.equal(model.from,ctx.names.indexOf('강매')-offset,'map and detailed coordinate agree throughout approach');
 }
 ctx.window.renderLive();assert.match(el('#detail').innerHTML,/마지막 관측 열차/);assert.match(el('#detail').innerHTML,/old-only/,'old train remains available in its own direction panel');assert.match(el('#detail').innerHTML,/현재 위치 확인 필요/);
 vm.runInContext('live.lastPositions.clear();live.arrivals.clear()',ctx);
 ctx.installPositions({updatedAt:Date.now()+30,items:[]});
 ctx.installArrivals(key,{updatedAt:Date.now()+30,items:[arrival('곡산',1,{btrainNo:'fresh-far'}),arrival('행신',-180,{btrainNo:'older-near',arvlCd:'5',arvlMsg2:'전역 도착'})]});
 ctx.window.renderLive();assert.match(el('#detail').innerHTML,/마지막 관측 열차 <small>#older-near/,'closest old train remains in the main board rather than an empty placeholder');assert.match(el('#detail').innerHTML,/마지막으로 받은 위치에 열차를 표시/);assert.match(el('#detail').innerHTML,/older-near/);
 assert(models().some(m=>m.row.trainNo==='older-near'),'old nearby train stays on full map');
 assert.match(el('#detail').innerHTML,/data-train="older-near"/,'same older nearby train is drawn in the main detail diagram without expanding any list');
 assert.doesNotMatch(el('#detail').innerHTML,/아래에서 마지막 위치를 확인하세요/,'old observations do not replace the diagram with a placeholder');
 const nearby=ctx.positionArrivalRows([],'하행');
 for(const row of nearby){const model=models().find(m=>ctx.sameService(m.row,row));if(!model)continue;const distance=(ctx.selected-model.from)*model.sign;if(distance>=0&&distance<=4)assert.equal(ctx.diagramTrackDistance(row,'하행'),distance,'detail is a crop of whole-map coordinates');}
 const crowded=ctx.platformDiagram([
  {btrainNo:'far-a',bstatnNm:'용문',positionDistance:8},
  {btrainNo:'far-b',bstatnNm:'용문',positionDistance:7},
  {btrainNo:'visible-a',bstatnNm:'용문',positionDistance:1},
  {btrainNo:'visible-b',bstatnNm:'용문',positionDistance:2},
  {btrainNo:'visible-c',bstatnNm:'용문',positionDistance:3}
 ],'하행');
 for(const id of ['visible-a','visible-b','visible-c'])assert.match(crowded,new RegExp('data-train="'+id+'"'),'offscreen entries and the old two-train limit never hide an in-range train');
 assert.match(crowded,/data-outside-train="far-a"/,'offscreen train has its own image card instead of disappearing or being placed on the wrong station');
 assert(ctx.usableObservation({recptnDt:time(-180)}),'age alone does not discard operating-day observation');
 assert.equal(ctx.usableObservation({recptnDt:time(-48*3600)}),false,'previous operating day is not mixed into current services');
 assert.equal(ctx.recentPosition({recptnDt:time(-91)}),false);assert.equal(ctx.recentPosition({recptnDt:time(30)}),false);assert.equal(ctx.observationTime({recptnDt:'2026-11-06T09:00:00+09:00'}),ctx.observationTime({recptnDt:'2026-11-06 09:00:00'}),'timezone suffix parsed once');
 for(const [code,station,status] of [['0','강매','0'],['1','강매','1'],['2','강매','2'],['3','행신','2'],['4','행신','0'],['5','행신','1']]){
  const row=arrival('',-2,{arvlCd:code,arvlMsg2:''}),location=ctx.arrivalLocation(row,'강매');assert.equal(location.statnNm,station,'arrival code '+code+' station');assert.equal(location.trainSttus,status);
 }
 // A temporary gap must not blink the train or replay the older station feed.
 vm.runInContext('live.lastPositions.clear();live.arrivals.clear();live.positions=null',ctx);
 const base=Date.now();
 ctx.installArrivals(key,{updatedAt:base,items:[arrival('곡산',-35)]});
 ctx.installPositions({updatedAt:base,items:[pos('행신',-5)]});
 const icon=models().find(m=>m.row.trainNo==='5045').el;
 ctx.installPositions({updatedAt:base+1,items:[]});
 let held=models().find(m=>m.row.trainNo==='5045');
 assert.equal(held.el,icon,'refresh reuses the train icon through a missing snapshot');
 assert.equal(held.row.statnNm,'행신','missing newer position cannot rewind to older cached Goksan');
 assert(ctx.oldObservation(held.row));
 assert.doesNotMatch(held.el.className,/observation-old/,'whole map has no previous-observation badge class');
 const heldDetail=ctx.stoppingArrivals([arrival('곡산',-35)])[0];
 assert.equal(heldDetail.positionStationName,'행신');
 assert.equal(ctx.diagramTrackDistance(heldDetail,'하행'),1);
 assert.match(ctx.platformMessage(heldDetail,'하행').main,/마지막 관측/);
 vm.runInContext('live.lastPositions.get("63:5045:1:용문").missingUntil=Date.now()-1',ctx);
 ctx.installPositions({updatedAt:base+2,items:[]});
 assert(!models().some(m=>m.row.trainNo==='5045'),'prolonged absence removes the icon without reviving an older observation');
 assert.equal(ctx.stoppingArrivals([arrival('곡산',-35)]).length,0);
 ctx.installPositions({updatedAt:base+3,items:[pos('강매',0)]});
 assert.equal(models().find(m=>m.row.trainNo==='5045').row.statnNm,'강매','a new observation resumes normal rendering');
 // Every line/route uses the same direction and station projection, including loops.
 let checked=0;
 for(const line of ctx.allLines){ctx.currentLine=line;for(const route of line.routes){if(route.names.length<3)continue;ctx.currentRoute=route;ctx.names=route.names;ctx.selected=1;
  for(const direction of ['0','1']){const label=line.number===2&&route.loop?(direction==='0'?'내선':'외선'):(direction==='0'?'상행':'하행');
   const sign=route.oneWay?1:line.number===2&&route.loop?(direction==='0'?1:-1):(direction==='1'?1:-1),index=(1-sign+ctx.names.length)%ctx.names.length;
   const location=ctx.arrivalLocation({btrainNo:'test',updnLine:label,arvlCd:'3',recptnDt:time(-1)},ctx.names[1]);assert.equal(location.statnNm,ctx.names[index],line.name+' '+route.name+' '+label);checked++;
  }
 }}
 assert(checked>40);console.log('PASS reconciliation: Ilsan/Goksan, newest of both APIs, delayed responses, identity, 90s freshness, all arrival states and '+checked+' line/route directions');
});
