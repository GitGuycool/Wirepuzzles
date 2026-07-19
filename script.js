const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// State Management
let currentScreen = 'menu-screen';
let currentTool = 'node'; // node, move, wire
let isEditorMode = true;

let gridSize = 20; 
let nodes = [];          // {x, y, id, label}
let paths = [];          // Auto-calculated node paths (Used in Editor Mode)
let permanentPaths = []; // Player-drawn or manually placed lines [[{x,y}, ...], ...]

let selectedNode = null;
let wireStartNode = null;
let currentDifficulty = 'easy';

// ------------------------------------
// SCREEN NAVIGATION & INTERFACE
// ------------------------------------
function switchScreen(screenId) {
    document.getElementById(currentScreen).classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
    currentScreen = screenId;
}

function toggleCustomSettings() {
    currentDifficulty = 'custom';
    document.getElementById('custom-settings').classList.toggle('hidden');
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('#editor-controls button').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`).classList.add('active');
}

function setDifficulty(diff) {
    currentDifficulty = diff;
    document.getElementById('custom-settings').classList.add('hidden');
}

// ------------------------------------
// AI GENERATOR & PROCEDURAL ENGINE
// ------------------------------------
function generatePlayLevel() {
    gridSize = Math.min(100, Math.max(5, parseInt(document.getElementById('play-grid-size').value) || 20));
    isEditorMode = false;
    nodes = [];
    paths = [];
    permanentPaths = [];
    
    document.getElementById('game-title').innerText = `Play Mode (${currentDifficulty.toUpperCase()})`;
    document.getElementById('editor-controls').style.display = 'none';
    switchScreen('editor-screen');

    let pairCount, maxDist;
    if (currentDifficulty === 'easy') {
        pairCount = 3; 
        maxDist = Math.floor(gridSize * 0.3);
    } else if (currentDifficulty === 'medium') {
        pairCount = 5; 
        maxDist = Math.floor(gridSize * 0.6);
    } else if (currentDifficulty === 'hard') {
        pairCount = 8; 
        maxDist = gridSize;
    } else { 
        pairCount = Math.floor((parseInt(document.getElementById('custom-nodes').value) || 6) / 2) || 2;
        maxDist = parseInt(document.getElementById('custom-dist').value) || 10;
    }

    let labelCounter = 1;
    for (let i = 0; i < pairCount; i++) {
        let placedStart = false;
        let startNode = null;

        let attempts = 0;
        while (!placedStart && attempts < 100) {
            let rx = Math.floor(Math.random() * gridSize);
            let ry = Math.floor(Math.random() * gridSize);
            if (!nodes.some(n => n.x === rx && n.y === ry)) {
                startNode = { x: rx, y: ry, id: Date.now() + Math.random(), label: labelCounter };
                nodes.push(startNode);
                placedStart = true;
            }
            attempts++;
        }

        let placedEnd = false;
        attempts = 0;
        while (!placedEnd && attempts < 100) {
            let angle = Math.random() * Math.PI * 2;
            let dist = Math.floor(Math.random() * (maxDist - 2)) + 2;
            let tx = Math.max(0, Math.min(gridSize - 1, Math.floor(startNode.x + Math.cos(angle) * dist)));
            let ty = Math.max(0, Math.min(gridSize - 1, Math.floor(startNode.y + Math.sin(angle) * dist)));

            if (!nodes.some(n => n.x === tx && n.y === ty)) {
                nodes.push({ x: tx, y: ty, id: Date.now() + Math.random(), label: labelCounter });
                placedEnd = true;
            }
            attempts++;
        }
        labelCounter++;
    }
    
    updateConnectivityUI();
    draw();
}

function initEditor() {
    isEditorMode = true;
    gridSize = 20; 
    nodes = [];
    paths = [];
    permanentPaths = [];
    document.getElementById('game-title').innerText = "Editor Mode";
    document.getElementById('editor-controls').style.display = 'block';
    setTool('node');
    draw();
}

// ------------------------------------
// DUAL-LAYER REAL-TIME AI SOLVER
// ------------------------------------
function runAIRealTimeCheck() {
    if (!isEditorMode) return; 

    let unblockedPaths = [];
    let staticObstacles = new Set();
    
    permanentPaths.forEach(path => {
        path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`));
    });

    let activeObstacles = new Set(staticObstacles);

    let pairs = {};
    nodes.forEach(n => {
        if (!pairs[n.label]) pairs[n.label] = [];
        pairs[n.label].push(n);
    });

    let labels = Object.keys(pairs).reverse();
    labels.forEach(label => {
        let pairList = pairs[label];
        if (pairList.length === 2) {
            let start = pairList[0];
            let end = pairList[1];

            let solvedRoute = findAStarPath({x: start.x, y: start.y}, {x: end.x, y: end.y}, activeObstacles);
            if (solvedRoute) {
                unblockedPaths.unshift(solvedRoute);
                solvedRoute.forEach(pt => activeObstacles.add(`${pt.x},${pt.y}`));
            } else {
                unblockedPaths.unshift([{x: start.x, y: start.y}, {x: end.x, y: end.y}]);
            }
        }
    });
    
    paths = unblockedPaths;
    updateConnectivityUI();
}

