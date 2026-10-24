/* 打黑龙 - Phaser 3 */
(function () {
'use strict';
const W = 720, H = 1280;
const ASSET = window.ASSET_BASE || '../assets/';
const FONT = 'GameFont,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif';
const WEAPONS = ['machinegun', 'shotgun', 'laser', 'missile'];
const WNAME = { machinegun: '机枪', shotgun: '散弹', laser: '激光', missile: '导弹' };
const ITEMS = ['item_weapon_crate', 'item_attack_up', 'item_firerate_up', 'item_health', 'item_shield', 'item_coin'];
const LS_KEY = 'dahei_long_best', LS_MUTE = 'dahei_long_mute', LS_UNLOCK = 'dahei_long_unlocked', LS_WEAPON = 'dahei_long_weapon';
const unlocked = () => { try { const a = JSON.parse(localStorage.getItem(LS_UNLOCK)); if (Array.isArray(a) && a.length) return a.filter(w => WEAPONS.includes(w)); } catch (e) {} return ['machinegun']; };
const unlock = w => { const a = unlocked(); if (!a.includes(w)) { a.push(w); localStorage.setItem(LS_UNLOCK, JSON.stringify(a)); return true; } return false; };
// ---- Web Audio 合成音效 ----
const SFX = {
  ctx: null, muted: localStorage.getItem(LS_MUTE) === '1', log: {}, last: {},
  ensure() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) { this.muted = m; localStorage.setItem(LS_MUTE, m ? '1' : '0'); },
  tone(type, f0, f1, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, hp) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hp || 1200;
    src.buffer = b; g.gain.value = vol; src.connect(f).connect(g).connect(c.destination); src.start();
  },
  play(name) {
    this.log[name] = (this.log[name] || 0) + 1;
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now(), gap = { shoot: 90, hit: 60, laser: 160, clink: 80 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return; this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone('square', 900, 400, 0.06, 0.04); break;
      case 'laser': this.tone('sawtooth', 1400, 1200, 0.12, 0.02); break;
      case 'hit': this.tone('triangle', 300, 180, 0.05, 0.06); break;
      case 'break': this.noise(0.25, 0.25, 900); this.tone('sine', 220, 60, 0.25, 0.15); break;
      case 'pickup': [660, 880, 1320].forEach((f, i) => this.tone('sine', f, f, 0.09, 0.12, i * 0.07)); break;
      case 'hurt': this.tone('sawtooth', 220, 70, 0.3, 0.18); this.noise(0.15, 0.15, 600); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.15, i * 0.14)); break;
      case 'clink': this.tone('square', 1800, 1500, 0.05, 0.03); break;
      case 'unlock': this.noise(0.4, 0.3, 2500); [392, 523, 784].forEach((f, i) => this.tone('sawtooth', f, f * 1.02, 0.18, 0.1, 0.1 + i * 0.09)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.28, 0.15, i * 0.2)); break;
    }
  }
};
window.__sfx = SFX;
const best = () => +(localStorage.getItem(LS_KEY) || 0);
const saveBest = s => { if (s > best()) localStorage.setItem(LS_KEY, String(s)); };

function txt(scene, x, y, s, size, color, stroke) {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color: color || '#fff',
    stroke: stroke || '#1a2340', strokeThickness: Math.max(3, size / 7) }).setOrigin(0.5);
}
function button(scene, x, y, key, label, scale, cb) {
  const b = scene.add.image(x, y, key).setScale(scale).setInteractive({ useHandCursor: true });
  const t = txt(scene, x, y - 4, label, 40, '#fff');
  b.on('pointerdown', () => { b.setScale(scale * 0.94); });
  b.on('pointerup', () => { b.setScale(scale); cb(); });
  b.on('pointerout', () => b.setScale(scale));
  return { b, t };
}
function bg(scene) {
  const layers = ['bg_sky_far', 'bg_clouds_mid', 'bg_near'].map(k => scene.add.tileSprite(0, 0, W, H, k).setOrigin(0));
  return dt => { layers[0].tilePositionY -= 0.01 * dt; layers[1].tilePositionY -= 0.03 * dt; layers[2].tilePositionY -= 0.06 * dt; };
}

class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const g = this.add.graphics();
    this.load.on('progress', p => { g.clear().fillStyle(0xffffff).fillRect(160, 630, 400 * p, 20); });
    this.load.json('manifest', ASSET + 'manifest.json');
  }
  create() {
    const m = this.cache.json.get('manifest');
    m.images.forEach(i => this.load.image(i.key, ASSET + i.file));
    m.backgrounds.forEach(i => this.load.image(i.key, ASSET + i.file));
    m.atlases.forEach(a => this.load.atlas(a.key, ASSET + a.textureURL, ASSET + a.atlasURL));
    let fontsReady = false, loaded = false;
    const go = () => { if (fontsReady && loaded) this.scene.start('Start'); };
    const fp = document.fonts ? Promise.all([document.fonts.load('bold 40px GameFont', '打黑龙0'), document.fonts.ready]) : Promise.resolve();
    fp.then(() => { fontsReady = true; window.__fontOK = document.fonts ? document.fonts.check('bold 40px GameFont') : false; go(); }).catch(() => { fontsReady = true; go(); });
    this.load.once('complete', () => {
      m.atlases.forEach(a => this.anims.create({ key: a.anim.key, frames: a.frames.map(f => ({ key: a.key, frame: f })), frameRate: a.anim.frameRate, repeat: a.anim.repeat }));
      this.textures.get('bullet_missile_base').add('single', 0, 0, 0, 80, 124); // 从导弹图裁出单枚导弹
      loaded = true; go();
    });
    this.load.start();
  }
}

