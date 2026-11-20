// Particle and Floating Text FX System
class ParticleSystem {
    constructor() {
        this.particles = [];
        this.floatingTexts = [];
    }

    addHitSparks(x, y, color = '#ffeb3b', count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3.5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 2.5,
                color,
                alpha: 1,
                decay: 0.03 + Math.random() * 0.04,
                type: 'spark'
            });
        }
    }

    addShockwave(x, y, maxRadius = 55, color = '#ff9800') {
        this.particles.push({
            x,
            y,
            radius: 5,
            maxRadius,
            growth: 3.5,
            color,
            alpha: 0.9,
            decay: 0.04,
            type: 'wave'
        });
    }

    addIceParticles(x, y, count = 6) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 2;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 3 + Math.random() * 3,
                color: '#4fc3f7',
                alpha: 1,
                decay: 0.02 + Math.random() * 0.03,
                type: 'ice'
            });
        }
    }

    addConfetti(x, y, count = 35) {
        const colors = ['#e91e63', '#9c27b0', '#2196f3', '#4caf50', '#ffeb3b', '#ff9800'];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5,
                width: 4 + Math.random() * 5,
                height: 3 + Math.random() * 4,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                gravity: 0.08,
                decay: 0.015,
                type: 'confetti'
            });
        }
    }

    addFloatingText(x, y, text, color = '#ffffff', size = 14) {
        this.floatingTexts.push({
            x,
            y,
            vy: -1.2,
            text,
            color,
            size,
            alpha: 1,
            decay: 0.02
        });
    }

    update() {
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.type === 'spark' || p.type === 'ice') {
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= p.decay;
            } else if (p.type === 'wave') {
                p.radius += p.growth;
                p.alpha -= p.decay;
            } else if (p.type === 'confetti') {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.rotation += p.rotSpeed;
                p.alpha -= p.decay;
            }

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.y += t.vy;
            t.alpha -= t.decay;
            if (t.alpha <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.alpha);
            if (p.type === 'spark') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'ice') {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.radius / 2, p.y - p.radius / 2, p.radius, p.radius);
            } else if (p.type === 'wave') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (p.type === 'confetti') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
                ctx.restore();
            }
        }

        // Draw floating text
        for (const t of this.floatingTexts) {
            ctx.globalAlpha = Math.max(0, t.alpha);
            ctx.font = `bold ${t.size}px 'Oswald', 'Montserrat', sans-serif`;
            ctx.fillStyle = t.color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillText(t.text, t.x, t.y);
        }
        ctx.restore();
    }
}

window.particleSystem = new ParticleSystem();
