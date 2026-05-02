// カードデータとデッキ状態
let cards = [];
let normalDeck = {}; // { cardId: count }
let danmakuDeck = {}; // { cardId: count }

// 画像パスのマッピング
const imagePathMap = {};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadCards();
  buildImagePathMap();
  renderCardList();
  setupEventListeners();
});

// CSVからカードデータを読み込む
async function loadCards() {
  try {
    const response = await fetch('data/cards.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length >= 9) {
        cards.push({
          id: values[0],
          type: values[1],
          name: values[2],
          text: values[3],
          cost: values[4],
          race: values[5],
          caster: values[6],
          attack: values[7],
          hp: values[8]
        });
      }
    }
  } catch (error) {
    console.error('カードデータの読み込みに失敗:', error);
  }
}

// CSVの行をパース（カンマを含むテキストに対応）
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// 画像パスマッピングを構築
function buildImagePathMap() {
  cards.forEach(card => {
    const id = card.id;
    let basePath = '';

    if (id.startsWith('AAB')) {
      basePath = 'カード画像/拡張/';
    } else if (id.startsWith('AAS')) {
      basePath = 'カード画像/スターター/';
    } else if (id.startsWith('AAD')) {
      // AAD011-014はスターター、それ以外は弾幕フォルダ
      const num = parseInt(id.replace('AAD', '').replace('PR01', ''));
      if (num >= 11 && num <= 14) {
        basePath = 'カード画像/スターター/';
      } else {
        basePath = 'カード画像/弾幕/';
      }
    } else if (id.startsWith('ABB') || id.startsWith('ABD')) {
      basePath = 'カード画像/第2弾/①/';
    }

    // 拡張子はJPGまたはjpg
    imagePathMap[id] = basePath + id + '.JPG';
  });
}

// カード画像のパスを取得
function getCardImagePath(cardId) {
  return imagePathMap[cardId] || null;
}

// カード一覧をレンダリング
function renderCardList(filter = {}) {
  const container = document.getElementById('card-list');
  container.innerHTML = '';

  let filteredCards = cards;

  // タイプフィルター
  if (filter.type) {
    filteredCards = filteredCards.filter(c => c.type === filter.type);
  }

  // 名前フィルター
  if (filter.name) {
    const searchTerm = filter.name.toLowerCase();
    filteredCards = filteredCards.filter(c =>
      c.name.toLowerCase().includes(searchTerm) ||
      c.id.toLowerCase().includes(searchTerm)
    );
  }

  filteredCards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card-item';
    div.dataset.cardId = card.id;

    const imgPath = getCardImagePath(card.id);
    const costDisplay = card.cost || '-';

    const img = document.createElement('img');
    img.src = imgPath;
    img.alt = card.name;
    img.onerror = function() {
      this.style.display = 'none';
      this.nextElementSibling.style.display = 'flex';
    };

    const noImg = document.createElement('div');
    noImg.className = 'no-image';
    noImg.style.display = 'none';
    noImg.textContent = 'NO IMAGE';

    const costDiv = document.createElement('div');
    costDiv.className = 'card-cost';
    costDiv.textContent = costDisplay;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'card-name';
    nameDiv.textContent = card.name;

    div.appendChild(img);
    div.appendChild(noImg);
    div.appendChild(costDiv);
    div.appendChild(nameDiv);

    div.addEventListener('click', () => addCardToDeck(card));
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCardDetail(card);
    });

    container.appendChild(div);
  });
}

// デッキにカードを追加
function addCardToDeck(card) {
  const isDanmaku = card.type === '弾幕';
  const deck = isDanmaku ? danmakuDeck : normalDeck;
  const maxPerCard = isDanmaku ? 2 : 4;
  const maxTotal = isDanmaku ? 10 : 60;

  // 通常弾は枚数制限なし
  const isNormalBullet = card.name === '通常弾' || card.name === '通常弾（低速）';
  const effectiveMaxPerCard = isNormalBullet ? 99 : maxPerCard;

  // 現在の枚数をチェック
  const currentCount = deck[card.id] || 0;
  const totalCount = Object.values(deck).reduce((sum, c) => sum + c, 0);

  if (currentCount >= effectiveMaxPerCard) {
    alert('同一カードは' + effectiveMaxPerCard + '枚までです');
    return;
  }

  if (totalCount >= maxTotal) {
    alert('デッキは' + maxTotal + '枚までです');
    return;
  }

  deck[card.id] = currentCount + 1;
  renderDeck(isDanmaku);
  updateDeckCount();
}

// デッキからカードを削除
function removeCardFromDeck(cardId, isDanmaku) {
  const deck = isDanmaku ? danmakuDeck : normalDeck;

  if (deck[cardId]) {
    deck[cardId]--;
    if (deck[cardId] <= 0) {
      delete deck[cardId];
    }
    renderDeck(isDanmaku);
    updateDeckCount();
  }
}

