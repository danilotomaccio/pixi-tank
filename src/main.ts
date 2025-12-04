import './style.css';
import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { loadTextureAtlas, textures } from './utils/AssetLoader';
import { Player } from './entities/Player';

import { Bullet } from './entities/Bullet';
import { Explosion } from './entities/Explosion';

const app = new PIXI.Application();

// Game State
let socket: Socket;
let players: Record<string, Player> = {};
let bullets: Record<string, Bullet> = {};
let obstacles: Record<string, PIXI.Sprite> = {};
let myId: string | null = null;

async function init() {
  // Initialize PixiJS
  await app.init({ width: 800, height: 600, backgroundColor: 0x1099bb });
  document.body.appendChild(app.canvas);

  // Load Assets
  await loadTextureAtlas('allSprites_default.xml', 'allSprites_default.png');

  // Create Background
  createBackground();

  // Connect to Server
  setupSocket();

  // Game Loop
  app.ticker.add(() => {
    // Update local player
    if (myId && players[myId]) {
      const player = players[myId];

      // Emit movement if changed
      if (socket) {
        socket.emit('playerMovement', {
          x: player.x,
          y: player.y,
          bodyRotation: player.body.rotation,
          turretRotation: player.turret.rotation
        });
      }
    }

    // Update bullets
    Object.keys(bullets).forEach(id => {
      bullets[id].update();
    });
  });
}

function createBackground() {
  const texture = textures['tileSand1.png'];
  const tilingSprite = new PIXI.TilingSprite({
    texture,
    width: app.screen.width,
    height: app.screen.height,
  });
  app.stage.addChild(tilingSprite);
}

function setupSocket() {
  // Connect to the server (assuming localhost:3000 for now)
  socket = io('http://localhost:3000');

  socket.on('connect', () => {
    console.log('Connected to server');
    myId = socket.id || null;
  });

  socket.on('currentPlayers', (serverPlayers: any) => {
    Object.keys(serverPlayers).forEach((id) => {
      if (!players[id]) {
        addPlayer(id, serverPlayers[id]);
      }
    });
  });

  socket.on('newPlayer', (playerInfo: any) => {
    addPlayer(playerInfo.id, playerInfo);
  });

  socket.on('playerDisconnected', (id: string) => {
    removePlayer(id);
  });

  socket.on('playerMoved', (playerInfo: any) => {
    if (players[playerInfo.id]) {
      // Don't update self from server to avoid lag/jitter (client prediction/authoritative)
      if (playerInfo.id !== myId) {
        players[playerInfo.id].setRemoteState(
          playerInfo.x,
          playerInfo.y,
          playerInfo.bodyRotation,
          playerInfo.turretRotation
        );
      }
    }
  });

  socket.on('currentObstacles', (serverObstacles: any[]) => {
    serverObstacles.forEach(obs => {
      createObstacle(obs);
    });
  });

  socket.on('bulletFired', (bulletInfo: any) => {
    const bullet = new Bullet(bulletInfo.id, bulletInfo.ownerId, bulletInfo.x, bulletInfo.y, bulletInfo.rotation);
    bullets[bullet.id] = bullet;
    app.stage.addChild(bullet);
  });

  socket.on('bulletExploded', (info: any) => {
    if (bullets[info.id]) {
      app.stage.removeChild(bullets[info.id]);
      delete bullets[info.id];
    }
    const explosion = new Explosion(info.x, info.y);
    app.stage.addChild(explosion);
  });

  socket.on('obstacleDestroyed', (id: string) => {
    if (obstacles[id]) {
      app.stage.removeChild(obstacles[id]);
      delete obstacles[id];
    }
  });
}

function createObstacle(info: any) {
  const texture = textures[info.type];
  const sprite = new PIXI.Sprite(texture);
  sprite.x = info.x;
  sprite.y = info.y;
  sprite.anchor.set(0.5);
  obstacles[info.id] = sprite;
  app.stage.addChild(sprite);
}

function addPlayer(id: string, info: any) {
  const isLocal = id === socket.id;
  const player = new Player(id, app, isLocal, info.color);
  player.x = info.x;
  player.y = info.y;

  if (isLocal) {
    player.on('shoot', (data) => {
      socket.emit('shoot', data);
    });
  }

  players[id] = player;
  app.stage.addChild(player);
}

function removePlayer(id: string) {
  if (players[id]) {
    app.stage.removeChild(players[id]);
    delete players[id];
  }
}

init();
