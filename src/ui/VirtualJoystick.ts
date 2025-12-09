import * as PIXI from 'pixi.js';

export class VirtualJoystick extends PIXI.Container {
    private outer: PIXI.Graphics;
    private inner: PIXI.Graphics;
    private radius: number;
    private dragging: boolean = false;
    private pointerId: number | null = null;
    public value: { x: number, y: number } = { x: 0, y: 0 };

    constructor(radius: number = 50) {
        super();
        this.radius = radius;

        this.outer = new PIXI.Graphics();
        this.outer.circle(0, 0, radius);
        this.outer.fill({ color: 0xffffff, alpha: 0.3 });
        this.outer.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        this.addChild(this.outer);

        this.inner = new PIXI.Graphics();
        this.inner.circle(0, 0, radius / 2);
        this.inner.fill({ color: 0xffffff, alpha: 0.5 });
        this.addChild(this.inner);

        this.interactive = true;
        this.on('pointerdown', this.onDragStart, this);
        this.on('pointermove', this.onDragMove, this);
        this.on('pointerup', this.onDragEnd, this);
        this.on('pointerupoutside', this.onDragEnd, this);
    }

    private onDragStart(event: PIXI.FederatedPointerEvent) {
        this.dragging = true;
        this.pointerId = event.pointerId;
        this.updateStick(event.global);
    }

    private onDragMove(event: PIXI.FederatedPointerEvent) {
        if (this.dragging && this.pointerId === event.pointerId) {
            this.updateStick(event.global);
        }
    }

    private onDragEnd(event: PIXI.FederatedPointerEvent) {
        if (this.dragging && this.pointerId === event.pointerId) {
            this.dragging = false;
            this.pointerId = null;
            this.inner.position.set(0, 0);
            this.value = { x: 0, y: 0 };
        }
    }

    private updateStick(globalPos: PIXI.Point) {
        const localPos = this.toLocal(globalPos);
        const distance = Math.sqrt(localPos.x * localPos.x + localPos.y * localPos.y);
        const angle = Math.atan2(localPos.y, localPos.x);

        const limit = this.radius;
        const cappedDist = Math.min(distance, limit);

        this.inner.x = Math.cos(angle) * cappedDist;
        this.inner.y = Math.sin(angle) * cappedDist;

        // Normalized value (-1 to 1)
        this.value = {
            x: this.inner.x / limit,
            y: this.inner.y / limit
        };
    }
}
