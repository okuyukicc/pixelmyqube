document.addEventListener('DOMContentLoaded', () => {

    const APP_VERSION = "v1.2.2";
    const JSZip = window.JSZip; 
    
    if (!JSZip) {
        alert("Fatal Error: JSZip library not found.");
        return;
    }

    const GRID_SIZE = 17;
    const OBJECT_DIM_MM = 20;
    const OBJECT_HEIGHT_MM = 9.40;
    const SPACING_MM = 2; 
    const TOTAL_CELL_DIM_MM = OBJECT_DIM_MM + SPACING_MM; 
    
    const OBJ_SCALE_X = 10.0;
    const OBJ_SCALE_Y = 10.0;
    const OBJ_SCALE_Z = 10.0; 

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
    let customGeometry = null;

    function createGrid() {
        gridContainer.innerHTML = ''; 
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const pixel = document.createElement('div');
            pixel.classList.add('grid-pixel');
            pixel.dataset.index = i;

            const pixelInner = document.createElement('div');
            pixelInner.classList.add('pixel-inner');
            pixel.appendChild(pixelInner);
            
            pixel.addEventListener('mousedown', (e) => {
                isMouseDown = true;
                paintPixel(pixelInner, i);
            });
            
            pixel.addEventListener('mouseover', (e) => {
                if (isMouseDown) {
                    paintPixel(pixelInner, i);
                }
            });
            
            gridContainer.appendChild(pixel);
        }
    }
    
    function paintPixel(pixelInnerElement, index) {
        const newColor = selectedColor === "null" ? null : selectedColor;
        
        if (gridData[index] !== newColor) {
            gridData[index] = newColor;
            pixelInnerElement.style.backgroundColor = newColor || 'transparent';
            
            if (newColor === null) {
                pixelInnerElement.classList.remove('painted');
            } else {
                pixelInnerElement.classList.add('painted');
            }
            updateStats();
        }
    }

    function clearGrid() {
        gridData.fill(null);
        const pixelsInner = gridContainer.querySelectorAll('.pixel-inner');
        pixelsInner.forEach(pixelInner => {
            pixelInner.style.backgroundColor = 'transparent';
            pixelInner.classList.remove('painted');
        });
        updateStats();
    }

    function updateStats() {
        const paintedPixels = gridData.filter(color => color !== null);
        const totalCount = paintedPixels.length;
        
        statsTotalEl.textContent = `Total: ${totalCount} pixels`;
        
        const colorCounts = {};
        paintedPixels.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        statsColorsEl.innerHTML = ''; 
        const sortedColors = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a]);
        
        if (sortedColors.length === 0) {
            statsColorsEl.innerHTML = '<p class="text-gray-500">No pixels painted.</p>';
        } else {
            sortedColors.forEach(color => {
                const count = colorCounts[color];
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between';
                row.innerHTML = `
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full border border-gray-300" style="background-color: ${color}"></div>
                        <span>${color}</span>
                    </div>
                    <span class="font-medium">${count}</span>
                `;
                statsColorsEl.appendChild(row);
            });
        }
    }

    function selectColor(newColor, activeSwatch) {
        selectedColor = newColor;
        
        colorPalette.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.classList.remove('active');
        });
        
        if (activeSwatch) {
            activeSwatch.classList.add('active');
        }
        
        if (newColor !== 'null' && !activeSwatch) {
            colorPicker.value = newColor;
        }
    }

    function parseOBJ(objText) {
        const vertices = [];
        const triangles = [];
        const lines = objText.split('\n');

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const type = parts[0];

            if (type === 'v') {
                const x = parseFloat(parts[1]) * OBJ_SCALE_X;
                const y = parseFloat(parts[2]) * OBJ_SCALE_Y;
                const z = parseFloat(parts[3]) * OBJ_SCALE_Z;
                vertices.push({ x, y, z });

            } else if (type === 'f') {
                const faceVertices = [];
                for (let i = 1; i < parts.length; i++) {
                    const v_parts = parts[i].split('/');
                    faceVertices.push(parseInt(v_parts[0]) - 1);
                }
                
                if (faceVertices.length === 3) {
                     triangles.push({ v1: faceVertices[0], v2: faceVertices[1], v3: faceVertices[2] });
                } 
                else if (faceVertices.length === 4) {
                    triangles.push({ v1: faceVertices[0], v2: faceVertices[1], v3: faceVertices[2] });
                    triangles.push({ v1: faceVertices[0], v2: faceVertices[2], v3: faceVertices[3] });
                }
            }
        }
        
        return { vertices, triangles };
    }

    async function loadCustomModel() {
        try {
            const objPath = 'assets/pixel.obj';
            const absoluteObjUrl = new URL(objPath, window.location.href).href;

            const response = await fetch(absoluteObjUrl);
            if (!response.ok) {
                throw new Error('Failed to load OBJ');
            }
            const objText = await response.text();
            customGeometry = parseOBJ(objText);
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download .3MF';

        } catch (error) {
            console.error(error);
            alert("Error loading assets/pixel.obj. Check console.");
            downloadBtn.textContent = 'Error loading model';
        }
    }

    async function generateAndDownload3MF() {
        
        if (!customGeometry) {
            return;
        }

        const zip = new JSZip();

        const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
        zip.folder("_rels").file(".rels", relsXML);

        const uniqueColors = [...new Set(gridData.filter(c => c !== null))];
        
        let baseMaterialsXML = `<basematerials id="1">`; 
        uniqueColors.forEach((color, index) => {
            const sRGBColor = color.substring(1); 
            baseMaterialsXML += `\n    <base name="Color ${index}" displaycolor="#${sRGBColor}" />`;
        });
        baseMaterialsXML += `\n</basematerials>`;

        let resourcesXML = `\n    ${baseMaterialsXML}`;
        
        let baseVerticesXML = `<vertices>`;
        customGeometry.vertices.forEach(v => {
            baseVerticesXML += `\n        <vertex x="${v.x}" y="${v.y}" z="${v.z}" />`;
        });
        baseVerticesXML += `\n    </vertices>`;

        let baseTrianglesXML = `<triangles>`;
        customGeometry.triangles.forEach(t => {
            baseTrianglesXML += `\n        <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" />`;
        });
        baseTrianglesXML += `\n    </triangles>`;

        const colorToObjectMap = {}; 
        let objectIdCounter = 2; 

        uniqueColors.forEach((color, index) => {
            const newObjectId = objectIdCounter++;
            colorToObjectMap[color] = newObjectId; 

            let coloredVerticesXML = baseVerticesXML.replace('</vertices>', ''); 
            
            for (let i = 0; i < index + 1; i++) {
                coloredVerticesXML += `\n        <vertex x="${i * 0.001}" y="${i * 0.001}" z="${-100 - i}" />`;
            }
            coloredVerticesXML += `\n    </vertices>`; 

            resourcesXML += `
<object id="${newObjectId}" type="model" pid="1" pindex="${index}">
    <mesh>
        ${coloredVerticesXML}
        ${baseTrianglesXML}
    </mesh>
</object>`;
        });

        const finalResourcesXML = `<resources>${resourcesXML}\n</resources>`;
        
        let buildItemsXML = "";
        const objectCenterOffset = OBJECT_DIM_MM / 2; 

        gridData.forEach((color, index) => {
            if (color !== null) {
                const x = (index % GRID_SIZE) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                const y = (GRID_SIZE - 1 - Math.floor(index / GRID_SIZE)) * TOTAL_CELL_DIM_MM + objectCenterOffset; 
                
                const transform = `1 0 0 0 1 0 0 0 1 ${x} ${y} 0`;
                
                const objectIdToPlace = colorToObjectMap[color];
                
                buildItemsXML += `\n    <item objectid="${objectIdToPlace}" transform="${transform}" />`;
            }
        });
        
        const buildXML = `<build>${buildItemsXML}\n</build>`;

        const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel">
${finalResourcesXML}
${buildXML}
</model>`;

        zip.folder("3D").file("3dmodel.model", modelXML);

        try {
            const blob = await zip.generateAsync({ type: "blob" });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "pixelmyqube_custom.3mf";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (error) {
            alert("Error generating .3mf");
        }
    }

    if (versionSpan) {
        versionSpan.textContent = APP_VERSION;
    }

    window.addEventListener('mouseup', () => {
        isMouseDown = false;
    });
    gridContainer.addEventListener('mouseleave', () => {
        isMouseDown = false;
    });

    colorPalette.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch) {
            const color = swatch.dataset.color;
            selectColor(color, swatch);
        }
    });

    colorPicker.addEventListener('input', (e) => {
        selectColor(e.target.value, null);
    });

    clearBtn.addEventListener('click', clearGrid);
    downloadBtn.addEventListener('click', generateAndDownload3MF);
    
    createGrid();
    updateStats();
    selectColor('null', document.querySelector('.color-swatch[data-color="null"]'));
    
    loadCustomModel();

});
