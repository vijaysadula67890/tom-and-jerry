const socket = io();

let players = {};
let myId;
let myRole;
let gameStarted = false;
let phaserScene = null;
let gameover = false;

const dpad = { left: false, right: false, up: false, down: false };

const TABLES = [
    { x1: 360, y1: 480, x2: 475, y2: 600 },
    { x1: 720, y1: 480, x2: 835, y2: 600 },
    { x1: 300, y1: 240, x2: 415, y2: 360 },
    { x1: 720, y1: 240, x2: 835, y2: 360 },
];

const SPEEDS = { cat: 2, mouse: 3 };
const CATCH_DISTANCE = 30;

const config = {
    type: Phaser.AUTO, width: 800, height: 600, parent: "game",
    physics: { default: 'arcade', arcade: { debug: true } }, // debug ON so you can see boxes
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

            // Create sprite WITH physics body
            const sprite = scene.physics.add.sprite(players[id].x, players[id].y, role);
            sprite.setScale(role === "cat" ? 0.175 : 0.025);
            sprite.setCollideWorldBounds(true);

            // Add collider against EVERY wall individually to be safe
            scene.wallBodies.forEach(wallBody => {
                scene.physics.add.collider(sprite, wallBody);
            });

            scene.playerSprites[id] = sprite;

            if (id === socket.id) {
                myId = id;
                myRole = role;
            }
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
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            socket.emit("time-up");
        }
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
    this.wallBodies = []; // store individual wall bodies

    const map = this.add.image(400, 300, 'house');
    map.displayWidth = 800;
    map.displayHeight = 600;

    // Boundary walls
    const allWalls = [
        { x: 400, y: 0,   w: 800, h: 20 },  // top
        { x: 400, y: 600, w: 800, h: 20 },  // bottom
        { x: 0,   y: 300, w: 20,  h: 600 }, // left
        { x: 800, y: 300, w: 20,  h: 600 }, // right
        // Table 1
        { x: (360+475)/2, y: (480+600)/2, w: 475-360, h: 600-480 },
        // Table 2
        { x: (720+835)/2, y: (480+600)/2, w: 835-720, h: 600-480 },
        // Table 3
        { x: (300+415)/2, y: (240+360)/2, w: 415-300, h: 360-240 },
        // Table 4
        { x: (720+835)/2, y: (240+360)/2, w: 835-720, h: 360-240 },
    ];

    for (const d of allWalls) {
        // Use a physics image instead of rectangle for reliable static body
        const wall = this.add.zone(d.x, d.y, d.w, d.h);
        this.physics.add.existing(wall, true); // true = static
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
    let moved = false;

    const goLeft  = this.cursors.left.isDown  || dpad.left;
    const goRight = this.cursors.right.isDown || dpad.right;
    const goUp    = this.cursors.up.isDown    || dpad.up;
    const goDown  = this.cursors.down.isDown  || dpad.down;

    // Use velocity for proper physics collision
    sprite.setVelocity(0, 0);
    if (goLeft)       { sprite.setVelocityX(-speed * 60); moved = true; }
    else if (goRight) { sprite.setVelocityX( speed * 60); moved = true; }
    if (goUp)         { sprite.setVelocityY(-speed * 60); moved = true; }
    else if (goDown)  { sprite.setVelocityY( speed * 60); moved = true; }

    if (moved) socket.emit("move", { x: sprite.x, y: sprite.y });

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
