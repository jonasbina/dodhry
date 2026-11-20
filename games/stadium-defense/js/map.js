// Stadium Map and Grid System
class StadiumMap {
    constructor() {
        this.cols = 24;
        this.rows = 15;
        this.tileSize = 40; // 960 x 600 px canvas
        this.width = this.cols * this.tileSize;
        this.height = this.rows * this.tileSize;

        // Path grid definition (tile coords)
        this.pathGridPoints = [
            { x: -1, y: 3 },
            { x: 5, y: 3 },
            { x: 5, y: 11 },
            { x: 11, y: 11 },
            { x: 11, y: 3 },
            { x: 17, y: 3 },
            { x: 17, y: 10 },
            { x: 24, y: 10 }
        ];

        // Pixel waypoints
        this.waypoints = this.pathGridPoints.map(p => ({
            x: (p.x + 0.5) * this.tileSize,
            y: (p.y + 0.5) * this.tileSize
        }));

        // Adjust entry and exit outside screen edges
        this.waypoints[0].x = -20;
        this.waypoints[this.waypoints.length - 1].x = this.width + 30;

        // Pre-calculate path segments & total distance for progress calculation
        this.totalDistance = 0;
        this.segments = [];
        for (let i = 0; i < this.waypoints.length - 1; i++) {
            const p1 = this.waypoints[i];
            const p2 = this.waypoints[i + 1];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            this.segments.push({
                p1,
                p2,
                dist,
                accumDist: this.totalDistance
            });
            this.totalDistance += dist;
        }

        // Initialize grid occupation map (false = available, true = occupied by track/tower/obstacle)
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        this.markTrackTiles();

        // Crowd animation timer
        this.crowdTimer = 0;
    }