function findAStarPath(start, end, obstacles) {
    let openSet = [ { ...start, g: 0, h: Math.abs(start.x - end.x) + Math.abs(start.y - end.y), parent: null } ];
    let closedSet = new Set();

    while (openSet.length > 0) {
        openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
        let current = openSet.shift();

        if (current.x === end.x && current.y === end.y) {
            let route = [];
            let curr = current;
            while (curr) {
                route.push({ x: curr.x, y: curr.y });
                curr = curr.parent;
            }
            return route.reverse();
        }

        closedSet.add(`${current.x},${current.y}`);

        let neighbors = [
            { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }
        ];

        for (let neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= gridSize || neighbor.y < 0 || neighbor.y >= gridSize) continue;
            if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue;
            
            if (obstacles.has(`${neighbor.x},${neighbor.y}`) && !(neighbor.x === end.x && neighbor.y === end.y)) {
                continue; 
            }

            let gScore = current.g + 1;
            let existing = openSet.find(o => o.x === neighbor.x && o.y === neighbor.y);

            if (!existing) {
                neighbor.g = gScore;
                neighbor.h = Math.abs(neighbor.x - end.x) + Math.abs(neighbor.y - end.y);
                neighbor.parent = current;
                openSet.push(neighbor);
            } else if (gScore < existing.g) {
                existing.g = gScore;
                existing.parent = current;
            }
        }
    }
    return null; 
}

function updateConnectivityUI() {
    if (nodes.length === 0) return;

    let totalPairs = 0;
    let connectedPairs = 0;

    let pairs = {};
    nodes.forEach(n => {
        if (!pairs[n.label]) pairs[n.label] = [];
        pairs[n.label].push(n);
    });

    Object.keys(pairs).forEach(label => {
        if (pairs[label].length === 2) totalPairs++;
    });

    let allActivePaths = [...paths, ...permanentPaths];
    allActivePaths.forEach(p => {
        if (!p || p.length < 2) return;
        let n1 = nodes.find(n => n.x === p[0].x && n.y === p[0].y);
        let n2 = nodes.find(n => n.x === p[p.length-1].x && n.y === p[p.length-1].y);
        if (n1 && n2 && n1.label === n2.label) {
            connectedPairs++;
        }
    });

    const status = document.getElementById('status-bar');
    if (totalPairs > 0 && connectedPairs === totalPairs) {
        status.innerText = `AI Status: ✅ Perfect! All ${connectedPairs}/${totalPairs} pairs correctly linked.`;
        status.style.color = "#10b981";
    } else {
        status.innerText = `AI Status: ⚠️ Verification: Connected ${connectedPairs}/${totalPairs} target matching pairs.`;
        status.style.color = "#f59e0b";
    }
}

// ------------------------------------
// MOBILE SMART COORD GETTER
// ------------------------------------
function getGridCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const cellSize = canvas.width / gridSize;
    
    // Support standard mouse interactions or mobile screen taps
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    }

    const gridX = Math.floor((clientX - rect.left) / cellSize);
    const gridY = Math.floor((clientY - rect.top) / cellSize);
    return { x: Math.max(0, Math.min(gridSize - 1, gridX)), y: Math.max(0, Math.min(gridSize - 1, gridY)) };
}

