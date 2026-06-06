const socket = io();

let players = {};
let myId;
let myRole;
let gameStarted = false;
let phaserScene = null;
let gameover = false;

const dpad = { left: false, right: false, up: false, down: false };

// Coordinates scaled from 975x717 → 800x600
const TABLES = [
    { x1: 295, y1: 402, x2: 390, y2: 502 }, // Table 1 bottom-left
    { x1: 591, y1: 402, x2: 685, y2: 502 }, // Table 2 bottom-right
    { x1: 246, y1: 201, x2: 341, y2: 301 }, // Table 3 top-left
    { x1: 591, y1: 201, x2: 685, y2: 301 }, // Table 4 top-right
];

const SPEEDS = { cat: 2, mouse: 3 };
const CATCH_DISTANCE = 30;

const config = {
    type: Phaser.AUTO, width: 800, height: 600, parent: "game",
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
            scene.wallBodies.forEach(wall => {
                scene.physics.add.collider(sprite, wall);
            });
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

    const allWalls = [
        // Boundaries
        { x: 400, y:   5, w: 800, h: 10 },
        { x: 400, y: 595, w: 800, h: 10 },
        { x:   5, y: 300, w: 10,  h: 600 },
        { x: 795, y: 300, w: 10,  h: 600 },
        // Tables (scaled coordinates)
        { x: 342, y: 452, w:  95, h: 100 },
        { x: 638, y: 452, w:  94, h: 100 },
        { x: 293, y: 251, w:  95, h: 100 },
        { x: 638, y: 251, w:  94, h: 100 },
    ];

    for (const d of allWalls) {
        const wall = this.add.zone(d.x, d.y, d.w, d.h);
        this.physics.add.existing(wall, true);
        wall.body.setSize(d.w, d.h);
        wall.body.reset(d.x, d.y);
        this.wallBodies.push(wall);
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
