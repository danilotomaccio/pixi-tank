import * as PIXI from 'pixi.js';

export const textures: Record<string, PIXI.Texture> = {};

export async function loadTextureAtlas(xmlUrl: string, imageUrl: string): Promise<void> {
    try {
        // Load the XML
        const response = await fetch(xmlUrl);
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Load the Base Texture
        const baseTexture = await PIXI.Assets.load(imageUrl);

        // Parse SubTextures
        const subTextures = xmlDoc.getElementsByTagName("SubTexture");
        for (let i = 0; i < subTextures.length; i++) {
            const subTexture = subTextures[i];
            const name = subTexture.getAttribute("name");
            const x = parseInt(subTexture.getAttribute("x") || "0");
            const y = parseInt(subTexture.getAttribute("y") || "0");
            const width = parseInt(subTexture.getAttribute("width") || "0");
            const height = parseInt(subTexture.getAttribute("height") || "0");

            if (name) {
                const frame = new PIXI.Rectangle(x, y, width, height);
                const texture = new PIXI.Texture({
                    source: baseTexture.source,
                    frame: frame
                });
                textures[name] = texture;
            }
        }
        console.log(`Loaded ${Object.keys(textures).length} textures from atlas.`);
    } catch (error) {
        console.error("Failed to load texture atlas:", error);
    }
}
