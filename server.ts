import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_DIR = path.join(__dirname, 'maps');
if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR);
}

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
    health: number;
}

interface Room {
    id: string;
    players: Record<string, PlayerState>;
    bullets: Record<string, any>;
    obstacles: any[];
    powerUps: PowerUp[];
    hiddenPowerUps: Record<string, PowerUp>; // Map obstacle ID to PowerUp
}

interface PowerUp {
    id: string;
    x: number;
    y: number;
    type: 'S+' | 'S-' | 'B+' | 'H+' | 'A' | 'M';
    width: number;
    height: number;
}

const rooms: Record<string, Room> = {};
const maps: Record<string, any[]> = {}; // In-memory map storage

function generateObstacles(): any[] {
    const obstacles: any[] = [];
    const maxAttempts = 100;
    const minDistance = 40; // Minimum distance between obstacle centers

    for (let i = 0; i < 20; i++) {
        let attempts = 0;
        let valid = false;
        let x = 0;
        let y = 0;

        while (!valid && attempts < maxAttempts) {
            x = Math.random() * 700 + 50;
            y = Math.random() * 500 + 50;
            valid = true;

            for (const obs of obstacles) {
                const dist = Math.sqrt(Math.pow(x - obs.x, 2) + Math.pow(y - obs.y, 2));
                if (dist < minDistance) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        }

        if (valid) {
            obstacles.push({
                id: `obs_${Math.random().toString(36).substr(2, 9)}`,
                x: x,
                y: y,
                type: Math.random() > 0.5 ? 'crateWood.png' : 'crateMetal.png',
                width: 28,
                height: 28
            });
        }
    }
    return obstacles;
}

function findSafeSpawnPosition(obstacles: any[]): { x: number, y: number } {
    const tankRadius = 20;
    const obstacleRadius = 20; // Approx
    let safe = false;
    let x = 0;
    let y = 0;
    let attempts = 0;

    while (!safe && attempts < 100) {
        x = Math.random() * 700 + 50; // Keep away from edges (0-800)
        y = Math.random() * 500 + 50; // Keep away from edges (0-600)
        safe = true;

        for (const obs of obstacles) {
            const dist = Math.sqrt(Math.pow(x - obs.x, 2) + Math.pow(y - obs.y, 2));
            if (dist < tankRadius + obstacleRadius + 10) { // Add some buffer
                safe = false;
                break;
            }
        }
        attempts++;
    }

    return { x, y };
}

io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);
    let currentRoomId: string | null = null;

    socket.on('createRoom', (config: any) => {
        const roomId = Math.random().toString(36).substr(2, 4).toUpperCase();

        const mapData = config?.mapData;
        const powerUpCount = config?.powerUpCount ?? 10;

        let obstacles = [];
        // Handle custom map data
        if (mapData && mapData.obstacles) {
            obstacles = mapData.obstacles.map((obs: any) => ({
                ...obs,
                id: obs.id || `obs_${Math.random().toString(36).substr(2, 9)}`
            }));
        } else {
            obstacles = generateObstacles();
        }

        // Generate Power-ups
        const powerUps: PowerUp[] = [];
        const hiddenPowerUps: Record<string, PowerUp> = {};
        const types: ('S+' | 'S-' | 'B+' | 'H+' | 'A' | 'M')[] = ['S+', 'S-', 'B+', 'H+', 'A', 'M'];

        // Shuffle obstacles to hide power-ups randomly
        const shuffledObstacles = [...obstacles].sort(() => 0.5 - Math.random());
        const crateObstacles = shuffledObstacles.filter(o => o.type.includes('crateWood'));

        for (let i = 0; i < powerUpCount; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const pu: PowerUp = {
                id: `pu_${Math.random().toString(36).substr(2, 9)}`,
                x: 0,
                y: 0,
                type: type,
                width: 20,
                height: 20
            };

            if (i < crateObstacles.length) {
                // Hide under crate
                const obs = crateObstacles[i];
                pu.x = obs.x;
                pu.y = obs.y;
                hiddenPowerUps[obs.id] = pu;
            } else {
                // Place in open
                const pos = findSafeSpawnPosition(obstacles); // Reuse spawn logic
                pu.x = pos.x;
                pu.y = pos.y;
                powerUps.push(pu);
            }
        }

        rooms[roomId] = {
            id: roomId,
            players: {},
            bullets: {},
            obstacles: obstacles,
            powerUps: powerUps,
            hiddenPowerUps: hiddenPowerUps
        };

        joinRoom(socket, roomId);
    });

    socket.on('joinRoom', (roomId: string) => {
        if (rooms[roomId]) {
            joinRoom(socket, roomId);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    function joinRoom(socket: Socket, roomId: string) {
        if (currentRoomId) {
            leaveRoom(socket);
        }

        currentRoomId = roomId;
        socket.join(roomId);
        const room = rooms[roomId];

        const spawnPos = findSafeSpawnPosition(room.obstacles);

        // Initialize new player
        room.players[socket.id] = {
            id: socket.id,
            x: spawnPos.x,
            y: spawnPos.y,
            bodyRotation: 0,
            turretRotation: 0,
            color: Object.keys(room.players).length % 2 === 0 ? 'blue' : 'red',
            health: 10
        };

        // Send room info to player
        // Send room info to player
        socket.emit('roomJoined', {
            roomId,
            players: room.players,
            obstacles: room.obstacles,
            powerUps: room.powerUps
        });

        // Broadcast new player to others in room
        socket.to(roomId).emit('newPlayer', room.players[socket.id]);
    }

    function leaveRoom(socket: Socket) {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                socket.to(currentRoomId).emit('playerDisconnected', socket.id);
            }
            socket.leave(currentRoomId);

            if (Object.keys(room.players).length === 0) {
                delete rooms[currentRoomId];
            }
            currentRoomId = null;
        }
    }

    socket.on('playerMovement', (movementData) => {
        if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].players[socket.id]) {
            const player = rooms[currentRoomId].players[socket.id];
            player.x = movementData.x;
            player.y = movementData.y;
            player.bodyRotation = movementData.bodyRotation;
            player.turretRotation = movementData.turretRotation;

            socket.to(currentRoomId).emit('playerMoved', player);
        }
    });

    socket.on('shoot', (shootData) => {
        if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].players[socket.id]) {
            const room = rooms[currentRoomId];
            const bulletId = Math.random().toString(36).substr(2, 9);
            const bullet = {
                id: bulletId,
                ownerId: socket.id,
                x: room.players[socket.id].x,
                y: room.players[socket.id].y,
                rotation: room.players[socket.id].turretRotation,
                vx: Math.cos(room.players[socket.id].turretRotation - Math.PI / 2) * 10,
                vy: Math.sin(room.players[socket.id].turretRotation - Math.PI / 2) * 10
            };
            room.bullets[bulletId] = bullet;
            io.to(currentRoomId).emit('bulletFired', bullet);
        }
    });

    socket.on('resetGame', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            room.obstacles = generateObstacles();
            // Reset players
            Object.keys(room.players).forEach(id => {
                const spawnPos = findSafeSpawnPosition(room.obstacles);
                room.players[id].x = spawnPos.x;
                room.players[id].y = spawnPos.y;
                room.players[id].health = 10;
            });
            io.to(currentRoomId).emit('gameReset', {
                players: room.players,
                obstacles: room.obstacles,
                powerUps: [] // Clear powerups on reset for now, or regenerate
            });
        }
    });

    socket.on('saveMap', (payload: { name: string, data: any[] }) => {
        const filePath = path.join(MAPS_DIR, `${payload.name}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(payload.data, null, 2));
            console.log(`Map saved to file: ${filePath}`);
        } catch (err) {
            console.error(`Error saving map: ${err}`);
        }
    });

    socket.on('loadMap', (name: string) => {
        const filePath = path.join(MAPS_DIR, `${name}.json`);
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                const mapData = JSON.parse(data);
                socket.emit('mapLoaded', mapData);
            } catch (err) {
                console.error(`Error loading map: ${err}`);
                socket.emit('error', 'Failed to load map');
            }
        } else {
            socket.emit('error', 'Map not found');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        leaveRoom(socket);
    });
});

// Game Loop on Server
setInterval(() => {
    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];

        // Update bullets
        Object.keys(room.bullets).forEach(id => {
            const bullet = room.bullets[id];
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;

            // Check collisions with obstacles
            for (const obstacle of room.obstacles) {
                if (checkCollision(bullet, obstacle)) {
                    io.to(roomId).emit('bulletExploded', { id: bullet.id, x: bullet.x, y: bullet.y, type: 'obstacle' });
                    delete room.bullets[id];
                    if (obstacle.type === 'crateWood.png') {
                        // Destroy crate
                        const index = room.obstacles.indexOf(obstacle);
                        if (index > -1) {
                            room.obstacles.splice(index, 1);
                        }
                        io.to(roomId).emit('obstacleDestroyed', obstacle.id);

                        // Spawn hidden power-up or auto-collect
                        if (room.hiddenPowerUps[obstacle.id]) {
                            const pu = room.hiddenPowerUps[obstacle.id];

                            // Auto-collect logic
                            if (room.players[bullet.ownerId]) {
                                const player = room.players[bullet.ownerId];
                                applyPowerUpEffect(io, roomId, player, pu);
                                io.to(roomId).emit('powerUpAutoCollected', {
                                    playerId: bullet.ownerId,
                                    type: pu.type,
                                    x: obstacle.x,
                                    y: obstacle.y
                                });
                            } else {
                                // Fallback if player gone: spawn it
                                room.powerUps.push(pu);
                                io.to(roomId).emit('powerUpSpawned', pu);
                            }
                            delete room.hiddenPowerUps[obstacle.id];
                        }
                    }
                    return;
                }
            }

            // Check collisions with players
            Object.keys(room.players).forEach(playerId => {
                if (playerId !== bullet.ownerId) {
                    const player = room.players[playerId];
                    if (checkCollision(bullet, { x: player.x, y: player.y, width: 38, height: 38 })) {
                        io.to(roomId).emit('bulletExploded', { id: bullet.id, x: bullet.x, y: bullet.y, type: 'player' });
                        delete room.bullets[id];

                        // Damage Player
                        player.health -= 1;
                        io.to(roomId).emit('healthUpdate', { id: playerId, health: player.health });
                        if (player.health <= 0) {
                            // Player Died
                            io.to(roomId).emit('playerDied', playerId);
                            delete room.players[playerId];
                        }
                        return;
                    }
                }
            });

            // Remove out of bounds
            if (bullet.x < 0 || bullet.x > 4000 || bullet.y < 0 || bullet.y > 4000) {
                delete room.bullets[id];
            }
        });

        // Check Power-up Collisions
        for (let i = room.powerUps.length - 1; i >= 0; i--) {
            const pu = room.powerUps[i];
            let collected = false;
            const playerIds = Object.keys(room.players);

            for (const playerId of playerIds) {
                const player = room.players[playerId];
                if (checkCollision(pu, { x: player.x, y: player.y })) {
                    // Apply Effect
                    applyPowerUpEffect(io, roomId, player, pu);
                    collected = true;
                    break; // Stop checking other players
                }
            }

            if (collected) {
                room.powerUps.splice(i, 1);
                io.to(roomId).emit('powerUpCollected', pu.id);
            }
        }
    });
}, 1000 / 60);

function checkCollision(a: any, b: any) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 20; // Simple radius check
}

function applyPowerUpEffect(io: any, roomId: string, player: PlayerState, pu: PowerUp) {
    switch (pu.type) {
        case 'S+':
            io.to(roomId).emit('statUpdate', { id: player.id, stat: 'speed', value: 5, duration: 5000 });
            break;
        case 'S-':
            io.to(roomId).emit('statUpdate', { id: player.id, stat: 'speed', value: 1.5, duration: 5000 });
            break;
        case 'H+':
            player.health = Math.min(player.health + 3, 10);
            io.to(roomId).emit('healthUpdate', { id: player.id, health: player.health });
            break;
        case 'A':
            io.to(roomId).emit('armorUpdate', { id: player.id, value: 5 });
            break;
        case 'B+':
            // Placeholder
            break;
        case 'M':
            io.to(roomId).emit('statUpdate', { id: player.id, stat: 'machineGun', value: 1, duration: 10000 });
            break;
    }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
