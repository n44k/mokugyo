/* main.js
   - ノーツ生成（BPM同期）
   - Settingsの反映（difficulty / judgement位置 / BPM / offset）
   - 判定：音楽基準の時間とノーツ位置を元にOK/MISS/PERFECT
   - コンボでギミック発動
   - 般若接近 / 背後移動 / 最終ミスで首ゴキ->GAME OVER
*/

const CONFIG = {
  BPM: 80,
  OFFSET: 0.0,
  NOTE_TRAVEL_SEC: 1.8,      // ノーツが生成されてから着弾までの時間
  BASE_WINDOW: 0.15,
  PERFECT_WINDOW: 0.04,
  EASY_EXTRA_MISS: 10,
  MAX_MISS_DEFAULT: 6,
  HIDE_STEP: 5,
};

const els = {
  bgm: document.getElementById('bgm'),
  seHit: document.getElementById('seHit'),
  seMiss: document.getElementById('seMiss'),
  startBtn: document.getElementById('startBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  overlay: document.querySelector('.panel'),
  settingsModal: document.getElementById('settingsModal'),
  applySettings: document.getElementById('applySettings'),
  closeSettings: document.getElementById('closeSettings'),
  settingsRadio: document.getElementsByName('difficulty'),
  judPosRadio: document.getElementsByName('judPos'),
  bpmInput: document.getElementById('bpmInput'),
  offsetInput: document.getElementById('offsetInput'),
  mokugyoBtn: document.getElementById('mokugyoBtn'),
  noteLayer: document.getElementById('noteLayer'),
  judgementTop: document.getElementById('judgementTop'),
  judgementBottom: document.getElementById('judgementBottom'),
  msgSmall: document.getElementById('msgSmall'),
  comboEl: document.getElementById('combo'),
  missesEl: document.getElementById('misses'),
  hannya: document.getElementById('hannya'),
  gameOverScreen: document.getElementById('gameOverScreen'),
  retryBtn: document.getElementById('retryBtn'),
  settingsBtnMain: document.getElementById('settingsBtn'),
  startOverlay: document.querySelector('.panel'),
};

let audioCtx = null;
let mediaSrc = null;
let startTimeCtx = null;
let playing = false;

// game state
let combo = 0;
let misses = 0;
let maxMiss = CONFIG.MAX_MISS_DEFAULT;
let mode = 'normal';
let judgementPosition = 'bottom';
let noteIdCounter = 0;
let notes = new Map(); // id -> {el, spawnTime, targetTime, hit}
let spawnTimer = null;
let beatInterval = () => 60 / CONFIG.BPM;
let effectsTimeouts = [];

// apply initial config UI
document.getElementById('bpmInput').value = CONFIG.BPM;
document.getElementById('offsetInput').value = CONFIG.OFFSET;

// ===== helpers =====
function createAudioContextIfNeeded(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    mediaSrc = audioCtx.createMediaElementSource(els.bgm);
    mediaSrc.connect(audioCtx.destination);
  }
}

function currentAudioTime(){ return audioCtx ? audioCtx.currentTime : 0; }
function spb(){ return 60 / CONFIG.BPM; }

// nearest beat time (round)
function nearestBeatTime(t){
  const t0 = startTimeCtx + CONFIG.OFFSET;
  const k = Math.round((t - t0) / spb());
  return t0 + k * spb();
}

// judgement window depends on mode & threat
function currentWindow(){
  const base = CONFIG.BASE_WINDOW;
  const threat = Math.min(misses, maxMiss-1) / Math.max(1, maxMiss-1);
  const minWindow = 0.05;
  const w = base - (base - minWindow) * threat;
  // difficulty adjustments
  if(mode === 'hard') return w * 0.6;
  if(mode === 'easy') return w * 1.4;
  return w;
}

// ===== settings UI =====
els.settingsBtn.addEventListener('click', ()=>{ els.settingsModal.classList.remove('hidden') });
els.closeSettings.addEventListener('click', ()=>{ els.settingsModal.classList.add('hidden') });

