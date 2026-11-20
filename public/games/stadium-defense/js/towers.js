// Towers and Projectiles System

const TOWER_TYPES = {
    TENNIS: {
        id: 'TENNIS',
        name: 'Tenista',
        title: 'Rychlá pálka',
        cost: 100,
        range: 135,
        fireRate: 2.2, // attacks per second
        damage: 24,
        desc: 'Vysoká kadence tenisových míčků. Ideální na rychlé běžce.',
        upgrades: [
            { cost: 80, name: 'Grafitová raketa', desc: '+30% poškození, +15% dosah', damageMul: 1.3, rangeMul: 1.15, fireRateMul: 1.1 },
            { cost: 160, name: 'Esový servis ★', desc: '35% šance na kritický úder (2.5x dmg) a +30% kadence', damageMul: 1.35, rangeMul: 1.1, fireRateMul: 1.3, critChance: 0.35 }
        ]
    },
    HOCKEY: {
        id: 'HOCKEY',
        name: 'Hokejista',
        title: 'Ledový obránce',
        cost: 140,
        range: 115,
        fireRate: 1.1,
        damage: 22,
        slowFactor: 0.45, // reduces speed by 55%
        slowDuration: 3.2,
        desc: 'Střílí ledové puky, které útočníky výrazně zpomalují.',
        upgrades: [
            { cost: 95, name: 'Broušené nože', desc: 'Zpomalení trvá 4.5s a +30% poškození', damageMul: 1.3, rangeMul: 1.15, slowDurationMul: 1.4 },
            { cost: 185, name: 'Příklep mrazu ★', desc: 'Puk exploduje do okolí (plošné zpomalení o 65%)', damageMul: 1.4, splashRadius: 45, slowFactor: 0.35, slowDurationMul: 1.5 }
        ]
    },
    BASKETBALL: {
        id: 'BASKETBALL',
        name: 'Basketbalista',
        title: 'Dunker ze vzduchu',
        cost: 175,
        range: 140,
        fireRate: 0.85,
        damage: 48,
        splashRadius: 55,
        desc: 'Hází obloukem basketbalové míče s plošným dopadem (Splash AoE).',
        upgrades: [
            { cost: 120, name: 'Slam Dunk', desc: '+35% poškození, větší plošný rádius (70px)', damageMul: 1.35, splashRadius: 70, rangeMul: 1.1 },
            { cost: 220, name: 'Trojkový král ★', desc: 'Obří dopad (90px) a +50% poškození', damageMul: 1.5, splashRadius: 90, rangeMul: 1.15 }
        ]
    },
    SOCCER: {
        id: 'SOCCER',
        name: 'Fotbalista',
        title: 'Kanonýr s dělovkou',
        cost: 195,
        range: 155,
        fireRate: 1.0,
        damage: 60,
        pierceCount: 3,
        desc: 'Tvrdá přízemní rána, která prostřelí až 3 fanoušky v jedné řadě.',
        upgrades: [
            { cost: 135, name: 'Zlatá kopačka', desc: 'Prostřelí až 6 nepřátel, +30% poškození', damageMul: 1.3, pierceCount: 6, rangeMul: 1.15 },
            { cost: 240, name: 'Falšovaná raketa ★', desc: 'Neomezený průraz v trajektorii + odmrštění nepřátel!', damageMul: 1.45, pierceCount: 99, rangeMul: 1.15, knockback: 18 }
        ]
    },
    JAVELIN: {
        id: 'JAVELIN',
        name: 'Oštěpař',
        title: 'Olympijský snajpr',
        cost: 225,
        range: 240,
        fireRate: 0.45,
        damage: 140,
        armorPierce: true,
        desc: 'Extrémní dostřel a masivní poškození. Ignoruje brnění kotelníků!',
        upgrades: [
            { cost: 155, name: 'Karbonový oštěp', desc: '+40% poškození, +15% dostřel', damageMul: 1.4, rangeMul: 1.15 },
            { cost: 275, name: 'Zlatý světový rekord ★', desc: 'Drtivých 280 poškození a probodne 2 cíle v linii!', damageMul: 1.55, rangeMul: 1.15, pierceCount: 2 }
        ]
    }
};

