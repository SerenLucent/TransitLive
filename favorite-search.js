// Keep station select values for stored favorites, with searchable fields on top.
const favoriteSearches=[];
for(const kind of ['origin','destination']){
  const select=document.querySelector('#favorite-'+kind),input=document.querySelector('#favorite-'+kind+'-search'),results=document.querySelector('#favorite-'+kind+'-results');
  const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false')};
  const refresh=()=>{input.value=select.value?select.value==='서울'?'서울역':select.value+'역':'';close()};
  const key=value=>value.trim().replace(/역$/,'').replace(/\s/g,'');
  function show(){
    const query=key(input.value);results.replaceChildren();
    if(!query){close();return}
    const matches=[...select.options].filter(o=>key(o.value).includes(query)).slice(0,12);
    for(const option of matches){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=option.textContent;
      button.onclick=()=>{select.value=option.value;refresh();input.focus();close()};results.append(button);
    }
    if(!matches.length){const empty=document.createElement('p');empty.textContent='이 호선에 없는 역이에요.';results.append(empty)}
    results.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.oninput=()=>{select.value='';const exact=[...select.options].find(o=>key(o.value)===key(input.value));if(exact)select.value=exact.value;show()};
  input.onfocus=()=>{if(input.value.trim())show()};
  input.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus()}if(e.key==='Enter'){e.preventDefault();results.querySelector('button')?.click()}};
  results.onkeydown=e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){input.focus();close()}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()}};
  document.querySelector('#favorite-'+kind+'-find').onclick=()=>{input.focus();show()};
  document.addEventListener('click',e=>{if(!input.parentElement.contains(e.target))close()});
  favoriteSearches.push({refresh,close});refresh();
}
window.refreshFavoriteSearches=()=>favoriteSearches.forEach(s=>s.refresh());
const favoriteImport=document.querySelector('#favorite-current');
function refreshFavoriteImport(){favoriteImport.disabled=live.destination===null}
document.addEventListener('click',refreshFavoriteImport);
document.addEventListener('input',refreshFavoriteImport);
document.querySelector('#favorite-editor').addEventListener('toggle',()=>{refreshFavoriteImport();favoriteSearches.forEach(s=>s.close())});
refreshFavoriteImport();
