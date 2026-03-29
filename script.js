/* --- script.js 完全版（仕掛け対応） --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const coinElement = document.getElementById('coinCount');
const enemyElement = document.getElementById('enemyCount');
const scoreElement = document.getElementById('totalScore');
const levelElement = document.getElementById('currentLevel');
const msgElement = document.getElementById('msg');
const fsBtn = document.getElementById('btn-fs');

// --- 画面サイズ調整 ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- 全画面切り替え機能 ---
fsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
            window.scrollTo(0, 1);
        });
        fsBtn.innerText = "解除";
    } else {
        document.exitFullscreen();
        fsBtn.innerText = "全画面";
    }
});

// --- 音響設定 ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmInterval;

function playTone(freq, type, duration, vol = 0.1) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playBGM() {
    if (bgmInterval) return;
    const notes = [261, 329, 392, 523, 493, 392, 329, 293];
    let i = 0;
    bgmInterval = setInterval(() => {
        if (!isCleared && gameStarted) playTone(notes[i % notes.length], 'square', 0.2, 0.015);
        i++;
    }, 250);
}

// --- ゲーム変数 ---
const gravity = 0.8;
const blockSize = 60;
let coins = 0, defeated = 0, score = 0, currentStage = 0;
let scrollX = 0, frame = 0, isCleared = false, gameStarted = false;
let particles = [], enemies = [], level = [], movingPlatforms = [];

const player = { x: 100, y: 100, width: 50, height: 40, vx: 0, vy: 0, speed: 6, jumpPower: -16, grounded: false, direction: 1 };

/**
 * ステージ初期化
 */
function initStage(stgIndex) {
    currentStage = stgIndex;
    const data = STAGE_DATA[currentStage];
    
    level = JSON.parse(JSON.stringify(data.map));
    player.x = 100; player.y = 100; player.vx = 0; player.vy = 0;
    isCleared = false;
    msgElement.style.display = 'none';
    levelElement.innerText = currentStage + 1;
    scrollX = 0;
    enemies = [];
    
    const startY = canvas.height - (level.length * blockSize) - 40;
    
    // 敵の配置
    if(data.enemies) {
        data.enemies.forEach(en => {
            enemies.push({ x: en.gx * blockSize, y: startY + en.gy * blockSize - 32, vx: en.vx, width: 40, height: 30, alive: true });
        });
    }

    // 動く床の配置
    movingPlatforms = [];
    if(data.platforms) {
        data.platforms.forEach(p => {
            movingPlatforms.push({ 
                x: p.gx * blockSize, y: startY + p.gy * blockSize, 
                baseX: p.gx * blockSize, range: p.range * blockSize, 
                speed: p.speed, width: blockSize * 1.5, height: 20 
            });
        });
    }
}

initStage(0);

// --- 入力処理 ---
const keys = {};
function activate() {
    if(!gameStarted) {
        gameStarted = true;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        playBGM();
        document.getElementById('start-guide').style.display='none';
    }
}
window.addEventListener('keydown', e => { keys[e.code] = true; activate(); });
window.addEventListener('keyup', e => keys[e.code] = false);

function setupBtn(id, code) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); keys[code] = true; activate(); });
    el.addEventListener('touchend', e => { e.preventDefault(); keys[code] = false; });
}
setupBtn('btn-left', 'ArrowLeft'); setupBtn('btn-right', 'ArrowRight'); setupBtn('btn-jump', 'Space');