class Projectile {
    constructor(params) {
        this.type = params.type;
        this.x = params.x;
        this.y = params.y;
        this.target = params.target;
        this.targetX = params.targetX || (params.target ? params.target.x : params.x);
        this.targetY = params.targetY || (params.target ? params.target.y : params.y);
        this.damage = params.damage;
        this.speed = params.speed || 400;
        this.alive = true;

        this.isCrit = params.isCrit || false;
        this.slowFactor = params.slowFactor || null;
        this.slowDuration = params.slowDuration || 0;
        this.splashRadius = params.splashRadius || 0;
        this.pierceCount = params.pierceCount || 1;
        this.armorPierce = params.armorPierce || false;
        this.knockback = params.knockback || 0;
        this.hitEnemies = new Set();

        // Ballistic arc parameters for Basketball
        this.startX = this.x;
        this.startY = this.y;
        this.totalDist = Math.hypot(this.targetX - this.startX, this.targetY - this.startY) || 1;
        this.traveled = 0;
        this.arcHeight = params.arcHeight || 50;

        // Visual angle & spin
        this.angle = Math.atan2(this.targetY - this.startY, this.targetX - this.startX);
        this.spin = 0;
    }

    update(dt, enemies) {
        if (!this.alive) return;

        this.spin += dt * 15;

        if (this.type === 'BASKETBALL') {
            // Ballistic arc trajectory
            const step = this.speed * dt;
            this.traveled += step;
            const t = Math.min(1, this.traveled / this.totalDist);

            this.x = this.startX + (this.targetX - this.startX) * t;
            this.y = this.startY + (this.targetY - this.startY) * t;
            // Height offset above ground (parabola: 4 * h * t * (1 - t))
            this.heightZ = 4 * this.arcHeight * t * (1 - t);

            if (t >= 1) {
                this.onImpact(enemies);
                this.alive = false;
            }
        } else if (this.type === 'SOCCER' || (this.type === 'JAVELIN' && this.pierceCount > 1)) {
            // Line trajectory with piercing
            const vx = Math.cos(this.angle) * this.speed * dt;
            const vy = Math.sin(this.angle) * this.speed * dt;
            this.x += vx;
            this.y += vy;
            this.traveled += Math.hypot(vx, vy);

            // Check collision with any alive enemies along path
            for (const enemy of enemies) {
                if (!enemy.alive || this.hitEnemies.has(enemy)) continue;
                const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                if (d <= enemy.size + 10) {
                    this.hitEnemy(enemy, enemies);
                    this.hitEnemies.add(enemy);

                    if (this.hitEnemies.size >= this.pierceCount) {
                        this.alive = false;
                        break;
                    }
                }
            }

            // Despawn if out of bounds or traveled far
            if (this.x < -40 || this.x > 1000 || this.y < -40 || this.y > 640 || this.traveled > 400) {
                this.alive = false;
            }
        } else {
            // Homing / direct projectile towards target
            if (this.target && this.target.alive) {
                this.targetX = this.target.x;
                this.targetY = this.target.y;
            }

            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.hypot(dx, dy);

            this.angle = Math.atan2(dy, dx);
            const step = this.speed * dt;

            if (dist <= step || dist < 12) {
                this.x = this.targetX;
                this.y = this.targetY;
                if (this.target && this.target.alive) {
                    this.hitEnemy(this.target, enemies);
                } else {
                    // Check closest enemy
                    for (const enemy of enemies) {
                        if (enemy.alive && Math.hypot(enemy.x - this.x, enemy.y - this.y) <= 20) {
                            this.hitEnemy(enemy, enemies);
                            break;
                        }
                    }
                }
                this.alive = false;
            } else {
                this.x += Math.cos(this.angle) * step;
                this.y += Math.sin(this.angle) * step;
            }
        }
    }

    hitEnemy(enemy, enemies = null) {
        enemy.applyDamage(this.damage, this.armorPierce);

        if (this.slowFactor) {
            enemy.applySlow(this.slowDuration, this.slowFactor);
        }

        if (this.knockback > 0) {
            enemy.distance = Math.max(0, enemy.distance - this.knockback);
        }

        if (this.splashRadius > 0 && enemies) {
            this.triggerSplash(enemy.x, enemy.y, [enemy], enemies);
        }
    }

    onImpact(enemies) {
        // AoE explosion impact at target coords
        if (window.particleSystem) {
            window.particleSystem.addShockwave(this.x, this.y, this.splashRadius, '#ff9800');
            window.particleSystem.addHitSparks(this.x, this.y, '#ff9800', 14);
        }
        this.triggerSplash(this.x, this.y, [], enemies);
    }

