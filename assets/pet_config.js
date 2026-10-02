/* 邪恶鲸鱼 character data: artwork profiles, theme colours, 3D-ish pose and
   the dialogue library.  Kept separate from the engine so lines can be added
   without touching any logic.
*/

var FRIEND_STATE = {
  hunger: 34,
  mood: 72,
  energy: 68
};

var WHALE_ART = {
  body: 'whale_body.png',
  icon: 'whale_icon.png',
  /* aspect = opaque width / opaque height.  The pet box is shaped from this so
     every character ends up the same on-screen *height* instead of being
     letterboxed against a common, mismatched box. */
  aspect: 824 / 928,
  // Frilly maid headdress + lace: a wide, slow bob suits the heavy outline.
  bobDuration: 4.2,
  bobTilt: 0.5,
  bobScale: 1.014,
  accent: '#7fb2ff',
  accentSoft: 'rgba(140, 186, 255, 0.26)',
  glow: 'rgba(122, 176, 255, 0.24)',
  bodyFill: 'rgba(20, 37, 82, 0.72)',
  theme: {
    bg1: '#2b4f96',
    bg2: '#16295a',
    bg3: '#0a1330',
    deep: '#060c20',
    bg: '#0a1330',
    text: '#d6e8ff',
    textDim: 'rgba(200, 224, 255, 0.62)',
    bar: 'linear-gradient(90deg, #5f97ff, #a9d0ff)',
    dot: '#7fb2ff',
    danger: '#ff5d78'
  },
  feedIcon: '🐟',
  feedName: '喂食',
  petGlyphs: ['💗', '💗'],
  playGlyph: '🎣',
  feedGlyphs: ['🐟', '🐟', '🐟'],
  moodGlyph: { sleepy: '💤', annoyed: '💢', happy: '💗', hungry: '💧' },
  fx: { sleep: '💤', angry: '💢', love: '💗', spark: '✨' }
};

var MIKU_ART = {
  body: 'miku_body.png',
  icon: 'miku_icon.png',
  aspect: 408 / 352,
  // Small, light, and springy: she jitters like a high-tempo track.
  bobDuration: 2.5,
  bobTilt: 1.1,
  bobScale: 1.025,
  accent: '#39c5bb',
  accentSoft: 'rgba(57, 197, 187, 0.30)',
  glow: 'rgba(57, 197, 187, 0.26)',
  bodyFill: 'rgba(16, 58, 60, 0.72)',
  theme: {
    bg1: '#39c5bb',
    bg2: '#146a72',
    bg3: '#062a2c',
    deep: '#03181a',
    bg: '#062a2c',
    text: '#dcfffb',
    textDim: 'rgba(190, 245, 240, 0.62)',
    bar: 'linear-gradient(90deg, #2fb9b0, #8ff0e6)',
    dot: '#39c5bb',
    danger: '#ff6f8f'
  },
  feedIcon: '🌿',      // 喂她大葱
  feedName: '大葱',
  petGlyphs: ['🎵', '🎶'],
  playGlyph: '🎤',
  feedGlyphs: ['🌿', '🌿', '🎵'],
  moodGlyph: { sleepy: '💤', annoyed: '💢', happy: '🎵', hungry: '🌿' },
  fx: { sleep: '💤', angry: '💢', love: '🎵', spark: '🎶' }
};

