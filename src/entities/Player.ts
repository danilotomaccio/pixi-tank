
import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';

export class Player extends PIXI.Container {
    public id: string;
    public body: PIXI.Sprite;
    public turret: PIXI.Container;
    public speed: number = 3;
    public isLocal: boolean;
    private keys: any = {};
    private app: PIXI.Application;
    private healthBar: PIXI.Graphics;

    constructor(id: string, app: PIXI.Application, isLocal: boolean, color: 'blue' | 'red') {
        super();
        this.id = id;
        this.app = app;
        this.isLocal = isLocal;

        // Create Body
        const bodyTexture = textures[`tankBody_${color}.png`];
        this.body = new PIXI.Sprite(bodyTexture);
        this.body.anchor.set(0.5);
        this.addChild(this.body);

        // Turret
        this.turret = new PIXI.Container();
        const turretTexture = textures[`tank${color === 'blue' ? 'Blue' : 'Red'}_barrel1.png`];
        const turretSprite = new PIXI.Sprite(turretTexture);
        turretSprite.anchor.set(0.5, 0.75); // Pivot at back of turret
        this.turret.addChild(turretSprite);
        this.addChild(this.turret);

        // Health Bar
        this.healthBar = new PIXI.Graphics();
        this.healthBar.y = -40;
        this.addChild(this.healthBar);
        this.updateHealth(10, 10);

        if (isLocal) {
            this.setupInput();
        }
    }

    private setupInput(): void {
        const onKeyDown = (e: KeyboardEvent) => this.keys[e.key.toLowerCase()] = true;
        const onKeyUp = (e: KeyboardEvent) => this.keys[e.key.toLowerCase()] = false;
        const onMouseDown = () => {
            if (this.app.canvas) {
                this.emit('shoot', {
                    x: this.x,
                    y: this.y,
                    rotation: this.turret.rotation,
                    ownerId: this.id
                });
            }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mousedown', onMouseDown);

        // Store cleanup function
        (this as any).cleanupInput = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('mousedown', onMouseDown);
        };
    }

    public destroy(options?: any) {
        if ((this as any).cleanupInput) {
            (this as any).cleanupInput();
        }
        super.destroy(options);
    }

    public update(obstacles: PIXI.Sprite[]): void {
        let dx = 0;
        let dy = 0;

        if (this.keys['w']) dy -= 1;
        if (this.keys['s']) dy += 1;
        if (this.keys['a']) dx -= 1;
        if (this.keys['d']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            // Normalize vector
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;

            const nextX = this.x + dx * this.speed;
            const nextY = this.y + dy * this.speed;

            // Check collision with obstacles
            let collision = false;
            const tankRadius = 19; // 38/2
            const obstacleRadius = 14; // 28/2

            for (const obstacle of obstacles) {
                const dist = Math.sqrt(Math.pow(nextX - obstacle.x, 2) + Math.pow(nextY - obstacle.y, 2));
                if (dist < tankRadius + obstacleRadius) {
                    collision = true;
                    break;
                }
            }

            // Check canvas boundaries
            if (nextX < tankRadius || nextX > this.app.screen.width - tankRadius || nextY < tankRadius || nextY > this.app.screen.height - tankRadius) {
                collision = true;
            }

            if (!collision) {
                this.x = nextX;
                this.y = nextY;
            }

            // Rotate body to face movement direction
            this.body.rotation = Math.atan2(dy, dx) + Math.PI / 2;
        }

        // Rotate turret to face mouse
        if (this.app.canvas) { // Ensure canvas exists
            // Get global mouse position
            const mousePosition = this.app.stage.toLocal(this.app.renderer.events.pointer.global);
            const angle = Math.atan2(mousePosition.y - this.y, mousePosition.x - this.x);
            this.turret.rotation = angle - this.rotation + Math.PI / 2; // Adjust for container rotation if any, +90deg offset for sprite
        }
    }

    public setRemoteState(x: number, y: number, bodyRotation: number, turretRotation: number): void {
        this.x = x;
        this.y = y;
        this.body.rotation = bodyRotation;
        this.turret.rotation = turretRotation;
    }

    public updateHealth(current: number, max: number) {
        this.healthBar.clear();

        // Background (Red)
        this.healthBar.rect(-20, 0, 40, 5);
        this.healthBar.fill(0xff0000);

        // Foreground (Green)
        const percent = Math.max(0, current / max);
        this.healthBar.rect(-20, 0, 40 * percent, 5);
        this.healthBar.fill(0x00ff00);
    }
}
