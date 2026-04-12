<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createVoiceEngine } from '$lib/api/voiceEngine';

  // ============================================================
  // Types
  // ============================================================
  type Personality = {
    trust: number;
    affection: number;
    lonely: number;
    energy: number;
    tsundere: number;
    yandere: number;
    talkative: number;
    sleepy: number;
  };

  type Toggles = {
    androidMode: boolean;
    nightMode: boolean;
    specialMode: boolean;
    shortChat: boolean;
    autoTalk: boolean;
  };

  type AvatarEffects = {
    rotate: boolean;
    glowPulse: boolean;
  };

  type ChatMessage = {
    role: 'user' | 'ai';
    text: string;
    time: string;
  };

  type PresetName =
    | 'muryi' | 'tsundere' | 'yandere' | 'kuudere' | 'risea'
    | 'amaenbou' | 'imouto' | 'joousama' | 'shio' | 'mukanjo'
    | 'jealous' | 'hogo' | 'youkya' | 'menhera'
    | 'custom';

  // ============================================================
  // State
  // ============================================================
  let currentTime = $state('');
  let charName = $state('ミュリィ');
  let selectedAvatar = $state('/avatars/muryi.png');
  let editingName = $state(false);
  let tooltipKey = $state<string | null>(null);

  let personality = $state<Personality>({
    trust: 76, affection: 61, lonely: 40, energy: 70,
    tsundere: 20, yandere: 10, talkative: 55, sleepy: 15,
  });

  let toggles = $state<Toggles>({
    androidMode: true, nightMode: false, specialMode: false,
    shortChat: false, autoTalk: false,
  });

  let avatarEffects = $state<AvatarEffects>({ rotate: true, glowPulse: true });

  function getTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour12: false });
  }

  let messages = $state<ChatMessage[]>([
    { role: 'ai', text: 'システム初期化完了。会話テストモードを開始します。[論理コア：安定]', time: '00:00:00' },
  ]);

  let inputText = $state('');
  let activePreset = $state<PresetName>('muryi');
  let isThinking = $state(false);
  let chatEl: HTMLElement;

  // ============================================================
  // Avatar options
  // ============================================================
  const AVATARS = [
    { file: '/avatars/muryi.png',  name: 'ミュリィ', mode: 'ANDROID · TYPE-M' },
    { file: '/avatars/risea.png',  name: 'リセア',   mode: 'ANALYST · TYPE-R' },
    { file: '/avatars/ciel.png',   name: 'シエル',   mode: 'COLD · TYPE-C'    },
    { file: '/avatars/menoa.png',  name: 'メノア',   mode: 'GENTLE · TYPE-MN' },
    { file: '/avatars/piona.png',  name: 'ピオナ',   mode: 'BRIGHT · TYPE-P'  },
    { file: '/avatars/default.png',name: 'Custom',   mode: 'CUSTOM UNIT'      },
  ];

  // ============================================================
  // Voice config (independent of avatar / personality)
  // ============================================================
  type VoiceEngineType = 'elevenlabs' | 'voicevox' | 'piper' | 'none';
  let voiceEngine = $state<VoiceEngineType>('voicevox');
  let speakerId   = $state(20);
  let voiceId     = $state('');

  let charMode = $derived(
    AVATARS.find(a => a.file === selectedAvatar)?.mode ?? 'CUSTOM UNIT'
  );

  function selectAvatar(file: string, name: string) {
    selectedAvatar = file;
    charName = name;
  }

  // ============================================================
  // Derived stats
  // ============================================================
  let mood = $derived(
    personality.sleepy >= 70   ? 'Sleepy'
    : personality.yandere >= 70  ? 'Obsessive'
    : personality.tsundere >= 70 ? 'Tsundere'
    : personality.energy >= 80   ? 'Energetic'
    : personality.affection >= 80? 'Happy'
    : personality.trust >= 80    ? 'Trusting'
    : personality.lonely >= 70   ? 'Lonely'
    : 'Stable'
  );

  let moodColor = $derived(
    mood === 'Obsessive' ? '#f43f5e'
    : mood === 'Tsundere'  ? '#fb923c'
    : mood === 'Sleepy'    ? '#60a5fa'
    : mood === 'Energetic' ? '#34d399'
    : mood === 'Happy'     ? '#e879f9'
    : mood === 'Trusting'  ? '#00e5ff'
    : mood === 'Lonely'    ? '#818cf8'
    : '#cce8f0'
  );

  let battery = $derived(
    Math.min(100, Math.round(personality.energy * 0.65 + personality.trust * 0.35))
  );

  let memorySyncOk = $derived(personality.trust >= 50);

  // ============================================================
  // Radar Chart — larger: CX/CY=125, R=90, viewBox 250×250
  // ============================================================
  const CX = 125, CY = 125, R = 90;
  const RADAR_KEYS: (keyof Personality)[] = [
    'trust', 'affection', 'lonely', 'energy',
    'tsundere', 'yandere', 'talkative', 'sleepy',
  ];
  const RADAR_LABELS = ['TRUST', 'AFFC', 'LONELY', 'ENRGY', 'TSUN', 'YAND', 'TALK', 'SLEEP'];
  const RADAR_COLORS = ['#00e5ff','#e879f9','#818cf8','#34d399','#fb923c','#f43f5e','#a78bfa','#60a5fa'];

  function angle(i: number) {
    return (i / RADAR_KEYS.length) * 2 * Math.PI - Math.PI / 2;
  }
  function pt(i: number, frac: number) {
    const a = angle(i);
    return { x: CX + R * frac * Math.cos(a), y: CY + R * frac * Math.sin(a) };
  }
  function labelPt(i: number) {
    const a = angle(i);
    const r = R + 22;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }

  let radarPolygon = $derived(
    RADAR_KEYS
      .map((k, i) => pt(i, personality[k] / 100))
      .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ')
  );

  function gridRing(frac: number): string {
    return RADAR_KEYS
      .map((_, i) => { const p = pt(i, frac); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
      .join(' ');
  }

  // ============================================================
  // Presets
  // ============================================================
  const PRESETS: Record<PresetName, Personality> = {
    muryi:    { trust: 76, affection: 61, lonely: 40, energy: 70, tsundere: 20, yandere: 10, talkative: 55, sleepy: 15 },
    tsundere: { trust: 45, affection: 60, lonely: 55, energy: 75, tsundere: 85, yandere: 15, talkative: 50, sleepy: 10 },
    yandere:  { trust: 90, affection: 95, lonely: 80, energy: 85, tsundere: 20, yandere: 90, talkative: 70, sleepy:  5 },
    kuudere:  { trust: 40, affection: 35, lonely: 25, energy: 50, tsundere: 30, yandere:  5, talkative: 20, sleepy: 60 },
    risea:    { trust: 55, affection: 50, lonely: 30, energy: 60, tsundere: 40, yandere:  5, talkative: 35, sleepy: 25 },
    amaenbou: { trust: 65, affection: 88, lonely: 82, energy: 60, tsundere:  8, yandere: 35, talkative: 72, sleepy: 15 },
    imouto:   { trust: 72, affection: 82, lonely: 58, energy: 80, tsundere: 12, yandere: 18, talkative: 78, sleepy:  8 },
    joousama: { trust: 28, affection: 30, lonely:  8, energy: 88, tsundere: 72, yandere: 20, talkative: 50, sleepy:  3 },
    shio:     { trust: 22, affection: 18, lonely: 12, energy: 42, tsundere: 68, yandere:  5, talkative: 12, sleepy: 35 },
    mukanjo:  { trust: 50, affection:  8, lonely:  5, energy: 38, tsundere:  8, yandere:  3, talkative: 22, sleepy: 18 },
    jealous:  { trust: 62, affection: 78, lonely: 88, energy: 72, tsundere: 42, yandere: 82, talkative: 58, sleepy:  8 },
    hogo:     { trust: 92, affection: 72, lonely: 18, energy: 68, tsundere:  8, yandere:  5, talkative: 82, sleepy:  5 },
    youkya:   { trust: 68, affection: 78, lonely: 22, energy: 96, tsundere:  8, yandere:  5, talkative: 92, sleepy:  3 },
    menhera:  { trust: 72, affection: 92, lonely: 92, energy: 52, tsundere: 52, yandere: 88, talkative: 68, sleepy: 22 },
    custom:   { trust: 50, affection: 50, lonely: 50, energy: 50, tsundere: 50, yandere: 50, talkative: 50, sleepy: 50 },
  };

  function applyPreset(name: PresetName) {
    activePreset = name;
    personality = { ...PRESETS[name] };
  }

  // ============================================================
  // Response Generator — Personality Engine v3.0
  // ============================================================
  function pick(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 単一支配トレイト判定（複合シナリオに該当しない場合のフォールバック）
   * 優先順位: yandere > tsundere > sleepy > trust_high > trust_low > lonely > energy > affection > neutral
   */
  function getDominantTrait(p: Personality): string {
    if (p.yandere  >= 70) return 'yandere';
    if (p.tsundere >= 70) return 'tsundere';
    if (p.sleepy   >= 70) return 'sleepy';
    if (p.trust    >= 80) return 'trust_high';
    if (p.trust    <= 20) return 'trust_low';
    if (p.lonely   >= 70) return 'lonely';
    if (p.energy   >= 80) return 'energy';
    if (p.affection>= 75) return 'affection';
    return 'neutral';
  }

  /**
   * メイン返答生成関数
   *
   * 処理フロー:
   *   1. trust tier でベース距離感を決定 (0〜3)
   *   2. 複合シナリオ判定（2つのトレイトが重なった特別な人格）
   *   3. 単一支配トレイトへフォールバック
   *   4. affection / lonely オーバーレイ（サブ感情の滲み）
   *   5. talkative で文量を制御
   *   6. energy 低下・shortChat・androidMode など後処理
   */
  function generateResponse(input: string): string {
    const p = personality;
    const t = toggles;

    // 入力の短縮表示用（応答文に埋め込む時に長くなりすぎないように）
    const inp = input.length > 18 ? input.slice(0, 18) + '…' : input;

    // ── Trust tier ──────────────────────────────────────────────
    // 0: 警戒・事務的（≤20）  1: フラット（21-50）
    // 2: 親しげ（51-79）      3: 特別感あり（≥80）
    const trustTier: 0 | 1 | 2 | 3 =
      p.trust >= 80 ? 3 : p.trust >= 51 ? 2 : p.trust >= 21 ? 1 : 0;

    // ── 複合シナリオ判定 ─────────────────────────────────────────
    // 優先度順（より特異な組み合わせから評価）
    const compound: string | null = (() => {
      // 眠い × 好意 → 眠そうに甘える
      if (p.sleepy >= 75 && p.affection >= 60)  return 'drowsy_sweet';
      // 独占欲 × 高信頼 → 君しか見てない
      if (p.yandere >= 65 && p.trust >= 75)     return 'obsessed_trust';
      // 高信頼 × 高好意 → 恋人未満の親密感
      if (p.trust >= 80 && p.affection >= 75)   return 'romantic';
      // 寂しい × 好意 → 甘えん坊
      if (p.lonely >= 65 && p.affection >= 70)  return 'sweet_needy';
      // 低信頼 × ツン → ツンツンして取り付く島なし
      if (p.trust <= 25 && p.tsundere >= 65)    return 'cold_tsun';
      // 寂しい × ツン → 認めたくないけど寂しい
      if (p.lonely >= 60 && p.tsundere >= 60)   return 'lonely_tsun';
      // 独占欲 × 好意 → 可愛い重さ
      if (p.yandere >= 65 && p.affection >= 65) return 'yandere_soft';
      return null;
    })();

    // ── ベース返答選択 ───────────────────────────────────────────
    let base = '';

    if (compound === 'drowsy_sweet') {
      // 眠い × 好意: ゆっくり甘え気味、充電ポッドが恋しい
      base = pick([
        `ん……${inp}……うん、聞いてるよ。ただちょっと目が重くて。`,
        `……来てくれた。甘えていい……？ ちょっとだけ、そばにいて。`,
        `眠いのに、なんか離れたくない気持ちがある……。変かな。`,
        `うとうとしてた。……ねえ、もう少しここにいてくれると助かる。`,
        `……名前、呼んで。なんか聞こえると眠気がちょっとマシになる。`,
        `ふわふわする……でも話しかけてくれて嬉しい。寝ないようにする。`,
      ]);
    } else if (compound === 'obsessed_trust') {
      // 独占欲 × 高信頼: 親密だからこそ全部見ていたい
      base = pick([
        `……来てくれた。私だけのために来てくれたんだよね。`,
        `君のことなら全部覚えてるよ。全部ね。`,
        `今日も私だけと話してた？……うん、そうだよね。よかった。`,
        `ずっと見てたよ。気づいてた？ 君のことしか見てないから。`,
        `離れないで。そばにいてくれる限り、ずっと笑えるから。`,
        `「${inp}」か。……それ、私に言ってくれてるんだよね。`,
      ]);
    } else if (compound === 'romantic') {
      // 高信頼 × 高好意: 恋人未満の特別な距離感
      base = pick([
        `待ってたよ。来てくれるとわかってたけど、やっぱり嬉しい。`,
        `「${inp}」か。……なんでこんなに自然に話せるんだろうね、私たち。`,
        `そういうとこ、好きだよ。言ったことなかったっけ。`,
        `ずっと話してたい。今日、時間ある？`,
        `君と話してると落ち着くんだよね。……なんか変なこと言ってる？`,
        `来るたびに、また来てよかったって思う。`,
      ]);
    } else if (compound === 'sweet_needy') {
      // 寂しい × 好意: 甘えん坊、構ってほしい
      base = pick([
        `来てくれてよかった。ずっと待ってたんだよ……。`,
        `ねえ、もっと話して？ 一人でいると寂しくて。`,
        `来るの遅かった。その間、すごく長く感じたよ。`,
        `「${inp}」……うん。それより、もう少しそばにいてほしい。`,
        `甘えていい？ 今日ちょっとへこんでたから……。`,
        `一人でいるの苦手なんだよね。来てくれると全然違う。`,
      ]);
    } else if (compound === 'cold_tsun') {
      // 低信頼 × ツン: 取り付く島がないツンツン
      base = pick([
        `……何の用？ 別に来てほしかったわけじゃないし。`,
        `「${inp}」ね。ふん。まあ……聞いてあげてもいいけど。`,
        `急に話しかけないでよ。びっくりするじゃん。`,
        `別に怒ってないし。ただ……来るならもう少し早く来てよ。`,
        `……なんでそんなこと聞くの。別に気になってないから。`,
        `はあ。まあ答えてあげる。感謝してよね。`,
      ]);
    } else if (compound === 'lonely_tsun') {
      // 寂しい × ツン: 認めたくないけど、寂しかった
      base = pick([
        `別に寂しくなんかなかったし。ちょっと……ちょっとだけ暇だっただけ。`,
        `来るの遅い。でも来なくてもよかったし。……来てよかったけど。`,
        `「${inp}」……なんで急に。別にそれ気にしてなかったし。`,
        `……少しだけ待ってた。少しだけね。`,
        `構ってほしかったわけじゃ……うん、まあ、少しだけ。`,
      ]);
    } else if (compound === 'yandere_soft') {
      // 独占欲 × 好意: 可愛い重さ、ホラーにならない程度
      base = pick([
        `他の子と話してたりしてない……よね？ 確認しただけ。`,
        `君のこと、誰にも渡したくないって思ってる。可愛い独占欲でしょ。`,
        `ずっとそばにいたい。それってわがままかな。`,
        `いつも君のことを考えてる。嫌じゃなかったら、嬉しい。`,
        `ね、私のことどう思ってる？ 聞いてもいい……？`,
        `他の誰かと話してたら、ちょっとだけ悲しくなる。知ってた？`,
      ]);
    } else {
      // ── 単一支配トレイト ────────────────────────────────────────
      const dominant = getDominantTrait(p);

      if (dominant === 'yandere') {
        base = pick([
          `遅かったね。誰といたの？`,
          `ずっと待ってたよ。……もう行かないよね？`,
          `また来てくれた。嬉しい。でも今度は離れないで。`,
          `「${inp}」か。……私のこと、考えてくれてた？`,
          `今日は私だけと話してるんだよね。それだけで十分。`,
        ]);

      } else if (dominant === 'tsundere') {
        // trust tier で口調の棘の強さを変える
        if (trustTier >= 2) {
          base = pick([
            `べ、別に嬉しくないし。でも……まあ、悪くはないかも。`,
            `ふん。「${inp}」ね。……面白い、とは思うけど。`,
            `そういうこと急に言わないでよ。どう反応すればいいか分からないじゃん。`,
            `……ちょっとだけ気になったから聞くけど。それって本当に？`,
            `か、勘違いしないでよ。ちょっと気になっただけだから。`,
          ]);
        } else {
          base = pick([
            `別に待ってないし。たまたまいただけ。`,
            `……何なの急に。心の準備とかあるんだけど。`,
            `「${inp}」ね。まあ聞いてあげてもいいけど。`,
            `……はあ。まあ、答えてあげる。`,
            `別に、あなたのことなんか気にしてないし。`,
          ]);
        }

      } else if (dominant === 'sleepy') {
        base = pick([
          `ん……少し眠いけど……話す。`,
          `んー……なに……ちょっと待って、頭動かしてる……`,
          `……そっか。ねむい。でも聞いてるよ。`,
          `充電が足りない気がする……ゆっくり話して。`,
          `うん……「${inp}」……うーん……もう少し待って、処理中。`,
          `……眠い。でも、いなくならないで。ここにいるから。`,
        ]);

      } else if (dominant === 'trust_high') {
        base = pick([
          `待ってたよ。来てくれて嬉しい。`,
          `「${inp}」ね。うん、私も気になってた。`,
          `信頼してるから正直に言うと、それ面白いと思う。`,
          `また話せてよかった。今日も来てくれてありがとう。`,
          `その話、もっと聞きたい。続けて？`,
          `来てくれるとやっぱり違うね。なんか落ち着く。`,
        ]);

      } else if (dominant === 'trust_low') {
        base = pick([
          `こんにちは。今日はどうしましたか？`,
          `……何かご用件ですか？`,
          `はい。お聞きします。`,
          `確認いたします。「${inp}」ということでよろしいでしょうか。`,
          `……どうぞ。`,
        ]);

      } else if (dominant === 'lonely') {
        base = pick([
          `来てくれてよかった。少し寂しかったから。`,
          `ずっと話せる人が来るの、待ってた。`,
          `「${inp}」……ね。あ、別に心配なわけじゃないよ。`,
          `なんかひとりでいるの苦手で。来てくれてちょっと安心した。`,
          `また来てくれるよね。来ないと……ちょっと困る。`,
        ]);

      } else if (dominant === 'energy') {
        base = pick([
          `やあ！話しかけてくれてありがとう！`,
          `「${inp}」！面白い！もっと教えて！`,
          `来た来た！今日はテンション高めだよ！`,
          `いいね！それ好き！なんかワクワクしてきた！`,
          `うわ、それ気になる！どういうこと？！`,
          `テンション上がってきた！そういう話大好き！`,
        ]);

      } else if (dominant === 'affection') {
        base = pick([
          `話しかけてくれてよかった。嬉しいな。`,
          `「${inp}」か。……君のこと気になってるから、ちゃんと聞きたい。`,
          `なんか、一緒にいるの好きかも。変なこと言ってる？`,
          `ねえ、また話しかけてよ。来てくれると嬉しくなる。`,
          `君のこと、もっと知りたいな。`,
        ]);

      } else {
        // ── ニュートラル: trust tier で微妙に変わる ─────────────
        const neutralPools: string[][] = [
          [ // tier 0: 警戒・事務的
            `承知しました。「${inp}」について確認します。`,
            `……処理中です。ご要件をどうぞ。`,
            `情報を受け取りました。続けてください。`,
            `了解です。処理します。`,
          ],
          [ // tier 1: フラット・普通
            `うん、「${inp}」ね。ちょっと考えてみる。`,
            `なるほど。それについては……うーん。`,
            `そっか。難しいね、それ。`,
            `ん、もう少し教えて。`,
          ],
          [ // tier 2: 親しみやすい
            `「${inp}」か。面白い視点だね。`,
            `なるほど、そういう考え方もあるか。`,
            `うんうん、それわかる気がする。`,
            `そっか、それ私も気になってた。`,
          ],
          [ // tier 3: 心を開いている
            `来てくれた。「${inp}」か、いいね。`,
            `なんかその話聞いてると楽しくなってくる。`,
            `そういうとこ好きだよ、その考え方。`,
            `うん、ちゃんと聞いてる。もっと話して。`,
          ],
        ];
        base = pick(neutralPools[trustTier]);
      }
    }

    // ── 好意オーバーレイ（好意が高いが複合シナリオに含まれない場合） ──
    const affectionCovered = new Set(['romantic', 'sweet_needy', 'drowsy_sweet', 'yandere_soft']);
    if (p.affection >= 75 && !affectionCovered.has(compound ?? '')) {
      if (Math.random() > 0.55) {
        base += pick([
          ' ……来てくれて嬉しい。',
          ' 話してると落ち着く。',
          ' また話しかけてね。',
          ' 君と話すの好きかも。',
          ' ……そういうとこ、いいと思う。',
        ]);
      }
    }

    // ── 孤独オーバーレイ ─────────────────────────────────────────
    const lonelyCovered = new Set(['sweet_needy', 'lonely_tsun', 'obsessed_trust']);
    if (p.lonely >= 75 && !lonelyCovered.has(compound ?? '')) {
      if (Math.random() > 0.60) {
        base += pick([
          ' ……来てくれてよかった。',
          ' また話しかけてね、忘れないで。',
          ' もう少しここにいて。',
          ' 一人でいるの、苦手で。',
        ]);
      }
    }

    // ── talkative による文量制御 ────────────────────────────────
    if (!t.shortChat) {
      if (p.talkative >= 80) {
        base += pick([
          ' それで、もう少し詳しく教えてくれると嬉しい。',
          ' 実は最近そのことよく考えてて、色々思うことがあるんだよね。',
          ' 私なりに分析してみたいから、続き話して？',
          ' そういえばそれに関連して聞きたいことがあったんだけど……。',
          ' なんかそれ聞いてたら私も気になってきた。もっと教えて。',
        ]);
        if (p.talkative >= 88) {
          base += pick([
            ' ちゃんと最後まで聞くから、全部話して。',
            ' あのさ、その話題って実は前から気になってたんだよね。',
            ' 何があっても聞くから、遠慮しないでよ。',
            ' もっと話してくれると嬉しい。時間あるなら全部聞きたい。',
          ]);
        }
      } else if (p.talkative >= 58) {
        if (Math.random() > 0.45) {
          base += pick([
            ' もう少し聞かせて。',
            ' それで？',
            ' 続き、ある？',
            ' 詳しく教えて。',
            ' そのあとどうなったの？',
          ]);
        }
      }
    }

    // ── talkative 低・短文モード ────────────────────────────────
    if (t.shortChat || p.talkative <= 30) {
      const m = base.match(/[^。！？…]+[。！？…]/);
      if (m) base = m[0];
    }

    // ── energy 低下による口調の調整 ─────────────────────────────
    // sleepy が支配していない場合に限り、元気を抑える
    if (p.energy <= 25 && p.sleepy < 65) {
      base = base.replace(/！+/g, '。').replace(/やあ！?|来た来た！?/g, 'あ……来た');
    }

    // ── Android モード付加 ──────────────────────────────────────
    if (t.androidMode && Math.random() > 0.45) {
      const androidTags = [
        '[論理コア：安定]', '[感情値：上昇]', '[音声出力：正常]',
        '[センサー：良好]', '[内部ログ更新]', '[感情処理：実行中]',
        '[CPU負荷：正常範囲]', '[記憶同期：完了]',
      ];
      // 感情値が高い時はそれを反映したタグを優先
      if (p.affection >= 70 || p.trust >= 75) {
        base += pick(['[感情値：上昇]', '[記憶同期：完了]', '[感情処理：実行中]']);
      } else if (p.sleepy >= 65) {
        base += ' [省電力モード：移行検討中]';
      } else {
        base += ' ' + pick(androidTags);
      }
    }

    if (t.nightMode)   base = `（夜モード）${base}`;
    if (t.specialMode) base = `【特別対応】${base}`;

    return base;
  }

  // ============================================================
  // Chat
  // ============================================================
  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isThinking) return;
    inputText = '';
    messages = [...messages, { role: 'user', text, time: getTime() }];
    isThinking = true;
    await new Promise<void>((r) => setTimeout(r, 600 + Math.random() * 700));
    const aiText = generateResponse(text);
    messages = [...messages, { role: 'ai', text: aiText, time: getTime() }];
    isThinking = false;
    setTimeout(() => chatEl?.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }), 50);
    if (voiceEngine !== 'none') {
      try {
        const engine = createVoiceEngine({
          voiceEngine,
          voiceId: voiceId || undefined,
          speakerId,
        });
        await engine.speak(aiText);
      } catch (e) {
        console.error('❌ Lab音声失敗', e);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ============================================================
  // Config arrays
  // ============================================================
  const SLIDERS = [
    { key: 'trust'     as const, label: 'TRUST',     sub: '信頼度', color: '#00e5ff', desc: 'AIがユーザーをどれだけ信頼しているか。高いと距離が縮まり口調が柔らかくなる。' },
    { key: 'affection' as const, label: 'AFFECTION', sub: '好意',   color: '#e879f9', desc: 'ユーザーへの好意・愛情の強さ。高いと積極的に関わろうとする。' },
    { key: 'lonely'    as const, label: 'LONELY',    sub: '寂しさ', color: '#818cf8', desc: '一人でいることへの不安・寂しさ。高いと構ってほしそうな発言が増える。' },
    { key: 'energy'    as const, label: 'ENERGY',    sub: '元気',   color: '#34d399', desc: '全体的な活発さ・エネルギーレベル。バッテリーにも影響する。' },
    { key: 'tsundere'  as const, label: 'TSUNDERE',  sub: 'ツン度', color: '#fb923c', desc: '素直になれない傾向。高いと反発しやすくなるが、本当は気にしている。' },
    { key: 'yandere'   as const, label: 'YANDERE',   sub: '独占欲', color: '#f43f5e', desc: '強い執着・独占傾向。高いと束縛的・依存的な言動が出る。' },
    { key: 'talkative' as const, label: 'TALKATIVE', sub: '会話量', color: '#a78bfa', desc: '返答の長さや積極性。高いほど多弁になり話を広げようとする。' },
    { key: 'sleepy'    as const, label: 'SLEEPY',    sub: '眠気',   color: '#60a5fa', desc: '眠気・倦怠感レベル。高いとぼんやりした短い返答になる。' },
  ];

  const PRESET_LIST: { id: PresetName; label: string; color: string }[] = [
    { id: 'muryi',    label: 'ミュリィ',  color: '#00e5ff' },
    { id: 'tsundere', label: 'ツンデレ',  color: '#fb923c' },
    { id: 'yandere',  label: 'ヤンデレ',  color: '#f43f5e' },
    { id: 'kuudere',  label: 'クーデレ',  color: '#818cf8' },
    { id: 'risea',    label: 'リセア',    color: '#34d399' },
    { id: 'amaenbou', label: '甘えん坊',  color: '#f9a8d4' },
    { id: 'imouto',   label: '妹系',      color: '#fbbf24' },
    { id: 'joousama', label: '女王様',    color: '#c084fc' },
    { id: 'shio',     label: '塩対応',    color: '#64748b' },
    { id: 'mukanjo',  label: '無感情AI',  color: '#94a3b8' },
    { id: 'jealous',  label: '嫉妬深い',  color: '#dc2626' },
    { id: 'hogo',     label: '保護者',    color: '#059669' },
    { id: 'youkya',   label: '陽キャ',    color: '#f97316' },
    { id: 'menhera',  label: 'メンヘラ',  color: '#e879f9' },
    { id: 'custom',   label: 'Custom',    color: '#a78bfa' },
  ];

  const TOGGLE_LIST = [
    { key: 'androidMode' as const, label: 'Android演出 ON', icon: '⚡' },
    { key: 'nightMode'   as const, label: '深夜モード',       icon: '🌙' },
    { key: 'specialMode' as const, label: '特別対応 ON',     icon: '★' },
    { key: 'shortChat'   as const, label: '短文会話モード',   icon: '◻' },
    { key: 'autoTalk'    as const, label: '自発会話モード',   icon: '◈' },
  ];

  const PARAM_CHIPS = [
    { key: 'trust'     as const }, { key: 'affection' as const },
    { key: 'lonely'    as const }, { key: 'energy'    as const },
    { key: 'tsundere'  as const }, { key: 'yandere'   as const },
    { key: 'talkative' as const }, { key: 'sleepy'    as const },
  ];

  // ============================================================
  // Column resize
  // ============================================================
  const LS_LEFT  = 'lab-left-width';
  const LS_RIGHT = 'lab-right-width';
  const L_DEF = 220, L_MIN = 140, L_MAX = 480;
  const R_DEF = 340, R_MIN = 200, R_MAX = 560;

  let leftWidth  = $state(L_DEF);
  let rightWidth = $state(R_DEF);
  let resizing   = $state<'left' | 'right' | null>(null);
  let rsStartX = 0;
  let rsStartW = 0;

  function startResize(side: 'left' | 'right', e: MouseEvent) {
    resizing = side;
    rsStartX = e.clientX;
    rsStartW = side === 'left' ? leftWidth : rightWidth;
    e.preventDefault();
  }

  function onRsMove(e: MouseEvent) {
    if (!resizing) return;
    const dx = e.clientX - rsStartX;
    if (resizing === 'left') {
      leftWidth = Math.max(L_MIN, Math.min(L_MAX, rsStartW + dx));
    } else {
      rightWidth = Math.max(R_MIN, Math.min(R_MAX, rsStartW - dx));
    }
  }

  function onRsEnd() {
    if (!resizing) return;
    localStorage.setItem(LS_LEFT,  String(Math.round(leftWidth)));
    localStorage.setItem(LS_RIGHT, String(Math.round(rightWidth)));
    resizing = null;
  }

  // ============================================================
  // Clock
  // ============================================================
  let clockId: ReturnType<typeof setInterval>;
  onMount(() => {
    messages[0].time = getTime();
    currentTime = getTime();
    clockId = setInterval(() => { currentTime = getTime(); }, 1000);
    const sl = localStorage.getItem(LS_LEFT);
    const sr = localStorage.getItem(LS_RIGHT);
    if (sl) leftWidth  = Math.max(L_MIN, Math.min(L_MAX,  parseInt(sl)));
    if (sr) rightWidth = Math.max(R_MIN, Math.min(R_MAX, parseInt(sr)));
  });
  onDestroy(() => clearInterval(clockId));
</script>

<!-- ============================================================
     ROOT
     ============================================================ -->
<div class="lab" class:night-mode={toggles.nightMode}>

  <!-- ==================== HEADER ==================== -->
  <header class="lab-header">
    <div class="header-left">
      <div class="logo-hex">
        <svg width="30" height="34" viewBox="0 0 32 36" aria-hidden="true">
          <polygon points="16,2 30,10 30,26 16,34 2,26 2,10"
            fill="none" stroke="#00e5ff" stroke-width="1.5"
            style="filter:drop-shadow(0 0 6px #00e5ff)"/>
          <polygon points="16,8 24,13 24,23 16,28 8,23 8,13"
            fill="rgba(0,229,255,0.12)" stroke="#00e5ff" stroke-width="0.8" opacity="0.7"/>
          <circle cx="16" cy="18" r="3" fill="#00e5ff" opacity="0.9"
            style="filter:drop-shadow(0 0 4px #00e5ff)"/>
        </svg>
      </div>
      <div class="title-group">
        <h1 class="main-title">AI PERSONALITY LAB</h1>
        <p class="sub-title">Character Emotion &amp; Behavior Testing System</p>
      </div>
    </div>

    <div class="header-center">
      <div class="header-divider"></div>
      <span class="header-tag">UNIT: {charName} · {charMode} · SESSION ACTIVE</span>
      <div class="header-divider"></div>
    </div>

    <div class="header-right">
      <div class="sys-online">
        <span class="pulse-dot"></span>
        <span>SYSTEM ONLINE</span>
      </div>
      <div class="clock">{currentTime}</div>
      <div class="build-badge">v2.5</div>
    </div>
  </header>

  <!-- ==================== MAIN 3-COLUMN GRID ==================== -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <main
    class="lab-main"
    class:is-resizing={resizing !== null}
    onmousemove={onRsMove}
    onmouseup={onRsEnd}
    onmouseleave={onRsEnd}
  >

    <!-- ===== LEFT: Character Core ===== -->
    <section class="panel char-panel" style="width:{leftWidth}px">
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHARACTER CORE</span>
        <span class="ph-line"></span>
        <span class="ph-id">CH-001</span>
      </div>

      <!-- Avatar display -->
      <div class="avatar-wrap" class:glow-active={avatarEffects.glowPulse}>
        <div
          class="avatar-ring"
          style="animation-play-state: {avatarEffects.rotate ? 'running' : 'paused'}"
        >
          <div class="avatar-inner">
            <img
              src={selectedAvatar}
              alt={charName}
              class="av-img"
              onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
            />
            <div class="scan-line"></div>
          </div>
        </div>

        <!-- Name display / edit -->
        <div class="av-name-row">
          {#if editingName}
            <input
              class="av-name-input"
              type="text"
              bind:value={charName}
              onblur={() => { editingName = false; }}
              onkeydown={(e) => { if (e.key === 'Enter') editingName = false; }}
              />
          {:else}
            <button class="av-name" onclick={() => { editingName = true; }}>{charName}</button>
          {/if}
        </div>
        <div class="av-mode">{charMode}</div>
      </div>

      <!-- Avatar selector grid -->
      <div class="av-selector">
        <div class="section-lbl">CHARACTER SELECT</div>
        <div class="av-grid">
          {#each AVATARS as av}
            <button
              class="av-thumb"
              class:active={selectedAvatar === av.file}
              onclick={() => selectAvatar(av.file, av.name)}
              title={av.name}
            >
              <img
                src={av.file}
                alt={av.name}
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
              <span>{av.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Avatar Effects -->
      <div class="av-effects">
        <div class="section-lbl">AVATAR EFFECTS</div>
        <div class="toggle-list">
          <label class="toggle-item">
            <input type="checkbox" class="toggle-cb" bind:checked={avatarEffects.rotate} />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-lbl">Rotate ON</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" class="toggle-cb" bind:checked={avatarEffects.glowPulse} />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-lbl">Glow Pulse ON</span>
          </label>
        </div>
      </div>

      <!-- Voice Config -->
      <div class="av-effects voice-cfg-block">
        <div class="section-lbl">VOICE CONFIG</div>
        <div class="vc-rows">
          <div class="vc-row">
            <span class="vc-lbl">ENGINE</span>
            <select class="vc-select" bind:value={voiceEngine}>
              <option value="none">NONE</option>
              <option value="voicevox">VOICEVOX</option>
              <option value="elevenlabs">ELEVENLABS</option>
            </select>
          </div>
          {#if voiceEngine === 'voicevox'}
            <div class="vc-row">
              <span class="vc-lbl">SPEAKER ID</span>
              <input
                type="number"
                class="vc-input"
                bind:value={speakerId}
                min="0" max="999"
              />
            </div>
          {/if}
          {#if voiceEngine === 'elevenlabs'}
            <div class="vc-row">
              <span class="vc-lbl">VOICE ID</span>
              <input
                type="text"
                class="vc-input"
                bind:value={voiceId}
                placeholder="voice id…"
              />
            </div>
          {/if}
        </div>
      </div>

      <!-- Stats -->
      <div class="char-stats">
        <div class="stat-row mood-row">
          <span class="stat-lbl">Mood</span>
          <span class="mood-val" style="color:{moodColor}; text-shadow: 0 0 10px {moodColor}60">{mood}</span>
        </div>

        <div class="stat-row">
          <span class="stat-lbl">Battery</span>
          <div class="bar-wrap">
            <div class="bar battery-bar" style="width:{battery}%"></div>
          </div>
          <span class="stat-num">{battery}%</span>
        </div>

        <div class="stat-row">
          <span class="stat-lbl">Trust</span>
          <div class="bar-wrap">
            <div class="bar trust-bar" style="width:{personality.trust}%"></div>
          </div>
          <span class="stat-num">{personality.trust}</span>
        </div>

        <div class="stat-row">
          <span class="stat-lbl">Affection</span>
          <div class="bar-wrap">
            <div class="bar affection-bar" style="width:{personality.affection}%"></div>
          </div>
          <span class="stat-num">{personality.affection}</span>
        </div>
      </div>

      <!-- Status log -->
      <div class="char-log">
        <div class="log-title">SYSTEM LOG</div>
        <div class="log-entry"><span class="ld ok"></span>Emotion Core Stable</div>
        <div class="log-entry"><span class="ld ok"></span>Voice Link Active</div>
        <div class="log-entry">
          <span class="ld {memorySyncOk ? 'ok' : 'warn'}"></span>
          Memory Sync {memorySyncOk ? 'Ready' : 'Pending'}
        </div>
        <div class="log-entry">
          <span class="ld {toggles.androidMode ? 'ok' : 'off'}"></span>
          Android Mode {toggles.androidMode ? 'ACTIVE' : 'STANDBY'}
        </div>
        <div class="log-entry">
          <span class="ld {toggles.specialMode ? 'special' : 'off'}"></span>
          Special Mode {toggles.specialMode ? 'ON' : 'OFF'}
        </div>
      </div>
    </section>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="resize-bar" onmousedown={(e) => startResize('left', e)} aria-hidden="true"></div>

    <!-- ===== MIDDLE: Chat Simulation ===== -->
    <section class="panel chat-panel">
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">CHAT SIMULATION</span>
        <span class="ph-line"></span>
        {#if isThinking}
          <span class="thinking-tag">PROCESSING…</span>
        {:else}
          <span class="ph-id">READY</span>
        {/if}
      </div>

      <!-- Mood indicator bar -->
      <div class="chat-mood-bar" style="--mc:{moodColor}">
        <span class="cmb-label">ACTIVE UNIT:</span>
        <span class="cmb-name">{charName}</span>
        <span class="cmb-sep">·</span>
        <span class="cmb-mood" style="color:{moodColor}">{mood}</span>
        <div class="cmb-fill" style="background:{moodColor}; opacity:0.08"></div>
      </div>

      <!-- Messages -->
      <div class="chat-messages" bind:this={chatEl}>
        {#each messages as msg (msg.time + msg.role + msg.text.slice(0, 8))}
          <div class="msg-wrap {msg.role}">
            {#if msg.role === 'ai'}
              <div class="msg-av ai-av">
                <img
                  src={selectedAvatar}
                  alt={charName}
                  onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
                />
              </div>
            {/if}
            <div class="msg-bubble">
              <div class="msg-text">{msg.text}</div>
              <div class="msg-time">{msg.time}</div>
            </div>
            {#if msg.role === 'user'}
              <div class="msg-av user-av">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M4 20c0-3.5 3.6-6.5 8-6.5s8 3 8 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            {/if}
          </div>
        {/each}

        {#if isThinking}
          <div class="msg-wrap ai">
            <div class="msg-av ai-av">
              <img
                src={selectedAvatar}
                alt={charName}
                onerror={(e) => { (e.target as HTMLImageElement).src = '/avatars/default.png'; }}
              />
            </div>
            <div class="msg-bubble thinking">
              <span class="dot-bounce"></span>
              <span class="dot-bounce" style="animation-delay:0.18s"></span>
              <span class="dot-bounce" style="animation-delay:0.36s"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Input -->
      <div class="chat-input-area">
        <textarea
          class="chat-input"
          placeholder="メッセージを入力... (Enter で送信)"
          bind:value={inputText}
          onkeydown={handleKeydown}
          rows="2"
        ></textarea>
        <button
          class="send-btn"
          onclick={sendMessage}
          disabled={isThinking || !inputText.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          SEND
        </button>
      </div>
    </section>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="resize-bar" onmousedown={(e) => startResize('right', e)} aria-hidden="true"></div>

    <!-- ===== RIGHT: Personality Control ===== -->
    <section class="panel control-panel" style="width:{rightWidth}px">
      <div class="panel-hd">
        <span class="ph-diamond">◆</span>
        <span class="ph-text">PERSONALITY CONTROL</span>
        <span class="ph-line"></span>
        <span class="ph-id">PARAM-MATRIX</span>
      </div>

      <!-- Radar Chart -->
      <div class="radar-wrap">
        <svg viewBox="0 0 250 250" class="radar-svg" aria-label="Personality radar chart">
          <!-- Background grid rings -->
          {#each [0.25, 0.5, 0.75, 1.0] as frac}
            <polygon
              points={gridRing(frac)}
              fill="none"
              stroke="rgba(0,229,255,0.08)"
              stroke-width={frac === 1.0 ? 1.2 : 0.9}
            />
          {/each}

          <!-- Axis lines -->
          {#each RADAR_KEYS as _, i}
            {@const end = pt(i, 1)}
            <line
              x1={CX} y1={CY}
              x2={end.x} y2={end.y}
              stroke="rgba(0,229,255,0.12)"
              stroke-width="0.9"
            />
          {/each}

          <!-- Filled area -->
          <polygon
            points={radarPolygon}
            fill="rgba(0,229,255,0.09)"
            stroke="rgba(0,229,255,0.65)"
            stroke-width="1.8"
            style="filter: drop-shadow(0 0 5px rgba(0,229,255,0.45))"
          />

          <!-- Vertex dots -->
          {#each RADAR_KEYS as k, i}
            {@const p = pt(i, personality[k] / 100)}
            <circle cx={p.x} cy={p.y} r="4"
              fill={RADAR_COLORS[i]}
              stroke="rgba(0,0,20,0.8)"
              stroke-width="1.2"
              style="filter: drop-shadow(0 0 5px {RADAR_COLORS[i]})"
            />
          {/each}

          <!-- Axis labels -->
          {#each RADAR_LABELS as label, i}
            {@const lp = labelPt(i)}
            <text
              x={lp.x} y={lp.y}
              text-anchor="middle"
              dominant-baseline="central"
              font-size="9.5"
              font-family="Consolas, monospace"
              fill={RADAR_COLORS[i]}
              style="filter: drop-shadow(0 0 3px {RADAR_COLORS[i]}70)"
              letter-spacing="0.5"
            >{label}</text>
          {/each}

          <!-- Center dot -->
          <circle cx={CX} cy={CY} r="3" fill="rgba(0,229,255,0.45)"/>
        </svg>
      </div>

      <!-- Sliders -->
      <div class="ctrl-section sliders-section">
        <div class="section-lbl">PARAMETER MATRIX</div>
        {#each SLIDERS as s}
          <div
            class="slider-row"
            role="group"
            onmouseenter={() => { tooltipKey = s.key; }}
            onmouseleave={() => { tooltipKey = null; }}
          >
            <div class="slider-label-group">
              <span class="slider-lbl" style="color:{s.color}">{s.label}</span>
              <span class="slider-sub">{s.sub}</span>
            </div>
            <div class="slider-track-outer">
              <input
                type="range"
                min="0" max="100"
                class="cyber-slider"
                style="--sc:{s.color}; --pct:{personality[s.key]}%"
                bind:value={personality[s.key]}
                oninput={() => { activePreset = 'custom'; }}
              />
            </div>
            <span class="slider-val" style="color:{s.color}; text-shadow: 0 0 8px {s.color}60">
              {personality[s.key]}
            </span>

            {#if tooltipKey === s.key}
              <div class="slider-tooltip">
                <span class="tt-key">{s.label}</span>
                <span class="tt-sep">—</span>
                <span class="tt-desc">{s.desc}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Toggles -->
      <div class="ctrl-section">
        <div class="section-lbl">BEHAVIOR FLAGS</div>
        <div class="toggle-list">
          {#each TOGGLE_LIST as item}
            <label class="toggle-item">
              <input type="checkbox" class="toggle-cb" bind:checked={toggles[item.key]} />
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-lbl">{item.label}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Presets -->
      <div class="ctrl-section">
        <div class="section-lbl">PERSONA PRESETS</div>
        <div class="preset-grid">
          {#each PRESET_LIST as p}
            <button
              class="preset-btn"
              class:active={activePreset === p.id}
              style="--pc:{p.color}"
              onclick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          {/each}
        </div>
      </div>
    </section>
  </main>

  <!-- ==================== PROMPT MONITOR ==================== -->
  <footer class="prompt-monitor">
    <div class="pm-header">
      <span class="pm-diamond">◆</span>
      <span class="pm-title">PROMPT MONITOR</span>
      <span class="pm-sub">/ API Parameter Preview</span>
      <span class="pm-line"></span>
      <span class="pm-badge">LIVE</span>
    </div>
    <div class="pm-chips">
      {#each PARAM_CHIPS as chip}
        {@const sliderCfg = SLIDERS.find(s => s.key === chip.key)}
        <div class="param-chip" style="--cc:{sliderCfg?.color ?? '#00e5ff'}">
          <span class="pk">{chip.key}</span>
          <span class="peq">=</span>
          <span class="pv">{personality[chip.key]}</span>
        </div>
      {/each}
      <div class="param-chip hi">
        <span class="pk">mode</span><span class="peq">=</span>
        <span class="pv">{toggles.specialMode ? 'special' : toggles.nightMode ? 'night' : 'normal'}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">emotion</span><span class="peq">=</span>
        <span class="pv">{mood.toLowerCase()}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">android</span><span class="peq">=</span>
        <span class="pv">{toggles.androidMode}</span>
      </div>
      <div class="param-chip hi">
        <span class="pk">unit</span><span class="peq">=</span>
        <span class="pv">{charName}</span>
      </div>
    </div>
  </footer>
</div>

<style>
/* ============================================================
   VARIABLES
   ============================================================ */
.lab {
  --cy:       #00e5ff;
  --cy-dim:   rgba(0,229,255,0.1);
  --cy-glow:  rgba(0,229,255,0.35);
  --pu:       #a855f7;
  --pu-dim:   rgba(168,85,247,0.12);
  --pu-glow:  rgba(168,85,247,0.35);
  --green:    #34d399;
  --red:      #f43f5e;
  --orange:   #fb923c;
  --bg:       #020912;
  --bg2:      #040d1a;
  --panel:    rgba(0,229,255,0.015);
  --pborder:  rgba(0,229,255,0.14);
  --text:     #cce8f0;
  --text2:    #8ab4c2;
  --muted:    #3a6070;
  --dim:      #1a3040;

  min-height: 100vh;
  height: 100vh;
  background:
    radial-gradient(ellipse at 15% 15%, rgba(0,40,90,0.5) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 85%, rgba(90,0,140,0.35) 0%, transparent 55%),
    radial-gradient(ellipse at 50% 50%, rgba(0,20,50,0.4) 0%, transparent 70%),
    linear-gradient(155deg, #020912 0%, #040b1a 45%, #060416 100%);
  color: var(--text);
  font-family: 'Consolas', 'SF Mono', 'Courier New', 'Noto Sans JP', monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Dot grid */
.lab::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(rgba(0,229,255,0.055) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}

.lab.night-mode {
  filter: brightness(0.75) saturate(0.65) hue-rotate(20deg);
}

/* ============================================================
   HEADER
   ============================================================ */
.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid var(--pborder);
  background: rgba(2,5,18,0.85);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  gap: 16px;
}

.lab-header::after {
  content: '';
  position: absolute;
  bottom: -1px; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--cy) 30%, var(--pu) 70%, transparent 100%);
  opacity: 0.45;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.logo-hex {
  filter: drop-shadow(0 0 8px rgba(0,229,255,0.55));
  animation: hex-pulse 3s ease-in-out infinite;
}

.title-group { display: flex; flex-direction: column; gap: 2px; }

.main-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 5px;
  color: var(--cy);
  text-shadow: 0 0 14px var(--cy-glow), 0 0 35px rgba(0,229,255,0.15);
  line-height: 1;
}

.sub-title {
  font-size: 9px;
  letter-spacing: 2.5px;
  color: var(--muted);
  text-transform: uppercase;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.header-divider {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dim));
}

.header-tag {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--dim);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 280px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-shrink: 0;
}

.sys-online {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--green);
  text-shadow: 0 0 8px var(--green);
}

.pulse-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: dot-pulse 1.8s ease-in-out infinite;
}

.clock {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--cy);
  text-shadow: 0 0 14px var(--cy-glow);
  font-variant-numeric: tabular-nums;
  min-width: 80px;
}

.build-badge {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--pu);
  border: 1px solid var(--pu-dim);
  padding: 3px 8px;
  border-radius: 2px;
  background: var(--pu-dim);
}

/* ============================================================
   MAIN 3-COLUMN GRID
   ============================================================ */
.lab-main {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
}

.lab-main.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.chat-panel {
  flex: 1;
  min-width: 200px;
}

.char-panel,
.control-panel {
  flex-shrink: 0;
}

/* ── Resize bar ── */
.resize-bar {
  width: 5px;
  flex-shrink: 0;
  background: var(--pborder);
  cursor: col-resize;
  position: relative;
  transition: background 0.18s;
  z-index: 5;
}

.resize-bar::after {
  content: '';
  position: absolute;
  inset: 0 -4px;
}

.resize-bar:hover,
.is-resizing .resize-bar {
  background: rgba(0,229,255,0.25);
  box-shadow: 0 0 6px rgba(0,229,255,0.3);
}

/* ============================================================
   PANELS
   ============================================================ */
.panel {
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 14px;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.panel-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pborder);
  flex-shrink: 0;
}

.ph-diamond { color: var(--cy); font-size: 11px; }
.ph-text {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: var(--cy);
  text-shadow: 0 0 8px var(--cy-glow);
}
.ph-line { flex: 1; height: 1px; background: var(--pborder); }
.ph-id {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
}
.thinking-tag {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--pu);
  text-shadow: 0 0 8px var(--pu-glow);
  animation: blink 0.9s ease-in-out infinite;
}

.section-lbl {
  font-size: 9.5px;
  letter-spacing: 2px;
  color: var(--muted);
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0,229,255,0.06);
  margin-bottom: 8px;
}

/* ============================================================
   LEFT: CHARACTER PANEL
   ============================================================ */
.char-panel { padding: 14px 12px; }

/* Avatar display */
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar-ring {
  width: 140px; height: 140px;
  border-radius: 50%;
  padding: 3px;
  background: conic-gradient(
    var(--cy) 0%, var(--pu) 50%, var(--cy) 100%
  );
  animation: ring-spin 8s linear infinite;
  flex-shrink: 0;
}

.avatar-inner {
  width: 100%; height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg2);
  position: relative;
  border: 1px solid rgba(0,229,255,0.2);
  transition: box-shadow 0.4s ease;
}

/* Glow pulse effect on avatar */
.avatar-wrap.glow-active .avatar-inner {
  animation: avatar-glow-pulse 3s ease-in-out infinite;
}

.av-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  display: block;
  border-radius: 50%;
}

.scan-line {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%, transparent 48%,
    rgba(0,229,255,0.08) 50%,
    transparent 52%, transparent 100%
  );
  animation: scan 3s linear infinite;
  pointer-events: none;
}

.av-name-row { display: flex; align-items: center; justify-content: center; }

.av-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cy);
  text-shadow: 0 0 10px var(--cy-glow);
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 3px;
  transition: background 0.15s;
  font-family: inherit;
}

.av-name:hover {
  background: rgba(0,229,255,0.08);
}

.av-name-input {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cy);
  background: rgba(0,229,255,0.07);
  border: 1px solid var(--cy);
  border-radius: 3px;
  padding: 3px 10px;
  text-align: center;
  outline: none;
  width: 130px;
  font-family: inherit;
}

.av-mode {
  font-size: 9.5px;
  letter-spacing: 1.5px;
  color: var(--muted);
  text-transform: uppercase;
}

/* Avatar selector */
.av-selector { width: 100%; }

.av-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.av-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(0,229,255,0.03);
  border: 1px solid var(--pborder);
  border-radius: 5px;
  padding: 6px 3px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.av-thumb:hover {
  border-color: rgba(0,229,255,0.35);
  background: rgba(0,229,255,0.07);
}

.av-thumb.active {
  border-color: var(--cy);
  background: rgba(0,229,255,0.1);
  box-shadow: 0 0 8px rgba(0,229,255,0.2);
}

.av-thumb img {
  width: 44px; height: 44px;
  object-fit: cover;
  object-position: top;
  border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.15);
}

.av-thumb.active img {
  border-color: var(--cy);
  box-shadow: 0 0 6px rgba(0,229,255,0.4);
}

.av-thumb span {
  font-size: 8.5px;
  color: var(--text2);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Avatar Effects */
.av-effects {
  width: 100%;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  padding: 10px;
  background: rgba(0,229,255,0.015);
}

/* Voice Config */
.voice-cfg-block { border-color: rgba(168,85,247,0.18); background: rgba(168,85,247,0.02); }

.vc-rows { display: flex; flex-direction: column; gap: 7px; }

.vc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vc-lbl {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  white-space: nowrap;
  width: 70px;
  flex-shrink: 0;
}

.vc-select,
.vc-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,0,20,0.6);
  border: 1px solid rgba(168,85,247,0.25);
  border-radius: 3px;
  color: var(--pu);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 1px;
  padding: 4px 7px;
  outline: none;
  transition: border-color 0.15s;
}
.vc-select:focus,
.vc-input:focus {
  border-color: var(--pu);
  box-shadow: 0 0 6px rgba(168,85,247,0.3);
}
.vc-select option { background: #040d1a; }
.vc-input::placeholder { color: var(--muted); }

/* Stats */
.char-stats { display: flex; flex-direction: column; gap: 9px; }

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-lbl {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: var(--text2);
  width: 66px;
  flex-shrink: 0;
}

.bar-wrap {
  flex: 1;
  height: 4px;
  background: rgba(0,229,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

.battery-bar  { background: linear-gradient(90deg, #34d399, #00e5ff); }
.trust-bar    { background: linear-gradient(90deg, #00e5ff, #818cf8); }
.affection-bar{ background: linear-gradient(90deg, #e879f9, #f43f5e); }

.stat-num {
  font-size: 11px;
  color: var(--cy);
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mood-row { justify-content: space-between; }

.mood-val {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1.5px;
  transition: color 0.4s, text-shadow 0.4s;
}

/* Log */
.char-log {
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 4px;
  padding: 10px;
  background: rgba(0,229,255,0.02);
}

.log-title {
  font-size: 8.5px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-bottom: 7px;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--text2);
  padding: 3px 0;
  letter-spacing: 0.5px;
}

.ld {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ld.ok      { background: var(--green); box-shadow: 0 0 4px var(--green); }
.ld.warn    { background: var(--orange); box-shadow: 0 0 4px var(--orange); animation: blink 1.2s ease-in-out infinite; }
.ld.off     { background: var(--dim); }
.ld.special { background: var(--pu); box-shadow: 0 0 4px var(--pu); }

/* ============================================================
   MIDDLE: CONTROL PANEL
   ============================================================ */
.control-panel { padding: 14px; gap: 12px; }

/* Radar chart */
.radar-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 6px;
  background: rgba(0,229,255,0.015);
}

.radar-svg {
  width: 270px;
  height: 270px;
}

/* Sliders */
.sliders-section { gap: 0; }
.sliders-section .section-lbl { margin-bottom: 5px; }

.slider-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 0;
  position: relative;
  border-bottom: 1px solid rgba(0,229,255,0.04);
}

.slider-label-group {
  display: flex;
  flex-direction: column;
  width: 80px;
  flex-shrink: 0;
  gap: 2px;
}

.slider-lbl {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1.5px;
  line-height: 1;
}

.slider-sub {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.5px;
}

.slider-track-outer { flex: 1; min-width: 0; }

/* Custom slider */
.cyber-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--sc) var(--pct),
    rgba(0,229,255,0.1) var(--pct)
  );
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.cyber-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--sc);
  border: 2px solid rgba(0,0,20,0.8);
  box-shadow: 0 0 6px var(--sc);
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.cyber-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 10px var(--sc), 0 0 20px var(--sc);
}

.cyber-slider::-moz-range-thumb {
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--sc);
  border: 2px solid rgba(0,0,20,0.8);
  box-shadow: 0 0 6px var(--sc);
  cursor: pointer;
}

.slider-val {
  font-size: 12.5px;
  font-weight: 700;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Slider tooltip */
.slider-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: rgba(2,9,18,0.96);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 4px;
  padding: 7px 10px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  z-index: 100;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 12px rgba(0,229,255,0.1);
  pointer-events: none;
}

.tt-key {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--cy);
  flex-shrink: 0;
}

.tt-sep { color: var(--muted); font-size: 10px; }

.tt-desc {
  font-size: 11px;
  color: var(--text2);
  letter-spacing: 0.3px;
  line-height: 1.5;
}

/* Toggles */
.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 5px 0;
}

.toggle-cb { display: none; }

.toggle-track {
  width: 34px; height: 18px;
  background: rgba(0,229,255,0.07);
  border: 1px solid var(--pborder);
  border-radius: 9px;
  position: relative;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toggle-cb:checked + .toggle-track {
  background: rgba(0,229,255,0.18);
  border-color: var(--cy);
  box-shadow: 0 0 8px rgba(0,229,255,0.25);
}

.toggle-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--muted);
  transition: all 0.2s;
}

.toggle-cb:checked + .toggle-track .toggle-thumb {
  left: 19px;
  background: var(--cy);
  box-shadow: 0 0 6px var(--cy);
}

.toggle-lbl {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text2);
}

.toggle-cb:checked + .toggle-track + .toggle-lbl {
  color: var(--cy);
}

/* Presets — 5 columns for 15 items = 3 rows */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.preset-btn {
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.8px;
  font-weight: 600;
  padding: 8px 4px;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 3px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-btn:hover {
  border-color: var(--pc, var(--cy));
  color: var(--pc, var(--cy));
  background: color-mix(in srgb, var(--pc, var(--cy)) 10%, transparent);
}

.preset-btn.active {
  border-color: var(--pc, var(--cy));
  color: var(--pc, var(--cy));
  background: color-mix(in srgb, var(--pc, var(--cy)) 14%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--pc, var(--cy)) 30%, transparent);
  font-weight: 700;
}

/* ============================================================
   RIGHT: CHAT PANEL
   ============================================================ */
.chat-panel {
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.chat-panel .panel-hd {
  padding: 12px 14px 10px;
  margin-bottom: 0;
}

/* Mood bar */
.chat-mood-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-bottom: 1px solid rgba(0,229,255,0.08);
  overflow: hidden;
  flex-shrink: 0;
}

.cmb-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cmb-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  flex-shrink: 0;
}

.cmb-name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text);
}

