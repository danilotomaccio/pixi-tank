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
    private onStartGame: () => void;
    private onJoinGame: (roomId: string) => void;
    private onStartEditor: () => void;

    constructor(app: PIXI.Application, onStartGame: () => void, onJoinGame: (roomId: string) => void, onStartEditor: () => void) {
        super();
        this.app = app;
        this.onStartGame = onStartGame;
        this.onJoinGame = onJoinGame;
        this.onStartEditor = onStartEditor;

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
        this.app.ticker.add(this.update.bind(this));
    }

    private createButtons() {
        const spacing = 200;
        const startX = this.app.screen.width / 2 - spacing * 1.5;
        const y = 200;

        const btn1 = new ButtonBlock('btn_match', startX, y, 'new-match');
        const btn2 = new ButtonBlock('btn_join', startX + spacing, y, 'join-match');
        const btn3 = new ButtonBlock('btn_map', startX + spacing * 2, y, 'create-map');
        const btn4 = new ButtonBlock('btn_settings', startX + spacing * 3, y, 'settings');

        this.buttons.push(btn1, btn2, btn3, btn4);
        this.addChild(btn1, btn2, btn3, btn4);
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
            this.destroyScene();
            this.onStartGame();
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
        this.app.ticker.remove(this.update, this);
        this.destroy({ children: true });
    }
}
