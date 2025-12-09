import * as PIXI from 'pixi.js';
import { Player } from '../entities/Player';
import { ButtonBlock } from '../entities/ButtonBlock';
import { Bullet } from '../entities/Bullet';
import { Explosion } from '../entities/Explosion';

export class MenuScene extends PIXI.Container {
    private app: PIXI.Application;
    private player: Player;
    private buttons: ButtonBlock[] = [];
    private bullets: Bullet[] = [];
    private onStartGame: (config: { mapData?: any, powerUpCount: number }) => void;
    private onJoinGame: (roomId: string) => void;
    private onStartEditor: () => void;
    private statusText: PIXI.Text;
    private socket: any;
    private configModal: HTMLDivElement | null = null;
    private getInput: () => { x: number, y: number, shoot: boolean } | null;

    constructor(app: PIXI.Application, onStartGame: (config: { mapData?: any, powerUpCount: number }) => void, onJoinGame: (roomId: string) => void, onStartEditor: () => void, socket: any, getInput: () => { x: number, y: number, shoot: boolean } | null) {
        super();
        this.app = app;
        this.onStartGame = onStartGame;
        this.onJoinGame = onJoinGame;
        this.onStartEditor = onStartEditor;
        this.socket = socket;
        this.getInput = getInput;

        // Status Text
        this.statusText = new PIXI.Text({
            text: 'Checking Server...',
            style: {
                fontFamily: 'Arial',
                fontSize: 18,
                fill: 0xffffff,
                align: 'left'
            }
        });
        this.statusText.x = 20;
        this.statusText.y = 20;
        this.addChild(this.statusText);

        this.checkConnection();

        // Player
        this.player = new Player('menu_player', app, true, 'blue');
        this.player.x = app.screen.width / 2;
        this.player.y = app.screen.height - 100;
        this.addChild(this.player);

        this.player.on('shoot', (data) => {
            const bullet = new Bullet(`bullet_${Math.random()}`, data.ownerId, data.x, data.y, data.rotation);
            this.bullets.push(bullet);
            this.addChild(bullet);
        });

        // Buttons
        this.createButtons();

        // Loop
        this.app.ticker.add(this.update, this);

        // Resize
        this.app.renderer.on('resize', this.onResize);
    }

    private createButtons() {
        // Clear existing buttons
        this.buttons.forEach(btn => btn.destroy());
        this.buttons = [];

        const isSmallScreen = this.app.screen.width < 600;
        const spacing = isSmallScreen ? 120 : 200;
        const startX = this.app.screen.width / 2;
        const startY = isSmallScreen ? this.app.screen.height / 2 - 200 : 200;

        const btn1 = new ButtonBlock('btn_match', 0, 0, 'new-match');
        const btn2 = new ButtonBlock('btn_join', 0, 0, 'join-match');
        const btn3 = new ButtonBlock('btn_map', 0, 0, 'create-map');
        const btn4 = new ButtonBlock('btn_settings', 0, 0, 'settings');

        const allButtons = [btn1, btn2, btn3, btn4];

        if (isSmallScreen) {
            // Vertical Stack
            allButtons.forEach((btn, index) => {
                btn.x = startX;
                btn.y = startY + index * spacing;
            });
        } else {
            // Horizontal Row
            const totalWidth = spacing * (allButtons.length - 1);
            const rowStartX = this.app.screen.width / 2 - totalWidth / 2;
            allButtons.forEach((btn, index) => {
                btn.x = rowStartX + index * spacing;
                btn.y = startY;
            });
        }

        this.buttons.push(...allButtons);
        this.addChild(...allButtons);

        // Add click listeners
        allButtons.forEach(btn => {
            btn.on('click', () => this.handleButtonAction(btn));
        });
    }

    private onResize = () => {
        this.player.x = this.app.screen.width / 2;
        this.player.y = this.app.screen.height - 100;
        this.createButtons();
    };