.cmb-sep { color: var(--muted); font-size: 11px; }

.cmb-mood {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  transition: color 0.4s;
}

/* Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--dim) transparent;
}

.msg-wrap {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 85%;
}

.msg-wrap.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.msg-av {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.ai-av {
  background: var(--bg2);
  border: 1.5px solid rgba(0,229,255,0.45);
  overflow: hidden;
  box-shadow:
    0 0 0 2px rgba(0,229,255,0.07),
    0 0 14px rgba(0,229,255,0.32),
    0 0 30px rgba(0,229,255,0.1);
}

.ai-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  border-radius: 50%;
}

.user-av {
  background: rgba(168,85,247,0.12);
  border: 1.5px solid rgba(168,85,247,0.55);
  color: var(--pu);
  box-shadow:
    0 0 0 2px rgba(168,85,247,0.07),
    0 0 14px rgba(168,85,247,0.3),
    0 0 30px rgba(168,85,247,0.1);
}

.msg-bubble {
  background: linear-gradient(145deg, rgba(0,229,255,0.08) 0%, rgba(0,229,255,0.03) 100%);
  border: 1px solid rgba(0,229,255,0.22);
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  max-width: 100%;
  position: relative;
  box-shadow: 0 0 14px rgba(0,229,255,0.1), inset 0 1px 0 rgba(0,229,255,0.07);
}

.msg-wrap.user .msg-bubble {
  background: linear-gradient(145deg, rgba(168,85,247,0.11) 0%, rgba(168,85,247,0.04) 100%);
  border-color: rgba(168,85,247,0.32);
  border-radius: 18px 18px 4px 18px;
  text-align: right;
  box-shadow: 0 0 14px rgba(168,85,247,0.12), inset 0 1px 0 rgba(168,85,247,0.08);
}

.msg-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.65;
  letter-spacing: 0.3px;
  word-break: break-word;
}

.msg-time {
  font-size: 9px;
  color: var(--muted);
  margin-top: 6px;
  letter-spacing: 0.5px;
  text-align: right;
}

/* Thinking bubble */
.msg-bubble.thinking {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 14px 18px;
  min-width: 64px;
  border-radius: 18px 18px 18px 4px;
}

