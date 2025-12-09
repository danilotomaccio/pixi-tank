import './style.css';
import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { loadTextureAtlas, textures } from './utils/AssetLoader';
import { Player } from './entities/Player';
import { Bullet } from './entities/Bullet';
import { Explosion } from './entities/Explosion';
import { MenuScene } from './scenes/MenuScene';
import { EditorScene } from './scenes/EditorScene';
import { VirtualJoystick } from './ui/VirtualJoystick';
import { ShootButton } from './ui/ShootButton';

const app = new PIXI.Application();

// Game State
let socket: Socket;
let players: Record<string, Player> = {};
let bullets: Record<string, Bullet> = {};
let obstacles: Record<string, PIXI.Sprite> = {};
let powerUps: Record<string, PIXI.Container> = {};
let myId: string | null = null;
let gameLoop: ((ticker: PIXI.Ticker) => void) | null = null;
let handledExplosions: Set<string> = new Set();
let joystick: VirtualJoystick | null = null;
let shootButton: ShootButton | null = null;

// Layers
let gameContainer: PIXI.Container | null = null;
let uiContainer: PIXI.Container | null = null;

async function init() {
  // Initialize PixiJS
  await app.init({ resizeTo: window, backgroundColor: 0x1099bb });
  document.body.appendChild(app.canvas);

  // Load Assets
  await loadTextureAtlas('allSprites_default.xml', 'allSprites_default.png');

  // Create Background (added directly to stage, behind everything)
  createBackground();

  // Create UI Container & Mobile Controls immediately
  uiContainer = new PIXI.Container();
  // We'll add it to stage, but we need to make sure it stays on top.
  // Ideally, distinct layers.
  createMobileControls();

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
  tilingSprite.label = 'background';
  // Check if background already exists
  const existing = app.stage.children.find(c => c.label === 'background');
  if (existing) app.stage.removeChild(existing);

  app.stage.addChildAt(tilingSprite, 0); // Always at bottom

  app.renderer.on('resize', () => {
    tilingSprite.width = app.screen.width;
    tilingSprite.height = app.screen.height;
  });
}

function startMenu() {
  cleanupGame();

  // Re-add background because cleanup might have wiped it if not careful, 
  // but we can just clear children and re-add.
  while (app.stage.children.length > 0) {
    app.stage.removeChildren();
  }
  // Create Background (added directly to stage, behind everything)
  createBackground();

  // Make sure UI container is on top
  if (uiContainer && uiContainer.parent) uiContainer.parent.removeChild(uiContainer);
  if (uiContainer) app.stage.addChild(uiContainer);

  setupSocket();
  const menu = new MenuScene(
    app,
    (config) => startGame('create', undefined, config),
    (roomId) => startGame('join', roomId),
    startEditor,
    socket,
    () => {
      if (joystick && shootButton) {
        return { x: joystick.value.x, y: joystick.value.y, shoot: shootButton.isPressed };
      }
      return null;
    }
  );
  app.stage.addChild(menu);
}

function startEditor() {
  cleanupGame();

  while (app.stage.children.length > 0) {
    app.stage.removeChildren();
  }
  createBackground();

  setupSocket();
  const editor = new EditorScene(app, startMenu);
  app.stage.addChild(editor);

  (editor as any).loadMap = (name: string) => {
    socket.emit('loadMap', name);
  };

  socket.off('mapLoaded');
  socket.on('mapLoaded', (mapData: any) => {
    if (mapData) {
      (editor as any).setObstacles(mapData);
    } else {
      alert('Map not found');
    }
  });
}

function cleanupGame() {
  if (gameLoop) {
    app.ticker.remove(gameLoop);
    gameLoop = null;
  }
  gameContainer = null;
  uiContainer = null;
  players = {};
  bullets = {};
  obstacles = {};
  powerUps = {};
  handledExplosions.clear();
}