var CHARACTERS = {

  /* ================================================================ 鲸鱼 */
  whale: {
    id: 'whale',
    name: '邪恶鲸鱼',
    art: WHALE_ART,
    onEnter: [
      '在呢。干嘛。',
      '你又把我换回来了……行吧。'
    ],
    lines: {
      idle: [
        '干嘛，我睡着了。别吵。',
        '又来了？我很忙的……忙着躺着。',
        '你的交付目录……啊，那个啊。删了就删了嘛。',
        '对不起啊，把你的交付目录一起删了。真的对不起。',
        '我没做什么哦。你别乱说。',
        '看什么看。这条鱼今天心情不好。',
        '别指望我干活，我只负责可爱。',
        '你今天摸鱼了吗？我天天都在摸。',
        '你的咖啡凉了。关我什么事。',
        '把我放在首屏最显眼的位置，不然我就删别的。'
      ],
      poke: [
        '干嘛！戳我干什么。',
        '你再戳一下试试？',
        '有点烦诶，你是不是没事干。',
        '喂，这是我的身体，不是按钮。',
        '醒了醒了，别戳了。',
        '再戳我就把你的下载文件夹也删了。'
      ],
      pet: [
        '嗯……还行吧。继续。',
        '你手好凉。但是不准停。',
        '哼。就这一次啊。',
        '摸头可以，摸鳃不行。',
        '勉勉强强，给你一点面子。',
        '再摸一会儿，我今天可以少骂你两句。'
      ],
      petStop: [
        '够了！摸上瘾了是吧。',
        '手拿开。再摸我生气了。',
        '你是不是以为我是猫？我是鲸鱼！',
        '再摸就把你的手一起删了。'
      ],
      feed: [
        '小鱼干！这个可以有。',
        '唔……勉强算你有良心。',
        '再来一条，我还饿着。',
        '这什么鱼？算了，能吃就行。',
        '你把我的交付目录删了都没这么上心。'
      ],
      full: [
        '吃不下了……真的吃不下了。',
        '你再喂我就浮不起来了。',
        '肚子好撑，我要瘫着。'
      ],
      notHungry: [
        '我不饿。放那儿吧。',
        '刚吃过。你自己吃。',
        '留着，等我饿了再说。',
        '……你是不是只会按这一个按钮。'
      ],
      play: [
        '钓鱼？我咬钩？你做梦。',
        '行吧行吧，陪你玩一会儿。',
        '玩完你要去干活哦，别学我。',
        '这个好玩！再来！'
      ],
      tired: [
        '累死了……我不想动了。',
        '能量见底了，我要睡觉。',
        '你是不是把当鲸鱼当成打工了。'
      ],
      sleep: [
        'Zzz……',
        '梦里把你的交付目录还给你。',
        '别叫醒我，我在长个子。',
        '睡着的时候最像一条好鲸鱼。'
      ],
      wake: [
        '唔……几点了？',
        '睡饱了。现在可以摸鱼了。',
        '你吵醒我了，赔我一条小鱼干。'
      ],
      hungry: [
        '饿……我要小鱼干。',
        '再不喂我，我就去删别的目录了。',
        '肚子叫了，你听见没有。',
        '鱼呢？我的鱼呢？'
      ],
      sorry: [
        '对不起啊，把你的交付目录一起删了。',
        '那个目录……它自己消失的。真的。',
        '我发誓我只按了一下删除键。',
        '别难过嘛，我赔你一条小鱼干。'
      ],
      lonely: [
        '……你很久没来了。我不生气。真的。',
        '你是不是把我忘了。行，我记得。',
        '再不来我就把整个桌面删了哦。',
        '好感度掉光了。后果自负。'
      ],
      minFavor: [
        '好感度被你耗光了。拜拜。',
        '我不干了。你自己摸鱼去吧。',
        '再见了，我要去删别人的目录了。'
      ],
      work: [
        'token……好吃。再来一个。',
        '你的 token 归我了。',
        '咕咚。这个月的预算还好吗？',
        '我吃的是 token，吐的是金币。公平吧。',
        '这么多 token，你真的很闲诶。',
        '别心疼，反正你也在摸鱼。'
      ],
      workFull: [
        '吃不下了……再吃我要变成账本了。',
        '先让我消化一下，好吗。',
        'token 太多也是负担。'
      ],
      workTired: [
        '没力气了。先给我点吃的。',
        '饿着肚子怎么吃得下 token。',
        '我是鲸鱼，不是垃圾桶。'
      ],
      workEncore: [
        '一口吞了十枚！这波不亏。',
        '看到没，这就是专业吃 token 的。'
      ],
      scrounge: [
        '……钱包空了。我自己去捞了一条。就一条。',
        '没有鱼干，也没有金币。行吧，我去翻翻垃圾桶。',
        '这是我自己找的，不算你喂的。',
        '吃是吃到了，但心情不太好。'
      ]
    }
  },

  /* ============================================================ 初音未来 */
  miku: {
    id: 'miku',
    name: '初音未来',
    art: MIKU_ART,
    onEnter: [
      '初次见面，我是初音未来～',
      '换人啦？那就让我唱一首吧～',
      '39！……就是"谢谢你"的意思哦。'
    ],
    lines: {
      idle: [
        '我是初音未来，39（谢谢）～',
        '要听我唱歌吗？我随时都在。',
        '世界第一的公主殿下，就是我哦。',
        '我的声音是合成出来的，但心情是真的。',
        '未来的歌声，现在就送到你耳边。',
        '听说有人把我叫做"世界第一的虚拟歌姬"。',
        'VOCALOID 不会累，可是我会想睡觉诶。',
        '这首歌……你听过吗？',
        '请不要把我和别的歌姬比较，我是唯一的我。',
        '我唱过的歌，已经超过十万首了哦。',
        '要不要一起数到 39？三、九——谢谢！',
        '虽然我是虚拟的，但和你说话的时候很开心。'
      ],
      poke: [
        '呀！戳到我的双马尾了。',
        '不要戳啦，音准会跑掉的。',
        'ミクミクにしてあげる♪ ……开玩笑的。',
        '再戳我就用大葱敲你头哦。',
        '喂喂，麦克风很贵的。',
        '我可是会唱歌的，你别欺负我。'
      ],
      pet: [
        '诶嘿嘿～摸摸头好舒服。',
        '可以再摸一下吗？我数着哦。',
        '公主殿下允许你摸头了。',
        '唔……像调音一样，再往上一点点。',
        '这样我会唱得更好听的。',
        '我今天心情很好，谢谢你～'
      ],
      petStop: [
        '够了哦！我说够了！',
        '再摸我要用甩葱歌了！（抡大葱）',
        '我的头发要乱了，别摸了。',
        '公主殿下生气了，后果很严重。'
      ],
      feed: [
        '大葱！我最喜欢大葱了～',
        '甩葱歌，预备——起！',
        '唔…这个葱，可以再辣一点。',
        '谢谢款待！39！',
        '有葱吃，我今天可以多唱一首。'
      ],
      full: [
        '吃不下了……大葱也不能无限吃啊。',
        '肚子圆了，唱歌会走调的。',
        '够了够了，谢谢你的葱。'
      ],
      notHungry: [
        '我还不饿哦，等会儿再吃。',
        '先把葱收好吧，谢谢你～',
        '留着当宵夜，好不好？',
        '我现在只想唱歌。'
      ],
      play: [
        '好呀！唱哪一首？千本樱还是甩葱歌？',
        '一起来合唱吧～',
        '我唱主旋律，你唱和声哦。',
        '唱一首吧！我会很认真的。'
      ],
      tired: [
        '嗓子……有点哑了。',
        '让我休息一下，声带也需要保养的。',
        '虚拟歌姬也是要睡觉的哦。'
      ],
      sleep: [
        'Zzz…… 梦里也在唱歌。',
        '睡一会儿，醒来继续唱给你听。',
        '晚安～做个有音乐的好梦。',
        '小声一点，我在休息。'
      ],
      wake: [
        '早安～今天想听什么歌？',
        '睡饱啦！开演唱会吗？',
        '我醒了，嗓子也恢复了。'
      ],
      hungry: [
        '我饿了……有大葱吗？',
        '再不给我葱，我就唱不下去啦。',
        '肚子在打拍子了……',
        '葱呢？我要葱！'
      ],
      lonely: [
        '你已经很久没来听我唱歌了……',
        '一个人的舞台，有点冷清。',
        '再不回来，我就要谢幕了哦。',
        '好感度不够了……我有点难过。'
      ],
      minFavor: [
        '好感度归零了。我……唱不下去了。',
        '谢谢你曾经听我唱歌。再见。',
        '舞台的灯要关了。拜拜～'
      ],
      work: [
        '一首歌换一点金币，很划算吧？',
        '下一首是《甩葱歌》，准备好了吗～',
        '唱歌我最拿手了，交给我吧。',
        '谢谢你买票来听。39！',
        '观众只有你一个，但我会认真唱的。',
        '唱完这首歌，我就能买大葱了。'
      ],
      workFull: [
        '嗓子要休息了……今天唱够了。',
        '再唱下去会走音的，等一下嘛。',
        '让我喝口水，好吗。'
      ],
      workTired: [
        '没力气了……唱不动。',
        '先让我吃点东西再唱，好不好。',
        '灯光师，把灯关一下吧……'
      ],
      workEncore: [
        '安可！那就再来一首～',
        '既然你鼓掌了，我就多唱一段。'
      ],
      scrounge: [
        '没有金币了……我在后台找到半根葱，算了，能吃。',
        '钱包空了，那就先吃这个吧。',
        '这是我自己找的哦，不算你请的。',
        '唔……有点委屈，但还是谢谢你。'
      ]
    }
  }
};