// デッキをレンダリング
function renderDeck(isDanmaku) {
  const deck = isDanmaku ? danmakuDeck : normalDeck;
  const containerId = isDanmaku ? 'danmaku-deck-list' : 'normal-deck-list';
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  // カードIDでソート
  const sortedIds = Object.keys(deck).sort();

  sortedIds.forEach(cardId => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const count = deck[cardId];
    const imgPath = getCardImagePath(cardId);

    const div = document.createElement('div');
    div.className = 'deck-card';

    const img = document.createElement('img');
    img.src = imgPath;
    img.alt = card.name;
    img.onerror = function() {
      this.style.display = 'none';
      this.nextElementSibling.style.display = 'flex';
    };

    const noImg = document.createElement('div');
    noImg.className = 'no-image-small';
    noImg.style.display = 'none';
    noImg.textContent = 'NO IMG';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'deck-card-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'deck-card-name';
    nameDiv.textContent = card.name;
    infoDiv.appendChild(nameDiv);

    const countDiv = document.createElement('div');
    countDiv.className = 'deck-card-count';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'minus-btn';
    minusBtn.textContent = '-';
    minusBtn.addEventListener('click', () => removeCardFromDeck(cardId, isDanmaku));

    const countSpan = document.createElement('span');
    countSpan.textContent = count;

    const plusBtn = document.createElement('button');
    plusBtn.className = 'plus-btn';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => addCardToDeck(card));

    countDiv.appendChild(minusBtn);
    countDiv.appendChild(countSpan);
    countDiv.appendChild(plusBtn);

    div.appendChild(img);
    div.appendChild(noImg);
    div.appendChild(infoDiv);
    div.appendChild(countDiv);

    container.appendChild(div);
  });
}

// デッキ枚数を更新
function updateDeckCount() {
  const normalCount = Object.values(normalDeck).reduce((sum, c) => sum + c, 0);
  const danmakuCount = Object.values(danmakuDeck).reduce((sum, c) => sum + c, 0);

  document.getElementById('normal-count').textContent = normalCount;
  document.getElementById('danmaku-count').textContent = danmakuCount;

  // バリデーション表示
  const normalTab = document.querySelector('[data-tab="normal"]');
  const danmakuTab = document.querySelector('[data-tab="danmaku"]');

  if (normalCount >= 40 && normalCount <= 60) {
    normalTab.style.borderColor = '#44ff44';
  } else {
    normalTab.style.borderColor = normalCount > 0 ? '#ff4444' : '#660000';
  }

  if (danmakuCount === 10) {
    danmakuTab.style.borderColor = '#44ff44';
  } else {
    danmakuTab.style.borderColor = danmakuCount > 0 ? '#ff4444' : '#660000';
  }
}

// カード詳細を表示
function showCardDetail(card) {
  const modal = document.getElementById('card-modal');
  const detail = document.getElementById('modal-card-detail');
  const imgPath = getCardImagePath(card.id);

  detail.innerHTML = '';

  const img = document.createElement('img');
  img.src = imgPath;
  img.alt = card.name;
  img.onerror = function() { this.style.display = 'none'; };
  detail.appendChild(img);

  const title = document.createElement('h3');
  title.textContent = card.name;
  detail.appendChild(title);

  const addInfo = (label, value) => {
    if (value) {
      const p = document.createElement('p');
      p.innerHTML = '<strong>' + label + ':</strong> ' + value;
      detail.appendChild(p);
    }
  };

  addInfo('ID', card.id);
  addInfo('タイプ', card.type);
  addInfo('コスト', card.cost || '-');
  addInfo('種族', card.race);
  addInfo('術者', card.caster);
  addInfo('効果', card.text);

  if (card.type === 'キャラ' || card.type === '弾幕') {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'card-stats';
    statsDiv.innerHTML = '<div>攻撃: ' + (card.attack || '-') + '</div><div>HP: ' + (card.hp || '-') + '</div>';
    detail.appendChild(statsDiv);
  }

  modal.classList.add('show');
}

// イベントリスナーを設定
function setupEventListeners() {
  // フィルター
  document.getElementById('type-filter').addEventListener('change', applyFilters);
  document.getElementById('name-filter').addEventListener('input', applyFilters);

  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.deck-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + '-deck').classList.add('active');
    });
  });

  // モーダルを閉じる
  document.querySelector('.modal .close').addEventListener('click', () => {
    document.getElementById('card-modal').classList.remove('show');
  });

  document.getElementById('card-modal').addEventListener('click', (e) => {
    if (e.target.id === 'card-modal') {
      e.target.classList.remove('show');
    }
  });

  // デッキ保存
  document.getElementById('save-deck').addEventListener('click', saveDeck);

  // デッキ読込
  document.getElementById('load-deck').addEventListener('click', () => {
    document.getElementById('deck-file-input').click();
  });

  document.getElementById('deck-file-input').addEventListener('change', loadDeck);

  // デッキクリア
  document.getElementById('clear-deck').addEventListener('click', () => {
    if (confirm('デッキをクリアしますか？')) {
      normalDeck = {};
      danmakuDeck = {};
      renderDeck(false);
      renderDeck(true);
      updateDeckCount();
    }
  });
}

// フィルターを適用
function applyFilters() {
  const type = document.getElementById('type-filter').value;
  const name = document.getElementById('name-filter').value;
  renderCardList({ type, name });
}

// デッキを保存
function saveDeck() {
  const normalCount = Object.values(normalDeck).reduce((sum, c) => sum + c, 0);
  const danmakuCount = Object.values(danmakuDeck).reduce((sum, c) => sum + c, 0);

  let warnings = [];
  if (normalCount < 40 || normalCount > 60) {
    warnings.push('通常デッキが' + normalCount + '枚です（40-60枚必要）');
  }
  if (danmakuCount !== 10) {
    warnings.push('弾幕デッキが' + danmakuCount + '枚です（10枚必要）');
  }

  if (warnings.length > 0 && !confirm(warnings.join('\n') + '\n\nこのまま保存しますか？')) {
    return;
  }

  const deckData = {
    version: 1,
    normalDeck: normalDeck,
    danmakuDeck: danmakuDeck,
    savedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(deckData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'deck_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// デッキを読み込む
function loadDeck(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const data = JSON.parse(event.target.result);
      normalDeck = data.normalDeck || {};
      danmakuDeck = data.danmakuDeck || {};
      renderDeck(false);
      renderDeck(true);
      updateDeckCount();
      alert('デッキを読み込みました');
    } catch (error) {
      alert('デッキファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
