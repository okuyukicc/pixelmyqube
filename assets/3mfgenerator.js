document.addEventListener('DOMContentLoaded', () => {

    const APP_VERSION = "v1.2.4 - Z-Fix & Perturbation";
    
    // --- GLOBALS ---
    const JSZip = window.JSZip;
    if (!JSZip) {
        alert("Fatal Error: JSZip library not found.");
        return;
    }

    // --- CONFIGURATION ---
    const GRID_SIZE = 17;
    const OBJECT_DIM_MM = 20; 
    const SPACING_MM = 2; 
    const TOTAL_CELL_DIM_MM = OBJECT_DIM_MM + SPACING_MM; 
    
    // Scale for OBJ
    const OBJ_SCALE = 10.0; 

    // --- DOM ELEMENTS ---
    const gridContainer = document.getElementById('grid-container');
    const colorPalette = document.getElementById('color-palette');
    const colorPicker = document.getElementById('color-picker');
    const clearBtn = document.getElementById('clear-btn');
    const downloadBtn = document.getElementById('download-btn');
    const statsTotalEl = document.getElementById('pixel-count-total');
    const statsColorsEl = document.getElementById('pixel-count-colors');
    const versionSpan = document.getElementById('app-version');

    // --- STATE ---
    let selectedColor = "null"; 
    let isMouseDown = false; 
    let gridData = new Array(GRID_SIZE * GRID_SIZE).fill(null);
    
    // Stores the raw geometry from OBJ
    let rawGeometry = null; // { vertices: [{x,y,z}], triangles: [{v1,v2,v3}] }

    // --- 1. UI & INTERACTION FUNCTIONS ---

    function createGrid() {
        gridContainer.innerHTML = ''; 
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const pixel = document.createElement('div');
            pixel.classList.add('grid-pixel');
            pixel.dataset.index = i;

            const pixelInner = document.createElement('div');
            pixelInner.classList.add('pixel-inner');
            pixel.appendChild(pixelInner);
            
            pixel.addEventListener('mousedown', () => {
                isMouseDown = true;
                paintPixel(pixelInner, i);
            });
            pixel.addEventListener('mouseover', () => {
                if (isMouseDown) paintPixel(pixelInner, i);
            });
            
            gridContainer.appendChild(pixel);
        }
    }
    
    function paintPixel(pixelInnerElement, index) {
        const newColor = selectedColor === "null" ? null : selectedColor;
        if (gridData[index] !== newColor) {
            gridData[index] = newColor;
            pixelInnerElement.style.backgroundColor = newColor || 'transparent';
            
            if (newColor === null) pixelInnerElement.classList.remove('painted');
            else pixelInnerElement.classList.add('painted');
            
            updateStats();
        }
    }

    function clearGrid() {
        gridData.fill(null);
        const pixelsInner = gridContainer.querySelectorAll('.pixel-inner');
        pixelsInner.forEach(p => {
            p.style.backgroundColor = 'transparent';
            p.classList.remove('painted');
        });
        updateStats();
    }

    function updateStats() {
        const paintedPixels = gridData.filter(c => c !== null);
        statsTotalEl.textContent = `Total: ${paintedPixels.length} pixels`;
        
        const colorCounts = {};
        paintedPixels.forEach(c => colorCounts[c] = (colorCounts[c] || 0) + 1);
        
        statsColorsEl.innerHTML = ''; 
        Object.keys(colorCounts)
            .sort((a, b) => colorCounts[b] - colorCounts[a])
            .forEach(color => {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between';
                row.innerHTML = `
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full border border-gray-300" style="background-color: ${color}"></div>
                        <span>${color}</span>
                    </div>
                    <span class="font-medium">${colorCounts[color]}</span>
                `;
                statsColorsEl.appendChild(row);
            });
    }

    function selectColor(newColor, activeSwatch) {
        selectedColor = newColor;
        colorPalette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        if (activeSwatch) activeSwatch.classList.add('active');
        if (newColor !== 'null' && !activeSwatch) colorPicker.value = newColor;
    }

    // --- 2. GEOMETRY PROCESSING (OBJ PARSER & Z-FIX) ---

    function parseAndNormalizeOBJ(objText) {
        const vertices = [];
        const triangles = [];
        const lines = objText.split('\n');

        // 1. Parse Raw
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === 'v') {
                vertices.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3])
                });
            } else if (parts[0] === 'f') {
                const faceIndices = parts.slice(1).map(p => parseInt(p.split('/')[0]) - 1);
                // Triangulate fans manually if needed (simple method for convex polys)
                for (let i = 1; i < faceIndices.length - 1; i++) {
                    triangles.push({
                        v1: faceIndices[0],
                        v2: faceIndices[i],
                        v3: faceIndices[i+1]
                    });
                }
            }
        }

        // 2. Calculate Z-Min for Grounding
        let minZ = Infinity;
        vertices.forEach(v => {
            if (v.z < minZ) minZ = v.z;
        });

        // 3. Normalize (Scale & Shift Z to 0)
        // We apply scale AND subtract minZ so the object sits perfectly on the bed.
        const processedVertices = vertices.map(v => ({
            x: v.x * OBJ_SCALE,
            y: v.y * OBJ_SCALE,
            z: (v.z - minZ) * OBJ_SCALE // This shifts the lowest point to 0
        }));

        return { vertices: processedVertices, triangles: triangles };
    }

    async function loadCustomModel() {
        try {
            const response = await fetch('assets/pixel.obj');
            if (!response.ok) throw new Error('OBJ fetch failed');
            const text = await response.text();
            
            rawGeometry = parseAndNormalizeOBJ(text);
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download .3MF';
        } catch (e) {
            console.error(e);
            // If local, provide help message
            if (window.location.protocol === 'file:') {
                alert("Error: Cannot load local files directly. Please use a local server or GitHub Pages.");
            } else {
                alert("Error loading assets/pixel.obj");
            }
            downloadBtn.textContent = 'Error loading model';
        }
    }

    // --- 3. 3MF GENERATION CORE ---

    async function generateAndDownload3MF() {
        if (!rawGeometry) return;

        const zip = new JSZip();

        // A. The Relationships file
        const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
        zip.folder("_rels").file(".rels", relsXML);

        // B. The 3D Model file
        const uniqueColors = [...new Set(gridData.filter(c => c !== null))];
        
        // B1. Materials Definition
        let materialsXML = `<basematerials id="1">`;
        uniqueColors.forEach((c, i) => {
            materialsXML += `\n    <base name="Color ${i}" displaycolor="${c}" />`;
        });
        materialsXML += `\n</basematerials>`;

        // B2. Object Definitions (Mesh Duplication + Micro-Perturbation)
        // We create a unique Object Definition for EACH color.
        // We slightly shift vertices to force the slicer to treat them as unique meshes.
        let objectsXML = "";
        const colorToObjID = {};
        let objIdCounter = 2;

        uniqueColors.forEach((color, colIndex) => {
            const objID = objIdCounter++;
            colorToObjID[color] = objID;

            // Generate perturbed vertices for this specific color
            // Shift amount: 0.0001mm * colIndex (imperceptible but mathematically distinct)
            let vertStr = "";
            rawGeometry.vertices.forEach(v => {
                const shift = 0.0001 * colIndex;
                vertStr += `\n<vertex x="${v.x + shift}" y="${v.y + shift}" z="${v.z + shift}" />`;
            });

            let triStr = "";
            rawGeometry.triangles.forEach(t => {
                triStr += `\n<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" />`;
            });

            // Define the object with PID/PINDEX strictly on the Object tag
            objectsXML += `
<object id="${objID}" type="model" pid="1" pindex="${colIndex}">
    <mesh>
        <vertices>${vertStr}\n</vertices>
        <triangles>${triStr}\n</triangles>
    </mesh>
</object>`;
        });

        // B3. Build Items
        let itemsXML = "";
        const objectCenterOffset = OBJECT_DIM_MM / 2;

        gridData.forEach((color, index) => {
            if (color !== null) {
                const x = (index % GRID_SIZE) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                const y = (GRID_SIZE - 1 - Math.floor(index / GRID_SIZE)) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                
                const objID = colorToObjID[color];
                
                // Simply place the pre-colored object
                itemsXML += `\n<item objectid="${objID}" transform="1 0 0 0 1 0 0 0 1 ${x} ${y} 0" />`;
            }
        });

        const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel">
    <resources>
        ${materialsXML}
        ${objectsXML}
    </resources>
    <build>
        ${itemsXML}
    </build>
</model>`;

        zip.folder("3D").file("3dmodel.model", modelXML);

        // C. Content Types
        const contentTypesXML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
    <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;
        zip.file("[Content_Types].xml", contentTypesXML);

        // D. Generate Zip
        try {
            const blob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "pixelmyqube_custom.3mf";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            alert("Error generating ZIP");
        }
    }


    // --- 4. INITIALIZATION ---
    if (versionSpan) versionSpan.textContent = APP_VERSION;

    window.addEventListener('mouseup', () => isMouseDown = false);
    gridContainer.addEventListener('mouseleave', () => isMouseDown = false);

    colorPalette.addEventListener('click', (e) => {
        const s = e.target.closest('.color-swatch');
        if (s) selectColor(s.dataset.color, s);
    });
    
    colorPicker.addEventListener('input', (e) => selectColor(e.target.value, null));

    clearBtn.addEventListener('click', clearGrid);
    downloadBtn.addEventListener('click', generateAndDownload3MF);
    
    createGrid();
    updateStats();
    selectColor('null', document.querySelector('.color-swatch[data-color="null"]'));
    
    loadCustomModel();
});
