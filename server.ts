import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for LAN
        methods: ["GET", "POST"]
    }
});

interface PlayerState {
    id: string;
    x: number;
    y: number;
    bodyRotation: number;
    turretRotation: number;
    color: 'blue' | 'red';
}

const players: Record<string, PlayerState> = {};
const bullets: Record<string, any> = {};
const obstacles: any[] = [];

// Generate Obstacles
for (let i = 0; i < 20; i++) {
    obstacles.push({
        id: `obs_${i}`,
        x: Math.random() * 700 + 50,
        y: Math.random() * 500 + 50,
        type: Math.random() > 0.5 ? 'crateWood.png' : 'crateMetal.png',
        width: 28,
        height: 28
    });
}

io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Initialize new player
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 800,
        y: Math.random() * 600,
        bodyRotation: 0,
        turretRotation: 0,
        color: Object.keys(players).length % 2 === 0 ? 'blue' : 'red'
    };

    // Send current state to new player
    socket.emit('currentPlayers', players);
    socket.emit('currentObstacles', obstacles);

    // Broadcast new player to others
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].bodyRotation = movementData.bodyRotation;
            players[socket.id].turretRotation = movementData.turretRotation;

            // Broadcast movement to others
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('shoot', (shootData) => {
        const bulletId = Math.random().toString(36).substr(2, 9);
        const bullet = {
            id: bulletId,
            ownerId: socket.id,
            x: players[socket.id].x,
            y: players[socket.id].y,
            rotation: players[socket.id].turretRotation,
            vx: Math.cos(players[socket.id].turretRotation - Math.PI / 2) * 10,
            vy: Math.sin(players[socket.id].turretRotation - Math.PI / 2) * 10
        };
        bullets[bulletId] = bullet;
        io.emit('bulletFired', bullet);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Game Loop on Server
setInterval(() => {
    // Update bullets
    Object.keys(bullets).forEach(id => {
        const bullet = bullets[id];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        // Check collisions with obstacles
        for (const obstacle of obstacles) {
            if (checkCollision(bullet, obstacle)) {
                io.emit('bulletExploded', { id: bullet.id, x: bullet.x, y: bullet.y, type: 'obstacle' });
                delete bullets[id];
                if (obstacle.type === 'crateWood.png') {
                    // Destroy crate
                    const index = obstacles.indexOf(obstacle);
                    if (index > -1) {
                        obstacles.splice(index, 1);
                    }
                    io.emit('obstacleDestroyed', obstacle.id);
                }
                return;
            }
        }

        // Check collisions with players
        Object.keys(players).forEach(playerId => {
            if (playerId !== bullet.ownerId) {
                const player = players[playerId];
                if (checkCollision(bullet, { x: player.x, y: player.y, width: 38, height: 38 })) {
                    io.emit('bulletExploded', { id: bullet.id, x: bullet.x, y: bullet.y, type: 'player' });
                    delete bullets[id];
                    // Logic for player damage could go here
                    return;
                }
            }
        });

        // Remove out of bounds
        if (bullet.x < 0 || bullet.x > 800 || bullet.y < 0 || bullet.y > 600) {
            delete bullets[id];
        }
    });
}, 1000 / 60);

function checkCollision(a: any, b: any) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 20; // Simple radius check
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