els.applySettings.addEventListener('click', ()=>{
  // difficulty
  for(const r of els.settingsRadio) if(r.checked) mode = r.value;
  for(const r of els.judPosRadio) if(r.checked) judgementPosition = r.value;
  CONFIG.BPM = Math.max(30, Math.min(240, Number(els.bpmInput.value) || CONFIG.BPM));
  CONFIG.OFFSET = Number(els.offsetInput.value) || 0;
  beatInterval = () => 60 / CONFIG.BPM;

  // max misses
  if(mode === 'easy'){ maxMiss = CONFIG.MAX_MISS_DEFAULT + CONFIG.EASY_EXTRA_MISS; }
  else if(mode === 'hard'){ maxMiss = 1; }
  else { maxMiss = CONFIG.MAX_MISS_DEFAULT; }

  // judgement position reflect
  if(judgementPosition === 'top'){ els.judgementTop.classList.remove('hidden'); els.judgementBottom.classList.add('hidden'); }
  else { els.judgementTop.classList.add('hidden'); els.judgementBottom.classList.remove('hidden'); }

  els.settingsModal.classList.add('hidden');
});

// ===== start / retry =====
els.startBtn.addEventListener('click', startGame);
els.retryBtn.addEventListener('click', ()=>{
  resetGame();
  els.gameOverScreen.classList.add('overlayHidden');
  els.overlay.classList.remove('hidden');
});

function startGame(){
  createAudioContextIfNeeded();
  if(audioCtx.state === 'suspended') audioCtx.resume();

  // reset
  misses = 0; combo = 0; notes.forEach(n=>n.el.remove()); notes.clear(); noteIdCounter = 0;
  updateHUD();
  updateHannya();

  // start BGM
  els.bgm.currentTime = 0;
  els.bgm.play().catch(()=>{});
  startTimeCtx = currentAudioTime();

  // spawn notes periodically in beatInterval rhythm (spawn earlier by NOTE_TRAVEL_SEC)
  spawnBeatLoop();
  playing = true;
  els.overlay.classList.add('hidden');
  els.msgSmall.textContent = '開始';
}

