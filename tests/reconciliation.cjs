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
 const key='63:강매',base=Date.now();
 const detail=(items,direction='하행')=>ctx.upcomingArrivals(ctx.positionArrivalRows(items,direction));
 const active=id=>models().find(m=>m.row.trainNo===id);
 const latest=arrival('곡산',-5,{barvlDt:'90'});
 ctx.installPositions({updatedAt:base,items:[pos('일산')]});
 const icon=active('5045').el;
 ctx.installArrivals(key,{updatedAt:base,items:[latest]});
 assert.equal(active('5045').row.statnNm,'일산','newer arrival never overrides location API');
 assert.equal(active('5045').el,icon,'arrival ETA refresh does not rebuild the map');
 const [joined]=detail([latest]);
 assert.equal(joined.positionStationName,'일산');assert.equal(joined.positionDistance,7);
 assert.equal(joined.eta,'1분 30초 후');assert.equal(ctx.diagramTrackDistance(joined,'하행'),7);
 assert.match(ctx.platformDiagram([joined],'하행'),/data-outside-train="5045"/);
 assert.equal(detail([{...latest,btrainNo:'05045'}]).length,1,'zero-padded number still matches');
 for(const mismatch of [{updnLine:'상행'},{bstatnNm:'서울'},{bstatnNm:''}]){
  const candidate={...latest,...mismatch};const rows=detail([candidate],candidate.updnLine);
  assert(rows.some(r=>r.locationUnknown),'an unmatched arrival remains available');
  assert(!rows.some(r=>!r.locationUnknown&&r.eta),'direction and destination must both match for ETA');
 }
 for(const bad of [{recptnDt:time(-180)},{snapshotStale:true},{arvlCd:'2'}])assert.equal(detail([{...latest,...bad}])[0].eta,'');
 assert.equal(detail([latest,{...latest,barvlDt:'180'}])[0].eta,'','conflicting ETAs at the same timestamp are not guessed');
 const unlocated=Array.from({length:8},(_,i)=>arrival('행신',-5,{btrainNo:'arrival-'+i,barvlDt:'90'}));
 ctx.installArrivals(key,{updatedAt:base+1,items:[latest,...unlocated]});
 ctx.window.renderLive();
 assert.match(el('#detail').innerHTML,/위치 미확인 열차 \(8대\)/);
 for(const row of unlocated){
  assert(el('#detail').innerHTML.includes('#'+row.btrainNo),'arrival-only service is listed');
  assert(!el('#detail').innerHTML.includes('data-train="'+row.btrainNo+'"'),'arrival-only service is never plotted');
  assert(!active(row.btrainNo),'arrival-only service never enters the map');
 }
 ctx.installPositions({updatedAt:base+2,items:[pos('행신',-1)]});
 assert.equal(ctx.diagramTrackDistance(detail([latest])[0],'하행'),1,'both diagrams use the new position');
 ctx.installPositions({updatedAt:base+3,items:[]});
 assert.equal(active('5045').row.statnNm,'행신');assert.equal(active('5045').el,icon);
 assert(ctx.oldObservation(detail([latest])[0]));
 assert.doesNotMatch(ctx.platformMessage(detail([latest])[0],'하행').main,/1분 30초/);
 vm.runInContext('live.lastPositions.get("63:5045:1:용문").missingUntil=Date.now()-1',ctx);
 ctx.installPositions({updatedAt:base+4,items:[]});
 assert(!active('5045'),'expiry cannot revive the station feed as a position');
 assert(detail([latest])[0].locationUnknown,'an ETA remains usable without a position after expiry');
 ctx.installPositions({updatedAt:base+5,items:[pos('강매',0,{trainSttus:'2'})]});
 assert.equal(detail([latest]).length,0,'a position-confirmed departure does not reappear as an arrival-only service');
 ctx.currentLine={...ctx.lineFixture,positions:false};
 const only=detail([latest]);assert.equal(only.length,1);assert(only[0].locationUnknown);assert.equal(only[0].eta,'1분 30초 후');
 ctx.window.renderLive();assert.doesNotMatch(el('#detail').innerHTML,/class="platform-diagram"/);
 console.log('PASS source separation: same coordinates, exact fresh ETA, all unmatched arrivals, omissions and arrival-only routes');
});