    triggerSplash(centerX, centerY, excludeEnemies = [], enemiesList = null) {
        if (!enemiesList) return;
        for (const enemy of enemiesList) {
            if (!enemy.alive || excludeEnemies.includes(enemy)) continue;
            const dist = Math.hypot(enemy.x - centerX, enemy.y - centerY);
            if (dist <= this.splashRadius) {
                const falloff = 1 - (dist / (this.splashRadius * 1.3));
                const damage = this.damage * Math.max(0.4, falloff);
                enemy.applyDamage(damage, this.armorPierce);
                if (this.slowFactor) {
                    enemy.applySlow(this.slowDuration, this.slowFactor);
                }
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();

        if (this.type === 'BASKETBALL') {
            const currentY = this.y - (this.heightZ || 0);

            // Ground shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            const shadowSize = Math.max(3, 8 * (1 - (this.heightZ || 0) / (this.arcHeight * 1.5)));
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, shadowSize, shadowSize * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Basketball
            ctx.translate(this.x, currentY);
            ctx.rotate(this.spin);
            ctx.fillStyle = '#ff6f00';
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fill();
            // Ball black seams
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(7, 0);
            ctx.stroke();
        } else if (this.type === 'TENNIS') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.spin);
            // Neon tennis ball
            ctx.fillStyle = this.isCrit ? '#ffd700' : '#c6ff00';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, 3.5, 0.5, Math.PI * 0.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 3.5, Math.PI + 0.5, Math.PI * 1.9);
            ctx.stroke();
        } else if (this.type === 'HOCKEY') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            // Black hockey puck
            ctx.fillStyle = '#212121';
            ctx.fillRect(-6, -3, 12, 6);
            ctx.strokeStyle = '#81d4fa';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-6, -3, 12, 6);
        } else if (this.type === 'SOCCER') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.spin);
            // Classic black/white soccer ball
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#212121';
            // Pentagons
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI * 2) / 3;
                ctx.fillRect(Math.cos(a) * 3 - 2, Math.sin(a) * 3 - 2, 4, 4);
            }
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (this.type === 'JAVELIN') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            // Aerodynamic spear / javelin
            ctx.strokeStyle = '#ffb300';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-16, 0);
            ctx.lineTo(14, 0);
            ctx.stroke();
            // Shiny spearhead
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(14, -3);
            ctx.lineTo(20, 0);
            ctx.lineTo(14, 3);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}

class Tower {
    constructor(typeKey, col, row, tileSize) {
        this.typeKey = typeKey;
        this.col = col;
        this.row = row;
        this.tileSize = tileSize;
        this.x = (col + 0.5) * tileSize;
        this.y = (row + 0.5) * tileSize;

        const def = TOWER_TYPES[typeKey];
        this.def = def;
        this.name = def.name;
        this.level = 1; // 1, 2, or 3
        this.totalInvested = def.cost;

        this.range = def.range;
        this.fireRate = def.fireRate;
        this.damage = def.damage;
        this.splashRadius = def.splashRadius || 0;
        this.slowFactor = def.slowFactor || null;
        this.slowDuration = def.slowDuration || 0;
        this.pierceCount = def.pierceCount || 1;
        this.armorPierce = def.armorPierce || false;
        this.critChance = def.critChance || 0;
        this.knockback = def.knockback || 0;

        this.cooldown = 0;
        this.angle = 0;
        this.target = null;
        this.targetMode = 'FIRST'; // FIRST, STRONGEST, WEAKEST, CLOSEST
        this.swingAnim = 0;
        this.totalKills = 0;
        this.totalDamageDealt = 0;
    }

    upgrade() {
        if (this.level >= 3) return false;
        const upgDef = this.def.upgrades[this.level - 1];
        if (!upgDef) return false;

        this.level++;
        this.totalInvested += upgDef.cost;

        if (upgDef.damageMul) this.damage = Math.round(this.damage * upgDef.damageMul);
        if (upgDef.rangeMul) this.range = Math.round(this.range * upgDef.rangeMul);
        if (upgDef.fireRateMul) this.fireRate = this.fireRate * upgDef.fireRateMul;
        if (upgDef.splashRadius) this.splashRadius = upgDef.splashRadius;
        if (upgDef.slowFactor) this.slowFactor = upgDef.slowFactor;
        if (upgDef.slowDurationMul) this.slowDuration = this.slowDuration * upgDef.slowDurationMul;
        if (upgDef.pierceCount) this.pierceCount = upgDef.pierceCount;
        if (upgDef.critChance) this.critChance = upgDef.critChance;
        if (upgDef.knockback) this.knockback = upgDef.knockback;

        if (window.soundManager) window.soundManager.upgrade();
        if (window.particleSystem) {
            window.particleSystem.addHitSparks(this.x, this.y, '#ffd700', 16);
            window.particleSystem.addFloatingText(this.x, this.y - 25, 'UPGRADE! ★', '#ffd700', 16);
        }

        return true;
    }