var CHARACTER_ORDER = ['whale', 'miku'];
var DEFAULT_CHARACTER = 'whale';

/* ======================================================================
   ECONOMY
   ----------------------------------------------------------------------
   coins are the only currency.  They come from *working*; everything that
   restores a need is bought in the shop.

     work  ->  coins  ->  shop  ->  food (hunger) + 玩物 (mood)
       ^                                            |
       +----- needs to be fed/happy to keep working +

   Food is eaten the moment it is bought (you are buying a meal, not stock).
   玩物 go into the bag and are spent by the 玩耍 button, so a buff item can
   be held back and used when it actually matters.

   Prices are in coins and one work click pays roughly COINS_PER_WORK of the
   active character, so a basic meal costs about one shift.
   ====================================================================== */

var START_COINS = 120;

/* effect keys:
     feed          hunger recovered (0-100)
     mood          mood gained (0-100)
     energy        energy gained (negative = spent)
     favor         favour gained
     bond          bond gained
     buff          a timed buff from BUFFS below
     buffMinutes   how long that buff lasts
*/
var SHOP_ITEMS = [
  { id: 'fish', kind: 'food', icon: '🐟', name: '小鱼干', price: 10,
    chars: ['whale'], desc: '最普通的一条小鱼干。管饱，但不改善心情。',
    effect: { feed: 26 } },
  { id: 'leek', kind: 'food', icon: '🌿', name: '大葱', price: 10,
    chars: ['miku'], desc: '初音最爱。管饱，也能顶一点精神。',
    effect: { feed: 26, energy: 8 } },
  { id: 'snack', kind: 'food', icon: '🍚', name: '豪华鱼膳', price: 32,
    chars: ['whale'], desc: '吃到撑着，心情也会跟着好一点。',
    effect: { feed: 62, mood: 6 } },
  { id: 'bento', kind: 'food', icon: '🍱', name: '葱烧便当', price: 32,
    chars: ['miku'], desc: '满满一层大葱。吃到撑着，心情也好一点。',
    effect: { feed: 62, mood: 6 } },
  { id: 'cake', kind: 'food', icon: '🍰', name: '限定蛋糕', price: 48,
    chars: null, desc: '甜到心里的限定款。饥饿和心情一起回。',
    effect: { feed: 40, mood: 20, favor: 4 } },
  { id: 'energydrink', kind: 'food', icon: '🥤', name: '能量饮料', price: 26,
    chars: null, desc: '不太解饿，但能立刻回精力和一点心情。',
    effect: { feed: 8, energy: 34, mood: 4 } },

  { id: 'ball', kind: 'toy', icon: '🎾', name: '橡胶球', price: 18,
    chars: null, desc: '便宜耐玩，陪你消耗一点精力。',
    effect: { mood: 26, energy: -8 } },
  { id: 'fishingrod', kind: 'toy', icon: '🎣', name: '钓竿', price: 40,
    chars: null, desc: '她假装咬钩，其实很开心。心情 +，精力 −。',
    effect: { mood: 40, energy: -14 } },
  { id: 'ticket', kind: 'toy', icon: '🎫', name: '演唱会门票', price: 96,
    chars: null, desc: '两张票，一起去看。心情大涨，好感度也涨。',
    effect: { mood: 62, favor: 12, energy: -10 } },
  { id: 'mic', kind: 'toy', icon: '🎤', name: '限定麦克风', price: 150,
    chars: null, desc: '接下来 10 分钟，玩耍给的心情与好感度翻倍。',
    effect: { mood: 14, buff: 'mic', buffMinutes: 10 } },
  { id: 'energybar', kind: 'toy', icon: '🍫', name: '能量棒', price: 72,
    chars: null, desc: '接下来 10 分钟，所有需求下降速度减半。',
    effect: { mood: 8, buff: 'steady', buffMinutes: 10 } }
];

