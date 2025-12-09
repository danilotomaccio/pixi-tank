import * as PIXI from 'pixi.js';

export class ShootButton extends PIXI.Container {
    private outer: PIXI.Graphics;
    public isPressed: boolean = false;
    private radius: number;
    private pointerId: number | null = null;

    constructor(radius: number = 40) {
        super();
        this.radius = radius;

        this.outer = new PIXI.Graphics();
        this.drawButton(false);
        this.addChild(this.outer);

        // Icon or Text
        const text = new PIXI.Text({
            text: 'FIRE',
            style: {
                fontFamily: 'Arial',
                fontSize: 16,
                fontWeight: 'bold',
                fill: 0xffffff
            }
        });
        text.anchor.set(0.5);
        this.addChild(text);

        this.interactive = true;
        this.on('pointerdown', this.onDown, this);
        this.on('pointerup', this.onUp, this);
        this.on('pointerupoutside', this.onUp, this);
    }

    private drawButton(pressed: boolean) {
        this.outer.clear();
        this.outer.circle(0, 0, this.radius);
        if (pressed) {
            this.outer.fill({ color: 0xff4500, alpha: 0.8 }); // Lit up
            this.outer.stroke({ width: 4, color: 0xffffff, alpha: 1 });
        } else {
            this.outer.fill({ color: 0xff0000, alpha: 0.5 }); // Normal
            this.outer.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        }
    }

    private onDown(event: PIXI.FederatedPointerEvent) {
        if (!this.isPressed) {
            this.isPressed = true;
            this.pointerId = event.pointerId;
            this.drawButton(true);
            this.emit('pointerdown', event); // Re-emit for external listeners if needed
        }
    }

    private onUp(event: PIXI.FederatedPointerEvent) {
        if (this.isPressed && this.pointerId === event.pointerId) {
            this.isPressed = false;
            this.pointerId = null;
            this.drawButton(false);
            this.emit('pointerup', event);
        }
    }
}
