const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const layout=source.slice(source.indexOf('function layout()'),source.indexOf('function select('));
const position=source.slice(source.indexOf('function positionAt('),source.indexOf('function frame('));
for(const width of [250,280,330,374,550,700,1000]){
 const c={map:{clientWidth:width,style:{setProperty(){}}},names:Array.from({length:43},(_,i)=>String(i)),points:[],segments:[],stations:{children:Array.from({length:43},()=>({style:{}}))},document:{querySelector:()=>({innerHTML:''})}};
 vm.createContext(c);vm.runInContext(layout+position+'layout()',c);
 assert.equal(c.points.length,43);
 assert.equal(c.points[0].x,c.points[42].x,'loop endpoints align');
 for(let i=0;i<43;i++){const p=c.positionAt(i);assert.equal(p.x,c.points[i].x);assert.equal(p.y,c.points[i].y)}
 for(let p=0;p<43;p+=.025){const q=c.positionAt(p);assert(q.x>=0&&q.x<=width,'track fits viewport')}
 const last=c.positionAt(42.999999);assert(Math.hypot(last.x-c.points[0].x,last.y-c.points[0].y)<.01,'continuous loop');
 const rows=new Set(c.points.map(p=>p.y)).size;assert.equal(rows%2,0);
 console.log(`PASS ${width}px: ${rows} rows, 43 stations, closed loop, track within width`);
}