    private showConfigModal() {
        if (this.configModal) return;

        this.configModal = document.createElement('div');
        this.configModal.style.position = 'absolute';
        this.configModal.style.top = '50%';
        this.configModal.style.left = '50%';
        this.configModal.style.transform = 'translate(-50%, -50%)';
        this.configModal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        this.configModal.style.padding = '20px';
        this.configModal.style.borderRadius = '10px';
        this.configModal.style.color = 'white';
        this.configModal.style.display = 'flex';
        this.configModal.style.flexDirection = 'column';
        this.configModal.style.gap = '10px';
        this.configModal.style.zIndex = '1000';

        const title = document.createElement('h2');
        title.innerText = 'Match Configuration';
        this.configModal.appendChild(title);

        // Power-up Count
        const powerUpContainer = document.createElement('div');
        powerUpContainer.innerHTML = '<label>Total Power-ups: </label>';
        const powerUpInput = document.createElement('input');
        powerUpInput.type = 'number';
        powerUpInput.value = '10';
        powerUpInput.min = '0';
        powerUpInput.max = '50';
        powerUpContainer.appendChild(powerUpInput);
        this.configModal.appendChild(powerUpContainer);

        // Map Upload
        const mapContainer = document.createElement('div');
        mapContainer.innerHTML = '<label>Load Map (Optional): </label>';
        const mapInput = document.createElement('input');
        mapInput.type = 'file';
        mapInput.accept = '.json';
        mapContainer.appendChild(mapInput);
        this.configModal.appendChild(mapContainer);

        let loadedMapData: any = null;
        mapInput.onchange = (e: any) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        loadedMapData = JSON.parse(ev.target?.result as string);
                    } catch (err) {
                        alert('Invalid Map File');
                        mapInput.value = '';
                        loadedMapData = null;
                    }
                };
                reader.readAsText(file);
            } else {
                loadedMapData = null;
            }
        };

        // Buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.marginTop = '10px';

        const startBtn = document.createElement('button');
        startBtn.innerText = 'Start Match';
        startBtn.onclick = () => {
            const count = parseInt(powerUpInput.value) || 0;
            this.destroyModal();
            this.destroyScene();
            this.onStartGame({ mapData: loadedMapData, powerUpCount: count });
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = () => {
            this.destroyModal();
        };

        btnContainer.appendChild(startBtn);
        btnContainer.appendChild(cancelBtn);
        this.configModal.appendChild(btnContainer);

        document.body.appendChild(this.configModal);
    }

    private destroyModal() {
        if (this.configModal && this.configModal.parentNode) {
            this.configModal.parentNode.removeChild(this.configModal);
        }
        this.configModal = null;
    }

    public update() {
        if (this.destroyed) return;

        // Update Player
        // Treat buttons as obstacles for collision
        const obstacleSprites = this.buttons.map(b => b.sprite);
        // Hack: Player expects sprites with x/y, but buttons are containers. 
        // We need to pass objects with x/y/width/height/radius
        // Or just pass the buttons themselves since they have x/y
        // But Player.ts expects Sprite[] and checks .x .y. ButtonBlock is Container (has x/y).
        // However, collision logic uses radius. ButtonBlock is 100x100.
        // Let's just pass them as any[] for now or fix Player.ts later.
        // Check Mobile Input
        if (this.getInput) {
            const input = this.getInput();
            if (input) {
                this.player.joystickInput = { x: input.x, y: input.y };
                this.player.triggerHeld = input.shoot;
            }
        }

        this.player.update(this.buttons as any[]);

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update();

            // Check collision with buttons
            let hit = false;
            for (const btn of this.buttons) {
                if (this.checkCollision(bullet, btn)) {
                    this.createExplosion(bullet.x, bullet.y);
                    this.removeChild(bullet);
                    this.bullets.splice(i, 1);
                    hit = true;

                    if (btn.isDestructible) {
                        this.handleButtonAction(btn);
                    }
                    break;
                }
            }

            if (!hit) {
                // Bounds check
                if (bullet.x < 0 || bullet.x > this.app.screen.width || bullet.y < 0 || bullet.y > this.app.screen.height) {
                    this.removeChild(bullet);
                    this.bullets.splice(i, 1);
                }
            }
        }
    }

    private checkCollision(bullet: Bullet, btn: ButtonBlock): boolean {
        const dx = bullet.x - btn.x;
        const dy = bullet.y - btn.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < 50; // Button radius approx
    }

    private createExplosion(x: number, y: number) {
        const explosion = new Explosion(x, y);
        this.addChild(explosion);
    }

    private handleButtonAction(btn: ButtonBlock) {
        if (btn.type === 'new-match') {
            this.showConfigModal();
        } else if (btn.type === 'join-match') {
            const roomId = prompt("Enter Room Code:");
            if (roomId) {
                this.destroyScene();
                this.onJoinGame(roomId);
            }
        } else if (btn.type === 'create-map') {
            this.destroyScene();
            this.onStartEditor();
        }
    }

    public destroyScene() {
        this.destroyModal();
        this.app.ticker.remove(this.update, this);
        this.app.renderer.off('resize', this.onResize);
        this.destroy({ children: true });
    }
    private checkConnection() {
        if (this.socket && this.socket.connected) {
            this.statusText.text = 'Server: Online';
            this.statusText.style.fill = 0x00ff00;
        } else {
            this.statusText.text = 'Server: Offline (Connecting...)';
            this.statusText.style.fill = 0xff0000;
        }

        if (this.socket) {
            this.socket.on('connect', () => {
                if (!this.destroyed) {
                    this.statusText.text = 'Server: Online';
                    this.statusText.style.fill = 0x00ff00;
                }
            });
            this.socket.on('disconnect', () => {
                if (!this.destroyed) {
                    this.statusText.text = 'Server: Offline';
                    this.statusText.style.fill = 0xff0000;
                }
            });
            this.socket.on('connect_error', () => {
                if (!this.destroyed) {
                    this.statusText.text = 'Server: Unreachable';
                    this.statusText.style.fill = 0xff0000;
                }
            });
        }
    }
}
