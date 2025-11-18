// Wait for the DOM to be fully loaded before running any script
document.addEventListener('DOMContentLoaded', () => {

    // --- Version ---
    const APP_VERSION = "v1.2.1"; // Based on v1.2 logic, but now external

    // --- Globals ---
    // Grab JSZip from the global window object (loaded in index.html)
    const JSZip = window.JSZip; 
    if (!JSZip) {
        console.error("JSZip library not found. Please ensure it's loaded in the HTML.");
        alert("Fatal Error: JSZip library not found.");
        return;
    }

    // --- 1. CONFIGURATION AND INITIALIZATION ---
    const GRID_SIZE = 17;
    const OBJECT_DIM_MM = 20; // Dimensions of your 3D object (20x20x9.40mm)
    const OBJECT_HEIGHT_MM = 9.40;
    const SPACING_MM = 2; // Spacing between objects
    const TOTAL_CELL_DIM_MM = OBJECT_DIM_MM + SPACING_MM; 
    
    // Scale for the OBJ model.
    const OBJ_SCALE_X = 10.0;
    const OBJ_SCALE_Y = 10.0;
    const OBJ_SCALE_Z = 10.0; 

    // --- DOM ELEMENT SELECTION ---
    const gridContainer = document.getElementById('grid-container');
    const colorPalette = document.getElementById('color-palette');
    const colorPicker = document.getElementById('color-picker');
    const clearBtn = document.getElementById('clear-btn');
    const downloadBtn = document.getElementById('download-btn');
    const statsTotalEl = document.getElementById('pixel-count-total');
    const statsColorsEl = document.getElementById('pixel-count-colors');
    const versionSpan = document.getElementById('app-version');

    // --- STATE VARIABLES ---
    let selectedColor = "null"; // "null" is the eraser
    let isMouseDown = false; 
    let gridData = new Array(GRID_SIZE * GRID_SIZE).fill(null);
    let customGeometry = null; // Will store { vertices: [], triangles: [] }

    
    // --- 2. FUNCTIONS ---

    /**
     * Creates the pixel grid in the DOM
     */
    function createGrid() {
        gridContainer.innerHTML = ''; // Clear existing grid
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const pixel = document.createElement('div');
            pixel.classList.add('grid-pixel');
            pixel.dataset.index = i;

            const pixelInner = document.createElement('div');
            pixelInner.classList.add('pixel-inner');
            pixel.appendChild(pixelInner);
            
            // --- Paint Events ---
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
    
    /**
     * Paints a pixel in the DOM and updates the data
     */
    function paintPixel(pixelInnerElement, index) {
        const newColor = selectedColor === "null" ? null : selectedColor;
        
        // Only update if the color is different
        if (gridData[index] !== newColor) {
            gridData[index] = newColor;
            pixelInnerElement.style.backgroundColor = newColor || 'transparent';
            
            // Add/remove 'painted' class to show/hide the black dot
            if (newColor === null) {
                pixelInnerElement.classList.remove('painted');
            } else {
                pixelInnerElement.classList.add('painted');
            }
            updateStats();
        }
    }

    /**
     * Clears the grid and data
     */
    function clearGrid() {
        gridData.fill(null);
        const pixelsInner = gridContainer.querySelectorAll('.pixel-inner');
        pixelsInner.forEach(pixelInner => {
            pixelInner.style.backgroundColor = 'transparent';
            pixelInner.classList.remove('painted');
        });
        updateStats();
    }

    /**
     * Updates statistics (total count and count by color)
     */
    function updateStats() {
        const paintedPixels = gridData.filter(color => color !== null);
        const totalCount = paintedPixels.length;
        
        statsTotalEl.textContent = `Total: ${totalCount} pixels`;
        
        const colorCounts = {};
        paintedPixels.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        statsColorsEl.innerHTML = ''; // Clear previous stats
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

    /**
     * Sets the new active color
     * @param {string | null} newColor - The hex code or "null" for eraser
     * @param {HTMLElement | null} activeSwatch - The DOM element of the swatch clicked
     */
    function selectColor(newColor, activeSwatch) {
        selectedColor = newColor;
        
        // Remove 'active' class from all swatches
        colorPalette.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.classList.remove('active');
        });
        
        // Add 'active' class to the clicked swatch
        if (activeSwatch) {
            activeSwatch.classList.add('active');
        }
        
        // Update the color picker if a color (not eraser) was selected
        if (newColor !== 'null' && !activeSwatch) {
            // This means the color picker itself was used
            colorPicker.value = newColor;
        }
    }

    /**
     * Parses the text of an .OBJ file
     * @param {string} objText The text content of the .obj file
     * @returns {object} An object with { vertices: [], triangles: [] }
     */
    function parseOBJ(objText) {
        const vertices = [];
        const triangles = [];
        const lines = objText.split('\n');

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const type = parts[0];

            if (type === 'v') {
                // Vertex line: v x y z
                const x = parseFloat(parts[1]) * OBJ_SCALE_X;
                const y = parseFloat(parts[2]) * OBJ_SCALE_Y;
                const z = parseFloat(parts[3]) * OBJ_SCALE_Z;
                vertices.push({ x, y, z });

            } else if (type === 'f') {
                // Face line: f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3
                // We assume triangles
                const faceVertices = [];
                for (let i = 1; i < parts.length; i++) {
                    const v_parts = parts[i].split('/');
                    // OBJ index is 1-based, convert to 0-based
                    faceVertices.push(parseInt(v_parts[0]) - 1);
                }
                
                if (faceVertices.length === 3) {
                     triangles.push({ v1: faceVertices[0], v2: faceVertices[1], v3: faceVertices[2] });
                } 
                // Optional: Handle Quads (4-vertex faces) by triangulating them
                else if (faceVertices.length === 4) {
                    triangles.push({ v1: faceVertices[0], v2: faceVertices[1], v3: faceVertices[2] });
                    triangles.push({ v1: faceVertices[0], v2: faceVertices[2], v3: faceVertices[3] });
                }
            }
        }
        
        console.log(`OBJ model parsed: ${vertices.length} vertices, ${triangles.length} triangles`);
        return { vertices, triangles };
    }

    /**
     * Loads the .obj model from the server
     */
    async function loadCustomModel() {
        try {
            const objPath = 'assets/pixel.obj';
            // Build an absolute URL relative to the script's location
            const absoluteObjUrl = new URL(objPath, window.location.href).href;

            const response = await fetch(absoluteObjUrl);
            if (!response.ok) {
                throw new Error(`Error loading '${objPath}': ${response.statusText}. Please ensure 'assets/pixel.obj' exists and is accessible.`);
            }
            const objText = await response.text();
            customGeometry = parseOBJ(objText);
            
            // Enable the download button
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download .3MF';

        } catch (error) {
            console.error(error);
            // Provide a clearer error message for the common 'file://' issue
            if (window.location.protocol === 'file:') {
                alert(`Fatal Error: Could not load the 3D model.\n\nThis page is running from a local 'file://' address. Due to browser security, it cannot load the 'pixel.obj' file.\n\nTo fix this, please run it from a local web server (e.g., 'python -m http.server') or view it on GitHub Pages.`);
            } else {
                alert(`Fatal Error: Could not load the 3D model. ${error.message}`);
            }
            downloadBtn.textContent = 'Error loading model';
        }
    }


    /**
     * Generates and triggers the download of the .3MF file
     * (v1.2.1 - MESH DUPLICATION + DUMMY VERTEX)
     */
    async function generateAndDownload3MF() {
        
        // Check if the model is loaded
        if (!customGeometry) {
            alert("The custom 3D model has not loaded yet. Please wait a moment.");
            return;
        }

        console.log(`Generating .3MF file (${APP_VERSION} - Mesh Duplication + Dummy Vertex)...`);
        const zip = new JSZip();

        // --- .rels file (standard) ---
        const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
        zip.folder("_rels").file(".rels", relsXML);

        // --- 3dmodel.model file (the main content) ---
        
        // 1. Define Materials
        const uniqueColors = [...new Set(gridData.filter(c => c !== null))];
        
        let baseMaterialsXML = `<basematerials id="1">`; // All materials in one group
        uniqueColors.forEach((color, index) => {
            const sRGBColor = color.substring(1); // Remove '#'
            baseMaterialsXML += `\n    <base name="Color ${index}" displaycolor="#${sRGBColor}" />`;
        });
        baseMaterialsXML += `\n</basematerials>`;

        let resourcesXML = `\n    ${baseMaterialsXML}`;
        
        // 2. Define Base Geometry (as XML strings)
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

        // 3. Create ONE <object> per COLOR, each with a *unique* mesh
        // This is the "cache-busting" trick for slicers.
        const colorToObjectMap = {}; // Maps a color (e.g., "#E53E3E") to a new object ID (e.g., 2)
        let objectIdCounter = 2; // Start object IDs from 2 (1 is for basematerials)

        uniqueColors.forEach((color, index) => {
            const newObjectId = objectIdCounter++;
            colorToObjectMap[color] = newObjectId; // Map this color to the new ID

            // Create a *unique* vertex list for this color
            let coloredVerticesXML = baseVerticesXML.replace('</vertices>', ''); // Remove closing tag
            
            // Add 'index' number of dummy vertices to make the mesh unique
            // These vertices are not referenced by any triangle.
            for (let i = 0; i < index; i++) {
                // Add a unique, out-of-bounds vertex
                coloredVerticesXML += `\n        <vertex x="0" y="0" z="${-999 - i}" />`;
            }
            coloredVerticesXML += `\n    </vertices>`; // Add closing tag back

            // Create an object definition. This object *is* this color.
            // We assign the material (pid="1") and the specific color (pindex="${index}")
            // directly to the object definition.
            resourcesXML += `
<object id="${newObjectId}" type="model" pid="1" pindex="${index}">
    <mesh>
        ${coloredVerticesXML}
        ${baseTrianglesXML}
    </mesh>
</object>`;
        });

        const finalResourcesXML = `<resources>${resourcesXML}\n</resources>`;
        
        // 4. Build the scene
        let buildItemsXML = "";
        const objectCenterOffset = OBJECT_DIM_MM / 2; // Assume the model is centered at 0,0

        gridData.forEach((color, index) => {
            if (color !== null) {
                // Calculate 3D position
                const x = (index % GRID_SIZE) * TOTAL_CELL_DIM_MM + objectCenterOffset;
                // Invert Y-axis for 3D build (grid 0,0 is top-left, 3D 0,0 is bottom-left)
                const y = (GRID_SIZE - 1 - Math.floor(index / GRID_SIZE)) * TOTAL_CELL_DIM_MM + objectCenterOffset; 
                
                const transform = `1 0 0 0 1 0 0 0 1 ${x} ${y} 0`;
                
                // Get the correct Object ID for this color
                const objectIdToPlace = colorToObjectMap[color];
                
                // Place an item. It doesn't need color info, because the object
                // (e.g., objectid="3") is already defined as "red".
                buildItemsXML += `\n    <item objectid="${objectIdToPlace}" transform="${transform}" />`;
            }
        });
        
        const buildXML = `<build>${buildItemsXML}\n</build>`;

        // 5. Assemble the final XML
        const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel">
${finalResourcesXML}
${buildXML}
</model>`;

        zip.folder("3D").file("3dmodel.model", modelXML);

        // 6. Trigger Download
        try {
            const blob = await zip.generateAsync({ type: "blob" });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "pixelmyqube_custom.3mf";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log(".3MF file generated and downloaded!");

        } catch (error) {
            console.error("Error generating the .3mf file:", error);
            alert("An error occurred while generating the .3mf file. Check the console for more details.");
        }
    }


    // --- 7. APP INITIALIZATION ---

    // Set Version in Footer
    if (versionSpan) {
        versionSpan.textContent = APP_VERSION;
    }

    // --- GLOBAL EVENT LISTENERS ---
    window.addEventListener('mouseup', () => {
        isMouseDown = false;
    });
    gridContainer.addEventListener('mouseleave', () => {
        isMouseDown = false;
    });

    // --- ELEMENT-SPECIFIC LISTENERS ---
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
    
    // --- INITIAL CALLS ---
    createGrid();
    updateStats();
    selectColor('null', document.querySelector('.color-swatch[data-color="null"]'));
    
    // Start loading the .OBJ model as soon as the app runs
    loadCustomModel();

}); // End of DOMContentLoaded
