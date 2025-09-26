const TXT = document.getElementById('conlangText');
const toggleKeyboardBtn = document.getElementById('toggleKeyboard');
const keyboardContainer = document.getElementById('keyboardContainer');
const modeButtons = document.getElementById('modeButtons');
const keyboardControls = document.getElementById('keyboardControls');
const closeKeys = document.getElementById('closeKeys');

let keyboardData = null;
let design = null;
let currentModeIndex = 0;

/* Utilities */
function safeText(s){ return s == null ? '' : String(s); }

/* decode a hex string like "004100420043" into real string "ABC" */
function decodeHexString(s){
  if(!s) return '';
  s = String(s).trim();
  // if it seems textual already, return it
  if(!/^[0-9A-Fa-f]+$/.test(s)) {
    // sometimes JSON contains space-separated codes or commas; try removing non-hex
    // but if there's letters (like 'a' or '∅') keep it
    return s;
  }
  let out = '';
  // try groups of 4, fallback to 2
  for(let i=0;i<s.length;){
    let chunk = s.slice(i,i+4);
    if(chunk.length<4){
      // try 2
      chunk = s.slice(i,i+2);
      i += 2;
    } else {
      i += 4;
    }
    const code = parseInt(chunk,16);
    if(Number.isNaN(code)) continue;
    out += String.fromCharCode(code);
  }
  return out;
}

/* pick best entry from an array based on currentModeIndex (JMID) */
function pickEntryForMode(arr, mode){
  if(!Array.isArray(arr) || arr.length===0) return null;
  // exact JMID
  for(const e of arr) if(e.JMID === mode) return e;
  // JMID 0 or undefined
  for(const e of arr) if(e.JMID === 0 || e.JMID === undefined) return e;
  // fallback
  return arr[0];
}

/* pick output string for an entry object */
function outputFromEntry(e){
  if(!e) return '';
  if(e.Outp) return decodeHexString(e.Outp);
  if(e.SyOu) return decodeHexString(e.SyOu);
  if(e.Symb) return decodeHexString(e.Symb);
  // sometimes Symb is numeric like 2924 -> it's hex? try decode anyway
  return '';
}

/* build rows grouped by RowN and sorted by ColN */
function buildRows(keys){
  const map = {};
  (keys || []).forEach(k=>{
    const r = (k.RowN == null) ? 0 : Number(k.RowN);
    if(!map[r]) map[r] = [];
    map[r].push(k);
  });
  return Object.keys(map).map(r => ({ row: Number(r), keys: map[r].sort((a,b)=>( (a.ColN||0) - (b.ColN||0) )) }))
             .sort((a,b)=>a.row-b.row).map(x=>x.keys);
}

/* Render modes: if design.Modes exist use names; else infer JMID set */
function renderModes(){
  modeButtons.innerHTML = '';
  if(!design) return;
  const modes = Array.isArray(design.Modes) && design.Modes.length>0 ? design.Modes : null;
  if(modes){
    modes.forEach((m, idx)=>{
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.textContent = m.Name || `Mode ${idx}`;
      btn.addEventListener('click', ()=> {
        currentModeIndex = idx;
        setActiveModeButton(idx);
        renderKeyboard();
      });
      modeButtons.appendChild(btn);
    });
    // activate first
    setActiveModeButton(0);
    keyboardControls.classList.remove('hidden');
    return;
  }

  // infer jmids
  const jmids = new Set();
  (design.Keys || []).forEach(k=>{
    (k.FuPr || []).forEach(fp => { if(fp.JMID != null) jmids.add(fp.JMID); });
  });
  const arr = Array.from(jmids).sort((a,b)=>a-b);
  if(arr.length>1){
    arr.forEach((m, idx)=>{
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.textContent = `Mode ${m}`;
      btn.addEventListener('click', ()=> {
        currentModeIndex = m;
        setActiveModeButton(m);
        renderKeyboard();
      });
      modeButtons.appendChild(btn);
    });
    setActiveModeButton(arr[0]);
    keyboardControls.classList.remove('hidden');
    return;
  }

  // no modes
  keyboardControls.classList.add('hidden');
}

/* set active mode button styling */
function setActiveModeButton(index){
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  const btns = Array.from(document.querySelectorAll('.mode-btn'));
  // try to find button by exact label "Mode {index}"
  const found = btns.find(b => b.textContent.trim() === (`Mode ${index}`) || b.textContent.trim().includes(index));
  if(found) found.classList.add('active');
  else if(btns[0]) btns[0].classList.add('active');
}

