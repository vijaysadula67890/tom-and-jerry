// Auto-detect server URL: works on localhost AND on Render
const socket = io();

let players = {};
let myId;
let myRole;
let gameStarted = false;
let phaserScene = null;
let gameover = false;

const config = {
    type: Phaser.AUTO, width: 800, height: 600, parent: "game",
    physics: { default: 'arcade', arcade: { debug: false } },
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
    startTimer();
    socket.emit("request-players");
});

function spawnOrMovePlayers(data) {
    if (!phaserScene) return;
    players = data;
    const scene = phaserScene;

    for (let id in players) {
        if (!scene.playerSprites[id]) {
            const role = players[id].role;
            const sprite = scene.physics.add.sprite(players[id].x, players[id].y, role);
            sprite.setScale(role === "cat" ? 0.175 : 0.025);
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
}

socket.on("players", spawnOrMovePlayers);

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

    const map = this.add.image(400, 300, 'house');
    map.displayWidth = 800;
    map.displayHeight = 600;

    this.walls = this.physics.add.staticGroup();
    for (const d of [
        { x: 400, y: 0,   w: 800, h: 10 },
        { x: 400, y: 600, w: 800, h: 10 },
        { x: 0,   y: 300, w: 10,  h: 600 },
        { x: 800, y: 300, w: 10,  h: 600 },
    ]) {
        const wall = this.add.rectangle(d.x, d.y, d.w, d.h);
        this.physics.add.existing(wall, true);
        this.walls.add(wall);
    }

    this.playerSprites = {};
    this.cursors = this.input.keyboard.createCursorKeys();
}

function selectRole(role) { socket.emit("select-role", role); }
function startGame() { socket.emit("toggle-ready"); }

const CATCH_DISTANCE = 30;

function update() {
    if (!gameStarted || !myId || !this.playerSprites[myId] || gameover) return;

    const sprite = this.playerSprites[myId];
    const speed = 4;
    let moved = false;

    if (this.cursors.left.isDown)       { sprite.x -= speed; moved = true; }
    else if (this.cursors.right.isDown) { sprite.x += speed; moved = true; }
    if (this.cursors.up.isDown)         { sprite.y -= speed; moved = true; }
    else if (this.cursors.down.isDown)  { sprite.y += speed; moved = true; }

    sprite.x = Phaser.Math.Clamp(sprite.x, 10, 790);
    sprite.y = Phaser.Math.Clamp(sprite.y, 10, 590);

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