function startGame(mode: 'create' | 'join', roomId?: string, config?: { mapData?: any, powerUpCount: number }) {
  cleanupGame();

  while (app.stage.children.length > 0) {
    app.stage.removeChildren();
  }
  createBackground();

  // Init Layers
  gameContainer = new PIXI.Container(); // This will be the camera
  app.stage.addChild(gameContainer);

  // Re-add UI container to be on top
  if (uiContainer && uiContainer.parent) uiContainer.parent.removeChild(uiContainer);
  if (uiContainer) app.stage.addChild(uiContainer);

  setupSocket();

  if (mode === 'create') {
    socket.emit('createRoom', config);
  } else if (mode === 'join' && roomId) {
    socket.emit('joinRoom', roomId);
  }

  // Mobile Controls - already created in init, just ensure visible
  if (joystick && shootButton) {
    joystick.visible = true;
    shootButton.visible = true;
  }

  // Game Loop
  gameLoop = () => {
    // Update local player
    if (myId && players[myId]) {
      const player = players[myId];
      player.update(Object.values(obstacles));

      // Camera Follow
      if (gameContainer) {
        gameContainer.pivot.set(player.x, player.y);
        gameContainer.position.set(app.screen.width / 2, app.screen.height / 2);

        // Optional: Parallax background?
        // For simple tiling sprite, we can just move it opposite to player but modulo
        const bg = app.stage.children.find(c => c.label === 'background') as PIXI.TilingSprite;
        if (bg) {
          bg.tilePosition.x = -player.x;
          bg.tilePosition.y = -player.y;
        }
      }

      // Pass Mobile Input
      if (joystick && shootButton) {
        player.joystickInput = joystick.value;
        player.triggerHeld = shootButton.isPressed;
      }

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
      const bullet = bullets[id];
      bullet.update();

      // Client-side prediction
      if (bullet.ownerId === myId) {
        for (const obsId in obstacles) {
          const obs = obstacles[obsId];
          if (checkCollision(bullet, obs)) {
            const explosion = new Explosion(bullet.x, bullet.y);
            if (gameContainer) gameContainer.addChild(explosion);

            if (gameContainer) gameContainer.removeChild(bullet);
            delete bullets[id];

            handledExplosions.add(id);
            break;
          }
        }
      }
    });
  };
  app.ticker.add(gameLoop);
}