    getSellValue() {
        return Math.floor(this.totalInvested * 0.7);
    }

    getNextUpgradeCost() {
        if (this.level >= 3) return null;
        return this.def.upgrades[this.level - 1].cost;
    }

    getNextUpgradeInfo() {
        if (this.level >= 3) return null;
        return this.def.upgrades[this.level - 1];
    }

    cycleTargetMode() {
        const modes = ['FIRST', 'STRONGEST', 'WEAKEST', 'CLOSEST'];
        const currentIdx = modes.indexOf(this.targetMode);
        this.targetMode = modes[(currentIdx + 1) % modes.length];
        return this.targetMode;
    }

    findTarget(enemies) {
        let candidates = enemies.filter(e => {
            if (!e.alive) return false;
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            return dist <= this.range;
        });

        if (candidates.length === 0) return null;

        switch (this.targetMode) {
            case 'STRONGEST':
                return candidates.sort((a, b) => b.hp - a.hp)[0];
            case 'WEAKEST':
                return candidates.sort((a, b) => a.hp - b.hp)[0];
            case 'CLOSEST':
                return candidates.sort((a, b) => {
                    const da = Math.hypot(a.x - this.x, a.y - this.y);
                    const db = Math.hypot(b.x - this.x, b.y - this.y);
                    return da - db;
                })[0];
            case 'FIRST':
            default:
                // Furthest along the track
                return candidates.sort((a, b) => b.distance - a.distance)[0];
        }
    }

