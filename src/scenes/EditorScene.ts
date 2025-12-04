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

    constructor(app: PIXI.Application, onExit: () => void) {
        super();
        this.app = app;
        this.onExit = onExit;

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
        this.hitArea = new PIXI.Rectangle(0, 0, 800, 600);
        this.on('pointerdown', this.onPointerDown.bind(this));
    }

    private drawGrid() {
        this.grid.clear();
        this.grid.stroke({ width: 1, color: 0x333333, alpha: 0.5 });

        const cellSize = 40;
        for (let x = 0; x <= 800; x += cellSize) {
            this.grid.moveTo(x, 0);
            this.grid.lineTo(x, 600);
        }
        for (let y = 0; y <= 600; y += cellSize) {
            this.grid.moveTo(0, y);
            this.grid.lineTo(800, y);
        }
    }

    private onPointerDown(e: PIXI.FederatedPointerEvent) {
        const cellSize = 40;
        const x = Math.floor(e.global.x / cellSize) * cellSize + cellSize / 2;
        const y = Math.floor(e.global.y / cellSize) * cellSize + cellSize / 2;

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
        const name = prompt("Enter map name:");
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

        (this as any).saveMap(name, mapData);
    }

    private getTextureName(texture: PIXI.Texture): string {
        // Helper to find key by value in textures object
        return Object.keys(textures).find(key => textures[key] === texture) || 'tileSand1.png';
    }

    private loadMap() {
        const name = prompt("Enter map name to load:");
        if (!name) return;

        (this as any).loadMap(name);
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
        this.ui.destroy();
        super.destroy(options);
    }
}