function handleStart(e) {
    e.preventDefault();
    const coords = getGridCoords(e);
    let clickedNode = nodes.find(n => n.x === coords.x && n.y === coords.y);

    if (isEditorMode) {
        if (currentTool === 'node' && !clickedNode) {
            let pairs = {};
            nodes.forEach(n => {
                if(!pairs[n.label]) pairs[n.label] = 0;
                pairs[n.label]++;
            });
            let nextLabel = 1;
            while(pairs[nextLabel] && pairs[nextLabel] >= 2) {
                nextLabel++;
            }
            nodes.push({ x: coords.x, y: coords.y, id: Date.now(), label: nextLabel });
        } else if (currentTool === 'move' && clickedNode) {
            selectedNode = clickedNode;
        } else if (currentTool === 'wire' && clickedNode) {
            wireStartNode = clickedNode;
        }
    } else {
        if (clickedNode) {
            if (!wireStartNode) {
                wireStartNode = clickedNode;
            } else {
                if (wireStartNode.id !== clickedNode.id && wireStartNode.label === clickedNode.label) {
                    let staticObstacles = new Set();
                    permanentPaths.forEach(path => path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`)));
                    
                    let drawRoute = findAStarPath({x: wireStartNode.x, y: wireStartNode.y}, {x: clickedNode.x, y: clickedNode.y}, staticObstacles);
                    if (drawRoute) {
                        permanentPaths.push(drawRoute);
                    } else {
                        permanentPaths.push([{x: wireStartNode.x, y: wireStartNode.y}, {x: clickedNode.x, y: clickedNode.y}]);
                    }
                }
                wireStartNode = null;
            }
        }
    }
    runAIRealTimeCheck();
    draw();
}

function handleMove(e) {
    if (!isEditorMode || currentTool !== 'move' || !selectedNode) return;
    e.preventDefault();
    const coords = getGridCoords(e);
    
    permanentPaths.forEach(p => {
        if (p[0].x === selectedNode.x && p[0].y === selectedNode.y) { p[0].x = coords.x; p[0].y = coords.y; }
        if (p[p.length-1].x === selectedNode.x && p[p.length-1].y === selectedNode.y) { p[p.length-1].x = coords.x; p[p.length-1].y = coords.y; }
    });

    selectedNode.x = coords.x;
    selectedNode.y = coords.y;
    runAIRealTimeCheck();
    draw();
}

function handleEnd(e) {
    if (isEditorMode && currentTool === 'wire' && wireStartNode) {
        const coords = getGridCoords(e);
        let endNode = nodes.find(n => n.x === coords.x && n.y === coords.y);

        if (endNode && endNode.id !== wireStartNode.id && endNode.label === wireStartNode.label) {
            let staticObstacles = new Set();
            permanentPaths.forEach(path => path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`)));
            
            let manualRoute = findAStarPath({x: wireStartNode.x, y: wireStartNode.y}, {x: endNode.x, y: endNode.y}, staticObstacles);
            if (manualRoute) {
                permanentPaths.push(manualRoute);
            }
        }
        wireStartNode = null;
        runAIRealTimeCheck();
        draw();
    }
    selectedNode = null;
}

// Bind both Desktop Mouse and Mobile Touch inputs natively
canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseup', handleEnd);

canvas.addEventListener('touchstart', handleStart, { passive: false });
canvas.addEventListener('touchmove', handleMove, { passive: false });
canvas.addEventListener('touchend', handleEnd, { passive: false });

// ------------------------------------
// GRAPHICS RENDERING SYSTEM
// ------------------------------------
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellSize = canvas.width / gridSize;

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for(let i=0; i<=gridSize; i++) {
        ctx.beginPath(); ctx.moveTo(i*cellSize, 0); ctx.lineTo(i*cellSize, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i*cellSize); ctx.lineTo(canvas.width, i*cellSize); ctx.stroke();
    }

    permanentPaths.forEach(path => {
        ctx.strokeStyle = '#ef4444'; 
        ctx.lineWidth = Math.max(3, cellSize * 0.4);
        renderPathLine(path, cellSize);
    });

    if (isEditorMode) {
        paths.forEach(path => {
            ctx.strokeStyle = '#6366f1'; 
            ctx.lineWidth = Math.max(2, cellSize * 0.3);
            renderPathLine(path, cellSize);
        });
    }

    nodes.forEach(n => {
        let cx = n.x * cellSize + cellSize/2;
        let cy = n.y * cellSize + cellSize/2;
        let radius = Math.max(8, cellSize * 0.45);

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = (wireStartNode && wireStartNode.id === n.id) ? '#f59e0b' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${radius * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, cx, cy);
    });
}

function renderPathLine(path, cellSize) {
    if(!path || path.length < 2) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    path.forEach((pt, idx) => {
        let cx = pt.x * cellSize + cellSize / 2;
        let cy = pt.y * cellSize + cellSize / 2;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
}

function clearMap() {
    nodes = [];
    paths = [];
    permanentPaths = [];
    draw();
}

// ------------------------------------
// EXPORT & IMPORT UTILITIES
// ------------------------------------
function exportMap() {
    const levelState = { gridSize, nodes, permanentPaths };
    const code = btoa(JSON.stringify(levelState));
    navigator.clipboard.writeText(code);
    alert("Level code copied! Send this to your friend.");
}

function loadLevel(brandNew) {
    const code = document.getElementById('import-code').value.trim();
    if(!code) return alert("Please paste a valid level code!");

    try {
        const decoded = JSON.parse(atob(code));
        gridSize = decoded.gridSize || 20;
        nodes = decoded.nodes || [];
        
        if (brandNew) {
            paths = []; 
            permanentPaths = [];
            isEditorMode = false;
            document.getElementById('game-title').innerText = "Play Mode (Imported)";
            document.getElementById('editor-controls').style.display = 'none';
        } else {
            paths = []; 
            permanentPaths = decoded.permanentPaths || [];
            isEditorMode = true;
            document.getElementById('game-title').innerText = "Editor Mode (Imported)";
            document.getElementById('editor-controls').style.display = 'block';
        }

        switchScreen('editor-screen');
        runAIRealTimeCheck();
        draw();
    } catch(err) {
        alert("Failed to decode level code.");
    }
    }
        
