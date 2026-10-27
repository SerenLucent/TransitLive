// Favorites stay on this browser; no account or server storage is used.
const favoriteKey='transit-live:favorites:v1';
const favoriteForm=document.querySelector('#favorite-form');
const favoriteLine=document.querySelector('#favorite-line');
const favoriteRoute=document.querySelector('#favorite-route');
const favoriteOrigin=document.querySelector('#favorite-origin');
const favoriteDestination=document.querySelector('#favorite-destination');
const favoriteMessage=document.querySelector('#favorite-message');
const favoriteMemo=document.querySelector('#favorite-memo');
const memoText=value=>Array.from(typeof value==='string'?value:'').slice(0,20).join('');
favoriteMemo.oninput=()=>{document.querySelector('#favorite-memo-count').textContent=Array.from(favoriteMemo.value).length+'/20'};
let favorites=[];
let favoritesExpanded=false;
const favoriteToggle=document.querySelector('#favorite-toggle');
function updateFavoriteDisclosure(){
  if(!favorites.length)favoritesExpanded=false;
  favoriteToggle.hidden=!favorites.length;
  favoriteToggle.textContent=(favoritesExpanded?'▲ 즐겨찾기 접기':'▼ 즐겨찾기 보기')+' ('+favorites.length+')';
  favoriteToggle.setAttribute('aria-expanded',String(favoritesExpanded));
  document.querySelector('#favorite-list').hidden=!favoritesExpanded;
}
favoriteToggle.onclick=()=>{favoritesExpanded=!favoritesExpanded;updateFavoriteDisclosure()};
function validFavorite(f){
  const line=LINES[f?.line],route=line?.routes[f?.route];
  return !!route&&route.names.includes(f.origin)&&route.names.includes(f.destination)&&f.origin!==f.destination;
}
try{const saved=JSON.parse(localStorage.getItem(favoriteKey)||'[]');if(Array.isArray(saved))favorites=saved.filter(validFavorite)}catch(_){favoriteMessage.textContent='저장 공간을 사용할 수 없어 즐겨찾기를 불러오지 못했어요.'}
function storeFavorites(next){
  try{localStorage.setItem(favoriteKey,JSON.stringify(next));favorites=next;renderFavorites();return true}catch(_){favoriteMessage.textContent='브라우저 저장 공간을 사용할 수 없어요. 사이트 저장 설정을 확인해주세요.';return false}
}
function favoriteOption(value,label){const option=document.createElement('option');option.value=value;option.textContent=label;return option}
function fillFavoriteStations(){
  const route=LINES[favoriteLine.value].routes[Number(favoriteRoute.value)];
  [favoriteOrigin,favoriteDestination].forEach(select=>{select.replaceChildren();route.names.forEach(n=>select.append(favoriteOption(n,n==='서울'?'서울역':n+'역')));select.selectedIndex=-1;select.value=''});
  if(window.refreshCustomSelects)window.refreshCustomSelects();
  if(window.refreshFavoriteSearches)window.refreshFavoriteSearches();
}
function fillFavoriteRoutes(){
  favoriteRoute.replaceChildren();LINES[favoriteLine.value].routes.forEach((r,i)=>favoriteRoute.append(favoriteOption(i,r.name)));fillFavoriteStations();
}
function openFavorite(f){
  if(!validFavorite(f)){favoriteMessage.textContent='노선이 변경되었어요. 즐겨찾기를 다시 저장해주세요.';return}
  changeLine(Number(f.line),Number(f.route),f.origin);
  chooseDestination(names.indexOf(f.destination));
  document.querySelector('#station-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderFavorites(){
  const list=document.querySelector('#favorite-list');list.replaceChildren();
  document.querySelector('#favorite-empty').hidden=favorites.length>0;
  updateFavoriteDisclosure();
  favorites.forEach((f,index)=>{
    const line=LINES[f.line],item=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');
    item.className='favorite-item';item.style.setProperty('--favorite-color',line.color);
    open.type='button';open.className='favorite-open';
    const title=document.createElement('strong'),caption=document.createElement('small');
    title.textContent=f.origin+' → '+f.destination;caption.textContent=line.name+' · '+line.routes[f.route].name;
    const journey=document.createElement('span');journey.className='favorite-journey';journey.append(title);journey.append(caption);open.append(journey);
    if(f.memo){const memo=document.createElement('span');memo.className='favorite-memo';memo.textContent=memoText(f.memo);open.append(memo)}
    open.onclick=()=>openFavorite(f);
    remove.type='button';remove.className='favorite-remove';remove.textContent='×';remove.setAttribute('aria-label',f.origin+' → '+f.destination+' 즐겨찾기 삭제');
    remove.onclick=()=>{if(storeFavorites(favorites.filter((_,i)=>i!==index)))favoriteMessage.textContent='즐겨찾기를 삭제했어요.'};
    const edit=document.createElement('button'),editor=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),counter=document.createElement('span'),actions=document.createElement('div'),save=document.createElement('button'),cancel=document.createElement('button');
    edit.type='button';edit.className='favorite-edit';edit.textContent='메모 수정';edit.setAttribute('aria-label',f.origin+' → '+f.destination+' 메모 수정');edit.setAttribute('aria-expanded','false');
    editor.className='favorite-inline-editor';editor.id='favorite-memo-editor-'+index;editor.hidden=true;edit.setAttribute('aria-controls',editor.id);
    input.type='text';input.id='favorite-memo-edit-'+index;input.maxLength=20;input.placeholder='ex) 출근길 2호선';input.autocomplete='off';input.value=memoText(f.memo);
    label.htmlFor=input.id;label.textContent='메모';counter.className='favorite-inline-count';counter.textContent=Array.from(input.value).length+'/20';counter.setAttribute('aria-live','polite');
    input.oninput=()=>{counter.textContent=Array.from(input.value).length+'/20'};
    actions.className='favorite-inline-actions';save.type='submit';save.textContent='저장';cancel.type='button';cancel.textContent='취소';actions.append(save);actions.append(cancel);
    editor.append(label);editor.append(counter);editor.append(input);editor.append(actions);
    const closeEditor=()=>{editor.hidden=true;edit.setAttribute('aria-expanded','false');edit.focus()};
    edit.onclick=()=>{if(!editor.hidden){closeEditor();return}input.value=memoText(favorites[index].memo);input.oninput();editor.hidden=false;edit.setAttribute('aria-expanded','true');input.focus()};
    cancel.onclick=closeEditor;
    editor.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeEditor()}};
    editor.onsubmit=e=>{e.preventDefault();const memo=memoText(input.value.trim());if(storeFavorites(favorites.map((v,i)=>i===index?{...v,memo}:v))){favoriteMessage.textContent=memo?'메모를 수정했어요.':'메모를 지웠어요.';document.querySelector('#favorite-list').children[index].querySelector('.favorite-edit').focus()}};
    item.append(open);item.append(remove);item.append(edit);item.append(editor);list.append(item);
  });
}
Object.values(LINES).forEach(l=>favoriteLine.append(favoriteOption(l.number,l.name)));
favoriteLine.value=currentLine.number;fillFavoriteRoutes();
favoriteLine.onchange=fillFavoriteRoutes;favoriteRoute.onchange=fillFavoriteStations;
document.querySelector('#favorite-current').onclick=()=>{
  favoriteLine.value=currentLine.number;fillFavoriteRoutes();favoriteRoute.value=currentLine.routes.indexOf(currentRoute);fillFavoriteStations();favoriteOrigin.value=names[selected];
  if(live.destination!==null)favoriteDestination.value=names[live.destination];
  if(window.refreshCustomSelects)window.refreshCustomSelects();
  if(window.refreshFavoriteSearches)window.refreshFavoriteSearches();
};
favoriteForm.onsubmit=e=>{
  e.preventDefault();
  const f={line:Number(favoriteLine.value),route:Number(favoriteRoute.value),origin:favoriteOrigin.value,destination:favoriteDestination.value,memo:memoText(favoriteMemo.value.trim())};
  if(!f.origin||!f.destination){favoriteMessage.textContent='출발역과 도착역을 검색해서 선택해주세요.';return}
  if(!validFavorite(f)){favoriteMessage.textContent='출발역과 도착역을 다르게 선택해주세요.';return}
  if(favorites.some(v=>v.line===f.line&&v.route===f.route&&v.origin===f.origin&&v.destination===f.destination)){favoriteMessage.textContent='이미 저장한 즐겨찾기예요.';return}
  if(storeFavorites([...favorites,f])){favoriteMessage.textContent='이 브라우저에 저장했어요.';document.querySelector('#favorite-editor').open=false}
};
renderFavorites();