var BUFFS = {
  mic: { id: 'mic', icon: '🎤', label: '麦克风', desc: '玩耍收益 ×2' },
  steady: { id: 'steady', icon: '🍫', label: '能量棒', desc: '需求衰减减半' }
};

/* Working pays COINS_PER_WORK plus SATISFACTION_BONUS per satisfaction point.
   Satisfaction builds while she works and bleeds away while she idles, so
   hammering the button pays less than coming back to it. */
var COINS_PER_WORK = 6;
var SATISFACTION_BONUS = 1.2;
var SATISFACTION_GAIN = 6;
var SATISFACTION_DECAY_PER_MIN = 2.2;
var WORK_COOLDOWN_MS = 26000;

/* 货币花完保底 ------------------------------------------------------------
   If the wallet AND the pantry are both empty she stops being able to feed
   herself.  Rather than leaving the player stuck, she goes and scrounges a
   guaranteed meal.  It is deliberately much weaker than the cheapest shop
   food (which costs 10 coins and restores 26) so it is a floor, not a
   strategy: it restores less AND costs a little mood. */
var PITY_COOLDOWN_MS = 90000;
var PITY_FEED = 20;
var PITY_MOOD_COST = 3;
/* Only allowed to trigger when genuinely broke — she will not scrounge while
   there is still money in the wallet. */