/* render keyboard into keyboardContainer */
function renderKeyboard(){
  keyboardContainer.innerHTML = '';
  if(!design || !design.Keys) {
    keyboardContainer.innerHTML = '<div style="padding:10px;">No key data found</div>';
    return;
  }
  const rows = buildRows(design.Keys);
  rows.forEach(rowKeys => {
    const rowEl = document.createElement('div');
    rowEl.className = 'k-row';
    rowKeys.forEach(keyObj => {
      const btn = document.createElement('button');
      btn.className = 'key';

      // get candidate entry for visible label
      const entryForLabel = pickEntryForMode(keyObj.FuPr || [], currentModeIndex);
      let label = outputFromEntry(entryForLabel) || keyObj.Label || keyObj.TDes || keyObj.Name || '·';
      // fallback: if label is empty, try decode Symb values in FuPr array
      if(!label){
        for(const fp of (keyObj.FuPr || [])){
          if(fp.SyOu) { label = decodeHexString(fp.SyOu); break; }
          if(fp.Symb) { label = decodeHexString(fp.Symb); break; }
        }
      }
      btn.textContent = label;

      // click -> insert default output for mode
      btn.addEventListener('click', () => {
        const chosen = pickEntryForMode(keyObj.FuPr || [], currentModeIndex);
        const out = outputFromEntry(chosen);
        // if chosen has ODel (delete count) treat as backspace
        if(chosen && chosen.ODel !== undefined){
          const del = Number(chosen.ODel) || 1;
          for(let i=0;i<del;i++){
            TXT.value = TXT.value.slice(0,-1);
          }
          TXT.focus();
          return;
        }
        // if out indicates space/newline
        if(out === '\u0020' || out === '0020' || out === ' '){
          TXT.value += ' ';
          TXT.focus();
          return;
        }
        if(out && out.indexOf('\n') !== -1) {
          TXT.value += out;
          TXT.focus();
          return;
        }
        if(out){
          TXT.value += out;
          TXT.focus();
          return;
        }
        // fallback: insert visible label if nothing else
        TXT.value += btn.textContent;
        TXT.focus();
      });

      // long-press to show popup with all alternatives (FuPr / FuHo / FuUp arrays)
      let pressTimer = null;
      const startPress = (evt) => {
        if(pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          showVariantsPopup(keyObj, btn);
        }, 350); // 350ms long-press
      };
      const cancelPress = () => {
        if(pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      };

      btn.addEventListener('mousedown', startPress);
      btn.addEventListener('touchstart', startPress, {passive:true});
      btn.addEventListener('mouseup', cancelPress);
      btn.addEventListener('mouseleave', cancelPress);
      btn.addEventListener('touchend', cancelPress);
      btn.addEventListener('touchcancel', cancelPress);

      rowEl.appendChild(btn);
    });

    keyboardContainer.appendChild(rowEl);
  });
}

/* create a popup with possible outputs for a key and allow choosing */
function showVariantsPopup(keyObj, anchorBtn){
  // gather candidate entries from FuPr, FuHo, FuUp, FuDo, FuDR, FuUR etc.
  const candidates = [];
  const lists = ['FuPr','FuHo','FuUp','FuDo','FuDR','FuUR','FuDL','FuDR','FuLe','FuRi'];
  lists.forEach(name => {
    (keyObj[name] || []).forEach(e => candidates.push(e));
  });
  // also include all FuPr entries (even same JMID) but keep unique by Outp/SyOu/Symb
  (keyObj.FuPr || []).forEach(e => {
    candidates.push(e);
  });

  // reduce unique by textual output
  const unique = [];
  const seen = new Set();
  candidates.forEach(c => {
    const out = outputFromEntry(c) || (c.SyOu? decodeHexString(c.SyOu) : '') || (c.Symb? decodeHexString(c.Symb):'') || '';
    const key = out || JSON.stringify(c);
    if(!seen.has(key)){
      seen.add(key);
      unique.push({entry:c, text: out || key});
    }
  });

  if(unique.length === 0) {
    // nothing to show
    return;
  }

  // build popup
  const popup = document.createElement('div');
  popup.className = 'popup';

  unique.forEach(u=>{
    const b = document.createElement('button');
    b.className = 'key';
    b.style.padding = '6px 8px';
    b.textContent = u.text || '·';
    b.addEventListener('click', () => {
      // apply selection
      const e = u.entry;
      const out = outputFromEntry(e);
      if(e && e.ODel !== undefined){
        const del = Number(e.ODel) || 1;
        for(let i=0;i<del;i++) TXT.value = TXT.value.slice(0,-1);
      } else if(out){
        TXT.value += out;
      } else {
        TXT.value += b.textContent;
      }
      document.body.removeChild(popup);
      TXT.focus();
    });
    popup.appendChild(b);
  });

  // position popup near anchor button (simple)
  const rect = anchorBtn.getBoundingClientRect();
  popup.style.left = Math.max(8, (rect.left + (rect.width/2)) ) + 'px';
  popup.style.top = Math.max(8, (rect.top - rect.height - 8) ) + 'px';
  // close clicking outside
  setTimeout(()=> {
    const outsideListener = (ev) => {
      if(!popup.contains(ev.target) && ev.target !== anchorBtn) {
        if(document.body.contains(popup)) document.body.removeChild(popup);
        document.removeEventListener('mousedown', outsideListener);
        document.removeEventListener('touchstart', outsideListener);
      }
    };
    document.addEventListener('mousedown', outsideListener);
    document.addEventListener('touchstart', outsideListener);
  }, 10);

  document.body.appendChild(popup);
}

/* Load JSON and initialize */
fetch('KeyboardBlb.json')
  .then(r => {
    if(!r.ok) throw new Error('KeyboardBlb.json no cargado');
    return r.json();
  })
  .then(data => {
    keyboardData = data;
    // choose first design
    if(data.Designs && data.Designs.length>0) design = data.Designs[0];
    else design = data;

    renderModes();
    renderKeyboard();
  })
  .catch(err => {
    console.error('Error cargando teclado JSON:', err);
    keyboardContainer.innerHTML = '<div style="padding:8px;color:#900">No se pudo cargar KeyboardBlb.json</div>';
  });

/* toggle keyboard */
toggleKeyboardBtn.addEventListener('click', () => {
  const hidden = keyboardContainer.classList.toggle('hidden');
  keyboardControls.classList.toggle('hidden');
  keyboardContainer.setAttribute('aria-hidden', hidden ? 'true' : 'false');
});

/* close keys */
if(closeKeys) closeKeys.addEventListener('click', () => {
  keyboardContainer.classList.add('hidden');
  keyboardControls.classList.add('hidden');
});