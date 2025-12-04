
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
    private statusContainer: PIXI.Container;
    private activeEffects: { type: string, endTime: number, container: PIXI.Container, bar: PIXI.Graphics, totalDuration: number }[] = [];
    private hasMachineGun: boolean = false;
    private isMouseDown: boolean = false;
    private lastShotTime: number = 0;
    private shotCooldown: number = 100; // ms for machine gun
    private turretSprite: PIXI.Sprite;
    private defaultBarrelTexture: PIXI.Texture;

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
        this.defaultBarrelTexture = turretTexture;
        this.turretSprite = new PIXI.Sprite(turretTexture);
        this.turretSprite.anchor.set(0.5, 0.75); // Pivot at back of turret
        this.turret.addChild(this.turretSprite);
        this.addChild(this.turret);

        // Health Bar
        this.healthBar = new PIXI.Graphics();
        this.healthBar.y = -40;
        this.addChild(this.healthBar);
        this.addChild(this.healthBar);
        this.updateHealth(10, 10);

        // Status Container
        this.statusContainer = new PIXI.Container();
        this.statusContainer.y = -60;
        this.addChild(this.statusContainer);

        if (isLocal) {
            this.setupInput();
        }
    }

    private setupInput(): void {
        const onKeyDown = (e: KeyboardEvent) => this.keys[e.key.toLowerCase()] = true;
        const onKeyUp = (e: KeyboardEvent) => this.keys[e.key.toLowerCase()] = false;
        const onMouseDown = () => {
            this.isMouseDown = true;
            if (!this.hasMachineGun) {
                this.shoot();
            }
        };
        const onMouseUp = () => {
            this.isMouseDown = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);

        // Store cleanup function
        (this as any).cleanupInput = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }

    private shoot() {
        if (this.app.canvas) {
            this.emit('shoot', {
                x: this.x,
                y: this.y,
                rotation: this.turret.rotation,
                ownerId: this.id
            });
        }
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

            // Machine Gun Shooting
            if (this.isLocal && this.hasMachineGun && this.isMouseDown) {
                const now = Date.now();
                if (now - this.lastShotTime > this.shotCooldown) {
                    this.shoot();
                    this.lastShotTime = now;
                }
            }
        }

        // Update Status Effects
        const now = Date.now();
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const effect = this.activeEffects[i];
            const remaining = effect.endTime - now;

            if (remaining <= 0) {
                this.statusContainer.removeChild(effect.container);
                this.activeEffects.splice(i, 1);
                this.repositionStatusEffects();
            } else {
                // Update Bar
                const percent = remaining / effect.totalDuration;
                effect.bar.clear();
                effect.bar.rect(0, 0, 30 * percent, 4);
                effect.bar.fill(0xffffff);
            }
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

    public setSpeed(speed: number) {
        this.speed = speed;
    }

    public setArmor(armor: number) {
        // Visual indicator for armor (e.g., blue outline or bar)
        // For now, let's just add a blue border to health bar if armor > 0
        if (armor > 0) {
            this.healthBar.stroke({ width: 2, color: 0x0000ff });
        } else {
            this.healthBar.stroke({ width: 0, color: 0x000000, alpha: 0 });
        }
    }

    public setMachineGun(active: boolean) {
        this.hasMachineGun = active;
        if (active) {
            this.turretSprite.texture = textures['specialBarrel1.png'];
        } else {
            this.turretSprite.texture = this.defaultBarrelTexture;
            this.isMouseDown = false; // Reset trigger
        }
    }

    public showMuzzleFlash() {
        const flash = new PIXI.Sprite(textures['shotOrange.png']);
        flash.anchor.set(0.5, 1);
        flash.y = -30; // Tip of barrel
        this.turret.addChild(flash);

        setTimeout(() => {
            this.turret.removeChild(flash);
        }, 50);
    }

    public addStatusEffect(type: string, duration: number) {
        // Check if exists, update time
        const existing = this.activeEffects.find(e => e.type === type);
        if (existing) {
            existing.endTime = Date.now() + duration;
            existing.totalDuration = duration;
            return;
        }

        const container = new PIXI.Container();

        // Icon (Text)
        const text = new PIXI.Text({
            text: type,
            style: {
                fontFamily: 'Arial',
                fontSize: 12,
                fontWeight: 'bold',
                fill: 0xffffff,
                stroke: { color: 0x000000, width: 2 }
            }
        });
        container.addChild(text);

        // Bar Background
        const bg = new PIXI.Graphics();
        bg.rect(0, 14, 30, 4);
        bg.fill(0x333333);
        container.addChild(bg);

        // Bar Foreground
        const bar = new PIXI.Graphics();
        bar.rect(0, 14, 30, 4);
        bar.fill(0xffffff);
        container.addChild(bar);

        this.statusContainer.addChild(container);
        this.activeEffects.push({
            type,
            endTime: Date.now() + duration,
            container,
            bar,
            totalDuration: duration
        });

        this.repositionStatusEffects();
    }

    private repositionStatusEffects() {
        let xOffset = -(this.activeEffects.length * 35) / 2;
        this.activeEffects.forEach((effect, index) => {
            effect.container.x = xOffset + index * 35;
        });
    }
}
