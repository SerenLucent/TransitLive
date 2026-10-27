// Keep native values/change handlers while presenting the same white menu on every device.
const customSelects=[];
function createCustomSelect(select){
  const root=document.createElement('span'),trigger=document.createElement('button'),menu=document.createElement('span');
  const label=document.querySelector(`label[for="${select.id}"]`)||select.closest('label');
  const name=select.getAttribute('aria-label')||[...(label?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||'선택';
  root.className='custom-select';trigger.type='button';trigger.className='custom-select-trigger';
  trigger.id=select.id+'-trigger';menu.id=select.id+'-menu';menu.className='custom-select-menu';menu.hidden=true;
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',menu.id);
  menu.setAttribute('role','listbox');menu.setAttribute('aria-label',name);
  select.parentNode.insertBefore(root,select);root.append(select,trigger,menu);select.hidden=true;
  if(label?.contains(root)){
    // A label wrapping multiple interactive controls can forward a second click.
    const field=document.createElement('div');field.className='custom-select-field';
    while(label.firstChild)field.append(label.firstChild);
    label.replaceWith(field);
  }else if(label)label.htmlFor=trigger.id;
  const content=option=>{
    const fragment=document.createDocumentFragment(),text=document.createElement('span');
    const line=select.id==='favorite-line'?LINES[option.value]:null;
    text.className='custom-select-label';text.textContent=option.textContent;
    if(line){
      const badge=document.createElement('span');badge.className='select-line-badge'+(line.number>9?' named':'');
      badge.style.setProperty('--badge-color',line.color);badge.textContent=line.number<=9?line.badge:line.name;badge.setAttribute('aria-hidden','true');fragment.append(badge);
      if(line.number>9)text.classList.add('visually-hidden');
    }
    fragment.append(text);return fragment;
  };
  function close(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()}
  function refresh(){
    const selected=select.selectedOptions[0];trigger.replaceChildren();
    if(selected)trigger.append(content(selected));
    const chevron=document.createElement('span');chevron.className='custom-select-chevron';chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');trigger.append(chevron);
    trigger.setAttribute('aria-label',name+(selected?' · '+selected.textContent:''));trigger.disabled=select.disabled;
    menu.replaceChildren();
    [...select.options].forEach(option=>{
      const button=document.createElement('button');button.type='button';button.className='custom-select-option';button.setAttribute('role','option');button.setAttribute('aria-label',option.textContent);button.setAttribute('aria-selected',String(option.selected));button.disabled=option.disabled;button.tabIndex=-1;button.append(content(option));
      if(option.selected){const check=document.createElement('span');check.className='custom-select-check';check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(check)}
      button.onclick=event=>{event.preventDefault();close();select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));window.refreshCustomSelects();trigger.focus()};menu.append(button);
    });
  }
  function open(last=false){customSelects.forEach(item=>item.close());refresh();menu.hidden=false;trigger.setAttribute('aria-expanded','true');const options=[...menu.querySelectorAll('button:not(:disabled)')];(options.find(b=>b.getAttribute('aria-selected')==='true')||(last?options.at(-1):options[0]))?.focus()}
  trigger.onclick=event=>{event.preventDefault();event.stopPropagation();if(menu.hidden)open();else close()};
  trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp')}if(event.key==='Escape')close()};
  menu.onkeydown=event=>{
    if(event.key==='Escape'){event.preventDefault();close(true);return}
    if(event.key==='Tab'){close(true);return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const options=[...menu.querySelectorAll('button:not(:disabled)')],index=options.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next]?.focus();
  };
  select.addEventListener('change',refresh);
  customSelects.push({root,close,refresh});refresh();
}
window.refreshCustomSelects=()=>customSelects.forEach(item=>item.refresh());
document.querySelectorAll('#favorite-line,#route-picker').forEach(createCustomSelect);
document.addEventListener('click',event=>customSelects.forEach(item=>{if(!item.root.contains(event.target))item.close()}));
document.querySelector('#favorite-editor').addEventListener('toggle',event=>{if(!event.target.open)customSelects.forEach(item=>item.close())});
