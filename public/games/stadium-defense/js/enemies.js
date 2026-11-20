// Enemies and Wave Management System

const ENEMY_TYPES = {
    FAN: {
        id: 'fan',
        name: 'Běžný fanoušek',
        baseHp: 90,
        speed: 70,
        reward: 12,
        size: 14,
        color: '#e53935',
        description: 'Běžný fanoušek toužící po trofeji.'
    },
    STREAKER: {
        id: 'streaker',
        name: 'Streaker (Naháč)',
        baseHp: 50,
        speed: 130,
        reward: 16,
        size: 12,
        color: '#ffb74d',
        description: 'Bleskový běžec bez dresu. Rychlý, ale slabý!'
    },
    HOOLIGAN: {
        id: 'hooligan',
        name: 'Kotelník (Hooligan)',
        baseHp: 180,
        speed: 60,
        reward: 24,
        armor: 0.25, // 25% damage reduction
        size: 15,
        color: '#37474f',
        description: 'Těžce oblečený výtržník s dýmovnicí.'
    },
    MASCOT: {
        id: 'mascot',
        name: 'Klubový maskot',
        baseHp: 320,
        speed: 45,
        reward: 35,
        slowResist: 0.5, // 50% slow resistance
        size: 18,
        color: '#8d6e63',
        description: 'Obří plyšový maskot. Velká výdrž, pomalý krok.'
    },
    BOSS: {
        id: 'boss',
        name: 'Šéf soupeřova kotle (Boss)',
        baseHp: 1200,
        speed: 52,
        reward: 150,
        isBoss: true,
        size: 22,
        color: '#d32f2f',
        description: 'Vůdce invaze s megafonem a obří výdrží!'
    }
};

class Enemy {
    constructor(typeKey, waveNumber, map) {
        const def = ENEMY_TYPES[typeKey];
        this.def = def;
        this.typeKey = typeKey;
        this.map = map;

        // Stat scaling with wave number
        const waveScale = 1 + (waveNumber - 1) * 0.16;
        this.maxHp = Math.round(def.baseHp * waveScale);
        this.hp = this.maxHp;
        this.baseSpeed = def.speed;
        this.speed = this.baseSpeed;
        this.reward = Math.round(def.reward * (1 + (waveNumber - 1) * 0.05));
        this.size = def.size;

        this.distance = 0;
        this.x = -20;
        this.y = 0;
        this.angle = 0;
        this.alive = true;
        this.reachedEnd = false;

        // Status effects
        this.slowTimer = 0;
        this.slowFactor = 1.0;
        this.animTimer = Math.random() * 10;
        this.burnTimer = 0;

        // Boss special ability
        this.rageTimer = 0;
    }