function setupSocket() {
  if (socket) return;

  socket = io('http://172.20.79.29:3000');
  // socket = io('http://localhost:3000');

  socket.on('connect', () => {
    console.log('Connected to server');
    myId = socket.id || null;
  });

  socket.on('roomJoined', (data: any) => {
    console.log(`Joined room: ${data.roomId}`);

    const roomCodeText = new PIXI.Text({
      text: `Room: ${data.roomId}`, style: {
        fontFamily: 'Arial', fontSize: 24, fill: 0xffffff, align: 'right'
      }
    });
    roomCodeText.x = app.screen.width - 150;
    roomCodeText.y = 20;
    if (uiContainer) uiContainer.addChild(roomCodeText);

    // Load room state
    Object.keys(data.players).forEach(id => addPlayer(id, data.players[id]));
    data.obstacles.forEach((obs: any) => createObstacle(obs));
    if (data.powerUps) {
      data.powerUps.forEach((pu: any) => createPowerUp(pu));
    }
  });

  socket.on('error', (msg: string) => {
    alert(msg);
    location.reload();
  });

  socket.on('newPlayer', (playerInfo: any) => addPlayer(playerInfo.id, playerInfo));
  socket.on('playerDisconnected', (id: string) => removePlayer(id));

  socket.on('playerMoved', (playerInfo: any) => {
    if (players[playerInfo.id]) {
      if (playerInfo.id !== myId) {
        players[playerInfo.id].setRemoteState(
          playerInfo.x, playerInfo.y, playerInfo.bodyRotation, playerInfo.turretRotation
        );
      }
    }
  });

  socket.on('currentObstacles', (serverObstacles: any[]) => {
    serverObstacles.forEach(obs => createObstacle(obs));
  });

  socket.on('newBullet', (bulletInfo: any) => {
    const bullet = new Bullet(bulletInfo.id, bulletInfo.ownerId, bulletInfo.x, bulletInfo.y, bulletInfo.rotation);
    bullets[bullet.id] = bullet;
    if (gameContainer) gameContainer.addChild(bullet);
    if (players[bulletInfo.ownerId]) {
      players[bulletInfo.ownerId].showMuzzleFlash();
    }
  });

  socket.on('bulletExploded', (info: any) => {
    if (handledExplosions.has(info.id)) {
      handledExplosions.delete(info.id);
      return;
    }
    if (bullets[info.id]) {
      if (gameContainer) gameContainer.removeChild(bullets[info.id]);
      delete bullets[info.id];
    }
    const explosion = new Explosion(info.x, info.y);
    if (gameContainer) gameContainer.addChild(explosion);
  });

  socket.on('obstacleDestroyed', (id: string) => {
    if (obstacles[id]) {
      if (gameContainer) gameContainer.removeChild(obstacles[id]);
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
      const explosion = new Explosion(players[id].x, players[id].y);
      if (gameContainer) gameContainer.addChild(explosion);
      removePlayer(id);
      if (id === myId) {
        alert("You Died!");
        location.reload();
      }
    }
  });

  socket.on('gameReset', (data: any) => {
    Object.keys(obstacles).forEach(id => {
      if (gameContainer) gameContainer.removeChild(obstacles[id]);
    });
    obstacles = {};
    Object.keys(powerUps).forEach(id => {
      if (gameContainer) gameContainer.removeChild(powerUps[id]);
    });
    powerUps = {};

    data.obstacles.forEach((obs: any) => createObstacle(obs));
    if (data.powerUps) {
      data.powerUps.forEach((pu: any) => createPowerUp(pu));
    }

    Object.keys(data.players).forEach(id => {
      if (players[id]) {
        players[id].x = data.players[id].x;
        players[id].y = data.players[id].y;
      }
    });
  });

  socket.on('powerUpSpawned', (info: any) => createPowerUp(info));
  socket.on('powerUpCollected', (id: string) => {
    if (powerUps[id]) {
      if (gameContainer) gameContainer.removeChild(powerUps[id]);
      delete powerUps[id];
    }
  });

  socket.on('powerUpAutoCollected', (data: any) => animatePowerUpCollection(data));

  socket.on('statUpdate', (data: any) => {
    if (players[data.id]) {
      if (data.stat === 'speed') {
        players[data.id].setSpeed(data.value);
        if (data.duration > 0) {
          players[data.id].addStatusEffect('SPD', data.duration);
          setTimeout(() => { if (players[data.id]) players[data.id].setSpeed(3); }, data.duration);
        }
      } else if (data.stat === 'machineGun') {
        players[data.id].setMachineGun(true);
        players[data.id].addStatusEffect('MG', data.duration);
        setTimeout(() => { if (players[data.id]) players[data.id].setMachineGun(false); }, data.duration);
      }
    }
  });

  socket.on('armorUpdate', (data: any) => {
    if (players[data.id]) players[data.id].setArmor(data.value);
  });
}

function createObstacle(info: any) {
  const texture = textures[info.type];
  const sprite = new PIXI.Sprite(texture);
  sprite.x = info.x;
  sprite.y = info.y;
  sprite.anchor.set(0.5);
  obstacles[info.id] = sprite;
  if (gameContainer) gameContainer.addChild(sprite);
}

