/* 邪恶鲸鱼 — pet engine: two characters, needs, favour, music and touch.
 *
 * The cast lives in pet_config.js (CHARACTERS / CHARACTER_ORDER).  Everything
 * below is generic: it reads the active character's art profile, theme and
 * dialogue, so adding a third character only means adding a config entry plus
 * two PNGs.
 */
(function () {
  'use strict';

  var SAVE_KEY = 'evilwhale.save.v2';
  var LEGACY_KEY = 'evilwhale.save.v1';

  var DEFAULTS = { hunger: 34, mood: 72, energy: 68, bond: 0, favor: 100 };

  /* Favour is the "do not neglect me" meter.  It drains faster than mood and
     hitting zero makes her quit the app on you.  Seconds of steady neglect. */
  var FAVOR_DRAIN_SECONDS = 150;
  var FAVOR_WARN_AT = 25;
  var FAVOR_QUIT_DELAY_MS = 2600;

  /* ------------------------------------------------------------- storage */

  function freshState() {
    return {
      hunger: DEFAULTS.hunger, mood: DEFAULTS.mood, energy: DEFAULTS.energy,
      bond: DEFAULTS.bond, favor: DEFAULTS.favor, coins: START_COINS,
      satisfaction: 0, bag: {}, buffs: {}, bondClaimed: 1, lastPity: 0, last: Date.now()
    };
  }

  function normalise(s) {
    var out = freshState();
    ['hunger', 'mood', 'energy', 'bond', 'favor', 'coins', 'satisfaction']
      .forEach(function (k) {
        if (typeof s[k] === 'number' && isFinite(s[k])) { out[k] = s[k]; }
      });
    if (s.bag && typeof s.bag === 'object') {
      Object.keys(s.bag).forEach(function (id) {
        var n = s.bag[id];
        if (typeof n === 'number' && n > 0 && isFinite(n)) { out.bag[id] = Math.floor(n); }
      });
    }
    if (s.buffs && typeof s.buffs === 'object') {
      Object.keys(s.buffs).forEach(function (id) {
        var until = s.buffs[id];
        if (typeof until === 'number' && until > Date.now()) { out.buffs[id] = until; }
      });
    }
    if (typeof s.lastPity === 'number') { out.lastPity = s.lastPity; }
    if (typeof s.bondClaimed === 'number' && s.bondClaimed >= 1) {
      out.bondClaimed = Math.floor(s.bondClaimed);
    }
    if (typeof s.last === 'number') { out.last = s.last; }
    return out;
  }

  var store = (function loadStore() {
    var s = { active: DEFAULT_CHARACTER, characters: {}, seenEconomy: false };
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.characters) {
          if (typeof o.active === 'string' && CHARACTERS[o.active]) { s.active = o.active; }
          Object.keys(o.characters).forEach(function (k) {
            if (CHARACTERS[k]) { s.characters[k] = normalise(o.characters[k]); }
          });
          store.seenEconomy = !!o.seenEconomy;
        }
      } else {
        /* First run after the update: carry the whale's old save across. */
        var old = window.localStorage.getItem(LEGACY_KEY);
        if (old) {
          var p = JSON.parse(old);
          if (p) { s.characters.whale = normalise(p); }
        }
      }
    } catch (e) { /* start fresh */ }
    return s;
  })();

  function stateOf(id) {
    if (!store.characters[id]) { store.characters[id] = freshState(); }
    return store.characters[id];
  }

  function currentId() {
    return CHARACTERS[store.active] ? store.active : DEFAULT_CHARACTER;
  }

  function currentChar() { return CHARACTERS[currentId()]; }

  function state() { return stateOf(currentId()); }

  function save() {
    try {
      state().last = Date.now();
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        active: currentId(), characters: store.characters,
        seenEconomy: !!store.seenEconomy
      }));
    } catch (e) { /* ignore */ }
  }

  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  /* ----------------------------------------------------------------- DOM */

  var pet = document.getElementById('pet');
  var whaleImg = document.getElementById('whale');
  var bubbleEl = document.getElementById('bubble');
  var bubbleText = document.getElementById('bubbleText');
  var hint = document.getElementById('hint');
  var flyLayer = document.getElementById('flyLayer');
  var toastEl = document.getElementById('toast');
  var lvlEl = document.getElementById('lvl');
  var nameEl = document.getElementById('petName');
  var switchBtn = document.getElementById('switchBtn');
  var musicBtn = document.getElementById('musicBtn');
  var voiceBtn = document.getElementById('voiceBtn');
  var shopBtn = document.getElementById('shopBtn');
  var coinValueEl = document.getElementById('coinValue');
  var shopCoinsEl = document.getElementById('shopCoins');
  var shopEl = document.getElementById('shop');
  var shopListEl = document.getElementById('shopList');
  var shopSubEl = document.getElementById('shopSub');
  var shopCloseBtn = document.getElementById('shopClose');
  var shopTabsEl = document.getElementById('shopTabs');
  var buffBarEl = document.getElementById('buffBar');
  var bondEl = document.getElementById('bondPanel');
  var bondBodyEl = document.getElementById('bondBody');
  var bondCloseBtn = document.getElementById('bondClose');
  var bondCoinsEl = document.getElementById('bondCoins');
  var barEls = {};
  Array.prototype.forEach.call(document.querySelectorAll('#hud .stat'), function (el) {
    barEls[el.getAttribute('data-k')] = el;
  });
  var actionBtns = {};
  Array.prototype.forEach.call(document.querySelectorAll('#actions button'), function (b) {
    actionBtns[b.getAttribute('data-act')] = b;
  });
  var feedBtn = actionBtns.feed;
  var playBtn = actionBtns.play;
  var workBtn = actionBtns.work;

  /* --------------------------------------------------------------- speech */

  var lastPick = {};

  function pick(kind) {
    var lib = currentChar().lines;
    var pool = lib[kind] || lib.idle;
    if (!pool || !pool.length) { return ''; }
    if (pool.length === 1) { return pool[0]; }
    var key = currentId() + ':' + kind;
    var idx = Math.floor(Math.random() * pool.length);
    if (idx === lastPick[key]) { idx = (idx + 1) % pool.length; }
    lastPick[key] = idx;
    return pool[idx];
  }

  var bubbleTimer = null;

  /* Voice output.  Android's own TTS engine synthesises the line and the
     host then pitch-shifts it towards the character's register, so this
     stays free and offline. */
  var voice = { on: true };

  function speak(text, mode) {
    if (!voice.on) { return; }
    var n = native();
    if (!n || !n.speak) { return; }
    try { n.speak(text, currentId(), mode || 'say'); } catch (e) { /* no voice */ }
  }

  function say(text, holdMs, mode) {
    if (!text) { return; }
    bubbleText.textContent = text;
    bubbleEl.classList.remove('hide');
    if (bubbleTimer) { clearTimeout(bubbleTimer); }
    bubbleTimer = setTimeout(function () {
      bubbleEl.classList.add('hide');
    }, holdMs || Math.max(2300, 1200 + text.length * 95));
    speak(text, mode);
  }

  var toastTimer = null;

  function toast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, ms || 1600);
  }

  /* -------------------------------------------------------------- bridge */

  function native() {
    try {
      return (typeof window.WhaleNative !== 'undefined' && window.WhaleNative) || null;
    } catch (e) { return null; }
  }

  function buzz(ms) {
    var n = native();
    try { if (n && n.buzz) { n.buzz(ms); } } catch (e) { /* ignore */ }
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  /* ---------------------------------------------------------------- music */

  var music = { on: false, volume: 0.45, el: null };

  function musicAvailable() {
    var n = native();
    if (n && n.musicAvailable) {
      try { return !!n.musicAvailable(); } catch (e) { return false; }
    }
    return false;
  }

  function musicStart() {
    var n = native();
    if (musicAvailable()) {
      try { n.musicPlay(); } catch (e) { /* ignore */ }
    } else {
      if (!music.el) {
        music.el = document.createElement('audio');
        music.el.src = 'bgm.m4a';
        music.el.loop = true;
      }
      try { music.el.volume = music.volume; music.el.play(); } catch (e) { /* ignore */ }
    }
  }

  function musicStop() {
    var n = native();
    if (musicAvailable()) {
      try { n.musicPause(); } catch (e) { /* ignore */ }
    } else if (music.el) {
      try { music.el.pause(); } catch (e) { /* ignore */ }
    }
  }

  function renderMusicBtn() {
    if (!musicBtn) { return; }
    musicBtn.textContent = music.on ? '🔊' : '🔇';
    musicBtn.classList.toggle('playing', music.on);
    musicBtn.setAttribute('aria-label', music.on ? '关闭背景音乐' : '开启背景音乐');
  }

  function toggleMusic(force) {
    var want = (typeof force === 'boolean') ? force : !music.on;
    music.on = want;
    if (want) { musicStart(); } else { musicStop(); }
    renderMusicBtn();
    if (want) { toast('背景音乐已开启 · 《蔚蓝档案》5th PV'); }
    save();
  }

  function startMusic() {
    music.on = true;
    musicStart();
    renderMusicBtn();
  }

  function renderVoiceBtn() {
    if (!voiceBtn) { return; }
    voiceBtn.textContent = voice.on ? '🗣️' : '🤐';
    voiceBtn.classList.toggle('playing', voice.on);
    voiceBtn.setAttribute('aria-label', voice.on ? '关闭角色语音' : '开启角色语音');
  }

  function toggleVoice(force) {
    voice.on = (typeof force === 'boolean') ? force : !voice.on;
    renderVoiceBtn();
    var n = native();
    try {
      if (n && n.setVoiceEnabled) { n.setVoiceEnabled(voice.on); }
      if (!voice.on && n && n.stopSpeaking) { n.stopSpeaking(); }
    } catch (e) { /* ignore */ }
    toast(voice.on ? '角色语音已开启' : '角色语音已关闭');
    if (voice.on) { speak(pick('onEnter')); }
    save();
  }

  /* --------------------------------------------------------- theme / art */

  function applyTheme() {
    var art = currentChar().art;
    var t = art.theme;
    var root = document.documentElement;
    root.style.setProperty('--bg1', t.bg1);
    root.style.setProperty('--bg2', t.bg2);
    root.style.setProperty('--bg3', t.bg3);
    root.style.setProperty('--deep', t.deep);
    root.style.setProperty('--text', t.text);
    root.style.setProperty('--text-dim', t.textDim);
    root.style.setProperty('--bar', t.bar);
    root.style.setProperty('--dot', t.dot);
    root.style.setProperty('--danger', t.danger);
    root.style.setProperty('--accent', art.accent);
    root.style.setProperty('--accent-soft', art.accentSoft);
    root.style.setProperty('--glow-color', art.glow);
    root.style.setProperty('--btn-fill', art.bodyFill);
    root.style.setProperty('--bob-duration', art.bobDuration + 's');
    root.style.setProperty('--bob-tilt', art.bobTilt + 'deg');
    root.style.setProperty('--bob-scale', String(art.bobScale));
    if (art.aspect) { root.style.setProperty('--pet-aspect', String(art.aspect)); }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', t.bg); }
  }

  function applyArt() {
    var art = currentChar().art;
    if (whaleImg.getAttribute('src') !== art.body) {
      whaleImg.setAttribute('src', art.body);
    }
    whaleImg.setAttribute('alt', currentChar().name);
    if (feedBtn) {
      var span = feedBtn.querySelector('span');
      if (span) { span.textContent = art.feedIcon; }
      var flabel = feedBtn.querySelector('.btn-label');
      if (flabel) { flabel.textContent = feedLabel(); }
      feedBtn.setAttribute('aria-label', feedLabel());
      feedBtn.title = feedLabel() + ' · ' + currentChar().name;
    }
    if (playBtn) {
      var pspan = playBtn.querySelector('span');
      if (pspan) { pspan.textContent = art.playGlyph; }
    }
    var w = WORK[currentId()];
    if (workBtn && w) {
      var wspan = workBtn.querySelector('span');
      if (wspan) { wspan.textContent = w.icon; }
      var wtxt = workBtn.querySelector('.btn-label');
      if (wtxt) { wtxt.textContent = w.name; }
      workBtn.setAttribute('aria-label', w.name);
      workBtn.title = w.name;
    }
    if (nameEl) { nameEl.textContent = currentChar().name; }
    if (switchBtn) { switchBtn.textContent = '切换 ' + currentChar().name; }
    if (shopSubEl) { shopSubEl.textContent = '金币来自「' + (w ? w.name : '工作') + '」'; }
  }

  /* --------------------------------------------------------------- glyphs */

  function fxEls() {
    return {
      sleep: document.querySelector('.fx-sleep'),
      angry: document.querySelector('.fx-angry'),
      love: document.querySelector('.fx-love'),
      spark: document.querySelector('.fx-spark')
    };
  }

  function applyGlyphs() {
    var art = currentChar().art;
    var e = fxEls();
    if (e.sleep) { e.sleep.textContent = art.fx.sleep; }
    if (e.angry) { e.angry.textContent = art.fx.angry; }
    if (e.love) { e.love.textContent = art.fx.love; }
    if (e.spark) { e.spark.textContent = art.fx.spark; }
  }

  function fly(glyph, count) {
    var n = count || 1;
    for (var i = 0; i < n; i++) {
      (function (k) {
        setTimeout(function () {
          var el = document.createElement('span');
          el.className = 'fly';
          el.textContent = glyph;
          el.style.left = (34 + Math.random() * 32) + '%';
          el.style.top = (52 + Math.random() * 12) + '%';
          el.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
          el.style.setProperty('--rot', (Math.random() * 70 - 35) + 'deg');
          el.style.fontSize = (17 + Math.random() * 10) + 'px';
          flyLayer.appendChild(el);
          setTimeout(function () { el.remove(); }, 1250);
        }, k * 110);
      })(i);
    }
  }

  /* ----------------------------------------------------------------- mood */

  var sleeping = false;
  var annoyedUntil = 0;
  var forced = null;
  var forcedSay = null;
  var shotMode = false;
  var shotShop = null;
  var shotBond = false;
  var shotBroke = false;
  var skipTicker = false;
  var quitArmed = false;
  var warnedFavor = false;

  function moodKey() {
    if (forced) { return forced; }
    if (sleeping) { return 'sleepy'; }
    if (Date.now() < annoyedUntil) { return 'annoyed'; }
    var s = state();
    if (s.energy < 22) { return 'sleepy'; }
    if (s.hunger > 76) { return 'hungry'; }
    if (s.mood < 32 || s.hunger > 62) { return 'annoyed'; }
    if (s.mood > 68 && s.hunger < 58 && s.energy > 40) { return 'happy'; }
    return 'normal';
  }

  function applyMood() {
    var k = moodKey();
    if (pet.dataset.mood !== k) {
      pet.dataset.mood = k;
      pet.className = pet.className.replace(/mood-\S+/g, '').trim();
      pet.classList.add('mood-' + k);
    }
    return k;
  }

  function setBar(el, ratio, warn, bad) {
    if (!el) { return; }
    var i = el.querySelector('i');
    if (i) { i.style.width = Math.round(ratio * 100) + '%'; }
    el.className = 'stat' + (bad ? ' bad' : warn ? ' warn' : '');
  }

  function render() {
    applyMood();
    var s = state();
    setBar(barEls.hunger, 1 - s.hunger, s.hunger > 58, s.hunger > 76);
    setBar(barEls.mood, s.mood, s.mood < 50, s.mood < 32);
    setBar(barEls.energy, s.energy, s.energy < 42, s.energy < 22);
    if (barEls.favor) {
      setBar(barEls.favor, s.favor, s.favor < 45, s.favor < FAVOR_WARN_AT);
    }
    if (lvlEl) {
      var pending = pendingBondLevels().length;
      lvlEl.textContent = '羁绊 ' + bondLevel() + (pending ? ' ↑' : '');
      lvlEl.classList.toggle('claimable', pending > 0);
      lvlEl.title = '查看羁绊等级' + (pending ? '（有奖励可领）' : '');
    }
    renderCoins();
    renderWorkBtn();
    renderBuffs();
    if (shopEl && !shopEl.classList.contains('hide')) { renderShop(); }
    if (bondEl && !bondEl.classList.contains('hide')) { renderBond(); }
    return s;
  }

  /* ------------------------------------------------------- coins / bag */

  function renderCoins() {
    var s = state();
    var n = Math.floor(s.coins);
    if (coinValueEl) { coinValueEl.textContent = n; }
    if (shopCoinsEl) { shopCoinsEl.textContent = n; }
  }

  function addCoins(n) {
    var s = state();
    s.coins = Math.max(0, Math.floor(s.coins + n));
    return s.coins;
  }

  function bagCount(id) {
    var bag = state().bag;
    return Math.floor(bag[id] || 0);
  }

  function bagTotal() {
    var bag = state().bag;
    var t = 0;
    Object.keys(bag).forEach(function (k) { t += Math.max(0, Math.floor(bag[k] || 0)); });
    return t;
  }

  function addToBag(id, n) {
    var bag = state().bag;
    bag[id] = Math.max(0, Math.floor((bag[id] || 0) + n));
    if (bag[id] <= 0) { delete bag[id]; }
  }

  function itemsOfKind(kind) {
    return SHOP_ITEMS.filter(function (it) {
      if (it.kind !== kind) { return false; }
      return !it.chars || it.chars.indexOf(currentId()) !== -1;
    });
  }

  function itemById(id) {
    for (var i = 0; i < SHOP_ITEMS.length; i++) {
      if (SHOP_ITEMS[i].id === id) { return SHOP_ITEMS[i]; }
    }
    return null;
  }

  /* ---------------------------------------------------------------- buffs */

  function activeBuffs() {
    var b = state().buffs;
    var now = Date.now();
    var out = [];
    Object.keys(b).forEach(function (id) {
      if (b[id] > now) { out.push({ id: id, until: b[id], left: b[id] - now }); }
      else { delete b[id]; }
    });
    return out;
  }

  function hasBuff(id) {
    var b = state().buffs;
    return !!(b[id] && b[id] > Date.now());
  }

  function addBuff(id, minutes) {
    var s = state();
    var base = Math.max(Date.now(), s.buffs[id] || 0);
    s.buffs[id] = base + minutes * 60000;
  }

  function renderBuffs() {
    if (!buffBarEl) { return; }
    var list = activeBuffs();
    if (!list.length) {
      if (buffBarEl.childNodes.length) { buffBarEl.innerHTML = ''; }
      buffBarEl.className = 'buffs';
      return;
    }
    buffBarEl.className = 'buffs on';
    var html = '';
    list.forEach(function (b) {
      var def = BUFFS[b.id] || { icon: '✨', label: b.id };
      var mins = Math.max(1, Math.round(b.left / 60000));
      html += '<span class="buff" title="' + def.label + '：' + (def.desc || '') + '">' +
        def.icon + '<em>' + mins + '′</em></span>';
    });
    buffBarEl.innerHTML = html;
  }

  /* ------------------------------------------------------------ work state */

  var workReadyAt = 0;

  function workPay() {
    var w = WORK[currentId()];
    var s = state();
    var base = (w && w.coins) || 8;
    var sat = Math.max(0, s.satisfaction || 0);
    return Math.round(base + sat * (typeof SATISFACTION_BONUS === 'number' ? SATISFACTION_BONUS : 1.2));
  }

    function renderWorkBtn() {
    if (!workBtn) { return; }
    var left = workReadyAt - Date.now();
    var label = workBtn.querySelector('.btn-label');
    var w = WORK[currentId()];
    if (left > 0) {
      workBtn.classList.add('cool');
      workBtn.classList.remove('blocked');
      workBtn.removeAttribute('title');
      if (label) { label.textContent = Math.ceil(left / 1000) + 's'; }
      return;
    }
    workBtn.classList.remove('cool');
    // Surface the blocker on the button itself, so "why can't she work" is
    // answerable without pressing it.
    var miss = missingForWork();
    var overfed = isOverfed();
    if (miss) {
      workBtn.classList.add('blocked');
      workBtn.title = miss.label + '不够（' + miss.have + '/' + miss.need + '）· ' + miss.hint;
      if (label) { label.textContent = miss.label + ' ' + miss.have; }
    } else {
      workBtn.classList.remove('blocked');
      if (label) { label.textContent = w ? w.name : '工作'; }
      workBtn.title = overfed ? '吃太饱了，效率只有 40%' : (w ? w.name : '工作');
    }
  }

  /* Shop UI */

  var shopTab = 'food';

  function shopOpen() {
    if (!shopEl) { return; }
    shopTab = 'food';
    if (shopTabsEl) {
      Array.prototype.forEach.call(shopTabsEl.querySelectorAll('button'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-tab') === shopTab);
      });
    }
    renderShop();
    shopEl.classList.remove('hide');
    shopEl.setAttribute('aria-hidden', 'false');
  }

  function shopHide() {
    if (!shopEl) { return; }
    shopEl.classList.add('hide');
    shopEl.setAttribute('aria-hidden', 'true');
  }

  function shopVisible() {
    return shopEl && !shopEl.classList.contains('hide');
  }

  function renderShop() {
    if (!shopListEl) { return; }
    var s = state();
    var coins = Math.floor(s.coins);
    var html = '';

    if (shopTab === 'bag') {
      var ids = Object.keys(s.bag);
      if (!ids.length) {
        html = '<p class="empty">背包是空的。<br>去「食物」买点吃的，或去「玩物」买个玩具。</p>';
      } else {
        // food first, then toys, each group cheapest-first
        ids.sort(function (a, b) {
          var ia = itemById(a), ib = itemById(b);
          if (!ia || !ib) { return 0; }
          if (ia.kind !== ib.kind) { return ia.kind === 'food' ? -1 : 1; }
          return ia.price - ib.price;
        });
        ids.forEach(function (id) {
          var it = itemById(id);
          if (!it) { return; }
          var n = bagCount(id);
          var eff = describeEffect(it.effect);
          html += '<div class="row">' +
            '<span class="ico">' + it.icon + '</span>' +
            '<span class="meta"><span class="nm">' + it.name +
            '<em class="price">' + (it.kind === 'food' ? '食物' : '玩物') + '</em></span>' +
            '<span class="ds">' + it.desc + '</span>' +
            '<span class="eff">' + eff + '</span></span>' +
            '<span class="tag ok">×' + n + '</span>' +
            '</div>';
        });
        html += '<p class="note">食物按「投喂」吃掉，玩物按「玩耍」用掉一件。</p>';
      }
    } else {
      itemsOfKind(shopTab).forEach(function (it) {
        var afford = coins >= it.price;
        var eff = describeEffect(it.effect);
        var have = bagCount(it.id);
        html += '<div class="row' + (afford ? '' : ' dim') + '">' +
          '<span class="ico">' + it.icon + '</span>' +
          '<span class="meta"><span class="nm">' + it.name +
          '<em class="price">🪙' + it.price + '</em>' +
          (have ? '<em class="have">已有 ×' + have + '</em>' : '') + '</span>' +
          '<span class="ds">' + it.desc + '</span>' +
          '<span class="eff">' + eff + '</span></span>' +
          '<button class="buy" type="button" data-buy="' + it.id + '"' +
          (afford ? '' : ' disabled') + '>' +
          (it.kind === 'food' ? '买下' : '放背包') + '</button>' +
          '</div>';
      });
      if (shopTab === 'food') {
        html += '<p class="note">食物会放进背包，按主界面的「投喂」吃掉（一次吃最好的一件）。' +
          '背包空了再按「投喂」会顺手买最便宜的那份。</p>';
      } else {
        html += '<p class="note">玩物会放进背包，按主界面的「玩耍」用掉一件，' +
          '一次用最便宜的那件。带 buff 的道具留到需要的时候再用。</p>';
      }
      // 保底 status, only while it actually matters
      if (shopTab === 'food' && isBroke()) {
        var wait = pityWaitMs();
        html += '<p class="note pity">💠 保底：金币不够买最便宜的食物了。' +
          (wait > 0
            ? '她 ' + Math.ceil(wait / 1000) + ' 秒后能自己找到一点吃的（免费，但心情 −' + PITY_MOOD_COST + '）。'
            : '现在按「' + feedLabel() + '」她会自己找到一点吃的（免费，但心情 −' + PITY_MOOD_COST + '）。') +
          '</p>';
      }
    }
    shopListEl.innerHTML = html;
  }

  /** Plain-language summary of what an item does, e.g. "饱食 26 · 心情 +20". */
  function describeEffect(eff) {
    var parts = [];
    if (!eff) { return ''; }
    if (eff.feed) { parts.push('饱食 ' + eff.feed); }
    if (eff.mood) { parts.push('心情 +' + eff.mood); }
    if (eff.energy > 0) { parts.push('精力 +' + eff.energy); }
    if (eff.energy < 0) { parts.push('精力 ' + eff.energy); }
    if (eff.favor) { parts.push('好感 +' + eff.favor); }
    if (eff.bond) { parts.push('羁绊 +' + eff.bond); }
    if (eff.buff) {
      var def = BUFFS[eff.buff] || {};
      parts.push((def.icon || '') + (def.label || eff.buff) +
        ' ' + (eff.buffMinutes || 10) + '分钟');
    }
    return parts.join(' · ');
  }

  function buyItem(id) {
    var it = itemById(id);
    if (!it) { return; }
    var s = state();
    if (s.coins < it.price) {
      toast('金币不够，去「' + (WORK[currentId()] ? WORK[currentId()].name : '工作') + '」赚一点');
      return;
    }
    addCoins(-it.price);
    addToBag(id, 1);              // both food and toys are stocked, not eaten
    if (it.kind === 'food') {
      toast(it.name + ' 已放进背包，按「' + feedLabel() + '」吃掉');
    } else {
      toast(it.name + ' 已放进背包，按「玩耍」用掉');
    }
    render(); save();
  }

  /** What the feed button is called for the active character. */
  function feedLabel() {
    return currentId() === 'whale' ? '投喂' : '给葱';
  }

  /* Shared effect applier for shop items and play items. */
  function applyEffect(eff, glyph) {
    if (!eff) { return; }
    var s = state();
    if (eff.feed) {
      s.hunger = clamp(s.hunger - eff.feed);
      fly(glyph || currentChar().art.feedGlyphs[0], 3);
    }
    if (eff.mood) {
      var mood = eff.mood;
      if (hasBuff('mic')) { mood = mood * 2; }
      s.mood = clamp(s.mood + mood);
    }
    if (eff.energy) { s.energy = clamp(s.energy + eff.energy); }
    if (eff.favor) {
      var f = eff.favor;
      if (hasBuff('mic')) { f = f * 2; }
      addFavor(f);
    }
    if (eff.bond) { addBond(eff.bond); }
    if (eff.buff) { addBuff(eff.buff, eff.buffMinutes || 10); }
  }

  /* ------------------------------------------------------------ work action */

  /**
   * What is currently stopping her from working, or null if she can.
   * Reported rather than guessed: the caller shows the exact shortfall, so a
   * player is never told to fix the wrong stat.
   */
  function missingForWork() {
    var w = WORK[currentId()];
    if (!w || !w.cost) { return null; }
    var s = state();
    if (w.cost.energy && s.energy < w.cost.energy) {
      return {
        key: 'energy', label: '精力',
        have: Math.round(s.energy), need: w.cost.energy,
        hint: currentId() === 'whale' ? '先让她睡一觉' : '让她睡一觉，或者买瓶能量饮料'
      };
    }
    if (w.cost.hunger && s.hunger < w.cost.hunger) {
      return {
        key: 'hunger', label: '饱食',
        have: Math.round(s.hunger), need: w.cost.hunger,
        hint: '按「' + feedLabel() + '」喂点东西'
      };
    }
    return null;
  }

  /** True when she is too full for eating to be worth much (whale only). */
  function isOverfed() {
    return currentId() === 'whale' && state().hunger < 10;
  }

  function doWork() {
    var w = WORK[currentId()];
    if (!w) { return; }
    if (quitArmed) { return; }
    if (sleeping) { say(pick('sleep')); return; }
    var left = workReadyAt - Date.now();
    if (left > 0) {
      toast('让她喘口气，还有 ' + Math.ceil(left / 1000) + ' 秒');
      return;
    }

    var miss = missingForWork();
    if (miss) {
      toast(miss.label + '不够：' + miss.have + '/' + miss.need + '，' + miss.hint, 2800);
      say(pick('workTired'));
      render();
      return;
    }

    var s = state();
    var overfed = isOverfed();

    if (w.cost) {
      if (w.cost.hunger) { s.hunger = clamp(s.hunger - w.cost.hunger); }
      if (w.cost.energy) { s.energy = clamp(s.energy - w.cost.energy); }
    }
    if (w.gain) {
      if (w.gain.feed) { s.hunger = clamp(s.hunger - w.gain.feed); }
      if (w.gain.mood) { s.mood = clamp(s.mood + w.gain.mood); }
      if (w.gain.favor) { addFavor(w.gain.favor); }
      if (w.gain.bond) { addBond(w.gain.bond); }
    }

    var pay = workPay();
    var encore = w.encore && Math.random() < w.encore.chance;
    if (encore) {
      pay = Math.round(pay * (w.encore.mult || 1.8));
      if (w.encore.extraFeed) { s.hunger = clamp(s.hunger - w.encore.extraFeed); }
    }
    if (overfed) { pay = Math.max(1, Math.round(pay * 0.4)); }
    addCoins(pay);
    s.satisfaction = Math.min(20, (s.satisfaction || 0) +
      (typeof SATISFACTION_GAIN === 'number' ? SATISFACTION_GAIN : 6));

    fly(currentId() === 'whale' ? '🪙' : '🎵', encore ? 5 : 3);
    fly('💰', 1);
    buzz(encore ? 40 : 24);
    react();
    if (overfed) { say(pick('workFull')); }
    else { say(encore ? pick('workEncore') : pick('work')); }
    toast('+' + pay + ' 🪙' +
      (encore && !overfed ? '（' + w.encore.label + '）' : overfed ? '（吃太饱了，效率很低）' : ''),
      1800);

    workReadyAt = Date.now() + WORK_COOLDOWN_MS;
    render(); save();
  }

  /* ------------------------------------------------------ auto-quit logic */

  /* --------------------------------------------------------------- decay */

  function applyOfflineTime() {
    if (forced) { return; }
    var now = Date.now();
    CHARACTER_ORDER.forEach(function (id) {
      var s = stateOf(id);
      var mins = (now - s.last) / 60000;
      if (!isFinite(mins) || mins <= 0) { return; }
      var eff = Math.min(mins, 8 * 60) * 0.5;
      s.hunger = clamp(s.hunger + eff * 0.55);
      s.mood = clamp(s.mood - eff * 0.30);
      s.energy = clamp(s.energy + eff * 0.40);
      var seconds = Math.min(eff * 60, 60 * 60);
      s.favor = Math.max(0, s.favor - seconds / FAVOR_DRAIN_SECONDS * 4);
      s.last = now;
    });
  }

  function decay(dtMs) {
    if (forced) { return; }
    var s = state();
    var m = dtMs / 60000;
    // The energy bar halves the rate at which needs move, in both directions.
    var rate = hasBuff('steady') ? 0.5 : 1;
    s.hunger = clamp(s.hunger + m * 0.50 * rate);
    s.mood = clamp(s.mood - m * 0.28 * rate);
    s.energy = clamp(s.energy - m * 0.20 * rate);
    var seconds = dtMs / 1000;
    s.favor = Math.max(0, s.favor - seconds / FAVOR_DRAIN_SECONDS * 4 * rate);
    s.satisfaction = Math.max(0, (s.satisfaction || 0) - m * SATISFACTION_DECAY_PER_MIN);
    if (Date.now() - lastBondGain > 120000) {
      s.bond = Math.max(0, s.bond - m * 0.05);
    }
  }

  var lastBondGain = Date.now();

  function addBond(n) {
    var s = state();
    s.bond = Math.min(9999, s.bond + n);
    lastBondGain = Date.now();
  }

  function addFavor(n) {
    var s = state();
    s.favor = clamp(s.favor + n);
  }

  /* ------------------------------------------------------- bond / levels */

  function bondLevel() {
    return Math.max(1, Math.floor(state().bond / BOND_PER_LEVEL) + 1);
  }

  /** Bond points needed to reach the next level. */
  function bondNextAt() {
    return bondLevel() * BOND_PER_LEVEL;
  }

  /** 0..1 progress through the current level. */
  function bondProgress() {
    var level = bondLevel();
    var base = (level - 1) * BOND_PER_LEVEL;
    var span = BOND_PER_LEVEL;
    var into = state().bond - base;
    return Math.max(0, Math.min(1, into / span));
  }

  function bondRewardFor(level) {
    if (level <= 1) { return 0; }
    return BOND_REWARD_BASE + BOND_REWARD_STEP * (level - 2);
  }

  /** Levels reached but not yet paid out. */
  function pendingBondLevels() {
    var claimed = state().bondClaimed || 1;
    var level = bondLevel();
    var out = [];
    for (var l = claimed + 1; l <= level; l++) { out.push(l); }
    return out;
  }

  function pendingBondCoins() {
    return pendingBondLevels().reduce(function (sum, l) {
      return sum + bondRewardFor(l);
    }, 0);
  }

  /** Pays out every unclaimed level and reports what was earned. */
  function claimBondRewards() {
    var levels = pendingBondLevels();
    if (!levels.length) { return 0; }
    var total = 0;
    levels.forEach(function (l) { total += bondRewardFor(l); });
    state().bondClaimed = levels[levels.length - 1];
    addCoins(total);
    addFavor(3 * levels.length);
    fly('💰', Math.min(6, 2 + levels.length));
    buzz(24);
    react();
    say(randomOf([
      '羁绊升级了……谢、谢谢你。',
      '喏，这是给你的谢礼。别多想。',
      '和你在一起，我好像也没那么想删东西了。'
    ]));
    toast('羁绊奖励：+' + total + ' 🪙（' + levels.length + ' 级）', 2600);
    render(); save();
    return total;
  }

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* Bond panel */

  function bondOpen() {
    if (!bondEl) { return; }
    renderBond();
    bondEl.classList.remove('hide');
    bondEl.setAttribute('aria-hidden', 'false');
  }

  function bondHide() {
    if (!bondEl) { return; }
    bondEl.classList.add('hide');
    bondEl.setAttribute('aria-hidden', 'true');
  }

  function renderBond() {
    if (!bondBodyEl) { return; }
    var s = state();
    if (bondCoinsEl) { bondCoinsEl.textContent = Math.floor(s.coins); }
    var s = state();
    var level = bondLevel();
    var need = bondNextAt();
    var into = Math.round(s.bond - (level - 1) * BOND_PER_LEVEL);
    var pct = Math.round(bondProgress() * 100);
    var pending = pendingBondLevels();
    var pendingCoins = pendingBondCoins();
    var nextReward = bondRewardFor(level + 1);

    var html = '';
    html += '<div class="bond-hero">' +
      '<div class="bond-lv"><span class="num">Lv.' + level + '</span>' +
      '<span class="who">' + currentChar().name + '</span></div>' +
      '<div class="bond-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="bond-count">羁绊 ' + into + ' / ' + BOND_PER_LEVEL +
      '（距离 Lv.' + (level + 1) + ' 还差 ' + Math.max(0, need - Math.round(s.bond)) + '）</div>' +
      '</div>';

    html += '<div class="bond-rows">';
    html += '<div class="bond-row' + (pending.length ? ' hot' : '') + '">' +
      '<span class="k">可领取</span>' +
      '<span class="v">' + (pending.length
        ? 'Lv.' + pending[0] + (pending.length > 1 ? '–' + pending[pending.length - 1] : '') +
          ' · +' + pendingCoins + ' 🪙'
        : '暂无') + '</span>' +
      (pending.length ? '<button class="claim" type="button" data-claim="1">领取</button>' : '') +
      '</div>';
    html += '<div class="bond-row"><span class="k">下一级奖励</span>' +
      '<span class="v">+' + nextReward + ' 🪙</span></div>';
    html += '<div class="bond-row"><span class="k">每级所需</span>' +
      '<span class="v">' + BOND_PER_LEVEL + ' 点羁绊</span></div>';
    html += '</div>';

    html += '<p class="note">羁绊来自陪伴：摸摸、投喂、玩耍、唱歌、睡觉都会涨，' +
      '而且只增不减。升到新等级会发金币，记得回来领。</p>';

    html += '<div class="bond-actions">' +
      '<button type="button" data-bond="pet">摸摸她</button>' +
      '<button type="button" data-bond="play">陪她玩</button>' +
      '<button type="button" data-bond="close">关闭</button>' +
      '</div>';

    bondBodyEl.innerHTML = html;
  }

  /* ------------------------------------------------------ auto-quit logic */

  function quitApp() {
    var n = native();
    try { if (n && n.quitApp) { n.quitApp(); return; } } catch (e) { /* fall through */ }
    try { if (n && n.quit) { n.quit(); return; } } catch (e) { /* fall through */ }
    try { window.location.reload(); } catch (e) { /* ignore */ }
  }

  function checkFavor() {
    if (forced || shotMode) { return; }
    var s = state();
    if (s.favor >= FAVOR_WARN_AT) { warnedFavor = false; return; }
    if (warnedFavor) { return; }
    warnedFavor = true;
    say(pick('lonely'), 3200);
    toast('好感度告急！再不理她，她就要走了', 2800);
  }

  function triggerQuit() {
    if (quitArmed) { return; }
    quitArmed = true;
    sleeping = false;
    say(pick('minFavor'), 2400);
    toast('好感度归零，她关掉了软件……', 2400);
    buzz(120);
    if (music.on) { musicStop(); }
    save();
    setTimeout(quitApp, FAVOR_QUIT_DELAY_MS);
  }

  /* --------------------------------------------------------- switch cast */

  var switching = false;

  function switchCharacter() {
    if (switching) { return; }
    var order = CHARACTER_ORDER;
    var i = order.indexOf(currentId());
    var next = order[(i + 1) % order.length];
    if (next === currentId()) { return; }
    switching = true;

    save();                 // park the outgoing character's numbers
    sleeping = false;
    annoyedUntil = 0;
    warnedFavor = false;
    if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
    lastPick = {};

    pet.classList.add('switching');
    setTimeout(function () {
      store.active = next;
      stateOf(next);          // make sure the newcomer has a wallet at once
      applyTheme();
      applyArt();
      applyGlyphs();
      render();
      applyOfflineTime();
      render();
      lastTick = Date.now();
      pet.classList.remove('switching');
      switching = false;
      say(pick('onEnter'), 3000);
      toast('已切换为 ' + currentChar().name, 1800);
      addFavor(4);
      save();
    }, 260);
  }

  function accrueFavor(n) { addFavor(n); }

  /* ------------------------------------------------------------- actions */

  /* 货币花完保底: how long until she can scrounge again, in ms (0 = ready). */
  function pityWaitMs() {
    var last = state().lastPity || 0;
    var left = (last + PITY_COOLDOWN_MS) - Date.now();
    return left > 0 ? left : 0;
  }

  /* Broke = cannot afford the cheapest meal in this character's shop. */
  function isBroke() {
    var food = itemsOfKind('food');
    if (!food.length) { return true; }
    var cheapest = food.reduce(function (a, b) {
      return a.price <= b.price ? a : b;
    });
    return state().coins < cheapest.price;
  }

  /* 投喂: eats one item out of the pantry.  If the pantry is empty it buys
     the cheapest meal on the spot; if the wallet is empty too, the 保底
     kicks in and she scrounges a free (but worse) meal. */
  function doFeed() {
    var s = state();
    if (sleeping) { say('别吵……我在睡觉……'); return; }
    if (s.hunger < 12) {
      say(pick(s.hunger < 4 ? 'full' : 'notHungry'));
      render();
      return;
    }

    var stock = SHOP_ITEMS.filter(function (it) {
      return it.kind === 'food' && bagCount(it.id) > 0;
    });
    var meal = null;

    if (stock.length) {
      // biggest meal first: feeding is meant to actually matter
      stock.sort(function (a, b) { return (b.effect.feed || 0) - (a.effect.feed || 0); });
      meal = stock[0];
    } else {
      var afford = itemsOfKind('food').filter(function (it) { return s.coins >= it.price; });
      if (afford.length) {
        afford.sort(function (a, b) { return a.price - b.price; });
        meal = afford[0];
        addCoins(-meal.price);
        toast('背包是空的，顺手买了 ' + meal.name + '（−🪙' + meal.price + '）', 2200);
      }
    }

    if (meal) {
      addToBag(meal.id, -1);
      applyEffect(meal.effect, meal.icon);
      say(pick('feed'));
      buzz(16);
      react();
      render(); save();
      cool('feed', 900);
      return;
    }

    // ---- 保底: no pantry, no wallet ----
    var wait = pityWaitMs();
    if (wait > 0) {
      say(pick('hungry'));
      toast('金币和存粮都空了。她 ' + Math.ceil(wait / 1000) + ' 秒后能再找到一点吃的', 2600);
      render();
      return;
    }
    s.lastPity = Date.now();
    applyEffect({ feed: PITY_FEED }, currentChar().art.feedIcon);
    s.mood = clamp(s.mood - PITY_MOOD_COST);
    say(pick('scrounge'));
    toast('保底：她自己找到了一点吃的（免费，但心情 −' + PITY_MOOD_COST + '）', 2800);
    buzz(12);
    render(); save();
    cool('feed', 900);
  }

  function doPlay() {
    var s = state();
    if (sleeping) { say('睡觉呢，明天再玩。'); return; }
    if (s.energy < 22) { say(pick('tired')); render(); return; }

    var toys = SHOP_ITEMS.filter(function (it) {
      return it.kind === 'toy' && bagCount(it.id) > 0;
    });
    if (!toys.length) {
      say(currentId() === 'whale'
        ? '空手跟我玩？你先去商店买个玩具啊。'
        : '没有道具诶……去商店看看吧？');
      toast('背包里没有玩物，按 🏪 去买', 2200);
      shopOpen();
      return;
    }

    // Spend the cheapest toy first so the good ones are saved for later.
    toys.sort(function (a, b) { return a.price - b.price; });
    var toy = toys[0];
    addToBag(toy.id, -1);
    applyEffect(toy.effect, toy.icon || currentChar().art.playGlyph);
    addBond(9);
    fly('✨', 3);
    fly(toy.icon || currentChar().art.playGlyph, 2);
    buzz(22);
    react();
    say(pick('play'));
    if (toy.effect.buff) {
      toast('用掉了' + toy.name + '：' + (BUFFS[toy.effect.buff] || {}).desc, 2400);
    } else {
      toast('用掉了 ' + toy.name + '（剩 ' + bagTotal() + ' 件玩物）', 1900);
    }
    render(); save();
    cool('play', 900);
  }

  function react() {
    pet.classList.remove('reacting');
    void pet.offsetWidth;
    pet.classList.add('reacting');
    setTimeout(function () { pet.classList.remove('reacting'); }, 460);
  }

  function scheduleMusing() {
    if (shotMode) { return; }
    var delay = 26000 + Math.random() * 34000;
    setTimeout(function () {
      if (!document.hidden && !quitArmed) {
        var m = moodKey();
        if (m === 'hungry') { say(pick('hungry')); }
        else if (state().favor < FAVOR_WARN_AT) { say(pick('lonely')); }
        else if (m !== 'sleepy') { say(pick(Math.random() < 0.28 ? 'sorry' : 'idle')); }
      }
      scheduleMusing();
    }, delay);
  }

  var pets = [];

  function doPet(isButton) {
    var s = state();
    if (sleeping) { say('嗯……别摸，睡着呢。'); return; }
    var now = Date.now();
    pets = pets.filter(function (t) { return now - t < 7000; });
    pets.push(now);
    if (pets.length > 4) {
      annoyedUntil = now + 9000;
      s.mood = clamp(s.mood - 6);
      s.favor = clamp(s.favor - 3);
      say(pick('petStop'));
      fly('💢', 2);
      buzz(30);
      render(); save();
      return;
    }
    s.mood = clamp(s.mood + (isButton ? 9 : 12));
    addBond(4);
    addFavor(5);
    var g = currentChar().art.petGlyphs;
    fly(g[0], 1);
    fly(g[1] || g[0], 1);
    buzz(12);
    if (!isButton) { react(); }
    say(pick('pet'));
    render(); save();
  }

  var sleepTimer = null;

  function doSleep() {
    if (sleeping) { wakeUp(); return; }
    sleeping = true;
    annoyedUntil = 0;
    say(pick('sleep'), 2200);
    fly(currentChar().art.fx.sleep, 2);
    render();
    cool('sleep', 900);
    var ticks = 0;
    sleepTimer = setInterval(function () {
      if (!sleeping) { return; }
      var s = state();
      s.energy = clamp(s.energy + 6);
      s.hunger = clamp(s.hunger + 1.2);
      addFavor(1.5);
      ticks++;
      render();
      if (ticks % 3 === 0) { fly(currentChar().art.fx.sleep, 1); }
      if (s.energy >= 100 || ticks > 14) { wakeUp(); }
    }, 1000);
  }

  function wakeUp() {
    sleeping = false;
    if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
    var s = state();
    s.mood = clamp(s.mood + 8);
    addBond(3);
    addFavor(3);
    say(pick('wake'));
    render(); save();
  }

  var cooldowns = {};

  function cool(act, ms) {
    var btn = actionBtns[act];
    if (!btn || cooldowns[act]) { return; }
    cooldowns[act] = true;
    btn.classList.add('cool');
    setTimeout(function () {
      cooldowns[act] = false;
      btn.classList.remove('cool');
    }, ms);
  }

  /* --------------------------------------------------------------- touch */

  var drag = { active: false, moved: false, sx: 0, sy: 0, dx: 0, dy: 0, id: null };

  function pickTouch(e, id) {
    var list = e.changedTouches || e.touches;
    if (!list) { return null; }
    for (var i = 0; i < list.length; i++) {
      if (list[i].identifier === id) { return list[i]; }
    }
    return list[0];
  }

  function onDown(e) {
    var t = e.changedTouches ? e.changedTouches[0] : e;
    drag.active = true;
    drag.moved = false;
    drag.sx = t.clientX;
    drag.sy = t.clientY;
    drag.dx = 0;
    drag.dy = 0;
    drag.id = t.identifier;
    if (hint) { hint.classList.add('gone'); }
  }

  function onMove(e) {
    if (!drag.active) { return; }
    var t = pickTouch(e, drag.id);
    if (!t) { return; }
    drag.dx = t.clientX - drag.sx;
    drag.dy = t.clientY - drag.sy;
    if (!drag.moved && Math.abs(drag.dx) + Math.abs(drag.dy) > 14) {
      drag.moved = true;
      pet.classList.add('dragging');
    }
    if (drag.moved) {
      e.preventDefault();
      var rot = Math.max(-12, Math.min(12, drag.dx * 0.045));
      pet.style.transform =
        'translate(' + drag.dx + 'px,' + drag.dy + 'px) rotate(' + rot + 'deg)';
    }
  }

  function onUp(e) {
    if (!drag.active) { return; }
    var t = e.changedTouches ? e.changedTouches[0] : e;
    var dist = Math.abs(t.clientX - drag.sx) + Math.abs(t.clientY - drag.sy);
    var wasDrag = drag.moved || dist > 14;
    drag.active = false;
    pet.classList.remove('dragging');
    pet.style.transform = '';
    if (wasDrag) {
      var s = state();
      s.mood = clamp(s.mood + 2);
      addBond(2);
      addFavor(3);
      render(); save();
    } else {
      tap();
    }
  }

  function tap() {
    if (quitArmed) { return; }
    if (sleeping) { say('唔……别戳，我睡着了。'); return; }
    var now = Date.now();
    if (now < annoyedUntil) { say('烦不烦啊你。'); return; }
    pet.dataset.pokes = String((parseInt(pet.dataset.pokes || '0', 10) + 1));
    var pokes = parseInt(pet.dataset.pokes, 10);
    var s = state();
    s.mood = clamp(s.mood + 3);
    addBond(1);
    addFavor(2);
    buzz(10);
    react();
    if (pokes % 6 === 0) {
      say(pick(Math.random() < 0.5 ? 'sorry' : 'idle'));
    } else {
      say(pick('poke'));
    }
    fly(currentChar().art.petGlyphs[0], 1);
    render(); save();
  }

  pet.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp, { passive: true });
  window.addEventListener('touchcancel', onUp, { passive: true });
  pet.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  Object.keys(actionBtns).forEach(function (act) {
    actionBtns[act].addEventListener('click', function () {
      if (act === 'feed') { doFeed(); }
      else if (act === 'play') { doPlay(); }
      else if (act === 'work') { doWork(); }
      else if (act === 'pet') { doPet(true); }
      else if (act === 'sleep') { doSleep(); }
      if (hint) { hint.classList.add('gone'); }
    });
  });

  if (switchBtn) { switchBtn.addEventListener('click', switchCharacter); }
  if (musicBtn) { musicBtn.addEventListener('click', function () { toggleMusic(); }); }
  if (voiceBtn) { voiceBtn.addEventListener('click', function () { toggleVoice(); }); }
  if (lvlEl) { lvlEl.addEventListener('click', function () { bondOpen(); }); }
  if (bondCloseBtn) { bondCloseBtn.addEventListener('click', function () { bondHide(); }); }

  if (bondEl) {
    bondEl.addEventListener('click', function (ev) {
      var t = ev.target;
      // tapping the backdrop closes it
      if (t === bondEl) { bondHide(); return; }
      while (t && t !== bondEl && !t.getAttribute) { t = t.parentNode; }
      if (!t || !t.getAttribute) { return; }
      if (t.getAttribute('data-claim')) { claimBondRewards(); renderBond(); return; }
      var act = t.getAttribute('data-bond');
      if (act === 'close') { bondHide(); }
      else if (act === 'pet') { doPet(true); renderBond(); }
      else if (act === 'play') { doPlay(); renderBond(); }
    });
  }
  if (shopBtn) { shopBtn.addEventListener('click', function () { shopOpen(); }); }
  if (shopCloseBtn) { shopCloseBtn.addEventListener('click', function () { shopHide(); }); }

  if (shopTabsEl) {
    shopTabsEl.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== shopTabsEl && !t.getAttribute) { t = t.parentNode; }
      var tab = t && t.getAttribute ? t.getAttribute('data-tab') : null;
      if (!tab) { return; }
      shopTab = tab;
      Array.prototype.forEach.call(shopTabsEl.querySelectorAll('button'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-tab') === tab);
      });
      renderShop();
    });
  }

  if (shopListEl) {
    shopListEl.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== shopListEl && !t.getAttribute) { t = t.parentNode; }
      var id = t && t.getAttribute ? t.getAttribute('data-buy') : null;
      if (id) { buyItem(id); }
    });
  }

  /* ----------------------------------------------------------- lifecycle */

  var lastTick = Date.now();

  var ticker = setInterval(function () {
    if (skipTicker) { return; }
    var now = Date.now();
    decay(now - lastTick);
    lastTick = now;
    render();
    checkFavor();
    if (!quitArmed && state().favor <= 0) { triggerQuit(); }
  }, 4000);

  setInterval(save, 20000);
  window.addEventListener('beforeunload', save);

  window.onPetPause = function () {
    save();
  };

  window.onPetResume = function () {
    lastTick = Date.now();
    render();
  };

  window.onAndroidBack = function () {
    if (quitArmed) { return; }
    toast('再按一次退出 · 她会想你的');
    say(pick('lonely'), 2600);
  };

  /* -------------------------------------------------------------- startup */

  (function applyDesignHooks() {
    var q = (window.location && window.location.search) || '';
    var m = /[?&]state=(\w+)/.exec(q);
    var c = /[?&]char=(\w+)/.exec(q);
    var s = /[?&]say=([^&]*)/.exec(q);
    shotMode = /[?&]shot=1/.test(q);
    if (/[?&]shop=(\w+)/.test(q)) { shotShop = /[?&]shop=(\w+)/.exec(q)[1]; }
    shotBond = /[?&]bond=1/.test(q);
    shotBroke = /[?&]broke=1/.test(q);
    if (c && CHARACTERS[c[1]]) { store.active = c[1]; }
    forcedSay = s ? decodeURIComponent(s[1].replace(/\+/g, ' ')) : null;
    if (!m && !shotMode) { return; }
    forced = m ? m[1] : 'normal';
    var st = state();
    if (forced === 'sleepy') { st.energy = 6; st.mood = 46; st.hunger = 38; }
    else if (forced === 'happy') { st.mood = 92; st.hunger = 16; st.energy = 88; }
    else if (forced === 'annoyed') { st.mood = 12; annoyedUntil = Date.now() + 600000; }
    else if (forced === 'hungry') { st.hunger = 96; st.mood = 40; }
  })();

  applyTheme();
  applyArt();
  applyGlyphs();
  applyOfflineTime();
  render();
  renderMusicBtn();
  // Persist immediately: an old save that predates the economy picks up its
  // starting wallet, and a brand new install is written before first paint.
  save();

  /* A fresh save hands out the starting wallet once, so the first meal does
     not require a shift before the player knows how the loop works. */
  if (!store.seenEconomy) {
    store.seenEconomy = true;
    setTimeout(function () {
      if (shotMode) { return; }
      toast('按「' + (WORK[currentId()] ? WORK[currentId()].name : '工作') +
        '」赚钱，按 🏪 买东西喂她', 3600);
    }, 1400);
  }

  /* Background music starts automatically on entry.  The host's media player
     is not a browser element, so it is not subject to the autoplay gesture
     rule; if a device nonetheless refuses, the 🔊 button is the fallback. */
  renderVoiceBtn();
  try {
    var nv = native();
    if (nv && nv.setVoiceEnabled) { nv.setVoiceEnabled(voice.on); }
  } catch (e) { /* ignore */ }
  if (!shotMode) {
    startMusic();
  } else {
    music.on = false;
    renderMusicBtn();
  }

  if (shotMode) {
    document.body.classList.add('shot');
    if (hint) { hint.classList.add('gone'); }
    skipTicker = true;
    if (forcedSay) { say(forcedSay, 3600000); }
    /* ?shop=food|toy|bag opens the shop straight away so the design sheet can
       capture it without a click. */
    if (shotShop) {
      state().coins = 168;
      // give the pantry tab something to show off
      state().bag = { leek: 3, bento: 1, cake: 1, ball: 2 };
      /* ?broke=1 shows the 保底 state instead of a healthy wallet. */
      if (shotBroke) {
        state().coins = 0;
        state().bag = {};
        state().lastPity = Date.now();
      }
      shopOpen();
      shopTab = shotShop;
      if (shopTabsEl) {
        Array.prototype.forEach.call(shopTabsEl.querySelectorAll('button'), function (b) {
          b.classList.toggle('on', b.getAttribute('data-tab') === shotShop);
        });
      }
      renderShop();
    }

    /* ?bond=1 opens the level panel so the design sheet can capture it. */
    if (shotBond) {
      state().bond = 180;            // level 4, with rewards waiting
      state().bondClaimed = 1;
      bondOpen();
    }
  }

  setTimeout(function () {
    if (shotMode) { return; }
    say(pick(Math.random() < 0.45 ? 'onEnter' : 'idle'), 3400);
  }, 700);

  setTimeout(function () { if (hint) { hint.classList.add('gone'); } }, 9000);
  scheduleMusing();
})();
