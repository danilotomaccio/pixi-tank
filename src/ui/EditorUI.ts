export class EditorUI {
    private container: HTMLDivElement;
    private onSelect: (type: string) => void;
    private onSave: () => void;
    private onLoad: () => void;
    private onExit: () => void;

    constructor(onSelect: (type: string) => void, onSave: () => void, onLoad: () => void, onExit: () => void) {
        this.onSelect = onSelect;
        this.onSave = onSave;
        this.onLoad = onLoad;
        this.onExit = onExit;

        this.container = document.createElement('div');
        this.container.id = 'editor-ui';
        document.body.appendChild(this.container);

        this.createDrawer();
    }

    private createDrawer() {
        const drawer = document.createElement('div');
        drawer.className = 'editor-drawer';

        const title = document.createElement('h3');
        title.innerText = 'Obstacles';
        drawer.appendChild(title);

        drawer.appendChild(this.createItemButton('Wood Crate', 'crateWood.png'));
        drawer.appendChild(this.createItemButton('Metal Crate', 'crateMetal.png'));

        const groundTitle = document.createElement('h3');
        groundTitle.innerText = 'Ground';
        drawer.appendChild(groundTitle);

        drawer.appendChild(this.createItemButton('Sand', 'tileSand1.png'));
        drawer.appendChild(this.createItemButton('Grass', 'tileGrass1.png'));
        drawer.appendChild(this.createItemButton('Dirt', 'tileDirt1.png')); // Assuming this exists or similar


        const controls = document.createElement('div');
        controls.className = 'editor-controls';

        const saveBtn = document.createElement('button');
        saveBtn.innerText = 'Save Map';
        saveBtn.onclick = this.onSave;

        const loadBtn = document.createElement('button');
        loadBtn.innerText = 'Load Map';
        loadBtn.onclick = this.onLoad;

        const exitBtn = document.createElement('button');
        exitBtn.innerText = 'Exit';
        exitBtn.onclick = this.onExit;

        controls.appendChild(saveBtn);
        controls.appendChild(loadBtn);
        controls.appendChild(exitBtn);

        drawer.appendChild(controls);
        this.container.appendChild(drawer);
    }

    private createItemButton(label: string, type: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerText = label;
        btn.className = 'editor-item-btn';
        btn.onclick = () => {
            document.querySelectorAll('.editor-item-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.onSelect(type);
        };
        return btn;
    }

    public destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
