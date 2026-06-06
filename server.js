const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(path.join(__dirname)));

const TABLES = [
    { x: 295, y: 402, w: 95,  h: 100 },
    { x: 591, y: 402, w: 94,  h: 100 },
    { x: 246, y: 201, w: 95,  h: 100 },
    { x: 591, y: 201, w: 94,  h: 100 },
];

function isOnTable(px, py, margin = 40) {
    for (const t of TABLES) {
        if (px > t.x - margin && px < t.x + t.w + margin &&
            py > t.y - margin && py < t.y + t.h + margin) return true;
    }
    return false;
}

function randomSpawn() {
    let x, y;
    do {
        x = Math.floor(50 + Math.random() * 700);
        y = Math.floor(50 + Math.random() * 500);
    } while (isOnTable(x, y));
    return { x, y };
}

let roomState = { code: Math.floor(1000 + Math.random() * 9000), players: {} };

io.on("connection", (socket) => {
    console.log("Player Connected:", socket.id);
    socket.emit("room-code", roomState.code);
    socket.emit("lobby-update", roomState.players);

    socket.on("select-role", (role) => {
        const isTaken = Object.values(roomState.players).some(p => p.role === role);
        if (!isTaken) {
            const spawn = randomSpawn();
            roomState.players[socket.id] = { role, x: spawn.x, y: spawn.y, ready: false };
            io.emit("lobby-update", roomState.players);
        }
    });

    socket.on("toggle-ready", () => {
        if (roomState.players[socket.id]) {
            roomState.players[socket.id].ready = !roomState.players[socket.id].ready;
            io.emit("lobby-update", roomState.players);
            const list = Object.values(roomState.players);
            if (list.length === 2 && list.every(p => p.ready)) {
                io.emit("start-game");
                io.emit("players", roomState.players);
            }
        }
    });

    socket.on("request-players", () => socket.emit("players", roomState.players));

    socket.on("move", (data) => {
        if (roomState.players[socket.id]) {
            roomState.players[socket.id].x = Math.max(15, Math.min(785, data.x));
            roomState.players[socket.id].y = Math.max(15, Math.min(585, data.y));
            io.emit("players", roomState.players);
        }
    });

    socket.on("caught",  () => io.emit("game-over", { winner: "cat"   }));
    socket.on("time-up", () => io.emit("game-over", { winner: "mouse" }));

    socket.on("disconnect", () => {
        delete roomState.players[socket.id];
        io.emit("lobby-update", roomState.players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));