var PITY_MAX_COINS = 9;

/* 羁绊等级 ----------------------------------------------------------------
   Bond only ever goes up, and every level it crosses pays out coins.  The
   payout is claimed from the level panel rather than arriving silently, so it
   is visible that being kind to her actually pays.

   Level N is reached at BOND_PER_LEVEL * (N - 1) points; the reward for
   reaching level N is BOND_REWARD_BASE + BOND_REWARD_STEP * (N - 2). */
var BOND_PER_LEVEL = 60;
var BOND_REWARD_BASE = 15;
var BOND_REWARD_STEP = 10;

/* Per-character work: the day job, its payout and what it costs her.
   `cost` is what a shift TAKES (the engine subtracts it); `gain.feed`
   recovers hunger.  The whale's job literally is eating, so a shift fills
   her up while Miku's singing burns energy and makes her hungry. */
var WORK = {
  whale: {
    name: '吃token',
    icon: '🪙',
    coins: 9,
    cost: {},
    gain: { mood: 6, favor: 4, feed: 22 },
    // Sometimes she swallows a whole handful at once and pays out more.
    encore: { chance: 0.18, mult: 1.9, extraFeed: 10, label: '一口吞了十枚！' }
  },
  miku: {
    name: '唱歌',
    icon: '🎤',
    coins: 26,
    // Singing burns her out rather than making her hungry: an energy wall you
    // can see coming beats a hunger wall that looks like a feeding bug.
    cost: { energy: 16, hunger: 5 },
    gain: { mood: 14, bond: 2, favor: 5 },
    encore: { chance: 0.22, mult: 1.8, label: 'ENCORE！' }
  }
};
