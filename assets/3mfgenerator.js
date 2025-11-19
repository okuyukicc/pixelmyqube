document.addEventListener('DOMContentLoaded', () => {

    const APP_VERSION = "v1.3.0 - Geometric Mutation";
    
    const JSZip = window.JSZip;
    if (!JSZip) {
        alert("Fatal Error: JSZip library not found.");
        return;
    }

    const GRID_SIZE = 17;
    const OBJECT_DIM_MM = 20; 
    const SPACING_MM = 2; 
    const TOTAL_CELL_DIM_MM = OBJECT_DIM_MM + SPACING_MM; 
    
    const OBJ_SCALE = 10.0; 

    const gridContainer = document.getElementById('grid-container');
    const colorPalette = document.getElementById('color-palette');
    const colorPicker = document.getElementById('color-picker');
    const clearBtn = document.getElementById('clear-btn');
    const downloadBtn = document.getElementById('download-btn');
    const statsTotalEl = document.getElementById('pixel-count-total');
    const statsColorsEl = document.getElementById('pixel-count-colors');
    const versionSpan = document.getElementById('app-version');

    let selectedColor = "null"; 
    let isMouseDown = false; 
    let gridData = new Array(GRID_SIZE * GRID_SIZE).fill(null);
    
    // Guardaremos los datos raw (números) no strings XML, para poder manipularlos
    let rawModelData = null; // { vertices: [{x,y,z}], triangles: [{v1,v2,v3}] }

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

    // --- LÓGICA DE PROCESADO OBJ (NORMALIZACIÓN Z) ---

    function parseAndNormalizeOBJ(objText) {
        const vertices = [];
        const triangles = [];
        const lines = objText.split('\n');

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
                // Triangulación simple
                for (let i = 1; i < faceIndices.length - 1; i++) {
                    triangles.push({
                        v1: faceIndices[0],
                        v2: faceIndices[i],
                        v3: faceIndices[i+1]
                    });
                }
            }
        }

        // Calcular Z Mínimo para poner el objeto a ras de suelo
        let minZ = Infinity;
        vertices.forEach(v => {
            if (v.z < minZ) minZ = v.z;
        });

        // Normalizar vértices (Escalar y bajar Z a 0)
        const processedVertices = vertices.map(v => ({
            x: v.x * OBJ_SCALE,
            y: v.y * OBJ_SCALE,
            z: (v.z - minZ) * OBJ_SCALE 
        }));

        return { vertices: processedVertices, triangles: triangles };
    }

    async function loadCustomModel() {
        try {
            const response = await fetch('assets/pixel.obj');
            if (!response.ok) throw new Error('OBJ fetch failed');
            const text = await response.text();
            
            rawModelData = parseAndNormalizeOBJ(text);
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download .3MF';
        } catch (e) {
            console.error(e);
            if (window.location.protocol === 'file:') {
                alert("Error: Cannot load local files directly. Please use a local server or GitHub Pages.");
            } else {
                alert("Error loading assets/pixel.obj");
            }
            downloadBtn.textContent = 'Error loading model';
        }
    }

    // --- GENERACIÓN 3MF (CON MUTACIÓN GEOMÉTRICA) ---

    async function generateAndDownload3MF() {
        if (!rawModelData) return;

        const zip = new JSZip();

        const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
        zip.folder("_rels").file(".rels", relsXML);

        const uniqueColors = [...new Set(gridData.filter(c => c !== null))];
        
        // 1. Definición de Materiales
        let materialsXML = `<basematerials id="1">`;
        uniqueColors.forEach((c, i) => {
            materialsXML += `\n    <base name="Color ${i}" displaycolor="${c}" />`;
        });
        materialsXML += `\n</basematerials>`;

        // 2. Definición de Objetos (Aquí ocurre la magia)
        let objectsXML = "";
        const colorToObjID = {};
        let objIdCounter = 2;

        // Generamos la cadena de triángulos una sola vez, ya que no cambia
        let triStr = "";
        rawModelData.triangles.forEach(t => {
            triStr += `\n<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" />`;
        });

        uniqueColors.forEach((color, colIndex) => {
            const objID = objIdCounter++;
            colorToObjID[color] = objID;

            // MUTACIÓN GEOMÉTRICA:
            // Creamos una copia de los vértices para ESTE color específico.
            // Movemos ligeramente el PRIMER vértice basándonos en el índice del color.
            // Esto hace que la malla de cada color sea matemáticamente única e impide
            // que el laminador las fusione.
            let vertStr = "";
            rawModelData.vertices.forEach((v, vIndex) => {
                let x = v.x;
                let y = v.y;
                let z = v.z;

                // Solo mutamos el primer vértice de la lista
                if (vIndex === 0) {
                    x += 0.0001 * (colIndex + 1); // Desplazamiento microscópico
                }

                vertStr += `\n<vertex x="${x}" y="${y}" z="${z}" />`;
            });

            // Definimos el objeto asignándole su grupo de material y su índice de color
            objectsXML += `
<object id="${objID}" type="model" pid="1" pindex="${colIndex}">
    <mesh>
        <vertices>${vertStr}\n</vertices>
        <triangles>${triStr}\n</triangles>
    </mesh>
</object>`;
        });

        // 3. Construcción de la escena
        let itemsXML = "";
        const objectCenterOffset = OBJECT_DIM_MM / 2;

        gridData.forEach((color, index) => {
            if (color !== null) {
                const x = (index % GRID_SIZE) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                const y = (GRID_SIZE - 1 - Math.floor(index / GRID_SIZE)) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                
                // Recuperamos el ID del objeto que ya tiene el color y la geometría mutada correctos
                const objID = colorToObjID[color];
                
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

        const contentTypesXML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
    <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;
        zip.file("[Content_Types].xml", contentTypesXML);

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
