import * as PIXI from 'pixi.js';
import { textures } from '../utils/AssetLoader';
import { EditorUI } from '../ui/EditorUI';

export class EditorScene extends PIXI.Container {
    private app: PIXI.Application;
    private grid: PIXI.Graphics;
    private groundLayer: PIXI.Container;
    private objectLayer: PIXI.Container;
    private groundTiles: PIXI.Sprite[] = [];
    private obstacles: PIXI.Sprite[] = [];
    private ui: EditorUI;
    private selectedType: string = 'crateWood.png';
    private onExit: () => void;

    private boundResize: () => void;
    private boundKeyDown: (e: KeyboardEvent) => void;
    private boundKeyUp: (e: KeyboardEvent) => void;
    private isShiftDown: boolean = false;
    private lineStartPoint: { x: number, y: number } | null = null;

    constructor(app: PIXI.Application, onExit: () => void) {
        super();
        this.app = app;
        this.onExit = onExit;
        this.boundResize = this.onResize.bind(this);

        // Layers
        this.groundLayer = new PIXI.Container();
        this.objectLayer = new PIXI.Container();
        this.addChild(this.groundLayer);
        this.addChild(this.objectLayer);

        // Draw Grid
        this.grid = new PIXI.Graphics();
        this.drawGrid();
        this.addChild(this.grid);

        // UI
        this.ui = new EditorUI(
            (type) => { this.selectedType = type; },
            () => this.saveMap(),
            () => this.loadMap(),
            () => this.exit()
        );

        // Input
        this.eventMode = 'static';
        this.hitArea = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
        this.on('pointerdown', this.onPointerDown.bind(this));

        // Resize Handler
        this.app.renderer.on('resize', this.boundResize);

        // Keyboard Listeners
        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
    }

    private onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Shift') {
            this.isShiftDown = true;
        }
    }

    private onKeyUp(e: KeyboardEvent) {
        if (e.key === 'Shift') {
            this.isShiftDown = false;
            this.lineStartPoint = null; // Reset line start on release
        }
    }

    private onResize() {
        if (this.destroyed) return;
        this.hitArea = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
        this.drawGrid();
    }

    private drawGrid() {
        this.grid.clear();
        this.grid.stroke({ width: 1, color: 0x333333, alpha: 0.5 });

        const cellSize = 40;
        const width = this.app.screen.width;
        const height = this.app.screen.height;

        for (let x = 0; x <= width; x += cellSize) {
            this.grid.moveTo(x, 0);
            this.grid.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += cellSize) {
            this.grid.moveTo(0, y);
            this.grid.lineTo(width, y);
        }
    }

    private onPointerDown(e: PIXI.FederatedPointerEvent) {
        const cellSize = 40;
        const x = Math.floor(e.global.x / cellSize) * cellSize + cellSize / 2;
        const y = Math.floor(e.global.y / cellSize) * cellSize + cellSize / 2;

        if (this.isShiftDown && this.lineStartPoint) {
            // Draw Line
            this.drawLine(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
            this.lineStartPoint = { x, y }; // Continue line from here
        } else {
            // Single Placement
            this.placeElement(x, y);
            if (this.isShiftDown) {
                this.lineStartPoint = { x, y };
            }
        }
    }

    private drawLine(x0: number, y0: number, x1: number, y1: number) {
        const cellSize = 40;
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? cellSize : -cellSize;
        const sy = (y0 < y1) ? cellSize : -cellSize;
        let err = dx - dy;

        while (true) {
            this.placeElement(x0, y0);

            if (Math.abs(x0 - x1) < 1 && Math.abs(y0 - y1) < 1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    private placeElement(x: number, y: number) {
        const isGround = this.selectedType.startsWith('tile');

        if (isGround) {
            // Check if ground exists
            const existingIndex = this.groundTiles.findIndex(t =>
                Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1
            );
            if (existingIndex >= 0) {
                this.groundLayer.removeChild(this.groundTiles[existingIndex]);
                this.groundTiles.splice(existingIndex, 1);
            }
            // Add new ground
            const sprite = new PIXI.Sprite(textures[this.selectedType]);
            sprite.x = x;
            sprite.y = y;
            sprite.anchor.set(0.5);
            this.groundTiles.push(sprite);
            this.groundLayer.addChild(sprite);

        } else {
            // Obstacle logic
            const existingIndex = this.obstacles.findIndex(obs =>
                Math.abs(obs.x - x) < 1 && Math.abs(obs.y - y) < 1
            );

            if (existingIndex >= 0) {
                this.objectLayer.removeChild(this.obstacles[existingIndex]);
                this.obstacles.splice(existingIndex, 1);
            } else {
                const sprite = new PIXI.Sprite(textures[this.selectedType]);
                sprite.x = x;
                sprite.y = y;
                sprite.anchor.set(0.5);
                this.obstacles.push(sprite);
                this.objectLayer.addChild(sprite);
            }
        }
    }

    private saveMap() {
        console.log('EditorScene: saveMap called');
        const name = prompt("Enter map name:");
        console.log('EditorScene: prompt result', name);
        if (!name) return;

        const mapData = {
            obstacles: this.obstacles.map(obs => ({
                x: obs.x,
                y: obs.y,
                type: this.getTextureName(obs.texture)
            })),
            ground: this.groundTiles.map(t => ({
                x: t.x,
                y: t.y,
                type: this.getTextureName(t.texture)
            }))
        };

        const json = JSON.stringify(mapData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private getTextureName(texture: PIXI.Texture): string {
        // Helper to find key by value in textures object
        return Object.keys(textures).find(key => textures[key] === texture) || 'tileSand1.png';
    }

    private loadMap() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                try {
                    const content = readerEvent.target?.result as string;
                    const mapData = JSON.parse(content);
                    this.setObstacles(mapData);
                } catch (err) {
                    console.error('Error loading map:', err);
                    alert('Failed to load map file.');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    public setObstacles(data: any) {
        // Handle legacy format (array of obstacles) or new format { obstacles, ground }
        const obstaclesData = Array.isArray(data) ? data : data.obstacles || [];
        const groundData = data.ground || [];

        // Clear existing
        this.obstacles.forEach(obs => this.objectLayer.removeChild(obs));
        this.obstacles = [];
        this.groundTiles.forEach(t => this.groundLayer.removeChild(t));
        this.groundTiles = [];

        // Add Obstacles
        obstaclesData.forEach((obsData: any) => {
            const sprite = new PIXI.Sprite(textures[obsData.type]);
            sprite.x = obsData.x;
            sprite.y = obsData.y;
            sprite.anchor.set(0.5);
            this.obstacles.push(sprite);
            this.objectLayer.addChild(sprite);
        });

        // Add Ground
        groundData.forEach((tData: any) => {
            const sprite = new PIXI.Sprite(textures[tData.type]);
            sprite.x = tData.x;
            sprite.y = tData.y;
            sprite.anchor.set(0.5);
            this.groundTiles.push(sprite);
            this.groundLayer.addChild(sprite);
        });
    }

    private exit() {
        this.ui.destroy();
        this.onExit();
    }

    public destroy(options?: any) {
        this.app.renderer.off('resize', this.boundResize);
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        this.ui.destroy();
        super.destroy(options);
    }
}