// spawn loop: schedule the next beat note
function spawnBeatLoop(){
  if(spawnTimer) clearTimeout(spawnTimer);
  const interval = 60 / CONFIG.BPM;
  // schedule spawns slightly earlier so note arrives on beat
  function scheduleNext(){
    if(!playing) return;
    const now = currentAudioTime();
    // next beat base on audio clock
    const nextBeat = nearestBeatTime(now + 0.001) + interval; // ensure next
    const spawnTime = nextBeat - CONFIG.NOTE_TRAVEL_SEC;
    const delay = Math.max(0, (spawnTime - now) * 1000);
    spawnTimer = setTimeout(()=>{
      if(playing) spawnNoteAt(nextBeat);
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

function spawnNoteAt(targetTime){
  const id = ++noteIdCounter;
  const el = document.createElement('div');
  el.className = 'note';
  el.textContent = '●';
  // starting position: top center
  const startY = -60;
  const targetY = (getMokugyoCenter().y);
  el.style.left = getMokugyoCenter().x + 'px';
  el.style.top = startY + 'px';
  el.style.opacity = '1';
  el.dataset.id = id;
  document.getElementById('noteLayer').appendChild(el);

  notes.set(id, { el, spawnTime: currentAudioTime(), targetTime, hit:false });

  // start animation using rAF
  const travel = CONFIG.NOTE_TRAVEL_SEC;
  const startTime = performance.now();
  function frame(){
    const now = performance.now();
    const t = (now - startTime) / 1000;
    const p = Math.min(1, t / travel);
    const y = startY + (targetY - startY) * easeOutCubic(p);
    el.style.transform = `translate(-50%,${y}px)`;
    if(p < 1 && !notes.get(id).hit) requestAnimationFrame(frame);
    else {
      // reach target zone: if still not hit, it's a MISS for that note
      const note = notes.get(id);
      if(note && !note.hit){
        // if time close to audio beat -> mark miss
        onNoteMiss(id);
      }
      // fade out then remove
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(()=>{ el.remove(); notes.delete(id); }, 400);
    }
  }
  requestAnimationFrame(frame);
}

function getMokugyoCenter(){
  const rect = document.getElementById('mokugyoBtn').getBoundingClientRect();
  const parentRect = document.getElementById('game').getBoundingClientRect();
  // compute coordinates relative to #game
  const x = rect.left - parentRect.left + rect.width/2;
  const y = rect.top - parentRect.top - 40; // slightly above mokugyo (hit zone)
  return { x, y };
}
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

// ===== input / hit detection =====
els.mokugyoBtn.addEventListener('click', handleHit);
window.addEventListener('keydown', (e)=>{ if(e.code === 'Space'){ e.preventDefault(); handleHit(); } });

function handleHit(){
  if(!playing) return;
  const t = currentAudioTime();
  // find nearest active note (not hit) by time distance to its targetTime
  let best = null; let bestDt = Infinity;
  for(const [id, note] of notes){
    if(note.hit) continue;
    const dt = Math.abs(note.targetTime - t);
    if(dt < bestDt){ bestDt = dt; best = {id, note, dt}; }
  }

  const win = currentWindow();
  if(best && best.dt <= win){
    // hit
    registerHit(best.id, best.dt);
  } else {
    // no note close enough => MISS
    registerMiss();
  }
}

function registerHit(id, dt){
  const note = notes.get(id);
  if(!note) return;
  note.hit = true;
  // visual
  note.el.style.transition = 'transform .12s ease, opacity .25s';
  note.el.style.transform += ' scale(0.6)';
  note.el.style.opacity = '0';
  playSE(els.seHit);
  // judgement
  if(dt <= CONFIG.PERFECT_WINDOW) showJudgement('PERFECT');
  else showJudgement('OK');

  combo++;
  misses = Math.max(0, misses - 0); // do not reduce misses on hit
  updateHUD();
  triggerComboGimmick(combo);
}

function registerMiss(){
  playSE(els.seMiss);
  misses++;
  combo = 0;
  updateHannya();
  updateHUD();
  showJudgement('MISS');
  // check instant death on hard
  if(mode === 'hard' || misses >= maxMiss){
    // if misses reached hide step -> special behind move then final miss triggers neck-snap
    if(misses >= maxMiss){
      triggerDeath();
    }
  }
}

function onNoteMiss(id){
  // note reached target without being hit
  const note = notes.get(id);
  if(!note) return;
  note.hit = true;
  // count as miss
  registerMiss();
}

// ===== judgement display =====
function showJudgement(text){
  const el = (judgementPosition === 'top') ? els.judgementTop : els.judgementBottom;
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  // small animation
  el.animate([{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});
  setTimeout(()=>{ if(el) el.textContent = (judgementPosition==='top' ? '' : ''); }, 500);
}

// ===== HUD & hannya visual =====
function updateHUD(){
  els.comboEl.textContent = `COMBO ${combo}`;
  els.missesEl.textContent = `MISS ${misses}/${maxMiss}`;
}
function updateHannya(){
  const h = els.hannya;
  const th = Math.min(misses, maxMiss-1) / Math.max(1, maxMiss-1);
  const scale = 0.6 + th * 0.9;
  const bottom = 10 + th * 12;
  const right = -10 - th * 18;
  const blur = Math.max(1 - th * 1.0, 0);
  const opacity = Math.min(0.15 + th * 0.95, 1);
  if(misses >= CONFIG.HIDE_STEP && misses < maxMiss){
    h.style.opacity = '0';
    h.style.filter = 'blur(3px) brightness(.7)';
  } else {
    h.style.opacity = String(opacity);
    h.style.right = right + '%';
    h.style.bottom = bottom + '%';
    h.style.transform = `scale(${scale.toFixed(2)})`;
    h.style.filter = `blur(${blur.toFixed(2)}px)`;
  }
}

// ===== combo-based gimmicks =====
function triggerComboGimmick(comboValue){
  if(comboValue === 0) return;
  if(comboValue % 10 !== 0) return;

  // clear previous timeouts
  effectsTimeouts.forEach(t=>clearTimeout(t)); effectsTimeouts = [];

  if(comboValue === 10){
    // small shake
    document.getElementById('game').classList.add('shake');
    effectsTimeouts.push(setTimeout(()=>document.getElementById('game').classList.remove('shake'), 700));
  } else if(comboValue === 20){
    document.getElementById('game').classList.add('bigShake');
    effectsTimeouts.push(setTimeout(()=>document.getElementById('game').classList.remove('bigShake'), 1200));
  } else if(comboValue === 50){
    // rotate 60deg
    document.getElementById('game').classList.add('rotate60');
    effectsTimeouts.push(setTimeout(()=>document.getElementById('game').classList.remove('rotate60'), 2500));
  } else {
    // GPTが考える他の10の倍数ギミック
    switch(comboValue){
      case 30:
        // 30: 画面フラッシュ（短時間）
        flashScreen();
        break;
      case 40:
        // 40: スローモーション（ノーツ進行がゆっくりに）
        slowMotion(0.6, 2500);
        break;
      case 60:
        // 60: コントロール反転（左右ではないのでノーツ透明化→復活）
        ghostNotes(2200);
        break;
      case 70:
        // 70: ノーツ増加（短時間 spawn faster）
        increaseSpawnRate(1.6, 4000);
        break;
      case 80:
        // 80: 暗転
        blackout(1800);
        break;
      case 90:
        // 90: カラーフリップ（反転色）
        invertColors(3000);
        break;
      default:
        // 高い倍数はランダム小効果
        flashScreen();
    }
  }
}

/* gimmicks implementations */
function flashScreen(){
  const g = document.getElementById('game');
  const old = g.style.filter;
  g.style.transition = 'filter 120ms';
  g.style.filter = 'brightness(1.6)';
  setTimeout(()=>{ g.style.filter = old; }, 200);
}
function slowMotion(rate, duration){
  // slow travel time
  const prev = CONFIG.NOTE_TRAVEL_SEC;
  CONFIG.NOTE_TRAVEL_SEC = CONFIG.NOTE_TRAVEL_SEC / rate;
  effectsTimeouts.push(setTimeout(()=>{ CONFIG.NOTE_TRAVEL_SEC = prev; }, duration));
}
function ghostNotes(duration){
  // temporarily make incoming notes semi-transparent (ghost) — visually spooky
  const style = document.createElement('style');
  style.id = 'ghostStyle';
  style.textContent = `.note{opacity:0.45 !important; filter:grayscale(0.6) blur(1px)}`;
  document.head.appendChild(style);
  effectsTimeouts.push(setTimeout(()=>{ document.getElementById('ghostStyle')?.remove(); }, duration));
}
function increaseSpawnRate(factor, duration){
  // increase BPM spawn frequency (internally, we just spawn extra notes for time)
  const extraSpawner = setInterval(()=>{ if(playing) spawnNoteAt(currentAudioTime() + CONFIG.NOTE_TRAVEL_SEC); }, 600 / CONFIG.BPM);
  effectsTimeouts.push(extraSpawner);
  effectsTimeouts.push(setTimeout(()=>{ clearInterval(extraSpawner); }, duration));
}
function blackout(duration){
  const overlay = document.createElement('div');
  overlay.id = 'blackout';
  overlay.style.position = 'absolute'; overlay.style.inset = '0'; overlay.style.background = '#000'; overlay.style.opacity = '0.96'; overlay.style.zIndex = 200;
  document.getElementById('game').appendChild(overlay);
  effectsTimeouts.push(setTimeout(()=>{ overlay.remove(); }, duration));
}
function invertColors(duration){
  const g = document.getElementById('game');
  g.style.filter = 'invert(1) hue-rotate(180deg)';
  effectsTimeouts.push(setTimeout(()=>{ g.style.filter = ''; }, duration));
}

// ===== death sequence =====
function triggerDeath(){
  playing = false;
  // hide hannya if needed, then neck-snap animation
  els.hannya.style.opacity = '0';
  // neck-snap
  document.body.classList.add('neck-snap');
  // stop music shortly after
  setTimeout(()=>{ try{ els.bgm.pause(); }catch{} }, 500);
  // show game over big
  setTimeout(()=>{ els.gameOverScreen.classList.remove('overlayHidden'); els.gameOverScreen.style.pointerEvents='auto'; }, 600);
}

// ===== utility: playSE =====
function playSE(el){
  try{
    el.pause(); el.currentTime = 0; el.play();
  }catch(e){}
}

// ===== reset =====
function resetGame(){
  // clear notes
  notes.forEach(n=>n.el.remove()); notes.clear(); noteIdCounter = 0;
  misses = 0; combo = 0; playing = false;
  document.body.classList.remove('neck-snap');
  updateHUD();
  updateHannya();
  // clear effects
  effectsTimeouts.forEach(t=>clearTimeout(t)); effectsTimeouts = [];
}

// ===== small startup helpers =====
function init(){
  // judgement pos initial
  if(judgementPosition === 'top') els.judgementTop.classList.remove('hidden');
  else els.judgementBottom.classList.remove('hidden');

  // bind settings top small close
  els.settingsBtnMain.addEventListener('click', ()=>{ els.settingsModal.classList.remove('hidden') });

  // update UI text
  els.msgSmall.textContent = 'お経に合わせて叩け';
}
init();
