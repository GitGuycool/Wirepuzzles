const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// State Management
let currentScreen = 'menu-screen';
let currentTool = 'node'; // node, move, wire
let isEditorMode = true;

let gridSize = 20; 
let nodes = [];          // {x, y, id, label}
let paths = [];          // Auto-calculated node paths [[{x,y}, ...], ...]
let permanentPaths = []; // Manually drawn lines that act as solid walls [[{x,y}, ...], ...]

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

    let nodeCount, maxDist;
    if (currentDifficulty === 'easy') {
        nodeCount = 4;
        maxDist = Math.floor(gridSize * 0.25);
    } else if (currentDifficulty === 'medium') {
        nodeCount = 8;
        maxDist = Math.floor(gridSize * 0.5);
    } else if (currentDifficulty === 'hard') {
        nodeCount = 14;
        maxDist = gridSize;
    } else { 
        nodeCount = parseInt(document.getElementById('custom-nodes').value) || 6;
        maxDist = parseInt(document.getElementById('custom-dist').value) || 10;
    }

    let baseNode = { x: Math.floor(gridSize/2), y: Math.floor(gridSize/2), id: Date.now(), label: 1 };
    nodes.push(baseNode);

    for (let i = 1; i < nodeCount; i++) {
        let attempts = 0;
        while(attempts < 100) {
            let refNode = nodes[Math.floor(Math.random() * nodes.length)];
            let angle = Math.random() * Math.PI * 2;
            let dist = currentDifficulty === 'easy' ? Math.floor(Math.random() * maxDist) + 2 : Math.floor(Math.random() * (maxDist - 3)) + 3;
            
            let targetX = Math.max(0, Math.min(gridSize - 1, Math.floor(refNode.x + Math.cos(angle) * dist)));
            let targetY = Math.max(0, Math.min(gridSize - 1, Math.floor(refNode.y + Math.sin(angle) * dist)));

            if (!nodes.some(n => n.x === targetX && n.y === targetY)) {
                nodes.push({ x: targetX, y: targetY, id: Date.now() + i, label: i + 1 });
                break;
            }
            attempts++;
        }
    }
    
    runAIRealTimeCheck();
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
    let unblockedPaths = [];
    let staticObstacles = new Set();
    
    permanentPaths.forEach(path => {
        path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`));
    });

    let activeObstacles = new Set(staticObstacles);

    for (let i = paths.length - 1; i >= 0; i--) {
        let pathObj = paths[i];
        if (!pathObj || pathObj.length < 2) continue;
        
        let start = pathObj[0];
        let end = pathObj[pathObj.length - 1];

        let solvedRoute = findAStarPath(start, end, activeObstacles);
        
        if (solvedRoute) {
            unblockedPaths.unshift(solvedRoute);
            solvedRoute.forEach(pt => activeObstacles.add(`${pt.x},${pt.y}`));
        } else {
            unblockedPaths.unshift([start, end]);
        }
    }
    
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
    let adjacency = {};
    nodes.forEach(n => adjacency[n.id] = []);
    
    let allPaths = [...paths, ...permanentPaths];
    allPaths.forEach(p => {
        if (!p || p.length < 2) return;
        let n1 = nodes.find(n => n.x === p[0].x && n.y === p[0].y);
        let n2 = nodes.find(n => n.x === p[p.length-1].x && n.y === p[p.length-1].y);
        if (n1 && n2) {
            adjacency[n1.id].push(n2.id);
            adjacency[n2.id].push(n1.id);
        }
    });

    let visited = new Set();
    let queue = [nodes[0].id];
    visited.add(nodes[0].id);

    while (queue.length > 0) {
        let curr = queue.shift();
        if (adjacency[curr]) {
            adjacency[curr].forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }
    }

    const status = document.getElementById('status-bar');
    if (visited.size === nodes.length) {
        status.innerText = "AI Status: ✅ Valid Level! All nodes are reached/connectable.";
        status.style.color = "#10b981";
    } else {
        status.innerText = "AI Status: ⚠️ Warning: Isolated nodes detected.";
        status.style.color = "#f59e0b";
    }
}

// ------------------------------------
// CANVAS INTERACTION MOUSE/TOUCH HANDLERS
// ------------------------------------
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cellSize = canvas.width / gridSize;
    const gridX = Math.floor((e.clientX - rect.left) / cellSize);
    const gridY = Math.floor((e.clientY - rect.top) / cellSize);

    let clickedNode = nodes.find(n => n.x === gridX && n.y === gridY);

    if (isEditorMode) {
        if (currentTool === 'node' && !clickedNode) {
            nodes.push({ x: gridX, y: gridY, id: Date.now(), label: nodes.length + 1 });
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
                if (wireStartNode.id !== clickedNode.id) {
                    paths.push([{x: wireStartNode.x, y: wireStartNode.y}, {x: clickedNode.x, y: clickedNode.y}]);
                }
                wireStartNode = null;
            }
        }
    }
    runAIRealTimeCheck();
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    if (currentTool === 'move' && selectedNode) {
        const rect = canvas.getBoundingClientRect();
        const cellSize = canvas.width / gridSize;
        const gridX = Math.max(0, Math.min(gridSize-1, Math.floor((e.clientX - rect.left) / cellSize)));
        const gridY = Math.max(0, Math.min(gridSize-1, Math.floor((e.clientY - rect.top) / cellSize)));
        
        paths.forEach(p => {
            if (p[0].x === selectedNode.x && p[0].y === selectedNode.y) { p[0].x = gridX; p[0].y = gridY; }
            if (p[p.length-1].x === selectedNode.x && p[p.length-1].y === selectedNode.y) { p[p.length-1].x = gridX; p[p.length-1].y = gridY; }
        });
        permanentPaths.forEach(p => {
            if (p[0].x === selectedNode.x && p[0].y === selectedNode.y) { p[0].x = gridX; p[0].y = gridY; }
            if (p[p.length-1].x === selectedNode.x && p[p.length-1].y === selectedNode.y) { p[p.length-1].x = gridX; p[p.length-1].y = gridY; }
        });

        selectedNode.x = gridX;
        selectedNode.y = gridY;
        runAIRealTimeCheck();
        draw();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (currentTool === 'wire' && wireStartNode) {
        const rect = canvas.getBoundingClientRect();
        const cellSize = canvas.width / gridSize;
        const gridX = Math.floor((e.clientX - rect.left) / cellSize);
        const gridY = Math.floor((e.clientY - rect.top) / cellSize);
        let endNode = nodes.find(n => n.x === gridX && n.y === gridY);

        if (endNode && endNode.id !== wireStartNode.id) {
            let staticObstacles = new Set();
            permanentPaths.forEach(path => path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`)));
            
            let manualRoute = findAStarPath({x: wireStartNode.x, y: wireStartNode.y}, {x: endNode.x, y: endNode.y}, staticObstacles);
            if (manualRoute) {
                permanentPaths.push(manualRoute);
            } else {
                permanentPaths.push([{x: wireStartNode.x, y: wireStartNode.y}, {x: endNode.x, y: endNode.y}]);
            }
        }
        wireStartNode = null;
        runAIRealTimeCheck();
        draw();
    }
    selectedNode = null;
});

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

    paths.forEach(path => {
        ctx.strokeStyle = '#6366f1'; 
        ctx.lineWidth = Math.max(2, cellSize * 0.3);
        renderPathLine(path, cellSize);
    });

    nodes.forEach(n => {
        let cx = n.x * cellSize + cellSize/2;
        let cy = n.y * cellSize + cellSize/2;
        let radius = Math.max(6, cellSize * 0.4);

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = (wireStartNode && wireStartNode.id === n.id) ? '#f59e0b' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `${radius}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, cx, cy);
    });
}

function renderPathLine(path, cellSize) {
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
    const levelState = { gridSize, nodes, paths, permanentPaths };
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
            paths = decoded.paths || []; 
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
                  
