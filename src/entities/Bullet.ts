import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';

export class Bullet extends PIXI.Sprite {
    public id: string;
    public ownerId: string;
    public vx: number;
    public vy: number;
    public speed: number = 10;

    constructor(id: string, ownerId: string, x: number, y: number, rotation: number) {
        super(textures['bulletBlue1.png']);
        this.id = id;
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.anchor.set(0.5);

        this.vx = Math.cos(rotation - Math.PI / 2) * this.speed;
        this.vy = Math.sin(rotation - Math.PI / 2) * this.speed;
    }

    public update() {
        this.x += this.vx;
        this.y += this.vy;
    }
}
