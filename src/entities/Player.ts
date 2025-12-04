import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';

export class Player extends PIXI.Container {
    public id: string;
    public body: PIXI.Sprite;
    public turret: PIXI.Sprite;
    public speed: number = 3;
    private keys: Record<string, boolean> = {};
    private app: PIXI.Application;

    constructor(id: string, app: PIXI.Application, isLocal: boolean = false, color: 'blue' | 'red' = 'blue') {
        super();
        this.id = id;
        this.app = app;

        // Create Body
        const bodyTexture = textures[`tankBody_${color}.png`];
        this.body = new PIXI.Sprite(bodyTexture);
        this.body.anchor.set(0.5);
        this.addChild(this.body);

        // Create Turret
        const turretTexture = textures[`tank${color === 'blue' ? 'Blue' : 'Red'}_barrel1.png`];
        this.turret = new PIXI.Sprite(turretTexture);
        this.turret.anchor.set(0.5, 1.0); // Anchor at the bottom (pivot point)
        this.addChild(this.turret);

        if (isLocal) {
            this.setupInput();
            this.app.ticker.add(this.update.bind(this));
        }
    }

    private setupInput(): void {
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener('mousedown', () => {
            if (this.app.canvas) {
                this.emit('shoot', {
                    x: this.x,
                    y: this.y,
                    rotation: this.turret.rotation,
                    ownerId: this.id
                });
            }
        });
    }

    public update(): void {
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

            this.x += dx * this.speed;
            this.y += dy * this.speed;

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
}
