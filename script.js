// Updated state arrays to handle manual vs. automatic tracing
let nodes = [];       // {x, y, id, label}
let paths = [];       // Auto-calculated node paths [[{x,y}, ...], ...]
let permanentPaths = []; // Manually drawn lines that act as solid walls [[{x,y}, ...], ...]

// ------------------------------------
// DUAL-LAYER REAL-TIME AI SOLVER
// ------------------------------------
function runAIRealTimeCheck() {
    let unblockedPaths = [];
    
    // LAYER 1: Permanently seal off manually drawn paths as unbreakable obstacles
    let staticObstacles = new Set();
    permanentPaths.forEach(path => {
        path.forEach(pt => staticObstacles.add(`${pt.x},${pt.y}`));
    });

    // LAYER 2: Process auto-nodes backward (Newer nodes get routing priority)
    // Create a working set of active obstacles initialized with our hard walls
    let activeObstacles = new Set(staticObstacles);

    for (let i = paths.length - 1; i >= 0; i--) {
        let pathObj = paths[i];
        if (!pathObj || pathObj.length < 2) continue;
        
        let start = pathObj[0];
        let end = pathObj[pathObj.length - 1];

        // A* searches around permanent paths AND newer auto-calculated paths
        let solvedRoute = findAStarPath(start, end, activeObstacles);
        
        if (solvedRoute) {
            unblockedPaths.unshift(solvedRoute);
            // Append this new path to the obstacle layer so OLDER nodes must avoid it
            solvedRoute.forEach(pt => activeObstacles.add(`${pt.x},${pt.y}`));
        } else {
            // Completely trapped! Mark as an unroutable direct connection line
            unblockedPaths.unshift([start, end]);
        }
    }
    
    paths = unblockedPaths;
    
    // Update the UI warning indicator
    updateConnectivityUI(staticObstacles);
}

// ------------------------------------
// STRICT WIRE PATHFINDER (A*)
// ------------------------------------
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
            
            // Check against our comprehensive obstacle grid (allow stepping onto the final target node)
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
    return null; // No open space found - completely blocked
}

// ------------------------------------
// DUAL RENDERING SYSTEM (Visuals)
// ------------------------------------
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellSize = canvas.width / gridSize;

    // Draw background grid helper lines
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for(let i = 0; i <= gridSize; i++) {
        ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(canvas.width, i * cellSize); ctx.stroke();
    }

    // 1. Render permanent, user-drawn paths (Set in stone - Bold Crimson)
    permanentPaths.forEach(path => {
        ctx.strokeStyle = '#ef4444'; 
        ctx.lineWidth = Math.max(3, cellSize * 0.4);
        renderPathLine(path, cellSize);
    });

    // 2. Render real-time AI shifting paths (Dynamic Indigo)
    paths.forEach(path => {
        ctx.strokeStyle = '#6366f1'; 
        ctx.lineWidth = Math.max(2, cellSize * 0.3);
        renderPathLine(path, cellSize);
    });

    // 3. Draw standard Nodes
    nodes.forEach(n => {
        let cx = n.x * cellSize + cellSize / 2;
        let cy = n.y * cellSize + cellSize / 2;
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


