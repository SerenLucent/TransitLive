const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const props={SEOUL_SUBWAY_API_KEY:'test-only'},cache={};let calls=[];
const ctx={Date,JSON,Object,Array,Error,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},CacheService:{getScriptCache:()=>({get:k=>cache[k],put:(k,v)=>cache[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{formatDate:()=> '2026-10-25',newBlob:t=>({getBytes:()=>Buffer.from(t)})},UrlFetchApp:{fetch:url=>{calls.push(url);const line=decodeURIComponent(url).includes('6호선')?'1006':'1002';return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({realtimePositionList:[{subwayId:line,statnNm:'응암',trainNo:'6001'},{subwayId:'1009',trainNo:'exclude'}]})}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
const six=ctx.load_('positions','','6');assert.equal(six.line,'6호선');assert.equal(six.items.length,1);ctx.load_('positions','','6');assert.equal(calls.length,1,'same line shared cache');ctx.load_('positions','','2');assert.equal(calls.length,2,'lines cached separately');assert(calls[0].includes(encodeURIComponent('6호선')));
assert.equal(ctx.load_('positions','','93').error,'POSITION_UNAVAILABLE');
assert.equal(ctx.load_('positions','','81').error,'POSITION_UNAVAILABLE');
assert.equal(calls.length,2,'arrival-only lines never request upstream positions');
props.API_BUDGET=JSON.stringify({day:'2026-10-25',count:900});const result=ctx.load_('positions','','9');assert.equal(result.error,'DAILY_LIMIT');assert.equal(calls.length,2);console.log('PASS multi-line query, filtering, separate caches, global daily budget');