// --- ゲーム更新処理 ---
function update() {
    if (!gameStarted) return;
    frame++;

    // 移動計算
    if (!isCleared) {
        if (keys['ArrowRight']) { player.vx = player.speed; player.direction = 1; }
        else if (keys['ArrowLeft']) { player.vx = -player.speed; player.direction = -1; }
        else player.vx = 0;
        if (keys['Space'] && player.grounded) {
            player.vy = player.jumpPower; player.grounded = false;
            playTone(400, 'triangle', 0.1);
        }
    } else {
        player.vx = 3; player.direction = 1;
        if (player.grounded && frame % 60 === 0) player.vy = -10;
    }

    player.vy += gravity; player.x += player.vx; player.y += player.vy;
    scrollX = Math.max(0, player.x - 150);
    let onGround = false;
    const startY = canvas.height - (level.length * blockSize) - 40;

    // --- 動く床の更新と判定 ---
    movingPlatforms.forEach(p => {
        p.x = p.baseX + Math.sin(frame * p.speed) * p.range;
        // 乗っている判定
        if (player.vx >= 0 && player.x + player.width > p.x && player.x < p.x + p.width && 
            player.y + player.height <= p.y + 10 && player.y + player.height + player.vy >= p.y) {
            player.y = p.y - player.height;
            player.vy = 0;
            onGround = true;
            player.x += Math.cos(frame * p.speed) * p.speed * p.range; // 床と一緒に動く
        }
    });

    // --- マップ衝突判定 ---
    level.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            if (cell === 0) return;
            const bx = colIndex * blockSize, by = startY + rowIndex * blockSize;
            if (player.x < bx + blockSize && player.x + player.width > bx && player.y < by + blockSize && player.y + player.height > by) {
                if (cell === 1) { // 地面
                    if (player.vy > 0 && player.y + player.height - player.vy <= by) {
                        player.y = by - player.height; player.vy = 0; onGround = true;
                    }
                } else if (cell === 2 && !isCleared) { forceReset(); } // トゲ
                else if (cell === 3) { // 小判
                    level[rowIndex][colIndex] = 0; coins++; coinElement.innerText = coins;
                    score += 10; scoreElement.innerText = score;
                    playTone(880, 'sine', 0.1, 0.05);
                    for(let i=0; i<8; i++) particles.push({ x: bx+30, y: by+30, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, life: 1, color: 'gold' });
                } else if (cell === 4 && !isCleared) { // ゴール
                    isCleared = true; msgElement.style.display = 'block';
                    playTone(523, 'square', 0.5); setTimeout(() => playTone(659, 'square', 0.5), 150);
                    setTimeout(() => {
                        if (currentStage + 1 < STAGE_DATA.length) initStage(currentStage + 1);
                        else { msgElement.innerHTML = "ALL CLEAR!"; setTimeout(() => location.reload(), 3000); }
                    }, 2000);
                } else if (cell === 5) { // ジャンプ台
                    if (player.vy > 0) {
                        player.vy = -22; // 特大ジャンプ
                        playTone(600, 'triangle', 0.2);
                        for(let i=0; i<5; i++) particles.push({ x: bx+30, y: by+30, vx: (Math.random()-0.5)*10, vy: -Math.random()*10, life: 1, color: 'white' });
                    }
                }
            }
        });
    });
    player.grounded = onGround;

    // 敵の処理
    enemies.forEach(en => {
        if (!en.alive) return;
        en.x += en.vx;
        if (player.x < en.x + en.width && player.x + player.width > en.x && player.y < en.y + en.height && player.y + player.height > en.y) {
            if (player.vy > 0 && player.y + player.height < en.y + 20) {
                en.alive = false; player.vy = -12; defeated++; enemyElement.innerText = defeated;
                score += 50; scoreElement.innerText = score;
                playTone(150, 'sawtooth', 0.2);
            } else if(!isCleared) { forceReset(); }
        }
    });

    if (player.y > canvas.height + 100 && !isCleared) forceReset();
    particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; return p.life > 0; });
}

function forceReset() {
    playTone(100, 'sawtooth', 0.3, 0.2);
    player.vx = 0; player.vy = 0;
    setTimeout(() => initStage(currentStage), 10);
}

// --- 描画処理 ---
function draw() {
    const data = STAGE_DATA[currentStage];
    document.body.style.background = data.bg;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); 
    ctx.translate(-scrollX, 0);
    const startY = canvas.height - (level.length * blockSize) - 40;

    // マップチップ
    level.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            const bx = colIndex * blockSize, by = startY + rowIndex * blockSize;
            if (cell === 1) { // 地面
                ctx.fillStyle = (currentStage < 3) ? ["#7AC143", "#2d5a27", "#333"][currentStage] : "#553311";
                ctx.fillRect(bx, by, blockSize, blockSize);
            } else if (cell === 2) { // トゲ
                ctx.fillStyle = '#666'; ctx.beginPath(); ctx.moveTo(bx, by+60); ctx.lineTo(bx+30, by); ctx.lineTo(bx+60, by+60); ctx.fill();
            } else if (cell === 3) { // 小判
                ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.ellipse(bx+30, by+30+Math.sin(frame*0.1)*5, 10, 15, 0, 0, 7); ctx.fill();
            } else if (cell === 4) { // ゴール
                ctx.fillStyle = 'red'; ctx.fillRect(bx+10, by-80, 40, 140); ctx.font = "40px serif"; ctx.fillText("⛩️", bx+5, by);
            } else if (cell === 5) { // ジャンプ台
                ctx.fillStyle = '#ff6600'; ctx.fillRect(bx, by+40, blockSize, 20);
                ctx.fillStyle = '#ffcc00'; ctx.fillRect(bx+10, by+30+Math.abs(Math.sin(frame*0.2))*10, blockSize-20, 10);
            }
        });
    });

    // 動く床
    movingPlatforms.forEach(p => {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, p.width, p.height);
    });

    // 敵（ネズミ）
    enemies.forEach(en => { 
        if (en.alive) { 
            ctx.save(); ctx.translate(en.x + 20, en.y + 20); if (en.vx > 0) ctx.scale(-1, 1);
            ctx.fillStyle = '#888'; ctx.beginPath(); ctx.ellipse(0, 5, 18, 12, 0, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(-10, -5, 8, 0, 7); ctx.fill();
            ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(15, 5); ctx.quadraticCurveTo(30, 0, 25, 15); ctx.stroke();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(-8, 2, 2, 0, 7); ctx.fill();
            ctx.restore();
        }
    });

    // 猫
    ctx.save(); ctx.translate(player.x + 25, player.y + 20); if (player.direction === -1) ctx.scale(-1, 1);
    const walk = Math.sin(frame * 0.2) * 5;
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-20, 10); ctx.quadraticCurveTo(-40, -10 + walk, -35, -20 + walk); ctx.stroke();
    ctx.fillStyle = '#FFFACD'; ctx.beginPath(); ctx.ellipse(0, 0, 25, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(-25, -35); ctx.lineTo(-5, -20); ctx.fill();
    ctx.beginPath(); ctx.moveTo(15, -15); ctx.lineTo(25, -35); ctx.lineTo(5, -20); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-10, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); });
    ctx.restore();
    requestAnimationFrame(draw);
    update();
}

draw();