import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';

export class Explosion extends PIXI.AnimatedSprite {
    constructor(x: number, y: number) {
        const frames = [
            textures['explosion1.png'],
            textures['explosion2.png'],
            textures['explosion3.png'],
            textures['explosion4.png'],
            textures['explosion5.png']
        ];
        super(frames);
        this.x = x;
        this.y = y;
        this.anchor.set(0.5);
        this.animationSpeed = 0.2;
        this.loop = false;
        this.onComplete = () => {
            this.destroy();
        };
        this.play();
    }
}