function createPowerUp(pu: any) {
  const text = new PIXI.Text({
    text: pu.type,
    style: {
      fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold',
      fill: getPowerUpColor(pu.type), stroke: { color: 0x000000, width: 3 }
    }
  });
  text.x = pu.x;
  text.y = pu.y;
  text.anchor.set(0.5);
  powerUps[pu.id] = text;
  if (gameContainer) gameContainer.addChild(text);
}

function createMobileControls() {
  if (joystick && joystick.parent) joystick.parent.removeChild(joystick);
  if (shootButton && shootButton.parent) shootButton.parent.removeChild(shootButton);

  joystick = new VirtualJoystick(60);
  joystick.x = app.screen.width - 100;
  joystick.y = app.screen.height - 100;

  shootButton = new ShootButton(50);
  shootButton.x = 100;
  shootButton.y = app.screen.height - 100;
  shootButton.on('pointerdown', () => {
    if (myId && players[myId]) {
      players[myId].triggerShoot();
    }
  });

  console.log('Mobile controls created. Joystick:', joystick.x, joystick.y, 'Button:', shootButton.x, shootButton.y);

  if (uiContainer) {
    uiContainer.addChild(joystick);
    uiContainer.addChild(shootButton);
  } else {
    // Should always have UI container now
    uiContainer = new PIXI.Container();
    app.stage.addChild(uiContainer);
    uiContainer.addChild(joystick);
    uiContainer.addChild(shootButton);
  }

  const updatePositions = () => {
    if (joystick) {
      joystick.x = app.screen.width - 100;
      joystick.y = app.screen.height - 100;
    }
    if (shootButton) {
      shootButton.x = 100;
      shootButton.y = app.screen.height - 100;
    }
    console.log('Mobile controls resized. Screen:', app.screen.width, app.screen.height, 'Joystick:', joystick?.x, joystick?.y);
  };

  app.renderer.on('resize', updatePositions);
  updatePositions(); // Initial position update
}

function animatePowerUpCollection(data: any) {
  const targetPlayer = players[data.playerId];
  if (!targetPlayer) return;

  const text = new PIXI.Text({
    text: data.type,
    style: {
      fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold',
      fill: getPowerUpColor(data.type), stroke: { color: 0x000000, width: 3 }
    }
  });
  text.x = data.x;
  text.y = data.y;
  text.anchor.set(0.5);
  if (gameContainer) gameContainer.addChild(text);
  else app.stage.addChild(text);

  const duration = 500;
  const startTime = Date.now();
  const startX = data.x;
  const startY = data.y;

  const animate = () => {
    const now = Date.now();
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);

    if (targetPlayer && targetPlayer.parent) {
      text.x = startX + (targetPlayer.x - startX) * ease;
      text.y = startY + (targetPlayer.y - startY) * ease;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      text.destroy();
    }
  };
  requestAnimationFrame(animate);
}

function getPowerUpColor(type: string): number {
  switch (type) {
    case 'S+': return 0x00ff00;
    case 'S-': return 0xff0000;
    case 'H+': return 0xff00ff;
    case 'A': return 0x0000ff;
    case 'M': return 0xffa500;
    default: return 0xffffff;
  }
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
  if (gameContainer) gameContainer.addChild(player);
}

function removePlayer(id: string) {
  if (players[id]) {
    if (gameContainer) gameContainer.removeChild(players[id]);
    delete players[id];
  }
}

function checkCollision(a: any, b: any) {
  const bulletRadius = 2;
  const bWidth = b.width;
  const bHeight = b.height;
  const bLeft = b.x - bWidth / 2;
  const bRight = b.x + bWidth / 2;
  const bTop = b.y - bHeight / 2;
  const bBottom = b.y + bHeight / 2;

  const closestX = Math.max(bLeft, Math.min(a.x, bRight));
  const closestY = Math.max(bTop, Math.min(a.y, bBottom));
  const distanceX = a.x - closestX;
  const distanceY = a.y - closestY;

  return (distanceX * distanceX + distanceY * distanceY) < (bulletRadius * bulletRadius);
}

init();