class Start extends Phaser.Scene {
  constructor() { super('Start'); }
  create() {
    this.bgu = bg(this);
    const d = this.add.image(W / 2, 450, 'char_dragon_title').setScale(0.85);
    this.tweens.add({ targets: d, y: 430, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    txt(this, W / 2, 150, '打黑龙', 120, '#ffd94a', '#3a1a00');
    txt(this, W / 2, 745, '最高分  ' + best(), 40, '#fff');
    const un = unlocked(); let sel = localStorage.getItem(LS_WEAPON); if (!un.includes(sel)) sel = 'machinegun';
    txt(this, W / 2, 805, '选择初始武器', 28, '#ffe680');
    const g = this.add.graphics();
    const draw = () => { g.clear(); WEAPONS.forEach((w, i) => { const x = 135 + i * 150, y = 895, on = w === sel;
      g.fillStyle(on ? 0xffd94a : 0x0e1a3a, on ? 0.95 : 0.5).fillRoundedRect(x - 64, y - 64, 128, 128, 18).lineStyle(4, on ? 0xffffff : 0x6b7aa0).strokeRoundedRect(x - 64, y - 64, 128, 128, 18); }); };
    WEAPONS.forEach((w, i) => {
      const x = 135 + i * 150, y = 885, ok = un.includes(w);
      const ic = this.add.image(x, y - 4, 'char_turret_' + w + '_lv1').setScale(0.36).setInteractive({ useHandCursor: ok });
      if (!ok) ic.setTint(0x333344).setAlpha(0.7);
      txt(this, x, y + 48, ok ? WNAME[w] : '未解锁', 22, ok ? '#fff' : '#9aa');
      ic.on('pointerup', () => { if (!ok) { this.cameras.main.shake(80, 0.004); return; } sel = w; localStorage.setItem(LS_WEAPON, w); SFX.play('pickup'); draw(); });
    });
    draw(); this.getSel = () => sel;
    button(this, W / 2, 1035, 'ui_btn_green_large', '开始游戏', 1, () => { SFX.ensure(); this.scene.start('Game', { level: 1, score: 0, carry: { weapon: sel, wlv: 1 } }); });
    const mb = this.add.image(640, 70, 'ui_btn_blue').setScale(0.55).setInteractive({ useHandCursor: true });
    this.muteTxt = txt(this, 640, 66, SFX.muted ? '静音' : '音效', 30);
    mb.on('pointerup', () => { SFX.ensure(); SFX.setMuted(!SFX.muted); this.muteTxt.setText(SFX.muted ? '静音' : '音效'); SFX.play('pickup'); });
    this.input.once('pointerdown', () => SFX.ensure());
    txt(this, W / 2, 1140, '拖动/←→ 移动 · 自动射击', 30, '#fff');
    txt(this, W / 2, 1185, '接住道具强化武器，击碎龙头或全部龙身即胜利', 26, '#fff');
  }
  update(t, dt) { this.bgu(dt); }
}

class Game extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data) { this.level = data.level || 1; this.score = data.score || 0; this.carry = data.carry; }
  create() {
    window.__scene = this;
    this.bgu = bg(this);
    this.rnd = new Phaser.Math.RandomDataGenerator(['dahei-lv' + this.level]); // 每关固定种子：龙血与掉落可复现，难度稳定
    const L = this.level;
    // 难度曲线：第1关新手友好，之后平滑增长
    this.cfg = { segs: 22 + (L - 1) * 3, speed: 15 + (L - 1) * 3.5, hpMin: 4 + L, hpMax: 10 + L * 6, headHp: 90 + (L - 1) * 70,
      fireEvery: Math.max(1300, 4200 - (L - 1) * 450), fireSpeed: 240 + (L - 1) * 30, multi: L >= 4 ? 3 : L >= 2 ? 2 : 1 };
    this.buildPath();
    this.over = false; this.paused = false;
    const c = this.carry || {};
    this.hp = c.hp || 5; this.maxHp = 5; this.weapon = c.weapon || 'machinegun'; this.wlv = c.wlv || 1;
    this.atk = c.atk || 1; this.rate = c.rate || 1; this.shield = 0; this.fireT = 0; this.coins = 0;
    this.bullets = []; this.fireballs = []; this.items = [];
    this.bodyLayer = this.add.layer(); this.fxLayer = this.add.layer();
    this.buildDragon();
    this.player = this.add.image(W / 2, 1150, 'char_turret_machinegun_lv1').setScale(0.62);
    this.pflash = this.add.image(W / 2, 1150, 'char_turret_machinegun_lv1').setScale(0.62).setTintFill(0xffffff).setAlpha(0); this.inv = 0;
    this.shieldG = this.add.graphics();
    this.targetX = W / 2;
    this.setTurret();
    this.input.on('pointerdown', p => { this.targetX = p.x; });
    this.input.on('pointermove', p => { if (p.isDown) this.targetX = p.x; });
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D,P,ESC');
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.buildHUD();
    this.fireTimer = 0; this.t0 = this.time.now; this.beam = null; this.unlockT = 0; this.blocked = 0;
  }
  buildPath() {
    // big S: rows zigzag from top (off-screen) down to the bottom line
    // 从屏幕左侧外横向游入，路径全部位于顶部 HUD 安全区（y<170）之下
    const pts = [[-2400, 250], [-200, 250], [300, 250], [620, 258], [620, 335]];
    const rows = [410, 580, 750, 920, 1090];
    rows.forEach((y, i) => { pts.push(i % 2 ? [620, y] : [100, y]); if (i < rows.length - 1) pts.push(i % 2 ? [620, y + 85] : [100, y + 85]); });
    pts.push([W / 2, 1100], [620, 1100]);
    // smooth with Catmull-Rom spline and sample by arclength
    const spline = new Phaser.Curves.Spline(pts.map(p => new Phaser.Math.Vector2(p[0], p[1])));
    this.path = spline.getSpacedPoints(3000);
    this.pathLen = spline.getLength();
    this.endD = this.pathLen - 10;
  }
  posAt(d) {
    const n = this.path.length - 1;
    const f = Phaser.Math.Clamp(d / this.pathLen, 0, 1) * n, i = Math.floor(f), k = f - i;
    const a = this.path[i], b = this.path[Math.min(n, i + 1)];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  buildDragon() {
    const c = this.cfg;
    this.spacing = 82;
    this.headD = 2300; // 龙头从左侧刚进入画面
    this.head = { kind: 'head', hp: c.headHp, max: c.headHp, r: 52, slot: 0, cur: 0, locked: true }; this.segTotal = c.segs;
    this.headShield = this.add.graphics().setDepth(5); // 固定提示条：位于顶部 HUD 下方（y≈172），龙身路径最高只到 y≈199，不会重叠
    this.bannerBg = this.add.graphics().setDepth(99); this.headHpTxt = txt(this, W / 2, 169, '', 36, '#fff').setDepth(100); this.bannerHold = 0; this.bannerKey = '';
    this.head.spr = this.add.sprite(0, 0, 'char_dragon_head').setScale(0.72);
    this.head.flash = this.add.sprite(0, 0, 'char_dragon_head').setScale(0.72).setTintFill(0xffffff).setAlpha(0);
    this.head.badge = this.add.graphics(); this.head.label = txt(this, 0, 0, '', 26);
    this.segs = [];
    for (let i = 0; i < c.segs; i++) {
      const hp = this.rnd.between(c.hpMin, c.hpMax);
      const s = { kind: 'body', hp, max: hp, r: 40, slot: i + 1, cur: i + 1 };
      s.spr = this.add.image(0, 0, 'char_dragon_body').setScale(0.58);
      s.flash = this.add.image(0, 0, 'char_dragon_body').setScale(0.58).setTintFill(0xffffff).setAlpha(0);
      s.badge = this.add.graphics(); s.label = txt(this, 0, 0, String(hp), 26);
      this.bodyLayer.add([s.spr, s.flash, s.badge, s.label]);
      this.segs.push(s);
    }
    this.tail = { slot: c.segs + 1, cur: c.segs + 1, spr: this.add.image(0, 0, 'char_dragon_tail').setScale(0.55) };
    this.bodyLayer.addAt(this.tail.spr, 0);
    this.bodyLayer.add([this.head.spr, this.head.flash]);
    this.head.badge.destroy(); this.head.label.destroy();
  }
  badgeColor(hp) {
    // light yellow -> orange -> red -> deep wine red
    const stops = [[0, 0xffe680], [12, 0xff9a2e], [28, 0xe8392f], [50, 0x7a1030]];
    for (let i = 1; i < stops.length; i++) if (hp <= stops[i][0]) {
      const [a0, c0] = stops[i - 1], [a1, c1] = stops[i];
      const o = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(c0), Phaser.Display.Color.ValueToColor(c1), 100, (hp - a0) / (a1 - a0) * 100);
      return Phaser.Display.Color.GetColor(o.r, o.g, o.b);
    }
    return 0x7a1030;
  }
  drawBadge(s) {
    s.badge.clear().fillStyle(0x2a1030).fillCircle(0, 0, 25).fillStyle(this.badgeColor(s.hp)).fillCircle(0, 0, 21)
      .fillStyle(0xffffff, 0.35).fillEllipse(-5, -9, 22, 9);
    s.label.setText(String(s.hp)).setColor(s.hp <= 12 ? '#3a1a00' : '#fff').setStroke(s.hp <= 12 ? '#fff3c0' : '#2a0a14', 5);
  }
  buildHUD() {
    const D = 100;
    // 顶部 HUD 安全区背板（龙路径不进入 y<170）
    this.add.graphics().setDepth(D - 1).fillStyle(0x0e1a3a, 0.45).fillRoundedRect(8, 10, W - 16, 135, 24);
    this.add.image(170, 52, 'ui_hp_frame').setScale(1.1).setDepth(D);
    this.hpFill = this.add.image(102, 52, 'ui_hp_fill').setOrigin(0, 0.5).setScale(1.1).setDepth(D);
    this.hpTxt = txt(this, 262, 52, '', 24).setDepth(D);
    this.scoreTxt = txt(this, 450, 52, '', 52).setDepth(D);
    this.lvTxt = txt(this, 450, 100, '第 ' + this.level + ' 关', 24, '#ffe680').setDepth(D);
    const pb = this.add.image(660, 52, 'ui_btn_pause').setScale(1.05).setDepth(D).setInteractive({ useHandCursor: true });
    pb.on('pointerdown', (p, x, y, e) => { e.stopPropagation(); this.togglePause(); });
    this.add.image(85, 1225, 'ui_weapon_badge').setScale(1.05).setDepth(D);
    this.wTxt = txt(this, 85, 1205, '', 28).setDepth(D);
    this.wlvTxt = txt(this, 85, 1245, '', 30, '#ffe14a').setDepth(D);
    this.toast = txt(this, W / 2, 760, '', 44, '#ffe14a').setDepth(D).setAlpha(0);
    this.pauseUI = this.add.container(0, 0).setDepth(200).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setInteractive();
    const panel = this.add.nineslice(W / 2, 620, 'ui_panel_fail', null, 560, 520, 60, 60, 60, 60);
    const t = txt(this, W / 2, 470, '暂停', 64);
    const b1 = button(this, W / 2, 610, 'ui_btn_green', '继续', 1.2, () => this.togglePause());
    const b2 = button(this, W / 2, 750, 'ui_btn_orange', '返回主页', 1, () => { this.scene.start('Start'); });
    this.pauseUI.add([dim, panel, t, b1.b, b1.t, b2.b, b2.t]);
    this.updateHUD();
  }
  updateHUD() {
    const f = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpFill.setCrop(0, 0, 158 * f, 29);
    this.hpTxt.setText(this.hp + '/' + this.maxHp);
    this.scoreTxt.setText(String(this.score));
    this.wTxt.setText(WNAME[this.weapon]); this.wlvTxt.setText('Lv.' + this.wlv);
  }
  togglePause() { if (this.over) return; this.paused = !this.paused; this.pauseUI.setVisible(this.paused); }
  showToast(s) { this.toast.setText(s).setAlpha(1).setY(760); this.tweens.add({ targets: this.toast, alpha: 0, y: 700, duration: 900, delay: 300 }); }
  setTurret() { const k = 'char_turret_' + this.weapon + '_lv' + this.wlv; this.player.setTexture(k); if (this.pflash) this.pflash.setTexture(k); }

