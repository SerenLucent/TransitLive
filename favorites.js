// Favorites stay on this browser; no account or server storage is used.
const favoriteKey='transit-live:favorites:v1';
const favoriteForm=document.querySelector('#favorite-form');
const favoriteLine=document.querySelector('#favorite-line');
const favoriteRoute=document.querySelector('#favorite-route');
const favoriteOrigin=document.querySelector('#favorite-origin');
const favoriteDestination=document.querySelector('#favorite-destination');
const favoriteMessage=document.querySelector('#favorite-message');
let favorites=[];
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
  [favoriteOrigin,favoriteDestination].forEach(select=>{select.replaceChildren();route.names.forEach(n=>select.append(favoriteOption(n,n==='서울'?'서울역':n+'역')))});
  favoriteDestination.selectedIndex=Math.min(1,route.names.length-1);
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
  favorites.forEach((f,index)=>{
    const line=LINES[f.line],item=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');
    item.className='favorite-item';item.style.setProperty('--favorite-color',line.color);
    open.type='button';open.className='favorite-open';
    const title=document.createElement('strong'),caption=document.createElement('small');
    title.textContent=f.origin+' → '+f.destination;caption.textContent=line.name+' · '+line.routes[f.route].name;
    open.append(title);open.append(caption);open.onclick=()=>openFavorite(f);
    remove.type='button';remove.className='favorite-remove';remove.textContent='×';remove.setAttribute('aria-label',f.origin+' → '+f.destination+' 즐겨찾기 삭제');
    remove.onclick=()=>{if(storeFavorites(favorites.filter((_,i)=>i!==index)))favoriteMessage.textContent='즐겨찾기를 삭제했어요.'};
    item.append(open);item.append(remove);list.append(item);
  });
}
Object.values(LINES).forEach(l=>favoriteLine.append(favoriteOption(l.number,l.name)));
favoriteLine.value=currentLine.number;fillFavoriteRoutes();
favoriteLine.onchange=fillFavoriteRoutes;favoriteRoute.onchange=fillFavoriteStations;
document.querySelector('#favorite-current').onclick=()=>{
  favoriteLine.value=currentLine.number;fillFavoriteRoutes();favoriteRoute.value=currentLine.routes.indexOf(currentRoute);fillFavoriteStations();favoriteOrigin.value=names[selected];
  if(live.destination!==null)favoriteDestination.value=names[live.destination];
};
favoriteForm.onsubmit=e=>{
  e.preventDefault();
  const f={line:Number(favoriteLine.value),route:Number(favoriteRoute.value),origin:favoriteOrigin.value,destination:favoriteDestination.value};
  if(!validFavorite(f)){favoriteMessage.textContent='출발역과 도착역을 다르게 선택해주세요.';return}
  if(favorites.some(v=>v.line===f.line&&v.route===f.route&&v.origin===f.origin&&v.destination===f.destination)){favoriteMessage.textContent='이미 저장한 즐겨찾기예요.';return}
  if(storeFavorites([...favorites,f])){favoriteMessage.textContent='이 브라우저에 저장했어요.';document.querySelector('#favorite-editor').open=false}
};
renderFavorites();
