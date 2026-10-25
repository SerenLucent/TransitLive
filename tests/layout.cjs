const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const lc={};vm.createContext(lc);vm.runInContext(fs.readFileSync('lines.js','utf8')+';this.lines=LINES',lc);
const layout=source.slice(source.indexOf('function layout()'),source.indexOf('function select('));
const position=source.slice(source.indexOf('function positionAt('),source.indexOf('function frame('));
for(const line of Object.values(lc.lines))for(const route of line.routes)for(const width of [250,330,700,1000]){
 const c={map:{clientWidth:width,style:{setProperty(){}}},names:route.names,currentRoute:route,points:[],segments:[],stations:{children:Array.from({length:route.names.length},()=>({style:{}}))},document:{querySelector:()=>({innerHTML:''})}};
 vm.createContext(c);vm.runInContext(layout+position+'layout()',c);
 assert.equal(c.points.length,route.names.length);
 if(route.loop)assert.equal(c.points[0].x,c.points.at(-1).x,'loop endpoints align');
 for(let i=0;i<route.names.length;i++){const p=c.positionAt(i);assert.equal(p.x,c.points[i].x);assert.equal(p.y,c.points[i].y)}
 for(let p=0;p<route.names.length-1;p+=.025){const q=c.positionAt(p);assert(q.x>=0&&q.x<=width,'track fits viewport')}
 const last=c.positionAt(route.names.length-.000001);if(route.loop)assert(Math.hypot(last.x-c.points[0].x,last.y-c.points[0].y)<.01,'continuous loop');
 const rows=new Set(c.points.map(p=>p.y)).size;if(route.loop)assert.equal(rows%2,0);
 
}

console.log("PASS all supported lines / branches at 4 viewport widths: station alignment, endpoints, tracks within width");