  update(t, dt) {
    if (this.over || this.paused) return;
    dt = Math.min(dt, 50);
    this.bgu(dt);
    const s = dt / 1000;
    // player move
    const k = this.keys;
    if (k.LEFT.isDown || k.A.isDown) this.targetX = this.player.x - 700 * s;
    if (k.RIGHT.isDown || k.D.isDown) this.targetX = this.player.x + 700 * s;
    this.targetX = Phaser.Math.Clamp(this.targetX, 60, W - 60);
    this.player.x += Phaser.Math.Clamp(this.targetX - this.player.x, -900 * s, 900 * s);
    this.pflash.x = this.player.x; this.inv -= dt;
    this.shieldG.clear();
    if (this.shield > 0) { this.shield -= dt; this.shieldG.lineStyle(6, 0x6fe3ff, 0.8).strokeCircle(this.player.x, this.player.y, 95).fillStyle(0x6fe3ff, 0.15).fillCircle(this.player.x, this.player.y, 95); }
    // dragon
    this.headD += this.cfg.speed * s * (this.headD < 3000 ? 8 : 1); // 入场快速游入
    this.layoutDragon(s);
    // fire
    this.fireT -= dt;
    if (this.fireT <= 0) { this.shoot(); this.fireT = this.fireInterval(); }
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.head.y > 80) { this.spitFire(); this.fireTimer = this.cfg.fireEvery * this.rnd.realInRange(0.7, 1.3); }
    this.updateLaser(dt); this.updateBullets(s); this.updateFireballs(s); this.updateItems(s);
    if (this.headD >= this.endD && !this.over) this.finish(false, '黑龙冲到了底部！');
  }
  layoutDragon(s) {
    const place = (o) => {
      o.cur += (o.slot - o.cur) * Math.min(1, s * 6);
      const dd = this.headD - (o.cur ? o.cur * this.spacing + 22 : 0); const p = this.posAt(dd), q = this.posAt(dd + 6);
      o.x = p.x; o.y = p.y; o.ang = Math.atan2(q.y - p.y, q.x - p.x);
      return p;
    };
    const h = this.head; place(h);
    h.spr.setPosition(h.x, h.y).setRotation(h.ang - Math.PI / 2); h.flash.setPosition(h.x, h.y).setRotation(h.spr.rotation).setTexture(h.spr.texture.key);
    this.segs.forEach(sg => { place(sg); sg.spr.setPosition(sg.x, sg.y); sg.flash.setPosition(sg.x, sg.y); sg.badge.setPosition(sg.x, sg.y + 2); sg.label.setPosition(sg.x, sg.y + 2); this.drawBadge(sg); });
    this.drawHeadShield(h);
    const tl = this.tail; place(tl); tl.spr.setPosition(tl.x, tl.y).setRotation(tl.ang - Math.PI / 2);
  }
  drawHeadShield(h) {
    const g = this.headShield.clear(), t = this.time.now / 1000;
    if (h.locked) {
      // 护盾 + 锁链：龙身剩余超过一半时龙头无敌
      const R = 66 + Math.sin(t * 5) * 3;
      g.fillStyle(0x7fd8ff, 0.18).fillCircle(h.x, h.y, R).lineStyle(5, 0x9fe6ff, 0.85).strokeCircle(h.x, h.y, R);
      for (let i = 0; i < 14; i++) { const a = t * 0.8 + i * Math.PI * 2 / 14;
        g.lineStyle(5, 0x8a8f9c, 1).strokeEllipse(h.x + Math.cos(a) * R, h.y + Math.sin(a) * R, i % 2 ? 16 : 10, i % 2 ? 10 : 16); }
      g.fillStyle(0x3b3f4a).fillRoundedRect(h.x - 15, h.y - 6, 30, 24, 5).lineStyle(5, 0x3b3f4a).strokeCircle(h.x, h.y - 8, 10).fillStyle(0xffd94a).fillCircle(h.x, h.y + 5, 4);
      const left = this.segs.length - Math.floor(this.segTotal / 2);
      this.setBanner('再碎 ' + left + ' 节破盾', '#bff0ff', 0x0e2a4a);
    } else {
      g.lineStyle(4, 0xff5a3c, 0.9).strokeCircle(h.x, h.y, 60);
      if (this.time.now > this.bannerHold) this.setBanner('集火龙头！剩余 ' + Math.max(0, h.hp), '#ffd0c0', 0x4a0e14);
    }
  }
  setBanner(t, color, bgc) {
    const key = t + color; if (key === this.bannerKey) return; this.bannerKey = key;
    this.headHpTxt.setText(t).setColor(color);
    const w = Math.max(300, this.headHpTxt.width + 56);
    this.bannerBg.clear().fillStyle(bgc, 0.72).fillRoundedRect(W / 2 - w / 2, 148, w, 44, 22).lineStyle(3, 0xffffff, 0.5).strokeRoundedRect(W / 2 - w / 2, 148, w, 44, 22);
  }
  unlockHead() {
    const h = this.head; if (!h.locked) return; h.locked = false; this.unlockT = this.time.now;
    SFX.play('unlock'); this.setBanner('龙头护盾破碎！', '#ffe14a', 0x5a2a00); this.bannerHold = this.time.now + 2000;
    this.tweens.add({ targets: this.headHpTxt, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.out' }); this.cameras.main.flash(250, 255, 255, 255);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, p = this.add.rectangle(h.x, h.y, 12, 8, 0x9fe6ff);
      this.tweens.add({ targets: p, x: h.x + Math.cos(a) * 140, y: h.y + Math.sin(a) * 140, alpha: 0, angle: 360, duration: 600, onComplete: () => p.destroy() }); }
  }
  fireInterval() {
    const base = { machinegun: 150, shotgun: 430, laser: 1000, missile: 520 }[this.weapon];
    return base / this.rate;
  }
  dmg() { // 机枪/散弹靠弹数提升，导弹靠弹数，单发伤害不再叠等级倍率
    return this.atk * ({ machinegun: 1, shotgun: 1, laser: 0.8, missile: 2.6 }[this.weapon]); }
  shoot() {
    const x = this.player.x, y = this.player.y - 90, w = this.weapon, lv = this.wlv, d = this.dmg();
    const add = (key, vx, vy, sc, extra) => {
      const spr = this.add.image(x, y, key, extra && extra.frame).setScale(sc); spr.setRotation(Math.atan2(vy, vx) + Math.PI / 2);
      this.bullets.push(Object.assign({ spr, vx, vy, dmg: d, r: 16 }, extra || {}));
    };
    if (w === 'machinegun') {
      const offs = lv === 1 ? [0] : lv === 2 ? [-14, 14] : [-22, 0, 22];
      offs.forEach(o => { add('bullet_machinegun_lv1', 0, -1500, 0.22); this.bullets[this.bullets.length - 1].spr.x += o; });
    } else if (w === 'shotgun') {
      const n = [3, 5, 7][lv - 1], spread = 0.18;
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * spread; add('bullet_shotgun_base', Math.cos(a) * 1100, Math.sin(a) * 1100, 0.2); }
    } else if (w === 'laser') {
      return; // 激光为常驻光束，见 updateLaser
    } else {
      const n = lv; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5; add('bullet_missile_base', Math.cos(a) * 600, Math.sin(a) * 600, 0.42, { homing: true, r: 22, frame: 'single' }); }
    }
    SFX.play('shoot');
  }
  updateLaser(dt) {
    if (!this.beam) { this.beam = this.add.image(0, 0, 'bullet_laser_lv1').setOrigin(0.5, 1).setVisible(false); this.beamGlow = this.add.graphics(); }
    this.beamGlow.clear();
    if (this.weapon !== 'laser') { this.beam.setVisible(false); return; }
    const lv = this.wlv, bw = 22 + lv * 16, px = this.player.x, top = this.player.y - 95;
    let hit = null, hy = -40;
    for (const o of this.targets()) if (!o.dead && o.y < top && o.y > hy && Math.abs(o.x - px) < o.r + bw / 2) { hy = o.y; hit = o; }
    const endY = hit ? hit.y + hit.r * 0.5 : -40;
    this.beam.setTexture('bullet_laser_lv' + lv).setVisible(true).setPosition(px, top).setDisplaySize(bw * 1.6, top - endY).setAlpha(0.85 + Math.sin(this.time.now / 40) * 0.15);
    this.beamGlow.fillStyle(0xffffff, 0.6).fillRect(px - bw * 0.18, endY, bw * 0.36, top - endY).fillStyle(0xaef6ff, 0.9).fillCircle(px, endY, bw * 0.45);
    if (hit) { this.hitTarget(hit, 8 * this.atk * (1 + (lv - 1) * 0.35) * dt / 1000); SFX.play('laser'); }
  }
  targets() { return this.segs.concat([this.head]); }
  updateBullets(s) {
    const tg = this.targets();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], sp = b.spr;
      if (b.homing) {
        let best = null, bd = 1e9; tg.forEach(o => { if (o.y > -40) { const dd = Phaser.Math.Distance.Between(sp.x, sp.y, o.x, o.y); if (dd < bd) { bd = dd; best = o; } } });
        if (best) { const a = Math.atan2(best.y - sp.y, best.x - sp.x), cur = Math.atan2(b.vy, b.vx), na = Phaser.Math.Angle.RotateTo(cur, a, 6 * s); b.vx = Math.cos(na) * 900; b.vy = Math.sin(na) * 900; sp.setRotation(na + Math.PI / 2); }
      }
      sp.x += b.vx * s; sp.y += b.vy * s;
      let dead = sp.y < -60 || sp.y > H + 60 || sp.x < -60 || sp.x > W + 60;
      if (!dead) for (const o of tg) {
        if (o.dead || (b.hit && b.hit.has(o))) continue;
        if (Phaser.Math.Distance.Between(sp.x, sp.y, o.x, o.y) < o.r + b.r) {
          if (o.kind === 'head' && o.locked) { // 子弹被护盾弹开
            if (b.bounced) continue; b.bounced = true; this.blocked = (this.blocked || 0) + 1;
            const a = Math.atan2(sp.y - o.y, sp.x - o.x) + this.rnd.realInRange(-0.4, 0.4), v = Math.hypot(b.vx, b.vy) * 0.6;
            b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.homing = false; b.dmg = 0; sp.setAlpha(0.6).setRotation(a + Math.PI / 2);
            this.spark(sp.x, sp.y); SFX.play('clink'); break;
          }
          if (b.bounced) continue;
          this.hitTarget(o, b.dmg);
          if (b.pierce) b.hit.add(o); else { dead = true; break; }
        }
      }
      if (dead) { sp.destroy(); this.bullets.splice(i, 1); }
      if (this.over) return;
    }
  }
  spark(x, y) { const c = this.add.circle(x, y, 10, 0xffffff).setStrokeStyle(3, 0x9fe6ff); this.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 200, onComplete: () => c.destroy() }); }
  hitTarget(o, dmg) {
    if (o.kind === 'head' && o.locked) { this.blocked = (this.blocked || 0) + 1; if (this.time.now - (this.lastSpark || 0) > 120) { this.lastSpark = this.time.now; this.spark(o.x + this.rnd.between(-20, 20), o.y + 40); SFX.play('clink'); } return; }
    o.acc = (o.acc || 0) + dmg; const n = Math.floor(o.acc); if (n <= 0) return; o.acc -= n;
    o.hp -= n; this.score += n * 10; SFX.play('hit');
    if (this.time.now - (o.lastFlash || 0) > 220) { o.lastFlash = this.time.now; o.flash.setAlpha(0.6); this.tweens.killTweensOf(o.flash); this.tweens.add({ targets: o.flash, alpha: 0, duration: 110 }); }
    if (o.hp <= 0) {
      o.dead = true;
      if (o.kind === 'head') { this.headShield.clear(); this.headHpTxt.setText(''); this.bannerBg.clear(); this.boom(o.x, o.y, 1.2); this.score += 2000; this.finish(true, '击碎龙头！'); return; }
      this.killSeg(o);
    }
    this.updateHUD();
  }
  killSeg(o) {
    this.boom(o.x, o.y, 0.6); this.score += 100; SFX.play('break');
    [o.spr, o.flash, o.badge, o.label].forEach(g => g.destroy());
    const i = this.segs.indexOf(o); this.segs.splice(i, 1);
    if (this.head.locked && this.segs.length <= Math.floor(this.segTotal / 2)) this.unlockHead();
    this.segs.forEach((sg, j) => sg.slot = j + 1); this.tail.slot = this.segs.length + 1;
    if (!window.__noDrops && this.rnd.frac() < 0.3) this.dropItem(o.x, o.y);
    if (this.segs.length === 0) { this.score += 1500; this.finish(true, '龙身全部击碎！'); }
  }
  boom(x, y, sc) { const f = this.add.sprite(x, y, 'fx_body_break', 'fx_body_break_00').setScale(sc); f.play('fx_body_break_anim'); f.once('animationcomplete', () => f.destroy()); }
  dropItem(x, y, key) {
    key = key || this.rnd.pick(ITEMS.concat(['item_weapon_crate', 'item_coin']));
    const spr = this.add.image(x, y, key).setScale(0.5);
    this.items.push({ spr, key, vy: 160 });
  }
  updateItems(s) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.spr.y += it.vy * s; it.spr.rotation = Math.sin(this.time.now / 200) * 0.15;
      if (Phaser.Math.Distance.Between(it.spr.x, it.spr.y, this.player.x, this.player.y - 20) < 90) { this.applyItem(it.key); it.spr.destroy(); this.items.splice(i, 1); }
      else if (it.spr.y > H + 60) { it.spr.destroy(); this.items.splice(i, 1); }
    }
  }
  applyItem(key) {
    SFX.play('pickup');
    switch (key) {
      case 'item_weapon_crate': {
        const others = WEAPONS.filter(w => w !== this.weapon);
        if (this.wlv < 3 && this.rnd.frac() < 0.5) { this.wlv++; this.showToast(WNAME[this.weapon] + ' 升级 Lv.' + this.wlv); }
        else { this.weapon = this.rnd.pick(others); this.wlv = Math.max(1, this.wlv - 1) || 1; this.showToast((unlock(this.weapon) ? '解锁新武器：' : '换武器：') + WNAME[this.weapon]); }
        this.setTurret(); break;
      }
      case 'item_attack_up': this.atk = Math.min(4, this.atk + 0.25); this.showToast('攻击 +'); break;
      case 'item_firerate_up': this.rate = Math.min(2.5, this.rate + 0.15); this.showToast('射速 +'); break;
      case 'item_health': this.hp = Math.min(this.maxHp, this.hp + 1); this.showToast('生命 +1'); break;
      case 'item_shield': this.shield = 6000; this.showToast('护盾！'); break;
      case 'item_coin': this.score += 200; this.coins++; this.showToast('+200'); break;
    }
    this.updateHUD();
  }
  spitFire() {
    const h = this.head; h.spr.setTexture('char_dragon_head_fire'); this.time.delayedCall(350, () => h.spr && h.spr.active && h.spr.setTexture('char_dragon_head'));
    const a0 = Math.atan2(this.player.y - h.y, this.player.x - h.x), v = this.cfg.fireSpeed, n = this.cfg.multi;
    for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.28;
      const spr = this.add.image(h.x, h.y + 30, 'bullet_dragon_fireball').setScale(0.45).setRotation(a - Math.PI / 2);
      this.fireballs.push({ spr, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); }
  }
  updateFireballs(s) {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i]; f.spr.x += f.vx * s; f.spr.y += f.vy * s;
      let dead = f.spr.y > H + 60 || f.spr.x < -60 || f.spr.x > W + 60;
      if (Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.player.x, this.player.y) < 52) { dead = true; this.damagePlayer(); }
      if (dead) { f.spr.destroy(); this.fireballs.splice(i, 1); }
      if (this.over) return;
    }
  }
  damagePlayer() {
    if (this.shield > 0 || this.inv > 0 || window.__god) return;
    this.inv = 1400; SFX.play('hurt');
    this.hp--; this.updateHUD(); this.cameras.main.shake(150, 0.01);
    this.tweens.killTweensOf(this.pflash); this.pflash.setAlpha(0.8); this.tweens.add({ targets: this.pflash, alpha: 0, duration: 150, yoyo: true, repeat: 1 });
    if (this.hp <= 0) this.finish(false, '炮台被击毁了！');
  }
  finish(win, reason) {
    if (this.over) return; this.over = true; saveBest(this.score); SFX.play(win ? 'win' : 'lose'); if (this.beam) { this.beam.setVisible(false); this.beamGlow.clear(); } this.tweens.killTweensOf(this.pflash); this.pflash.setAlpha(0);
    const carry = { hp: Math.max(this.hp, 3), weapon: this.weapon, wlv: this.wlv, atk: this.atk, rate: this.rate };
    const gameSec = +((this.time.now - this.t0) / 1000).toFixed(1), unlockSec = this.unlockT ? +((this.unlockT - this.t0) / 1000).toFixed(1) : null;
    this.time.delayedCall(600, () => this.scene.launch('Result', { win, reason, score: this.score, level: this.level, hp: this.hp, carry, gameSec, unlockSec }));
  }
}

