// Main Game Engine and Controller for Stadium Defense

class StadiumDefenseGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.tickets = 350; // Starting budget
        this.lives = 20;
        this.score = 0;
        this.gameSpeed = 1; // 1 or 2
        this.isPaused = false;
        this.isGameOver = false;
        this.isVictory = false;
        this.autoPlayWaves = false;

        this.map = new window.StadiumMap();
        this.waveManager = new window.WaveManager(this.map);
        this.towers = [];
        this.projectiles = [];

        this.selectedBuildType = null;
        this.selectedTower = null;

        this.mousePos = { x: -1, y: -1 };
        this.hoverCol = -1;
        this.hoverRow = -1;

        this.lastTime = performance.now();

        this.initUI();
        this.initEvents();
        this.updateHUD();

        // Start game loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    initUI() {
        this.elTickets = document.getElementById('hud-tickets');
        this.elLives = document.getElementById('hud-lives');
        this.elWave = document.getElementById('hud-wave');
        this.elWaveTitle = document.getElementById('hud-wave-title');
        this.elScore = document.getElementById('hud-score');

        this.btnNextWave = document.getElementById('btn-next-wave');
        this.btnSpeed = document.getElementById('btn-speed');
        this.btnPause = document.getElementById('btn-pause');
        this.btnMute = document.getElementById('btn-mute');
        this.chkAutoplay = document.getElementById('chk-autoplay');

        // Inspector elements
        this.panelInspector = document.getElementById('tower-inspector');
        this.elInspName = document.getElementById('insp-name');
        this.elInspLevel = document.getElementById('insp-level');
        this.elInspDmg = document.getElementById('insp-damage');
        this.elInspRange = document.getElementById('insp-range');
        this.elInspRate = document.getElementById('insp-rate');
        this.elInspTarget = document.getElementById('insp-target');
        this.btnUpgrade = document.getElementById('btn-upgrade');
        this.btnSell = document.getElementById('btn-sell');
        this.btnTargetMode = document.getElementById('btn-target-mode');

        // Modals
        this.modalGameOver = document.getElementById('modal-gameover');
        this.modalVictory = document.getElementById('modal-victory');
        this.btnRestart = document.getElementById('btn-restart');
        this.btnRestartVic = document.getElementById('btn-restart-victory');
    }

    initEvents() {
        // Tower selection dock buttons
        document.querySelectorAll('.tower-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.tower;
                if (this.selectedBuildType === type) {
                    this.setBuildMode(null);
                } else {
                    this.setBuildMode(type);
                }
            });
        });

        // Next wave button
        this.btnNextWave.addEventListener('click', () => {
            this.startNextWave();
        });

        // Speed toggle
        this.btnSpeed.addEventListener('click', () => {
            this.gameSpeed = (this.gameSpeed === 1) ? 2 : 1;
            this.btnSpeed.textContent = `${this.gameSpeed}x Rychlost`;
            this.btnSpeed.classList.toggle('active', this.gameSpeed === 2);
            if (window.soundManager) window.soundManager.click();
        });

        // Pause toggle
        this.btnPause.addEventListener('click', () => {
            this.isPaused = !this.isPaused;
            this.btnPause.textContent = this.isPaused ? '▶ Pokračovat' : '⏸ Pauza';
            this.btnPause.classList.toggle('paused', this.isPaused);
            if (window.soundManager) window.soundManager.click();
        });

        // Mute toggle
        this.btnMute.addEventListener('click', () => {
            const isMuted = window.soundManager.toggleMute();
            this.btnMute.textContent = isMuted ? '🔇 Zvuk Vypnut' : '🔊 Zvuk Zapnut';
            this.btnMute.classList.toggle('muted', isMuted);
        });

        // Autoplay toggle
        this.chkAutoplay.addEventListener('change', (e) => {
            this.autoPlayWaves = e.target.checked;
        });

        // Inspector buttons
        this.btnUpgrade.addEventListener('click', () => {
            if (this.selectedTower) {
                this.tryUpgradeTower(this.selectedTower);
            }
        });

        this.btnSell.addEventListener('click', () => {
            if (this.selectedTower) {
                const refund = this.selectedTower.getSellValue();
                this.tickets += refund;
                this.map.clearTile(this.selectedTower.col, this.selectedTower.row);
                this.towers = this.towers.filter(t => t !== this.selectedTower);
                if (window.particleSystem) {
                    window.particleSystem.addFloatingText(this.selectedTower.x, this.selectedTower.y, `+${refund} 🎟️`, '#81c784', 16);
                }
                if (window.soundManager) window.soundManager.coin();
                this.selectTower(null);
                this.updateHUD();
            }
        });

        this.btnTargetMode.addEventListener('click', () => {
            if (this.selectedTower) {
                this.selectedTower.cycleTargetMode();
                this.updateInspector();
                if (window.soundManager) window.soundManager.click();
            }
        });

        // Prevent clicks on inspector panel from bubbling
        this.panelInspector.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Restart buttons
        this.btnRestart.addEventListener('click', () => this.restartGame());
        this.btnRestartVic.addEventListener('click', () => this.restartGame());

        // Canvas interactions
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverCol = -1;
            this.hoverRow = -1;
            this.canvas.style.cursor = 'default';
        });
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleCanvasDoubleClick(e));

        // Keyboard hotkeys
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.setBuildMode(null);
                this.selectTower(null);
            } else if (e.key === ' ' || e.code === 'Space') {
                this.btnPause.click();
            } else if (e.key.toLowerCase() === 'n') {
                this.startNextWave();
            } else if (e.key.toLowerCase() === 'u') {
                if (this.selectedTower) this.btnUpgrade.click();
            } else if (e.key.toLowerCase() === 's' && !e.ctrlKey) {
                if (this.selectedTower) this.btnSell.click();
            } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
                const keys = ['TENNIS', 'HOCKEY', 'BASKETBALL', 'SOCCER', 'JAVELIN'];
                const selectedKey = keys[parseInt(e.key) - 1];
                this.setBuildMode(selectedKey);
            }
        });
    }

    setBuildMode(typeKey) {
        this.selectedBuildType = typeKey;
        if (typeKey) {
            this.selectTower(null); // deselect existing tower inspector when activating build mode
        }

        document.querySelectorAll('.tower-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.tower === typeKey);
        });

        if (typeKey && window.soundManager) {
            window.soundManager.click();
        }
    }

    selectTower(tower) {
        this.selectedTower = tower;
        if (tower) {
            if (this.selectedBuildType) {
                this.setBuildMode(null);
            }
            this.panelInspector.classList.remove('hidden');
            this.updateInspector();
        } else {
            this.panelInspector.classList.add('hidden');
        }
    }

    updateInspector() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        this.elInspName.textContent = `${t.name} (Úroveň ${t.level})`;
        this.elInspLevel.textContent = t.level === 3 ? 'MAX' : `${t.level} / 3`;
        this.elInspDmg.textContent = Math.round(t.damage);
        this.elInspRange.textContent = Math.round(t.range);
        this.elInspRate.textContent = `${t.fireRate.toFixed(1)} /s`;

        const targetLabels = {
            FIRST: 'První v pořadí',
            STRONGEST: 'Nejsilnější (HP)',
            WEAKEST: 'Nejslabší (HP)',
            CLOSEST: 'Nejbližší'
        };
        this.elInspTarget.textContent = targetLabels[t.targetMode] || t.targetMode;

        // Upgrade button state
        const upgCost = t.getNextUpgradeCost();
        const upgInfo = t.getNextUpgradeInfo();
        if (upgCost) {
            this.btnUpgrade.disabled = this.tickets < upgCost;
            this.btnUpgrade.innerHTML = `Vylepšit na Úr. ${t.level + 1} (${upgCost} 🎟️)<br><small>${upgInfo.name}: ${upgInfo.desc}</small>`;
        } else {
            this.btnUpgrade.disabled = true;
            this.btnUpgrade.innerHTML = `Plně vylepšeno ★★★`;
        }

        // Sell button state
        const sellVal = t.getSellValue();
        this.btnSell.textContent = `Prodat za ${sellVal} 🎟️`;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        this.mousePos.x = (e.clientX - rect.left) * scaleX;
        this.mousePos.y = (e.clientY - rect.top) * scaleY;

        this.hoverCol = Math.floor(this.mousePos.x / this.map.tileSize);
        this.hoverRow = Math.floor(this.mousePos.y / this.map.tileSize);

        // Dynamický kurzor – změna na ručičku nad sportovcem nebo tlačítkem vylepšení
        let isOverInteractive = false;
        for (const t of this.towers) {
            if (Math.hypot(this.mousePos.x - t.x, this.mousePos.y - t.y) <= 26) {
                isOverInteractive = true;
                break;
            }
        }
        if (this.selectedTower) {
            const badgeY = this.selectedTower.y - 36;
            if (Math.abs(this.mousePos.x - this.selectedTower.x) <= 75 && Math.abs(this.mousePos.y - badgeY) <= 18) {
                isOverInteractive = true;
            }
        }
        this.canvas.style.cursor = isOverInteractive ? 'pointer' : (this.selectedBuildType ? 'crosshair' : 'default');
    }

    tryUpgradeTower(tower) {
        if (!tower) return;
        const cost = tower.getNextUpgradeCost();
        if (cost !== null) {
            if (this.tickets >= cost) {
                this.tickets -= cost;
                tower.upgrade();
                this.updateHUD();
                this.updateInspector();
            } else {
                if (window.soundManager) window.soundManager.buzzer();
                if (window.particleSystem) {
                    window.particleSystem.addFloatingText(tower.x, tower.y - 45, `Chybí ${cost - this.tickets} 🎟️!`, '#f44336', 15);
                }
            }
        } else {
            if (window.particleSystem) {
                window.particleSystem.addFloatingText(tower.x, tower.y - 45, 'Plně vylepšeno ★★★', '#ffd700', 15);
            }
        }
    }

    handleCanvasClick(e) {
        if (this.isGameOver || this.isVictory) return;

        // Přesný výpočet souřadnic kliknutí přímo z události bez závislosti na mousemove
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;
        const col = Math.floor(clickX / this.map.tileSize);
        const row = Math.floor(clickY / this.map.tileSize);

        // 1. Kontrola kliknutí na plovoucí tlačítko vylepšení nad vybraným sportovcem
        if (this.selectedTower) {
            const t = this.selectedTower;
            const badgeY = t.y - 36;
            const dx = Math.abs(clickX - t.x);
            const dy = Math.abs(clickY - badgeY);
            if (dx <= 80 && dy <= 22) {
                this.tryUpgradeTower(this.selectedTower);
                return;
            }
        }

        // 2. Režim stavby nové věže (včetně automatického prodeje stávajícího sportovce)
        if (this.selectedBuildType) {
            if (col >= 0 && col < this.map.cols && row >= 0 && row < this.map.rows) {
                const def = window.TOWER_TYPES[this.selectedBuildType];
                const existingTower = this.map.getTowerAt(col, row);

                if (existingTower) {
                    // Nahrazení stávajícího sportovce:
                    const refund = existingTower.getSellValue();
                    const netCost = def.cost - refund;

                    if (this.tickets >= netCost) {
                        // 1. Prodat stávajícího sportovce
                        this.tickets += refund;
                        this.map.clearTile(existingTower.col, existingTower.row);
                        this.towers = this.towers.filter(t => t !== existingTower);

                        // 2. Koupit a umístit nového
                        this.tickets -= def.cost;
                        const newTower = new window.Tower(this.selectedBuildType, col, row, this.map.tileSize);
                        this.map.setTileTower(col, row, newTower);
                        this.towers.push(newTower);

                        if (window.soundManager) window.soundManager.upgrade();
                        if (window.particleSystem) {
                            window.particleSystem.addHitSparks(newTower.x, newTower.y, '#ffd700', 14);
                            const sign = netCost <= 0 ? `+${Math.abs(netCost)}` : `-${netCost}`;
                            window.particleSystem.addFloatingText(newTower.x, newTower.y - 15, `Nahrazeno! (${sign} 🎟️)`, '#ffd700', 16);
                        }

                        this.setBuildMode(null);
                        this.updateHUD();
                        this.selectTower(newTower);
                    } else {
                        if (window.soundManager) window.soundManager.buzzer();
                        if (window.particleSystem) {
                            window.particleSystem.addFloatingText(clickX, clickY, `Chybí ${netCost - this.tickets} 🎟️!`, '#f44336', 15);
                        }
                    }
                    return;
                }

                // Stavba na volnou dlaždici
                if (this.map.isTileBuildable(col, row)) {
                    if (this.tickets >= def.cost) {
                        this.tickets -= def.cost;
                        const newTower = new window.Tower(this.selectedBuildType, col, row, this.map.tileSize);
                        this.map.setTileTower(col, row, newTower);
                        this.towers.push(newTower);

                        if (window.soundManager) window.soundManager.upgrade();
                        if (window.particleSystem) {
                            window.particleSystem.addHitSparks(newTower.x, newTower.y, '#81c784', 10);
                        }

                        this.setBuildMode(null); // Ukončit režim stavby po položení
                        this.updateHUD();
                        this.selectTower(newTower);
                    } else {
                        if (window.soundManager) window.soundManager.buzzer();
                        if (window.particleSystem) {
                            window.particleSystem.addFloatingText(clickX, clickY, 'Nedostatek vstupenek!', '#f44336', 15);
                        }
                    }
                } else {
                    if (window.soundManager) window.soundManager.buzzer();
                }
            }
            return;
        }

        // 3. Kontrola kliknutí na libovolného sportovce na ploše (když není vybrán nový sportovec ke stavbě)
        let clickedTower = null;
        for (const t of this.towers) {
            const dist = Math.hypot(clickX - t.x, clickY - t.y);
            if (dist <= 32 || (t.col === col && t.row === row)) {
                clickedTower = t;
                break;
            }
        }

        if (clickedTower) {
            if (this.selectedTower === clickedTower) {
                // Kliknutí na již označeného sportovce -> OKAMŽITÉ VYLEPŠENÍ!
                this.tryUpgradeTower(clickedTower);
            } else {
                // První kliknutí: označení sportovce a zobrazení dosahu + plovoucího tlačítka
                this.selectTower(clickedTower);
                if (window.soundManager) window.soundManager.click();
            }
            return;
        }

        // 4. Kliknutí do volné plochy -> odznačení
        this.selectTower(null);
    }

    handleCanvasDoubleClick(e) {
        if (this.isGameOver || this.isVictory) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;
        const col = Math.floor(clickX / this.map.tileSize);
        const row = Math.floor(clickY / this.map.tileSize);

        for (const t of this.towers) {
            const dist = Math.hypot(clickX - t.x, clickY - t.y);
            if (dist <= 32 || (t.col === col && t.row === row)) {
                this.selectTower(t);
                this.tryUpgradeTower(t);
                break;
            }
        }
    }

    startNextWave() {
        if (this.isGameOver || this.isVictory) return;
        if (this.waveManager.isWaveInProgress) return;

        const started = this.waveManager.startWave();
        if (started) {
            this.btnNextWave.disabled = true;
            this.updateHUD();
        }
    }

    updateHUD() {
        this.elTickets.textContent = this.tickets;
        this.elLives.textContent = this.lives;
        this.elScore.textContent = this.score;

        const waveInfo = this.waveManager.getCurrentWaveInfo();
        this.elWave.textContent = `${waveInfo.waveNumber} / ${waveInfo.totalWaves}`;
        this.elWaveTitle.textContent = waveInfo.title;

        // Update build buttons affordable state
        document.querySelectorAll('.tower-card').forEach(card => {
            const type = card.dataset.tower;
            const def = window.TOWER_TYPES[type];
            card.classList.toggle('disabled', this.tickets < def.cost);
        });

        // Update inspector upgrade affordability
        if (this.selectedTower) {
            this.updateInspector();
        }
    }

    restartGame() {
        this.tickets = 350;
        this.lives = 20;
        this.score = 0;
        this.isGameOver = false;
        this.isVictory = false;
        this.isPaused = false;
        this.towers = [];
        this.projectiles = [];

        this.map = new window.StadiumMap();
        this.waveManager = new window.WaveManager(this.map);

        this.selectTower(null);
        this.setBuildMode(null);

        this.modalGameOver.classList.add('hidden');
        this.modalVictory.classList.add('hidden');
        this.btnNextWave.disabled = false;

        this.updateHUD();
    }

    gameLoop(timestamp) {
        const rawDt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        // Cap dt to prevent massive jumps on tab switches
        const dt = Math.min(rawDt, 0.1) * (this.isPaused ? 0 : this.gameSpeed);

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(dt) {
        if (this.isGameOver || this.isVictory) return;

        if (dt > 0) {
            this.map.update(dt);

            // Update waves & enemies
            const waveRes = this.waveManager.update(dt);

            if (waveRes.livesLost > 0) {
                this.lives = Math.max(0, this.lives - waveRes.livesLost);
                this.updateHUD();

                if (this.lives <= 0) {
                    this.isGameOver = true;
                    this.modalGameOver.classList.remove('hidden');
                    if (window.soundManager) window.soundManager.buzzer();
                    return;
                }
            }

            if (waveRes.ticketsEarned > 0) {
                this.tickets += waveRes.ticketsEarned;
                this.score += waveRes.ticketsEarned * 10;
                this.updateHUD();
            }

            if (waveRes.waveCompleted) {
                this.score += 250;
                this.tickets += 40; // Wave completion bonus
                this.btnNextWave.disabled = false;
                this.updateHUD();

                if (waveRes.allWavesCompleted) {
                    this.isVictory = true;
                    this.modalVictory.classList.remove('hidden');
                    if (window.soundManager) window.soundManager.crowdCheer();
                } else if (this.autoPlayWaves) {
                    setTimeout(() => {
                        if (!this.waveManager.isWaveInProgress && !this.isGameOver && !this.isVictory) {
                            this.startNextWave();
                        }
                    }, 1200);
                }
            }

            // Update towers
            for (const tower of this.towers) {
                tower.update(dt, this.waveManager.enemies, this.projectiles);
            }

            // Update projectiles
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const proj = this.projectiles[i];
                proj.update(dt, this.waveManager.enemies);
                if (!proj.alive) {
                    this.projectiles.splice(i, 1);
                }
            }

            // Update particles
            if (window.particleSystem) {
                window.particleSystem.update();
            }
        }
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw stadium map & track
        this.map.draw(this.ctx);

        // 2. Draw hover preview when building
        if (this.selectedBuildType && this.hoverCol >= 0 && this.hoverRow >= 0) {
            const def = window.TOWER_TYPES[this.selectedBuildType];
            const existingTower = this.map.getTowerAt(this.hoverCol, this.hoverRow);
            let isValid = false;

            if (existingTower) {
                const refund = existingTower.getSellValue();
                const netCost = def.cost - refund;
                isValid = this.tickets >= netCost;
                this.map.drawGridHover(this.ctx, this.hoverCol, this.hoverRow, isValid, def, existingTower);
            } else {
                isValid = this.map.isTileBuildable(this.hoverCol, this.hoverRow) && (this.tickets >= def.cost);
                this.map.drawGridHover(this.ctx, this.hoverCol, this.hoverRow, isValid, def, null);
            }
        }

        // 3. Draw towers
        for (const tower of this.towers) {
            tower.draw(this.ctx, tower === this.selectedTower);
        }

        // 4. Draw enemies
        this.waveManager.draw(this.ctx);

        // 5. Draw projectiles
        for (const proj of this.projectiles) {
            proj.draw(this.ctx);
        }

        // 6. Draw particle FX & floating texts
        if (window.particleSystem) {
            window.particleSystem.draw(this.ctx);
        }
    }
}

// Launch game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.game = new StadiumDefenseGame();
});