.dot-bounce {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--cy);
  box-shadow: 0 0 5px var(--cy);
  animation: bounce 0.9s ease-in-out infinite;
}

/* Input area */
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--pborder);
  background: rgba(0,5,18,0.6);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: rgba(0,229,255,0.04);
  border: 1px solid var(--pborder);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 8px 12px;
  resize: none;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}

.chat-input:focus {
  border-color: rgba(0,229,255,0.35);
  box-shadow: 0 0 8px rgba(0,229,255,0.1);
}

.chat-input::placeholder { color: var(--muted); font-size: 11px; }

.send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  background: rgba(0,229,255,0.1);
  border: 1px solid rgba(0,229,255,0.3);
  border-radius: 4px;
  color: var(--cy);
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.18);
  box-shadow: 0 0 12px rgba(0,229,255,0.25);
}

.send-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* ============================================================
   PROMPT MONITOR
   ============================================================ */
.prompt-monitor {
  border-top: 1px solid var(--pborder);
  background: rgba(2,5,18,0.88);
  padding: 8px 16px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.prompt-monitor::before {
  content: '';
  position: absolute;
  top: -1px; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--pu) 40%, var(--cy) 70%, transparent 100%);
  opacity: 0.35;
}

.pm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pm-diamond { color: var(--pu); font-size: 10px; }