    markTrackTiles() {
        // Mark all tiles that intersect the track
        for (let i = 0; i < this.pathGridPoints.length - 1; i++) {
            const p1 = this.pathGridPoints[i];
            const p2 = this.pathGridPoints[i + 1];

            const minX = Math.max(0, Math.min(p1.x, p2.x));
            const maxX = Math.min(this.cols - 1, Math.max(p1.x, p2.x));
            const minY = Math.max(0, Math.min(p1.y, p2.y));
            const maxY = Math.min(this.rows - 1, Math.max(p1.y, p2.y));

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    this.grid[y][x] = 'track';
                }
            }
        }
    }

    isTileBuildable(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        // Don't build on top row (stands)
        if (row === 0) return false;
        return this.grid[row][col] === false;
    }

    setTileTower(col, row, tower) {
        if (this.isTileBuildable(col, row)) {
            this.grid[row][col] = tower;
            return true;
        }
        return false;
    }

    clearTile(col, row) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            if (this.grid[row][col] !== 'track') {
                this.grid[row][col] = false;
            }
        }
    }

    getTowerAt(col, row) {
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            const val = this.grid[row][col];
            return (val && val !== 'track') ? val : null;
        }
        return null;
    }

    // Get position along path given progress distance [0 .. totalDistance]
    getPositionAtDistance(distance) {
        if (distance <= 0) return { x: this.waypoints[0].x, y: this.waypoints[0].y, angle: 0 };
        if (distance >= this.totalDistance) {
            const last = this.waypoints[this.waypoints.length - 1];
            return { x: last.x, y: last.y, angle: 0 };
        }

        for (const seg of this.segments) {
            if (distance <= seg.accumDist + seg.dist) {
                const segT = (distance - seg.accumDist) / seg.dist;
                const x = seg.p1.x + (seg.p2.x - seg.p1.x) * segT;
                const y = seg.p1.y + (seg.p2.y - seg.p1.y) * segT;
                const angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
                return { x, y, angle };
            }
        }

        const last = this.waypoints[this.waypoints.length - 1];
        return { x: last.x, y: last.y, angle: 0 };
    }

    update(dt) {
        this.crowdTimer += dt;
    }

    draw(ctx) {
        // 1. Stadium Grass (Mowed stripes)
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                ctx.fillStyle = (c % 2 === 0) ? '#2e7d32' : '#388e3c';
                ctx.fillRect(c * this.tileSize, r * this.tileSize, this.tileSize, this.tileSize);
            }
        }

        // Soccer Field Markings (Center circle, penalty box)
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        // Center circle in the middle
        ctx.beginPath();
        ctx.arc(480, 300, 60, 0, Math.PI * 2);
        ctx.stroke();
        // Half line
        ctx.beginPath();
        ctx.moveTo(480, 40);
        ctx.lineTo(480, 560);
        ctx.stroke();
        ctx.restore();

        // 2. Athletic Tartan Running Track
        this.drawTrack(ctx);

        // 3. Grandstand / Stadium Bleachers at top row (Row 0)
        this.drawBleachers(ctx);

        // 4. Goal / Trophy Area at exit
        this.drawTrophyGate(ctx);

        // 5. Entrance Gate
        this.drawEntranceGate(ctx);
    }

    getOffsetWaypoints(offset) {
        const pts = [];
        const nSegs = this.waypoints.length - 1;
        const normals = [];

        for (let i = 0; i < nSegs; i++) {
            const p1 = this.waypoints[i];
            const p2 = this.waypoints[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            normals.push({ x: -dy / len, y: dx / len });
        }

        // Start point
        pts.push({
            x: this.waypoints[0].x + normals[0].x * offset,
            y: this.waypoints[0].y + normals[0].y * offset
        });

        // Corner points at intersection of offset line segments
        for (let i = 1; i < this.waypoints.length - 1; i++) {
            const n1 = normals[i - 1];
            const n2 = normals[i];
            const dot = n1.x * n2.x + n1.y * n2.y;
            const denom = 1 + dot;
            if (Math.abs(denom) > 0.001) {
                const scale = offset / denom;
                pts.push({
                    x: this.waypoints[i].x + (n1.x + n2.x) * scale,
                    y: this.waypoints[i].y + (n1.y + n2.y) * scale
                });
            } else {
                pts.push({
                    x: this.waypoints[i].x + n1.x * offset,
                    y: this.waypoints[i].y + n1.y * offset
                });
            }
        }

        // End point
        const lastN = normals[normals.length - 1];
        pts.push({
            x: this.waypoints[this.waypoints.length - 1].x + lastN.x * offset,
            y: this.waypoints[this.waypoints.length - 1].y + lastN.y * offset
        });

        return pts;
    }

    drawTrack(ctx) {
        ctx.save();

        // Track base (terracotta / athletic clay red)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Dark track border
        ctx.strokeStyle = '#8d2c20';
        ctx.lineWidth = this.tileSize + 6;
        ctx.beginPath();
        this.waypoints.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        // Main track surface
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = this.tileSize - 2;
        ctx.beginPath();
        this.waypoints.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        // Running track lanes (White dashed lines parallel to track borders)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([8, 8]);
        [-10, 10].forEach(offset => {
            const pts = this.getOffsetWaypoints(offset);
            ctx.beginPath();
            pts.forEach((pt, i) => {
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
        });

        ctx.restore();
    }

    drawBleachers(ctx) {
        ctx.save();
        // Bleacher background
        const grad = ctx.createLinearGradient(0, 0, 0, 40);
        grad.addColorStop(0, '#1a237e');
        grad.addColorStop(1, '#283593');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, 40);

        // Stadium lights & railing
        ctx.strokeStyle = '#ffca28';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 39);
        ctx.lineTo(this.width, 39);
        ctx.stroke();

        // Animated crowd heads
        const crowdColors = ['#f44336', '#2196f3', '#ffeb3b', '#ffffff', '#4caf50', '#ff9800'];
        for (let x = 12; x < this.width; x += 18) {
            const bob = Math.sin(this.crowdTimer * 3 + x) * 2;
            const colorIdx = Math.floor(Math.abs(Math.sin(x * 99)) * crowdColors.length);
            ctx.fillStyle = crowdColors[colorIdx];
            // Head
            ctx.beginPath();
            ctx.arc(x, 20 + bob, 5, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillStyle = '#102027';
            ctx.fillRect(x - 5, 26 + bob, 10, 12);
        }

        // Banners
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText("★ GRAND ARENA CUP 2026 ★", 380, 24);

        ctx.restore();
    }

    drawTrophyGate(ctx) {
        ctx.save();
        const gateX = this.width - 28;
        const gateY = (10 + 0.5) * this.tileSize;

        // Pedestal
        ctx.fillStyle = '#37474f';
        ctx.fillRect(gateX - 16, gateY - 24, 34, 48);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(gateX - 16, gateY - 24, 34, 48);

        // Glowing Golden Cup
        const glow = Math.sin(this.crowdTimer * 4) * 0.3 + 0.7;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12 * glow;

        // Cup bowl
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.arc(gateX, gateY - 6, 11, 0, Math.PI);
        ctx.fill();

        // Cup stem & base
        ctx.fillRect(gateX - 3, gateY - 6, 6, 12);
        ctx.fillRect(gateX - 8, gateY + 6, 16, 4);

        // Handles
        ctx.strokeStyle = '#ffa000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(gateX - 11, gateY - 6, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(gateX + 11, gateY - 6, 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    drawEntranceGate(ctx) {
        ctx.save();
        const gateY = (3 + 0.5) * this.tileSize;
        // Tunnel arch
        ctx.fillStyle = '#263238';
        ctx.fillRect(0, gateY - 22, 22, 44);
        ctx.strokeStyle = '#90a4ae';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, gateY - 22, 22, 44);

        // Warning chevrons
        ctx.fillStyle = '#ff9800';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText("START", 2, gateY + 4);
        ctx.restore();
    }

    drawGridHover(ctx, mouseCol, mouseRow, isValid, towerDef, existingTower = null) {
        if (mouseCol < 0 || mouseCol >= this.cols || mouseRow < 0 || mouseRow >= this.rows) return;

        const x = mouseCol * this.tileSize;
        const y = mouseRow * this.tileSize;

        ctx.save();
        // Slot highlight
        if (existingTower) {
            // Replace / swap mode: yellow/amber outline and highlight
            ctx.fillStyle = isValid ? 'rgba(255, 193, 7, 0.4)' : 'rgba(244, 67, 54, 0.4)';
            ctx.fillRect(x, y, this.tileSize, this.tileSize);
            ctx.strokeStyle = isValid ? '#ffc107' : '#f44336';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x, y, this.tileSize, this.tileSize);

            // Text indicator showing replacement / refund
            if (isValid) {
                const refund = existingTower.getSellValue();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 4;
                ctx.fillText(`🔄 +${refund}🎟️`, x + this.tileSize / 2, y + this.tileSize + 14);
                ctx.shadowBlur = 0;
            }
        } else {
            ctx.fillStyle = isValid ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';
            ctx.fillRect(x, y, this.tileSize, this.tileSize);
            ctx.strokeStyle = isValid ? '#4caf50' : '#f44336';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, this.tileSize, this.tileSize);
        }

        // Range preview if valid and tower selected
        if (isValid && towerDef) {
            ctx.fillStyle = 'rgba(33, 150, 243, 0.15)';
            ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x + this.tileSize / 2, y + this.tileSize / 2, towerDef.range, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }
}

window.StadiumMap = StadiumMap;
