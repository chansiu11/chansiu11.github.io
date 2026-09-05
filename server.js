const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const players = {};
const bullets = [];

io.on('connection', (socket) => {
    // 1. 플레이어 접속 (이름 설정)
    socket.on('joinGame', (nickname) => {
        players[socket.id] = {
            id: socket.id,
            name: nickname || '익명',
            x: Math.random() * 700 + 50,
            y: Math.random() * 500 + 50,
            angle: 0,
            score: 0,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`
        };
    });

    // 2. 플레이어 위치 및 각도 업데이트
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].angle = data.angle;
        }
    });

    // 3. 총알 발사
    socket.on('shoot', (bulletData) => {
        bullets.push({
            id: socket.id,
            x: bulletData.x,
            y: bulletData.y,
            dx: bulletData.dx,
            dy: bulletData.dy
        });
    });

    // 4. 접속 종료
    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// 주기적으로 전체 상태 전송 및 총알 이동 계산 (60FPS)
setInterval(() => {
    // 총알 위치 계산 및 화면 밖 제거
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.dx;
        b.y += b.dy;
        if (b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
            bullets.splice(i, 1);
        }
    }

    io.emit('gameState', { players, bullets });
}, 1000 / 60);

server.listen(3000, () => {
    console.log('서버가 http://localhost:3000 에서 실행 중입니다.');
});
