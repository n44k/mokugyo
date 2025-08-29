// ===== 設定（あなたのBGMに合わせて調整） =====
const CONFIG = {
  BPM: 80,                 // お経BGMのBPM（例）
  OFFSET_SEC: 0.0,         // 最初の拍が来るまでの無音/頭出し（秒）
  MAX_MISS: 6,             // 6回目でゲームオーバー（仕様に合わせて）
  BASE_WINDOW: 0.150,      // 判定許容（秒）：遠いほど広い
  MIN_WINDOW: 0.045,       // 判定許容（秒）：近づくとここまで狭まる
  HANAYYA_HIDE_STEP: 5,    // このミス段階で「背後へ移動して消える」
  PERFECT_THRESH: 0.035,   // Perfectの閾値（任意）
};

const els = {
  bgm: document.getElementById('bgm'),
  seHit: document.getElementById('seHit'),
  seMiss: document.getElementById('seMiss'),
  startBtn: document.getElementById('startBtn'),
  retryBtn: document.getElementById('retryBtn'),
  overlay: document.getElementById('overlay'),
  gameover: document.getElementById('gameover'),
  mokugyoBtn: document.getElementById('mokugyoBtn'),
  msg: document.getElementById('msg'),
  combo: document.getElementById('combo'),
  lives: document.getElementById('lives'),
  hannya: document.getElementById('hannya'),
};

let audioCtx, mediaSrc;
let startTimeCtx = null;      // AudioContext基準の再生開始時刻
let playing = false;

let misses = 0;
let combo = 0;

// ===== 便利関数 =====
const spb = () => 60 / CONFIG.BPM;

function currentAudioTime() {
  return audioCtx ? audioCtx.currentTime : 0;
}

// いまの時刻に最も近い拍の時刻を返す
function nearestBeatTime(t) {
  const t0 = startTimeCtx + CONFIG.OFFSET_SEC;
  const k = Math.round((t - t0) / spb());
  return t0 + k * spb();
}

// 般若の段階（0〜1）。ミス数に応じて接近。
function threatLevel() {
  const clamped = Math.min(misses, CONFIG.MAX_MISS - 1); // 最後のミス直前までで1に近づく
  return clamped / (CONFIG.MAX_MISS - 1);
}

// 判定許容（秒）：遠いと広く、近いと狭い
function currentWindow() {
  const th = threatLevel();
  return CONFIG.BASE_WINDOW - (CONFIG.BASE_WINDOW - CONFIG.MIN_WINDOW) * th;
}

// ===== 演出：般若の位置・見え方 =====
function updateHannyaVisual() {
  const h = els.hannya;
  const th = threatLevel();

  // 0 → 奥（小さく右） / 1 → 手前（大きく左寄り）という感じで補間
  const scale = 0.6 + th * 0.9;               // 0.6〜1.5倍
  const bottom = 12 + th * 10;                // 少し下からせり上げる
  const right = -10 - th * 18;                // 右 → 左方向へ侵食
  const blur = Math.max(1 - th * 1.0, 0);     // 近づくほどクッキリ
  const opacity = Math.min(0.15 + th * 0.95, 1);

  // 背後へ消える段階
  if (misses >= CONFIG.HANAYYA_HIDE_STEP && misses < CONFIG.MAX_MISS) {
    h.style.opacity = '0';
    h.style.filter = 'blur(2px) brightness(0.8)';
  } else {
    h.style.opacity = String(opacity);
    h.style.right = right + '%';
    h.style.bottom = bottom + '%';
    h.style.transform = `translate3d(0,0,0) scale(${scale.toFixed(3)})`;
    h.style.filter = `blur(${blur.toFixed(2)}px) brightness(${(0.9 + th*0.25).toFixed(2)})`;
  }
}

// ===== ゲーム状態UI =====
function updateHUD() {
  els.combo.textContent = `COMBO ${combo}`;
  els.lives.textContent = `MISS ${misses}/${CONFIG.MAX_MISS}`;
}

// ===== 判定・入力 =====
function onHit() {
  if (!playing || !audioCtx) return;

  const t = currentAudioTime();
  const beat = nearestBeatTime(t);
  const diff = Math.abs(t - beat);
  const win = currentWindow();

  if (diff <= win) {
    combo++;
    els.msg.textContent = (diff <= CONFIG.PERFECT_THRESH) ? 'PERFECT' : 'OK';
    playSE(els.seHit, 0.9 + Math.random()*0.2);
  } else {
    onMiss();
  }
  updateHUD();
}

function onMiss() {
  combo = 0;
  misses++;
  els.msg.textContent = 'MISS…';
  playSE(els.seMiss, 1.0);

  // 般若の近づき/消失を更新
  updateHannyaVisual();

  // 背後移動のテキスト演出（任意）
  if (misses === CONFIG.HANAYYA_HIDE_STEP) {
    els.msg.textContent = '背後に気配…';
  }

  if (misses >= CONFIG.MAX_MISS) {
    gameOver();
  }
  updateHUD();
}

// ===== サウンド =====
function playSE(el, rate = 1) {
  try {
    el.pause();
    el.currentTime = 0;
    el.playbackRate = rate;
    el.play();
  } catch {}
}

// ===== フロー：開始・リトライ・ゲームオーバー =====
async function startGame() {
  // AudioContext準備
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // HTMLAudioをWebAudioに接続（再生はHTMLAudioに任せ、クロックはAudioContextを使う）
    mediaSrc = audioCtx.createMediaElementSource(els.bgm);
    mediaSrc.connect(audioCtx.destination);
  } else if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // 状態リセット
  misses = 0; combo = 0;
  updateHUD();
  els.msg.textContent = 'お経開始…';

  // 可視更新
  els.overlay.classList.add('hidden');
  els.gameover.classList.add('hidden');
  document.body.classList.remove('neck-snap');

  // BGM再生と基準時刻
  els.bgm.currentTime = 0;
  await els.bgm.play().catch(()=>{});
  startTimeCtx = currentAudioTime();

  playing = true;
  updateHannyaVisual();
}

function gameOver() {
  playing = false;

  // 首ゴキッ
  document.body.classList.add('neck-snap');

  // 少し遅らせて停止＆画面
  setTimeout(() => {
    try { els.bgm.pause(); } catch {}
    els.gameover.classList.remove('hidden');
  }, 500);
}

function retry() {
  els.gameover.classList.add('hidden');
  els.overlay.classList.remove('hidden');
  els.msg.textContent = 'お経に合わせて叩け';
  updateHannyaVisual();
}

// ===== 入力バインド =====
function bindInputs() {
  els.mokugyoBtn.addEventListener('click', onHit);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onHit();
    }
    if ((e.code === 'Enter' || e.code === 'KeyS') && !playing) {
      // ショートカット開始
      if (!els.overlay.classList.contains('hidden')) startGame();
    }
  });

  els.startBtn.addEventListener('click', startGame);
  els.retryBtn.addEventListener('click', retry);
}

bindInputs();

// ===== 参考：BPMやオフセットの合わせ方 =====
// 1) 既知のBPMなら CONFIG.BPM を設定。最初の拍の頭出しは CONFIG.OFFSET_SEC に秒で。
// 2) オフセットの微調整：叩いて違和感があれば ±0.02s ずつ調整。
// 3) rit. / 加速などテンポ可変のBGMは、拍タイムスタンプ配列で管理する方法に変更推奨。
//    例：const BEATS = [0.52, 1.27, 1.99, ...]（BGM先頭からの秒）。nearestBeatTime は配列から最近値を探す実装へ差し替え。
