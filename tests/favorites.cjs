const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let saved=null,opened=null,chosen=null;
function setup(blocked=false){
 const elements=new Map();
 function element(){return {value:'',children:[],style:{setProperty(){}},append(e){this.children.push(e);if(!this.value)this.value=String(e.value??'')},replaceChildren(){this.children=[];this.value=''},setAttribute(){},scrollIntoView(){this.scrolled=true}}}
 const el=k=>{if(!elements.has(k))elements.set(k,element());return elements.get(k)};
 const route={name:'본선',names:['강남','교대','서초']};
 const ctx={window:{},LINES:{2:{number:2,name:'2호선',color:'green',routes:[route]}},currentLine:{number:2,routes:[route]},currentRoute:route,names:route.names,selected:0,live:{destination:2},localStorage:{getItem:()=>saved,setItem(k,v){if(blocked)throw Error('blocked');saved=v}},document:{querySelector:el,createElement:element},changeLine(...args){opened=args},chooseDestination(i){chosen=i},console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('favorites.js','utf8'),ctx);return {ctx,el};
}
let {ctx,el}=setup();assert.equal(el('#favorite-toggle').hidden,true,'no toggle without favorites');el('#favorite-current').onclick();el('#favorite-form').onsubmit({preventDefault(){}});
assert.equal(JSON.parse(saved)[0].destination,'서초');assert.equal(el('#favorite-list').children.length,1);
assert.equal(el('#favorite-toggle').hidden,false);assert.equal(el('#favorite-list').hidden,true,'new favorites remain collapsed');
el('#favorite-toggle').onclick();assert.equal(el('#favorite-list').hidden,false);assert.match(el('#favorite-toggle').textContent,/접기/);
el('#favorite-toggle').onclick();assert.equal(el('#favorite-list').hidden,true);
el('#favorite-form').onsubmit({preventDefault(){}});assert.equal(JSON.parse(saved).length,1,'duplicates rejected');
({ctx,el}=setup());assert.equal(el('#favorite-list').children.length,1,'favorites restored after reload');
assert.equal(el('#favorite-list').hidden,true,'reload starts collapsed');el('#favorite-toggle').onclick();
el('#favorite-list').children[0].children[0].onclick();assert.deepEqual(opened,[2,0,'강남']);assert.equal(chosen,2,'destination direction restored');assert(el('#station-panel').scrolled);
el('#favorite-list').children[0].children[1].onclick();assert.equal(JSON.parse(saved).length,0,'delete persisted');
assert.equal(el('#favorite-toggle').hidden,true,'last deletion hides toggle');assert.equal(el('#favorite-list').hidden,true);
({ctx,el}=setup(true));el('#favorite-current').onclick();el('#favorite-form').onsubmit({preventDefault(){}});assert.match(el('#favorite-message').textContent,/저장 공간/);assert.equal(el('#favorite-list').children.length,0,'failed storage does not claim saved');
saved='broken JSON';({el}=setup());assert.match(el('#favorite-message').textContent,/불러오지/);
console.log('PASS favorites: save, duplicate prevention, reload, route/destination selection, deletion, storage failure');