    applyDamage(amount, isPierce = false) {
        let finalDamage = amount;
        if (this.def.armor && !isPierce) {
            finalDamage = amount * (1 - this.def.armor);
        }
        this.hp -= finalDamage;

        // Sound & FX
        if (window.soundManager) window.soundManager.hit();
        if (window.particleSystem) {
            const isCrit = Math.random() < 0.2;
            const textColor = isCrit ? '#ffeb3b' : '#ffffff';
            const text = Math.round(finalDamage).toString();
            window.particleSystem.addFloatingText(this.x, this.y - 12, text, textColor, isCrit ? 16 : 13);
            window.particleSystem.addHitSparks(this.x, this.y, isCrit ? '#ffca28' : '#e0e0e0', isCrit ? 8 : 4);
        }

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.onDeath();
        }
    }

    applySlow(duration, factor) {
        const resist = this.def.slowResist || 0;
        const effectiveFactor = 1 - ((1 - factor) * (1 - resist));
        this.slowTimer = Math.max(this.slowTimer, duration);
        this.slowFactor = Math.min(this.slowFactor, effectiveFactor);
        if (window.particleSystem) {
            window.particleSystem.addIceParticles(this.x, this.y, 4);
        }
    }

    onDeath() {
        if (window.particleSystem) {
            window.particleSystem.addHitSparks(this.x, this.y, '#ffd54f', 12);
            window.particleSystem.addFloatingText(this.x, this.y - 20, `+${this.reward} 🎟️`, '#ffeb3b', 15);
        }
        if (window.soundManager) {
            window.soundManager.coin();
        }
    }

    update(dt) {
        if (!this.alive) return;

        this.animTimer += dt;

        // Handle slow status effect
        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) {
                this.slowFactor = 1.0;
            }
        }

        // Boss rage burst
        let bossSpeedMultiplier = 1.0;
        if (this.def.isBoss) {
            this.rageTimer += dt;
            if (this.rageTimer >= 7.0) {
                bossSpeedMultiplier = 1.7; // Sudden charge!
                if (window.particleSystem && Math.random() < 0.3) {
                    window.particleSystem.addHitSparks(this.x, this.y, '#ff1744', 3);
                }
                if (this.rageTimer >= 9.5) {
                    this.rageTimer = 0; // Reset rage cycle
                }
            }
        }

        const currentSpeed = this.baseSpeed * this.slowFactor * bossSpeedMultiplier;
        this.distance += currentSpeed * dt;

        // Get coordinates along the path
        const pos = this.map.getPositionAtDistance(this.distance);
        this.x = pos.x;
        this.y = pos.y;
        this.angle = pos.angle;

        // Reached the goal
        if (this.distance >= this.map.totalDistance) {
            this.alive = false;
            this.reachedEnd = true;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Runner bobbing effect
        const bob = Math.sin(this.animTimer * 12) * 2;

        // Shadow under feet
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 6, this.size * 0.9, this.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Slow aura if chilled
        if (this.slowTimer > 0) {
            ctx.strokeStyle = 'rgba(79, 195, 247, 0.8)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, bob, this.size + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Rotate facing direction
        ctx.rotate(this.angle);

        // Draw distinct visual per enemy type
        switch (this.typeKey) {
            case 'FAN':
                this.drawFan(ctx, bob);
                break;
            case 'STREAKER':
                this.drawStreaker(ctx, bob);
                break;
            case 'HOOLIGAN':
                this.drawHooligan(ctx, bob);
                break;
            case 'MASCOT':
                this.drawMascot(ctx, bob);
                break;
            case 'BOSS':
                this.drawBoss(ctx, bob);
                break;
            default:
                this.drawDefault(ctx, bob);
        }

        ctx.restore();

        // Draw Health Bar above enemy (unrotated)
        this.drawHealthBar(ctx);
    }

    drawFan(ctx, bob) {
        // Red jersey body
        ctx.fillStyle = '#d32f2f';
        ctx.beginPath();
        ctx.arc(0, bob, 11, 0, Math.PI * 2);
        ctx.fill();

        // Fan cap visor facing forward (right)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(4, bob - 4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(7, bob - 5, 5, 3); // Visor brim

        // Scarf tail
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-6, bob);
        ctx.lineTo(-12, bob + Math.sin(this.animTimer * 15) * 4);
        ctx.stroke();
    }

    drawStreaker(ctx, bob) {
        // Flesh tone runner
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(0, bob, 9, 0, Math.PI * 2);
        ctx.fill();

        // Running motion legs/arms blur
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        // White sports socks
        ctx.strokeRect(3, bob + 5, 4, 3);
        ctx.strokeRect(-5, bob + 5, 4, 3);

        // Blurring speed lines behind
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(-10, bob);
        ctx.lineTo(-18, bob);
        ctx.stroke();
    }

    drawHooligan(ctx, bob) {
        // Black hoodie
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        ctx.arc(0, bob, 13, 0, Math.PI * 2);
        ctx.fill();

        // Protective helmet / skull bandana
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.arc(2, bob - 2, 5, 0, Math.PI * 2);
        ctx.fill();

        // Smoke flare in hand
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.arc(8, bob - 7, 4, 0, Math.PI * 2);
        ctx.fill();
        // Smoke puff
        ctx.fillStyle = 'rgba(255, 87, 34, 0.5)';
        ctx.beginPath();
        ctx.arc(12 + Math.sin(this.animTimer * 10) * 3, bob - 9, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    drawMascot(ctx, bob) {
        // Big fluffy lion / bear costume
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.arc(0, bob, 16, 0, Math.PI * 2);
        ctx.fill();

        // Fluffy ears
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.arc(-8, bob - 12, 5, 0, Math.PI * 2);
        ctx.arc(4, bob - 12, 5, 0, Math.PI * 2);
        ctx.fill();

        // Mascot snout & nose
        ctx.fillStyle = '#d7ccc8';
        ctx.beginPath();
        ctx.arc(8, bob, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3e2723';
        ctx.beginPath();
        ctx.arc(12, bob, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawBoss(ctx, bob) {
        // Glowing boss circle
        const isRaging = this.rageTimer >= 7.0;
        ctx.fillStyle = isRaging ? '#b71c1c' : '#c62828';
        ctx.beginPath();
        ctx.arc(0, bob, 20, 0, Math.PI * 2);
        ctx.fill();

        // Golden spiked crown
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(-10, bob - 14);
        ctx.lineTo(-5, bob - 24);
        ctx.lineTo(0, bob - 16);
        ctx.lineTo(5, bob - 24);
        ctx.lineTo(10, bob - 14);
        ctx.closePath();
        ctx.fill();

        // Megaphone in hand
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(10, bob - 4);
        ctx.lineTo(24, bob - 12);
        ctx.lineTo(24, bob + 4);
        ctx.closePath();
        ctx.fill();
    }

    drawDefault(ctx, bob) {
        ctx.fillStyle = this.def.color;
        ctx.beginPath();
        ctx.arc(0, bob, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    drawHealthBar(ctx) {
        const barW = Math.max(26, this.size * 2);
        const barH = 5;
        const barX = this.x - barW / 2;
        const barY = this.y - this.size - 10;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Fill ratio
        const pct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ffeb3b' : '#f44336';
        ctx.fillRect(barX, barY, barW * pct, barH);

        // Armor shield icon if applicable
        if (this.def.armor) {
            ctx.fillStyle = '#90a4ae';
            ctx.beginPath();
            ctx.arc(barX - 5, barY + 2.5, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Boss crown icon
        if (this.def.isBoss) {
            ctx.font = '10px sans-serif';
            ctx.fillText('👑', barX + barW / 2 - 5, barY - 3);
        }
    }
}

// Pre-defined wave progression
const WAVES_CONFIG = [
    // Wave 1
    {
        title: "Vlna 1: Zahřívací kolo",
        spawns: [
            { type: 'FAN', count: 6, interval: 1.3 }
        ]
    },
    // Wave 2
    {
        title: "Vlna 2: První sprinteři",
        spawns: [
            { type: 'FAN', count: 6, interval: 1.1 },
            { type: 'STREAKER', count: 3, interval: 0.9 }
        ]
    },
    // Wave 3
    {
        title: "Vlna 3: Naháči v plném běhu!",
        spawns: [
            { type: 'STREAKER', count: 8, interval: 0.75 },
            { type: 'FAN', count: 6, interval: 1.0 }
        ]
    },
    // Wave 4
    {
        title: "Vlna 4: Příchod kotelníků",
        spawns: [
            { type: 'HOOLIGAN', count: 4, interval: 1.6 },
            { type: 'FAN', count: 8, interval: 0.9 }
        ]
    },
    // Wave 5
    {
        title: "Vlna 5: Maskot na scéně! (Miniboss)",
        spawns: [
            { type: 'FAN', count: 6, interval: 1.0 },
            { type: 'MASCOT', count: 1, interval: 2.0 },
            { type: 'STREAKER', count: 5, interval: 0.8 }
        ]
    },
    // Wave 6
    {
        title: "Vlna 6: Kotel se bouří",
        spawns: [
            { type: 'HOOLIGAN', count: 7, interval: 1.2 },
            { type: 'STREAKER', count: 6, interval: 0.7 }
        ]
    },
    // Wave 7
    {
        title: "Vlna 7: Útok plyšáků",
        spawns: [
            { type: 'MASCOT', count: 3, interval: 2.2 },
            { type: 'FAN', count: 10, interval: 0.8 }
        ]
    },
    // Wave 8
    {
        title: "Vlna 8: Sprinterská lavina",
        spawns: [
            { type: 'STREAKER', count: 16, interval: 0.45 },
            { type: 'HOOLIGAN', count: 5, interval: 1.0 }
        ]
    },
    // Wave 9
    {
        title: "Vlna 9: Obrněný předvoj",
        spawns: [
            { type: 'HOOLIGAN', count: 10, interval: 0.9 },
            { type: 'MASCOT', count: 4, interval: 1.8 }
        ]
    },
    // Wave 10
    {
        title: "Vlna 10: Poločasový Šéf! (BOSS)",
        spawns: [
            { type: 'FAN', count: 8, interval: 0.8 },
            { type: 'BOSS', count: 1, interval: 2.5 },
            { type: 'STREAKER', count: 8, interval: 0.7 }
        ]
    },
    // Wave 11
    {
        title: "Vlna 11: Zdivočelý dav",
        spawns: [
            { type: 'FAN', count: 15, interval: 0.6 },
            { type: 'HOOLIGAN', count: 8, interval: 0.9 }
        ]
    },
    // Wave 12
    {
        title: "Vlna 12: Průraz maskotů",
        spawns: [
            { type: 'MASCOT', count: 6, interval: 1.4 },
            { type: 'STREAKER', count: 12, interval: 0.5 }
        ]
    },
    // Wave 13
    {
        title: "Vlna 13: Tvrdé jádro chuligánů",
        spawns: [
            { type: 'HOOLIGAN', count: 14, interval: 0.7 },
            { type: 'MASCOT', count: 5, interval: 1.3 }
        ]
    },
    // Wave 14
    {
        title: "Vlna 14: Předfinální bouře",
        spawns: [
            { type: 'STREAKER', count: 18, interval: 0.4 },
            { type: 'HOOLIGAN', count: 10, interval: 0.8 },
            { type: 'MASCOT', count: 4, interval: 1.2 }
        ]
    },
    // Wave 15
    {
        title: "Vlna 15: FINÁLE – Absolutní invaze kotle!",
        spawns: [
            { type: 'HOOLIGAN', count: 12, interval: 0.7 },
            { type: 'MASCOT', count: 6, interval: 1.2 },
            { type: 'BOSS', count: 2, interval: 4.0 },
            { type: 'STREAKER', count: 15, interval: 0.5 }
        ]
    }
];

class WaveManager {
    constructor(map) {
        this.map = map;
        this.currentWaveIndex = 0; // 0-based
        this.enemies = [];
        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.isWaveInProgress = false;
        this.waveCompleted = false;
        this.maxWaves = WAVES_CONFIG.length;
    }

    startWave(index = null) {
        if (index !== null) {
            this.currentWaveIndex = index;
        }

        if (this.currentWaveIndex >= this.maxWaves) {
            return false; // All waves finished!
        }

        const config = WAVES_CONFIG[this.currentWaveIndex];
        this.spawnQueue = [];

        // Build spawn list
        for (const group of config.spawns) {
            for (let i = 0; i < group.count; i++) {
                this.spawnQueue.push({
                    type: group.type,
                    interval: group.interval
                });
            }
        }

        this.spawnTimer = 0.5; // Slight delay before first runner
        this.isWaveInProgress = true;
        this.waveCompleted = false;

        if (window.soundManager) {
            window.soundManager.whistle();
        }

        return true;
    }

    getCurrentWaveInfo() {
        const config = WAVES_CONFIG[Math.min(this.currentWaveIndex, this.maxWaves - 1)];
        return {
            waveNumber: this.currentWaveIndex + 1,
            totalWaves: this.maxWaves,
            title: config.title,
            isLastWave: this.currentWaveIndex === this.maxWaves - 1
        };
    }

    update(dt) {
        // Spawn pending enemies
        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                const item = this.spawnQueue.shift();
                const newEnemy = new Enemy(item.type, this.currentWaveIndex + 1, this.map);
                this.enemies.push(newEnemy);
                this.spawnTimer = item.interval;
            }
        }

        // Update all alive enemies
        let livesLost = 0;
        let ticketsEarned = 0;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt);

            if (enemy.reachedEnd) {
                livesLost += (enemy.def.isBoss ? 3 : 1);
                this.enemies.splice(i, 1);
                if (window.soundManager) window.soundManager.buzzer();
            } else if (!enemy.alive) {
                ticketsEarned += enemy.reward;
                this.enemies.splice(i, 1);
            }
        }

        let waveJustCompleted = false;
        // Check if wave finished
        if (this.isWaveInProgress && this.spawnQueue.length === 0 && this.enemies.length === 0) {
            this.isWaveInProgress = false;
            this.waveCompleted = true;
            waveJustCompleted = true;
            this.currentWaveIndex++;
            if (window.soundManager) window.soundManager.crowdCheer();
            if (window.particleSystem) {
                window.particleSystem.addConfetti(480, 200, 50);
            }
        }

        return {
            livesLost,
            ticketsEarned,
            waveCompleted: waveJustCompleted,
            allWavesCompleted: waveJustCompleted && this.currentWaveIndex >= this.maxWaves
        };
    }

    draw(ctx) {
        // Draw enemies sorted by Y so closer ones appear in front
        const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
        for (const enemy of sorted) {
            enemy.draw(ctx);
        }
    }
}

window.ENEMY_TYPES = ENEMY_TYPES;
window.WAVES_CONFIG = WAVES_CONFIG;
window.WaveManager = WaveManager;