    update(dt, enemies, projectiles) {
        if (this.cooldown > 0) {
            this.cooldown -= dt;
        }

        if (this.swingAnim > 0) {
            this.swingAnim -= dt * 6;
        }

        this.target = this.findTarget(enemies);

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

            if (this.cooldown <= 0) {
                this.shoot(this.target, projectiles);
                this.cooldown = 1 / this.fireRate;
                this.swingAnim = 1.0;
            }
        }
    }

    shoot(target, projectiles) {
        let finalDamage = this.damage;
        let isCrit = false;

        if (this.critChance > 0 && Math.random() < this.critChance) {
            finalDamage = Math.round(this.damage * 2.5);
            isCrit = true;
        }

        let speed = 460;
        let arcHeight = 0;

        if (this.typeKey === 'TENNIS') {
            speed = 520;
            if (window.soundManager) window.soundManager.tennisHit();
        } else if (this.typeKey === 'HOCKEY') {
            speed = 480;
            if (window.soundManager) window.soundManager.hockeySlap();
        } else if (this.typeKey === 'BASKETBALL') {
            speed = 340;
            arcHeight = 65;
            if (window.soundManager) window.soundManager.basketballBounce();
        } else if (this.typeKey === 'SOCCER') {
            speed = 460;
            if (window.soundManager) window.soundManager.soccerKick();
        } else if (this.typeKey === 'JAVELIN') {
            speed = 650;
            if (window.soundManager) window.soundManager.javelinThrow();
        }

        projectiles.push(new Projectile({
            type: this.typeKey,
            x: this.x,
            y: this.y,
            target: target,
            targetX: target.x,
            targetY: target.y,
            damage: finalDamage,
            speed: speed,
            isCrit: isCrit,
            slowFactor: this.slowFactor,
            slowDuration: this.slowDuration,
            splashRadius: this.splashRadius,
            pierceCount: this.pierceCount,
            armorPierce: this.armorPierce,
            knockback: this.knockback,
            arcHeight: arcHeight
        }));
    }

    draw(ctx, isSelected = false) {
        ctx.save();

        // 1. Tower Base / Pedestal
        ctx.fillStyle = '#263238';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#ffeb3b' : (this.level === 3 ? '#ffd700' : this.level === 2 ? '#90caf9' : '#546e7a');
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // 2. Athlete Figure (Rotated towards target)
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const swing = Math.sin(this.swingAnim * Math.PI) * 12;

        switch (this.typeKey) {
            case 'TENNIS':
                this.drawTennisAthlete(ctx, swing);
                break;
            case 'HOCKEY':
                this.drawHockeyAthlete(ctx, swing);
                break;
            case 'BASKETBALL':
                this.drawBasketballAthlete(ctx, swing);
                break;
            case 'SOCCER':
                this.drawSoccerAthlete(ctx, swing);
                break;
            case 'JAVELIN':
                this.drawJavelinAthlete(ctx, swing);
                break;
        }
        ctx.restore();

        // 3. Level Stars on pedestal
        this.drawLevelBadge(ctx);

        // 4. Selection Range Circle & Floating Upgrade Badge
        if (isSelected) {
            ctx.strokeStyle = 'rgba(255, 235, 59, 0.7)';
            ctx.fillStyle = 'rgba(255, 235, 59, 0.1)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            this.drawFloatingUpgradeBadge(ctx);
        }

        ctx.restore();
    }

    drawFloatingUpgradeBadge(ctx) {
        ctx.save();
        const cost = this.getNextUpgradeCost();
        const badgeY = this.y - 36;
        const badgeH = 22;

        if (cost !== null) {
            const text = `⬆ VYLEPŠIT (${cost} 🎟️)`;
            ctx.font = 'bold 12px sans-serif';
            const textWidth = ctx.measureText(text).width;
            const badgeW = textWidth + 18;
            const badgeX = this.x - badgeW / 2;

            // Background pill
            ctx.fillStyle = '#ff8f00';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(badgeX, badgeY - badgeH / 2, badgeW, badgeH, 11);
            } else {
                ctx.rect(badgeX, badgeY - badgeH / 2, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, this.x, badgeY);

            // Sub-hint
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#ffeb3b';
            ctx.fillText('Klikni pro vylepšení!', this.x, badgeY - 14);
        } else {
            const text = `MAX ÚROVEŇ ★★★`;
            ctx.font = 'bold 11px sans-serif';
            const textWidth = ctx.measureText(text).width;
            const badgeW = textWidth + 16;
            const badgeX = this.x - badgeW / 2;

            ctx.fillStyle = '#2e7d32';
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(badgeX, badgeY - badgeH / 2, badgeW, badgeH, 11);
            } else {
                ctx.rect(badgeX, badgeY - badgeH / 2, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, this.x, badgeY);
        }
        ctx.restore();
    }

    drawLevelBadge(ctx) {
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        let stars = this.level === 1 ? '★' : this.level === 2 ? '★★' : '★★★';
        ctx.fillStyle = this.level === 3 ? '#ffd700' : this.level === 2 ? '#64b5f6' : '#ffffff';
        ctx.fillText(stars, this.x, this.y + 24);
        ctx.restore();
    }

    drawTennisAthlete(ctx, swing) {
        // White polo & green shorts
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();

        // Head with headband
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(3, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f44336';
        ctx.fillRect(1, -5, 3, 10); // Red headband

        // Tennis racket in arm
        ctx.strokeStyle = '#388e3c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(3, 4);
        ctx.lineTo(12 + swing, 10);
        ctx.stroke();

        // Racket oval
        ctx.strokeStyle = '#c6ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(15 + swing, 12, 6, 4, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    drawHockeyAthlete(ctx, swing) {
        // Blue jersey & helmet
        ctx.fillStyle = '#1565c0';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Hockey helmet with visor
        ctx.fillStyle = '#0d47a1';
        ctx.beginPath();
        ctx.arc(4, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#81d4fa';
        ctx.fillRect(7, -3, 3, 6); // Visor

        // Hockey stick
        ctx.strokeStyle = '#8d6e63';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.lineTo(13 + swing, 7);
        ctx.lineTo(17 + swing, 11);
        ctx.stroke();
    }

    drawBasketballAthlete(ctx, swing) {
        // Purple/gold Lakers-style jersey
        ctx.fillStyle = '#ffb300';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Tall athlete head
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.arc(4, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Arm holding basketball up
        ctx.strokeStyle = '#ffb300';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(3, -4);
        ctx.lineTo(11 + swing, -7);
        ctx.stroke();

        // Orange ball in hand
        ctx.fillStyle = '#ff6f00';
        ctx.beginPath();
        ctx.arc(14 + swing, -8, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSoccerAthlete(ctx, swing) {
        // Red striped jersey
        ctx.fillStyle = '#e53935';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(4, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Kicking leg with soccer shoe
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(2, 4);
        ctx.lineTo(14 + swing, 8);
        ctx.stroke();

        // Soccer ball nearby
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(16 + swing, 9, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    drawJavelinAthlete(ctx, swing) {
        // Sleek athletic singlet (Black/Gold)
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(3, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Long javelin held along arm
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(18 + swing, -5);
        ctx.stroke();

        // Spear point
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(18 + swing, -7);
        ctx.lineTo(23 + swing, -5);
        ctx.lineTo(18 + swing, -3);
        ctx.closePath();
        ctx.fill();
    }
}

window.TOWER_TYPES = TOWER_TYPES;
window.Tower = Tower;
window.Projectile = Projectile;
