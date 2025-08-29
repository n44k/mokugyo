// DOM取得
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const settingsScreen = document.getElementById("settingsScreen");
const gameOverScreen = document.getElementById("gameOverScreen");

const startBtn = document.getElementById("startBtn");
const settingsBtn = document.getElementById("settingsBtn");
const closeSettings = document.getElementById("closeSettings");
const restartBtn = document.getElementById("restartBtn");

const judgement = document.getElementById("judgement");
const comboEl = document.getElementById("combo");
const hannya = document.getElementById("hannya");

// 設定
let difficulty = "normal";
let judgePosition = "bottom";

// ゲーム状態
let combo = 0;
let missCount = 0;
let gameOver = false;

// 難易度ごとの許容ミス
const missLimit = { easy: 10, normal: 5, hard: 1 };

// ---------- 画面遷移 ----------
window.onload = () => {
  startScreen.style.display = "flex";
};

startBtn.onclick = () => {
  startScreen.style.display = "none";
  gameScreen.style.display = "flex";
  startGame();
};

settingsBtn.onclick = () => {
  settingsScreen.style.display = "flex";
};

closeSettings.onclick = () => {
  settingsScreen.style.display = "none";
};

restartBtn.onclick = () => {
  resetGame();
};

// ---------- 設定変更 ----------
document.getElementById("difficulty").onchange = (e) => {
  difficulty = e.target.value;
};
document.getElementById("judgePosition").onchange = (e) => {
  judgePosition = e.target.value;
};

// ---------- ゲーム開始 ----------
function startGame() {
  combo = 0;
  missCount = 0;
  gameOver = false;
  updateCombo();
  moveHannya(-200);

  document.addEventListener("keydown", handleInput);
}

// ---------- リスタート ----------
function resetGame() {
  gameOverScreen.style.display = "none";
  gameScreen.style.display = "flex";
  startGame();
}

// ---------- 入力処理 ----------
function handleInput(e) {
  if (e.code === "Space") {
    hitNote();
  }
}

function hitNote() {
  if (gameOver) return;

  // 判定（今回は仮ランダム）
  const rand = Math.random();
  if (rand < 0.1) {
    showJudgement("MISS");
    combo = 0;
    miss();
  } else if (rand < 0.5) {
    showJudgement("OK");
    combo++;
  } else {
    showJudgement("PERFECT!");
    combo++;
  }
  updateCombo();
  checkComboEffects();
}

// ---------- 判定表示 ----------
function showJudgement(text) {
  judgement.textContent = text;
  if (judgePosition === "top") {
    judgement.style.top = "200px";
    judgement.style.bottom = "auto";
  } else {
    judgement.style.bottom = "200px";
    judgement.style.top = "auto";
  }
  setTimeout(() => judgement.textContent = "", 800);
}

// ---------- コンボ ----------
function updateCombo() {
  comboEl.textContent = combo + " Combo";
}

// ---------- 般若の動き ----------
function miss() {
  missCount++;
  moveHannya(-200 + missCount * 50);

  if (missCount >= missLimit[difficulty]) {
    triggerGameOver();
  }
}

function moveHannya(pos) {
  hannya.style.right = pos + "px";
}

// ---------- ゲームオーバー ----------
function triggerGameOver() {
  gameOver = true;
  gameOverScreen.style.display = "flex";
  gameScreen.style.display = "none";
}

// ---------- コンボによるギミック ----------
function checkComboEffects() {
  if (combo % 10 === 0) {
    switch(combo) {
      case 10: shakeScreen(5); break;
      case 20: shakeScreen(10); break;
      case 30: flashScreen(); break;
      case 40: bloodEffect(); break;
      case 50: tiltScreen(); break;
    }
  }
}

function shakeScreen(intensity) {
  gameScreen.style.transition = "transform 0.1s";
  gameScreen.style.transform = `translate(${intensity}px, 0)`;
  setTimeout(() => gameScreen.style.transform = "translate(0,0)", 100);
}

function flashScreen() {
  gameScreen.style.background = "white";
  setTimeout(() => gameScreen.style.background = "", 100);
}

function bloodEffect() {
  gameScreen.style.background = "radial-gradient(red, black)";
  setTimeout(() => gameScreen.style.background = "", 500);
}

function tiltScreen() {
  gameScreen.style.transform = "rotate(60deg)";
  setTimeout(() => gameScreen.style.transform = "rotate(0deg)", 1000);
}