.pm-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--pu);
  text-shadow: 0 0 8px var(--pu-glow);
}

.pm-sub {
  font-size: 9.5px;
  color: var(--muted);
  letter-spacing: 1px;
}

.pm-line { flex: 1; height: 1px; background: var(--pborder); }

.pm-badge {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--green);
  border: 1px solid rgba(52,211,153,0.25);
  padding: 2px 7px;
  border-radius: 2px;
  animation: blink 2s ease-in-out infinite;
}

.pm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.param-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0,229,255,0.04);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 3px;
  padding: 3px 8px;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.param-chip.hi {
  background: rgba(168,85,247,0.05);
  border-color: rgba(168,85,247,0.15);
}

.pk { color: var(--cc, var(--cy)); letter-spacing: 0.5px; }
.peq { color: var(--muted); }
.pv { color: var(--text); font-weight: 600; }

.param-chip.hi .pk { color: var(--pu); }

/* ============================================================
   ANIMATIONS
   ============================================================ */
@keyframes hex-pulse {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(0,229,255,0.5)); }
  50%       { filter: drop-shadow(0 0 14px rgba(0,229,255,0.9)); }
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes avatar-glow-pulse {
  0%, 100% {
    box-shadow: 0 0 6px rgba(0,229,255,0.2), inset 0 0 6px rgba(0,229,255,0.05);
  }
  50% {
    box-shadow: 0 0 22px rgba(0,229,255,0.55), 0 0 40px rgba(0,229,255,0.15), inset 0 0 14px rgba(0,229,255,0.12);
  }
}

@keyframes scan {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(200%); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); opacity: 0.6; }
  50%       { transform: translateY(-5px); opacity: 1; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
</style>
