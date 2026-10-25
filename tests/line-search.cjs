const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),buttons=[];let chosen;
function element(){const classes=new Set();return {value:'',hidden:false,children:[],textContent:'',dataset:{},classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},contains:c=>classes.has(c)},setAttribute(){},addEventListener(){},append(e){this.children.push(e)},replaceChildren(){this.children=[]},focus(){},querySelector(){return this.children.find(e=>e.type==='button')}}}
const el=k=>{if(!elements.has(k))elements.set(k,element());return elements.get(k)};
const c={window:{},document:{querySelector:el,querySelectorAll:()=>buttons,createElement:element,addEventListener(){}},normalizeStation:v=>String(v).replace(/\(.*\)/g,'').replace(/^서울역$/,'서울'),changeLine:(n,r,s)=>{chosen={n,r,s};c.window.updateLineMatches()}};
vm.createContext(c);vm.runInContext(fs.readFileSync('lines.js','utf8')+';this.lines=LINES',c);Object.values(c.lines).forEach(l=>{const b=element();b.dataset.line=l.number;buttons.push(b)});vm.runInContext(fs.readFileSync('line-search.js','utf8'),c);
c.setNetworkStation('홍대입구');assert.deepEqual(Array.from(c.matchedLines('홍대입구')),[2,63,65]);assert.equal(buttons.filter(b=>b.classList.contains('line-match')).length,3);
c.window.chooseLineFromSearch(63);assert.equal(chosen.n,63);assert.equal(chosen.s,'홍대입구');assert(!buttons.find(b=>b.dataset.line===63).classList.contains('line-match'));assert.equal(buttons.filter(b=>b.classList.contains('line-match')).length,2);
c.setNetworkStation('서울');c.window.chooseLineFromSearch(63);assert.equal(chosen.r,1);assert.equal(chosen.s,'서울');const route=c.lines[63].routes[chosen.r];assert.equal(route.names[0],'문산');assert.deepEqual(Array.from(route.names.slice(-3)),['가좌','신촌','서울']);assert.equal(route.name,'문산 ↔ 서울역');
el('#network-search').value='없는역';c.showNetworkResults();assert.equal(buttons.filter(b=>b.classList.contains('line-match')).length,0);
console.log('PASS: multi-line matches, selected line clears yellow, Seoul alias selects complete Munsan route, no-match reset');
