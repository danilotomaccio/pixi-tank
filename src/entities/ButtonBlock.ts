import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';

export class ButtonBlock extends PIXI.Container {
    public id: string;
    public type: 'new-match' | 'create-map' | 'settings' | 'join-match';
    public sprite: PIXI.Sprite;
    public labelText: PIXI.Text;
    public isDestructible: boolean;

    constructor(id: string, x: number, y: number, type: 'new-match' | 'create-map' | 'settings' | 'join-match') {
        super();
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;

        this.isDestructible = type !== 'settings';
        const textureName = this.isDestructible ? 'crateWood.png' : 'crateMetal.png';

        this.sprite = new PIXI.Sprite(textures[textureName]);
        this.sprite.anchor.set(0.5);
        this.sprite.width = 100; // Larger than normal crates
        this.sprite.height = 100;
        this.addChild(this.sprite);

        let labelText = '';
        switch (type) {
            case 'new-match': labelText = 'New Match'; break;
            case 'create-map': labelText = 'Create Map'; break;
            case 'settings': labelText = 'Settings'; break;
            case 'join-match': labelText = 'Join Match'; break;
        }

        this.labelText = new PIXI.Text({
            text: labelText, style: {
                fontFamily: 'Arial',
                fontSize: 16,
                fill: 0xffffff,
                align: 'center',
                stroke: { color: 0x000000, width: 4 }
            }
        });
        this.labelText.anchor.set(0.5);
        this.addChild(this.labelText);

        this.interactive = true;
        this.cursor = 'pointer';
        this.on('pointerdown', () => this.emit('click'));
    }
}
