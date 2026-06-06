const socket = io();

let players = {};
let myId;
let myRole;
let gameStarted = false;
let phaserScene = null;
let gameover = false;

const dpad = { left: false, right: false, up: false, down: false };

// Top-left corner + size (scaled from 975x717 to 800x600)
const TABLE_WALLS = [
    { x: 295, y: 402, w: 95,  h: 100 }, // bottom-left
    { x: 591, y: 402, w: 94,  h: 100 }, // bottom-right
    { x: 246, y: 201, w: 95,  h: 100 }, // top-left
    { x: 591, y: 201, w: 94,  h: 100 }, // top-right
];

// For spawn exclusion — same coords
function isOnTable(px, py, margin = 30) {
    for (const t of TABLE_WALLS) {
        if (px > t.x - margin && px < t.x + t.w + margin &&
            py > t.y - margin && py < t.y + t.h + margin) return true;
    }
    return false;
}

const SPEEDS = { cat: 2, mouse: 3 };
const CATCH_DISTANCE = 30;

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: "game",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: { default: 'arcade', arcade: { debug: true } },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

socket.on("room-code", (code) => {
    const el = document.getElementById("room-code");
    if (el) el.innerText = "Room Code: " + code;
});

socket.on("lobby-update", (data) => {
    players = data;
    if (players[socket.id]) {
        const btn = document.getElementById("start-btn");
        btn.disabled = false;
        btn.innerText = players[socket.id].ready ? "Ready!" : "Start Game";
    }
});

socket.on("start-game", () => {
    gameStarted = true;
    document.getElementById("lobby").style.display = "none";
    document.getElementById("timer").style.display = "block";
    if (isTouchDevice()) document.getElementById("dpad").style.display = "block";
    startTimer();
    socket.emit("request-players");
});

function isTouchDevice() {
    return ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
}

socket.on("players", (data) => {
    if (!phaserScene) return;
    players = data;
    const scene = phaserScene;

    for (let id in players) {
        if (!scene.playerSprites[id]) {
            const role = players[id].role;
            const sprite = scene.physics.add.sprite(players[id].x, players[id].y, role);
            sprite.setScale(role === "cat" ? 0.175 : 0.025);
            sprite.setCollideWorldBounds(true);
            scene.wallBodies.forEach(wall => scene.physics.add.collider(sprite, wall));
            scene.playerSprites[id] = sprite;
            if (id === socket.id) { myId = id; myRole = role; }
        } else if (id !== socket.id) {
            scene.playerSprites[id].x = players[id].x;
            scene.playerSprites[id].y = players[id].y;
        }
    }
});

socket.on("game-over", (data) => {
    if (gameover) return;
    gameover = true;
    clearInterval(timerInterval);
    const msg = data.winner === "cat"
        ? "🐱 Tom wins! Jerry was caught!"
        : "🐭 Jerry wins! Tom ran out of time!";
    setTimeout(() => { alert(msg); location.reload(); }, 100);
});

let timeLeft = 120;
let timerInterval = null;
function startTimer() {
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById("timer").innerText = "Time: " + timeLeft;
        if (timeLeft <= 0) { clearInterval(timerInterval); socket.emit("time-up"); }
    }, 1000);
}

function preload() {
    this.load.image("cat", "assets/tom.png");
    this.load.image("mouse", "assets/jerry.png");
    this.load.image("house", "assets/house.png");
}

function create() {
    phaserScene = this;
    this.playerSprites = {};
    this.wallBodies = [];

    const map = this.add.image(400, 300, 'house');
    map.displayWidth = 800;
    map.displayHeight = 600;

    // Boundary walls — use rectangles with physics
    const boundaries = [
        { x: 0,   y: 0,   w: 800, h: 10  }, // top
        { x: 0,   y: 590, w: 800, h: 10  }, // bottom
        { x: 0,   y: 0,   w: 10,  h: 600 }, // left
        { x: 790, y: 0,   w: 10,  h: 600 }, // right
    ];

    for (const d of [...boundaries, ...TABLE_WALLS]) {
        // Use a Rectangle game object — position is TOP-LEFT
        const rect = this.add.rectangle(
            d.x + d.w / 2,  // Phaser rectangle x = center
            d.y + d.h / 2,  // Phaser rectangle y = center
            d.w, d.h,
            0x000000, 0      // invisible
        );
        this.physics.add.existing(rect, true);
        // Force body to exact top-left position
        rect.body.position.x = d.x;
        rect.body.position.y = d.y;
        rect.body.setSize(d.w, d.h);
        this.wallBodies.push(rect);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    setupDpad();
}

function setupDpad() {
    const press = { "btn-up": "up", "btn-down": "down", "btn-left": "left", "btn-right": "right" };
    for (const id in press) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dir = press[id];
        el.addEventListener("touchstart", (e) => { e.preventDefault(); dpad[dir] = true;  }, { passive: false });
        el.addEventListener("touchend",   (e) => { e.preventDefault(); dpad[dir] = false; }, { passive: false });
        el.addEventListener("mousedown",  () => dpad[dir] = true);
        el.addEventListener("mouseup",    () => dpad[dir] = false);
        el.addEventListener("mouseleave", () => dpad[dir] = false);
    }
}

function selectRole(role) { socket.emit("select-role", role); }
function startGame() { socket.emit("toggle-ready"); }

function update() {
    if (!gameStarted || !myId || !this.playerSprites[myId] || gameover) return;

    const sprite = this.playerSprites[myId];
    const speed = SPEEDS[myRole] || 3;

    const goLeft  = this.cursors.left.isDown  || dpad.left;
    const goRight = this.cursors.right.isDown || dpad.right;
    const goUp    = this.cursors.up.isDown    || dpad.up;
    const goDown  = this.cursors.down.isDown  || dpad.down;

    sprite.setVelocity(0, 0);
    if (goLeft)       sprite.setVelocityX(-speed * 60);
    else if (goRight) sprite.setVelocityX( speed * 60);
    if (goUp)         sprite.setVelocityY(-speed * 60);
    else if (goDown)  sprite.setVelocityY( speed * 60);

    if (goLeft || goRight || goUp || goDown)
        socket.emit("move", { x: sprite.x, y: sprite.y });

    if (myRole === "cat") {
        for (let id in this.playerSprites) {
            if (id === myId) continue;
            const dist = Phaser.Math.Distance.Between(
                sprite.x, sprite.y,
                this.playerSprites[id].x, this.playerSprites[id].y
            );
            if (dist < CATCH_DISTANCE) socket.emit("caught");
        }
    }
}
