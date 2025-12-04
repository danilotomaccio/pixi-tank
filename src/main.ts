import './style.css';
import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { loadTextureAtlas, textures } from './utils/AssetLoader';
import { Player } from './entities/Player';
import { Bullet } from './entities/Bullet';
import { Explosion } from './entities/Explosion';
import { MenuScene } from './scenes/MenuScene';
import { EditorScene } from './scenes/EditorScene';

const app = new PIXI.Application();

// Game State
let socket: Socket;
let players: Record<string, Player> = {};
let bullets: Record<string, Bullet> = {};
let obstacles: Record<string, PIXI.Sprite> = {};
let myId: string | null = null;
let gameLoop: ((ticker: PIXI.Ticker) => void) | null = null;

async function init() {
  // Initialize PixiJS
  await app.init({ resizeTo: window, backgroundColor: 0x1099bb });
  document.body.appendChild(app.canvas);

  // Load Assets
  await loadTextureAtlas('allSprites_default.xml', 'allSprites_default.png');

  // Create Background
  createBackground();

  // Start Menu
  startMenu();
}

function createBackground() {
  const texture = textures['tileSand1.png'];
  const tilingSprite = new PIXI.TilingSprite({
    texture,
    width: app.screen.width,
    height: app.screen.height,
  });
  app.stage.addChildAt(tilingSprite, 0); // Always at bottom

  app.renderer.on('resize', () => {
    tilingSprite.width = app.screen.width;
    tilingSprite.height = app.screen.height;
  });
}

function startMenu() {
  const menu = new MenuScene(app, () => startGame('create'), (roomId) => startGame('join', roomId), startEditor);
  app.stage.addChild(menu);
}

function startEditor() {
  setupSocket(); // Ensure socket is connected
  const editor = new EditorScene(app, startMenu);
  app.stage.addChild(editor);

  // Inject socket methods into editor (hacky but works for now without refactoring EditorScene signature too much)
  (editor as any).saveMap = (name: string, data: any) => {
    socket.emit('saveMap', { name, data });
  };
  (editor as any).loadMap = (name: string) => {
    socket.emit('loadMap', name);
  };

  socket.off('mapLoaded'); // Remove old listeners
  socket.on('mapLoaded', (mapData: any) => {
    if (mapData) {
      (editor as any).setObstacles(mapData);
    } else {
      alert('Map not found');
    }
  });
}

function startGame(mode: 'create' | 'join', roomId?: string) {
  // Connect to Server
  setupSocket();

  if (mode === 'create') {
    socket.emit('createRoom');
  } else if (mode === 'join' && roomId) {
    socket.emit('joinRoom', roomId);
  }

  // Game Loop
  gameLoop = () => {
    // Update local player
    if (myId && players[myId]) {
      const player = players[myId];
      player.update(Object.values(obstacles));

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
  };
  app.ticker.add(gameLoop);
}

function setupSocket() {
  if (socket) return; // Already connected

  // Connect to the server
  socket = io('http://localhost:3000');

  socket.on('connect', () => {
    console.log('Connected to server');
    myId = socket.id || null;
  });

  socket.on('roomJoined', (data: any) => {
    console.log(`Joined room: ${data.roomId}`);

    // Display Room Code
    const roomCodeText = new PIXI.Text({
      text: `Room: ${data.roomId}`, style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xffffff,
        align: 'right'
      }
    });
    roomCodeText.x = app.screen.width - 150;
    roomCodeText.y = 20;
    app.stage.addChild(roomCodeText);

    // Clear existing state
    Object.keys(players).forEach(id => removePlayer(id));
    Object.keys(obstacles).forEach(id => {
      app.stage.removeChild(obstacles[id]);
      delete obstacles[id];
    });

    // Load room state
    Object.keys(data.players).forEach(id => {
      addPlayer(id, data.players[id]);
    });
    data.obstacles.forEach((obs: any) => {
      createObstacle(obs);
    });
  });

  socket.on('error', (msg: string) => {
    alert(msg);
    location.reload(); // Simple error handling
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

  socket.on('healthUpdate', (data: any) => {
    if (players[data.id]) {
      players[data.id].updateHealth(data.health, 10);
    }
  });

  socket.on('playerDied', (id: string) => {
    if (players[id]) {
      // Explosion effect
      const explosion = new Explosion(players[id].x, players[id].y);
      app.stage.addChild(explosion);

      removePlayer(id);

      if (id === myId) {
        // Local player died
        alert("You Died!");
        // Optionally return to menu or spectate
        // For now, reload to restart
        location.reload();
      }
    }
  });

  socket.on('gameReset', (data: any) => {
    // Clear obstacles
    Object.keys(obstacles).forEach(id => {
      app.stage.removeChild(obstacles[id]);
    });
    obstacles = {};

    // Recreate obstacles
    data.obstacles.forEach((obs: any) => {
      createObstacle(obs);
    });

    // Update players
    Object.keys(data.players).forEach(id => {
      if (players[id]) {
        players[id].x = data.players[id].x;
        players[id].y = data.players[id].y;
      }
    });
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

  if (info.health !== undefined) {
    player.updateHealth(info.health, 10);
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