class Result extends Phaser.Scene {
  constructor() { super('Result'); }
  create(d) {
    window.__result = d;
    this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setInteractive();
    const nb = d.score >= best() && d.score > 0;
    if (d.win) {
      this.add.nineslice(W / 2, 640, 'ui_panel_result', null, 600, 900, 80, 80, 140, 80);
      txt(this, W / 2, 255, '第 ' + d.level + ' 关 通关！', 56, '#ffe14a', '#5a2a00');
      const stars = d.hp >= 4 ? 3 : d.hp >= 2 ? 2 : 1;
      for (let i = 0; i < 3; i++) { const st = this.add.image(W / 2 + (i - 1) * 140, 400 - (i === 1 ? 20 : 0), i < stars ? 'ui_star_full' : 'ui_star_empty').setScale(0.8 + (i === 1 ? 0.15 : 0)).setScale(0); this.tweens.add({ targets: st, scale: 0.85 + (i === 1 ? 0.15 : 0), delay: 200 * i, duration: 300, ease: 'Back.out' }); }
      this.add.image(W / 2, 600, 'char_turret_happy').setScale(0.6);
      this.add.nineslice(W / 2, 790, 'ui_stat_box', null, 470, 110, 40, 40, 30, 30);
      txt(this, W / 2, 790, '得分  ' + d.score, 44);
      txt(this, W / 2, 870, (nb ? '新纪录！' : '最高分  ' + best()), 32, '#ffe680');
      button(this, W / 2 - 130, 990, 'ui_btn_blue', '主页', 1, () => this.go('Start'));
      button(this, W / 2 + 130, 990, 'ui_btn_green', '下一关', 1, () => this.go('Game', { level: d.level + 1, score: d.score, carry: d.carry }));
    } else {
      this.add.image(W / 2, 360, 'char_turret_broken').setScale(0.7);
      this.add.nineslice(W / 2, 720, 'ui_panel_fail', null, 620, 500, 60, 60, 60, 60);
      txt(this, W / 2, 545, '挑战失败', 64, '#ff6a5a', '#3a0a0a');
      txt(this, W / 2, 630, d.reason, 32);
      txt(this, W / 2, 700, '得分  ' + d.score, 44);
      txt(this, W / 2, 760, '最高分  ' + best(), 30, '#ffe680');
      button(this, W / 2 - 140, 870, 'ui_btn_blue', '主页', 1, () => this.go('Start'));
      button(this, W / 2 + 140, 870, 'ui_btn_orange', '再来一次', 0.85, () => this.go('Game', { level: d.level, score: 0 }));
    }
  }
  go(k, data) { window.__result = null; this.scene.stop('Game'); this.scene.start(k, data); }
}

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#7cc8f4',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [Boot, Start, Game, Result]
});
window.__game = game;
// debug hooks for automated tests
window.__debug = {
  scene: k => game.scene.getScene(k),
  active: () => game.scene.getScenes(true).map(s => s.scene.key),
  start: (lv) => { window.__result = null; const d = { level: lv || 1, score: 0 }; if (game.scene.isActive('Result')) game.scene.stop('Result'); if (game.scene.isActive('Game')) game.scene.getScene('Game').scene.restart(d); else { if (game.scene.isActive('Start')) game.scene.stop('Start'); game.scene.start('Game', d); } },
  state: () => { const s = game.scene.getScene('Game'); return s && s.segs ? { segs: s.segs.length, hp: s.hp, score: s.score, bullets: s.bullets.length, weapon: s.weapon, wlv: s.wlv, over: s.over, headY: s.head.y } : null; },
  setWeapon: (w, lv) => { const s = game.scene.getScene('Game'); unlock(w); s.weapon = w; s.wlv = lv; s.setTurret(); s.updateHUD(); },
  killAll: () => { const s = game.scene.getScene('Game'); s.segs.slice().forEach(o => s.hitTarget(o, o.hp + 1)); },
  lose: () => { window.__god = false; const s = game.scene.getScene('Game'); s.hp = 1; s.shield = 0; s.inv = 0; s.damagePlayer(); },
  god: (v) => { window.__god = v !== false; },
  drop: (k) => { const s = game.scene.getScene('Game'); s.dropItem(s.player.x, s.player.y - 300, k); },
};
})();
