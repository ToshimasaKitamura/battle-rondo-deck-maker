import { useState, useEffect, useMemo, useRef } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import KEYWORDS from './keywords'
import DANMAKU_KEYWORDS from './danmakuKeywords'
import cardKeywordsData from './cardKeywords.json'
import './App.css'

// SHA256ハッシュ生成
async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// 画像をfetchしてArrayBufferで返す
async function fetchImageAsBuffer(url) {
  const response = await fetch(url)
  return await response.arrayBuffer()
}

// ユドナリウム用XML生成
function generateUdonariumXML(cardHashes, backHash, deckName) {
  let cardsXML = ''
  cardHashes.forEach(hash => {
    cardsXML += `
    <card location.name="table" location.x="-5475" location.y="2750" posZ="0" state="1" rotate="0" owner="" zindex="0">
      <data name="card" type="undefined" currentValue="undefined">
        <data name="image" type="undefined" currentValue="undefined">
          <data name="imageIdentifier" type="image" currentValue="undefined"></data>
          <data name="front" type="image" currentValue="undefined">${hash}</data>
          <data name="back" type="image" currentValue="undefined">${backHash}</data>
        </data>
        <data name="common" type="undefined" currentValue="undefined">
          <data name="name" type="undefined" currentValue="undefined">1</data>
          <data name="size" type="undefined" currentValue="undefined">4</data>
        </data>
        <data name="detail" type="undefined" currentValue="undefined"></data>
      </data>
    </card>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<card-stack location.name="table" location.x="-5950" location.y="2475" posZ="0" rotate="0" zindex="182" owner="" isShowTotal="true">
  <data name="card-stack">
    <data name="image">
      <data type="image" name="imageIdentifier"></data>
    </data>
    <data name="common">
      <data name="name">${deckName}</data>
    </data>
    <data name="detail"></data>
  </data>
  <node name="cardRoot">${cardsXML}
  </node>
</card-stack>`
}

// CSVパース
function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') inQuotes = !inQuotes
    else if (char === ',' && !inQuotes) { values.push(current); current = '' }
    else current += char
  }
  values.push(current)
  return values
}

// カードデータ読込
async function loadCards() {
  const response = await fetch(import.meta.env.BASE_URL + 'data/cards.csv')
  const text = await response.text()
  const lines = text.trim().split('\n')
  const cards = []
  for (let i = 1; i < lines.length; i++) {
    const v = parseCSVLine(lines[i])
    if (v.length >= 9) {
      cards.push({
        id: v[0], type: v[1], name: v[2], text: v[3],
        cost: v[4], race: v[5], caster: v[6], attack: v[7], hp: v[8], set: (v[9] || '').trim()
      })
    }
  }
  return cards
}

// 画像パス
function getImagePath(id) {
  return `${import.meta.env.BASE_URL}data/images/${id}.jpg`
}

// カードアイテム
function CardItem({ card, onClick, onAdd, count }) {
  const [err, setErr] = useState(false)
  return (
    <div className="sv-card">
      <div className="sv-card-img" onClick={e => { e.stopPropagation(); onAdd(card) }}>
        {!err ? <img src={getImagePath(card.id)} alt="" onError={() => setErr(true)} />
          : <div className="sv-card-noimg">{card.name}</div>}
        {count > 0 && <div className="sv-card-badge">{count}</div>}
        <button className="sv-card-search" onClick={e => { e.stopPropagation(); onClick(card) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// デッキカード
function DeckCardItem({ card, count, onAdd, onRemove, onClick, onDelete }) {
  const [err, setErr] = useState(false)
  return (
    <div className="sv-deck-card" onClick={() => onClick(card)}>
      <div className="sv-deck-card-bg">
        {!err ? <img src={getImagePath(card.id)} alt="" onError={() => setErr(true)} />
          : <div className="sv-deck-noimg" />}
      </div>
      <div className="sv-deck-card-content">
        {card.type === '弾幕' ? (
          <span className={`sv-deck-card-cost ${card.name === '通常弾' ? 'danmaku-normal' : 'danmaku-special'}`}>
            {card.name === '通常弾' ? '通' : '特'}
          </span>
        ) : (
          <span className="sv-deck-card-cost">{card.cost}</span>
        )}
        <div className="sv-deck-card-info">
          <span className="sv-deck-card-name">{card.name}</span>
          <div className="sv-deck-card-ctrl">
            <button onClick={e => { e.stopPropagation(); onRemove(card) }}>−</button>
            <span className="sv-deck-card-count">{count}</span>
            <button onClick={e => { e.stopPropagation(); onAdd(card) }}>+</button>
          </div>
        </div>
        <button className="sv-deck-card-delete" onClick={e => { e.stopPropagation(); onDelete(card) }}>×</button>
      </div>
    </div>
  )
}

// コスト分布グラフ
function CostGraph({ deck, cards }) {
  const costs = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const counts = costs.map(c => {
    return Object.entries(deck).reduce((sum, [id, cnt]) => {
      const card = cards.find(x => x.id === id)
      const cardCost = parseInt(card?.cost) || 0
      return sum + (c === 8 ? (cardCost >= 8 ? cnt : 0) : (cardCost === c ? cnt : 0))
    }, 0)
  })
  const max = Math.max(...counts, 1)
  return (
    <div className="sv-cost-graph">
      {costs.map((c, i) => (
        <div key={c} className="sv-cost-bar-wrap">
          <div className="sv-cost-bar-container">
            <div className="sv-cost-bar" style={{ height: `${(counts[i] / max) * 100}%` }} />
          </div>
          <div className="sv-cost-label">{c === 8 ? '8+' : c}</div>
        </div>
      ))}
    </div>
  )
}

// カード詳細モーダル
function CardModal({ card, onClose, onAdd }) {
  const [err, setErr] = useState(false)
  if (!card) return null
  return (
    <div className="sv-modal-overlay" onClick={onClose}>
      <div className="sv-modal" onClick={e => e.stopPropagation()}>
        <button className="sv-modal-close" onClick={onClose}>×</button>
        <div className="sv-modal-body">
          <div className="sv-modal-img">
            {!err ? <img src={getImagePath(card.id)} alt="" onError={() => setErr(true)} />
              : <div className="sv-modal-noimg">{card.name}</div>}
          </div>
          <div className="sv-modal-info">
            <h2>{card.name}</h2>
            <div className="sv-modal-tags">
              <span className="tag-type">{card.type}</span>
              {card.race && <span className="tag-race">{card.race}</span>}
              {card.caster && <span className="tag-caster">術者: {card.caster}</span>}
              {(card.attack || card.hp) && <span className="tag-stats">{card.attack || 0}/{card.hp || 0}</span>}
            </div>
            <div className="sv-modal-text">{card.text}</div>
            <button className="sv-modal-add-btn" onClick={() => { onAdd(card); onClose() }}>デッキに追加</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// スマホ判定
function isMobile() {
  return window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function App() {
  const [cards, setCards] = useState([])
  const [normalDeck, setNormalDeck] = useState({})
  const [danmakuDeck, setDanmakuDeck] = useState({})
  const [activeTab, setActiveTab] = useState('normal') // カード一覧とデッキリストで共通
  const [modal, setModal] = useState(null)
  const [normalFilters, setNormalFilters] = useState({ search: '', type: '', cost: [], race: '', set: '', keyword: '', attack: '', attackOp: '>=', hp: '', hpOp: '>=' })
  const [danmakuFilters, setDanmakuFilters] = useState({ search: '', set: '', keyword: '', danmakuType: '' })
  const [filterOpen, setFilterOpen] = useState(true)
  const [viewMode, setViewMode] = useState('edit') // 'edit' or 'complete'
  const [deckName, setDeckName] = useState('')
  const deckViewRef = useRef(null)
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [mobileView, setMobileView] = useState('cards') // 'cards' or 'deck' - スマホ用表示切替

  useEffect(() => {
    setIsMobileDevice(isMobile())
    loadCards().then(setCards)
  }, [])

  // フィルター（カードタブに応じて弾幕/それ以外を分離）
  const filtered = useMemo(() => {
    return cards.filter(c => {
      // カードタブで弾幕とそれ以外を分離
      if (activeTab === 'normal' && c.type === '弾幕') return false
      if (activeTab === 'danmaku' && c.type !== '弾幕') return false

      if (activeTab === 'normal') {
        // 通常カード用フィルター
        if (normalFilters.set && c.set !== normalFilters.set) return false
        if (normalFilters.type && c.type !== normalFilters.type) return false
        if (normalFilters.search && !c.name.includes(normalFilters.search) && !c.id.includes(normalFilters.search) && !c.text?.includes(normalFilters.search)) return false
        if (normalFilters.cost.length > 0 && !normalFilters.cost.includes(c.cost)) return false
        if (normalFilters.race && c.race !== normalFilters.race) return false
        // キーワード能力を保有しているかチェック（cardKeywords.jsonを使用）
        if (normalFilters.keyword) {
          const cardKeywordInfo = cardKeywordsData[c.id]
          if (!cardKeywordInfo || !cardKeywordInfo.keywords.includes(normalFilters.keyword)) {
            return false
          }
        }
        // 攻撃力フィルター
        if (normalFilters.attack !== '') {
          const cardAtk = parseInt(c.attack) || 0
          const filterAtk = parseInt(normalFilters.attack)
          if (normalFilters.attackOp === '>=' && cardAtk < filterAtk) return false
          if (normalFilters.attackOp === '<=' && cardAtk > filterAtk) return false
        }
        // 体力フィルター
        if (normalFilters.hp !== '') {
          const cardHp = parseInt(c.hp) || 0
          const filterHp = parseInt(normalFilters.hp)
          if (normalFilters.hpOp === '>=' && cardHp < filterHp) return false
          if (normalFilters.hpOp === '<=' && cardHp > filterHp) return false
        }
      } else {
        // 弾幕カード用フィルター
        if (danmakuFilters.set && c.set !== danmakuFilters.set) return false
        if (danmakuFilters.search && !c.name.includes(danmakuFilters.search) && !c.id.includes(danmakuFilters.search) && !c.text?.includes(danmakuFilters.search)) return false
        // 弾幕タイプフィルター（通常弾幕/特殊弾幕）
        if (danmakuFilters.danmakuType) {
          const isNormalDanmaku = c.name === '通常弾' || c.name === '通常弾（低速）'
          if (danmakuFilters.danmakuType === 'normal' && !isNormalDanmaku) return false
          if (danmakuFilters.danmakuType === 'special' && isNormalDanmaku) return false
        }
        // 弾幕カードのキーワード能力チェック（テキスト先頭のキーワードで判定）
        if (danmakuFilters.keyword) {
          const text = c.text || ''
          const keyword = danmakuFilters.keyword
          // テキストの最初の部分（：や。の前）にキーワードが含まれているかチェック
          const firstPart = text.split(/[：。]/)[0]
          if (!firstPart.includes(keyword)) {
            return false
          }
        }
      }
      return true
    })
  }, [cards, normalFilters, danmakuFilters, activeTab])

  const races = useMemo(() => [...new Set(cards.map(c => c.race).filter(Boolean))].sort(), [cards])

  const normalCount = Object.values(normalDeck).reduce((s, c) => s + c, 0)
  const danmakuCount = Object.values(danmakuDeck).reduce((s, c) => s + c, 0)

  const addToDeck = (card) => {
    const isDanmaku = card.type === '弾幕'
    const deck = isDanmaku ? danmakuDeck : normalDeck
    const setDeck = isDanmaku ? setDanmakuDeck : setNormalDeck
    const maxPer = isDanmaku ? 2 : 4
    const isNormal = card.name === '通常弾' || card.name === '通常弾（低速）'
    const effMax = isNormal ? 99 : maxPer
    const curr = deck[card.id] || 0

    // 識別番号を取得（IDから「PR01」などのサフィックスを除いた部分）
    const getBaseId = (id) => id.replace(/PR\d+$/, '')
    const cardBaseId = getBaseId(card.id)

    // 同じ識別番号のカードの合計枚数チェック（プロモと通常版は同じ識別番号）
    const sameBaseIdCount = Object.entries(deck).reduce((sum, [id, cnt]) => {
      return getBaseId(id) === cardBaseId ? sum + cnt : sum
    }, 0)

    if (curr >= effMax) return
    if (!isNormal && sameBaseIdCount >= maxPer) return // 同じ識別番号のカード制限
    setDeck({ ...deck, [card.id]: curr + 1 })
  }

  const removeFromDeck = (card) => {
    const isDanmaku = card.type === '弾幕'
    const deck = isDanmaku ? danmakuDeck : normalDeck
    const setDeck = isDanmaku ? setDanmakuDeck : setNormalDeck
    if (!deck[card.id]) return
    const newDeck = { ...deck }
    newDeck[card.id]--
    if (newDeck[card.id] <= 0) delete newDeck[card.id]
    setDeck(newDeck)
  }

  const deleteFromDeck = (card) => {
    const isDanmaku = card.type === '弾幕'
    const deck = isDanmaku ? danmakuDeck : normalDeck
    const setDeck = isDanmaku ? setDanmakuDeck : setNormalDeck
    if (!deck[card.id]) return
    const newDeck = { ...deck }
    delete newDeck[card.id]
    setDeck(newDeck)
  }

  const getDeckCards = (deck) => Object.entries(deck)
    .map(([id, cnt]) => ({ card: cards.find(c => c.id === id), count: cnt }))
    .filter(x => x.card)
    .sort((a, b) => (parseInt(a.card.cost) || 0) - (parseInt(b.card.cost) || 0))

  const getCount = (id) => (normalDeck[id] || 0) + (danmakuDeck[id] || 0)

  const typeCounts = (deck) => {
    let chara = 0, spell = 0, action = 0, danmaku = 0
    Object.entries(deck).forEach(([id, cnt]) => {
      const c = cards.find(x => x.id === id)
      if (c?.type === 'キャラ') chara += cnt
      else if (c?.type === 'スペル') spell += cnt
      else if (c?.type === '行動') action += cnt
      else if (c?.type === '弾幕') danmaku += cnt
    })
    return { chara, spell, action, danmaku }
  }


  const clearDeck = () => {
    if (confirm('デッキをクリアしますか？')) {
      setNormalDeck({}); setDanmakuDeck({})
    }
  }

  const isDeckComplete = normalCount >= 40 && normalCount <= 60 && danmakuCount === 10

  const [isSaving, setIsSaving] = useState(false)

  const saveDeckAsImage = async () => {
    if (!deckViewRef.current) return
    try {
      setIsSaving(true)

      // スマホの場合、一時的にPC用スタイルを適用
      const targetEl = deckViewRef.current
      const wasMobile = isMobileDevice
      if (wasMobile) {
        targetEl.classList.add('sv-export-pc-mode')
      }

      // 少し待ってDOMが更新されるのを待つ
      await new Promise(resolve => setTimeout(resolve, 100))
      const canvas = await html2canvas(targetEl, {
        backgroundColor: '#1a1625',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 1200, // PC版の幅を固定
      })

      // スタイルを戻す
      if (wasMobile) {
        targetEl.classList.remove('sv-export-pc-mode')
      }

      const link = document.createElement('a')
      link.download = `deck_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('画像保存エラー:', err)
      alert('画像の保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const startNewDeck = () => {
    if (confirm('新しいデッキを作成しますか？現在のデッキはクリアされます。')) {
      setNormalDeck({})
      setDanmakuDeck({})
      setViewMode('edit')
    }
  }

  // ユドナリウム用ZIP出力
  const exportUdonarium = async (deckType) => {
    try {
      const isNormalDeck = deckType === 'normal'
      const deck = isNormalDeck ? normalDeck : danmakuDeck
      const backImageName = isNormalDeck ? 'normal_back.png' : 'danmaku_back.png'
      const backHashFixed = isNormalDeck
        ? '6ef1d99192259bd83611e5b07bfd8cb45bd68657e9a7c5779778e23dca7fd52a'
        : '799695ab48ad2b92ba1d6c05d4297780d519848d90adf1523f2d0704f27f8e92'
      const deckLabel = isNormalDeck ? '通常デッキ' : '弾幕デッキ'

      const zip = new JSZip()
      const cardHashes = []
      const addedImages = new Set()

      // 裏面画像を追加
      const backImageBuffer = await fetchImageAsBuffer(import.meta.env.BASE_URL + 'sleeves/' + backImageName)
      zip.file(backHashFixed + '.png', backImageBuffer)
      addedImages.add(backHashFixed)

      // 各カードを処理
      for (const [cardId, count] of Object.entries(deck)) {
        const imageUrl = getImagePath(cardId)
        const imageBuffer = await fetchImageAsBuffer(imageUrl)
        const hash = await sha256(imageBuffer)

        // 画像が未追加なら追加
        if (!addedImages.has(hash)) {
          zip.file(hash + '.jpg', imageBuffer)
          addedImages.add(hash)
        }

        // 枚数分ハッシュを追加
        for (let i = 0; i < count; i++) {
          cardHashes.push(hash)
        }
      }

      // XML生成
      const xmlContent = generateUdonariumXML(cardHashes, backHashFixed, deckName || deckLabel)
      zip.file('data.xml', xmlContent)

      // ZIPをダウンロード
      const blob = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
      link.download = `udonarium_${deckLabel}_${timestamp}.zip`
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      console.error('ユドナリウム出力エラー:', err)
      alert('ユドナリウムデータの出力に失敗しました')
    }
  }

  // デッキ完成画面用：ソートして枚数分展開
  const getExpandedDeckCards = (deck) => {
    const deckCards = getDeckCards(deck)
    // ソート: 枚数多い順 → コスト低い順 → ID若い順
    deckCards.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const costA = parseInt(a.card.cost) || 0
      const costB = parseInt(b.card.cost) || 0
      if (costA !== costB) return costA - costB
      return a.card.id.localeCompare(b.card.id)
    })
    // 枚数分展開
    const expanded = []
    deckCards.forEach(({ card, count }) => {
      for (let i = 0; i < count; i++) {
        expanded.push({ card, index: i })
      }
    })
    return expanded
  }

  const currentDeck = activeTab === 'normal' ? normalDeck : danmakuDeck
  const currentCount = activeTab === 'normal' ? normalCount : danmakuCount
  const counts = typeCounts(currentDeck)

  return (
    <div className={`sv-app ${isMobileDevice ? 'sv-mobile' : ''}`}>
      {/* ヘッダー */}
      <header className="sv-header">
        <div className="sv-header-inner">
          <div className="sv-logo">東方交戦輪舞曲 デッキメーカー</div>
        </div>
      </header>

      <main className="sv-main">
        {/* スマホ用：カード/デッキ切り替えタブ */}
        {isMobileDevice && (
          <div className="sv-mobile-nav">
            <button className={mobileView === 'cards' ? 'active' : ''} onClick={() => setMobileView('cards')}>
              カード一覧
            </button>
            <button className={mobileView === 'deck' ? 'active' : ''} onClick={() => setMobileView('deck')}>
              デッキ ({normalCount}, {danmakuCount})
            </button>
          </div>
        )}

        {/* 左：カード一覧 */}
        <section className={`sv-left ${isMobileDevice && mobileView !== 'cards' ? 'sv-hidden' : ''}`}>
          {/* カードタブ */}
          <div className="sv-card-tabs">
            <button className={activeTab === 'normal' ? 'active' : ''} onClick={() => setActiveTab('normal')}>
              通常カード
            </button>
            <button className={activeTab === 'danmaku' ? 'active' : ''} onClick={() => setActiveTab('danmaku')}>
              弾幕カード
            </button>
          </div>

          {/* フィルター（通常カードタブ） */}
          {activeTab === 'normal' && (
            <div className="sv-filter-section">
              <div className="sv-filter-header" onClick={() => setFilterOpen(!filterOpen)}>
                <span>絞り込み検索</span>
                <span className={`sv-filter-toggle ${filterOpen ? 'open' : ''}`}>▼</span>
              </div>
              {filterOpen && (
                <div className="sv-filter-body">
                  <div className="sv-filter-row">
                    <input
                      type="text"
                      placeholder="名前・テキスト・ID"
                      value={normalFilters.search}
                      onChange={e => setNormalFilters({ ...normalFilters, search: e.target.value })}
                    />
                    {normalFilters.search && <button className="sv-clear-btn" onClick={() => setNormalFilters({ ...normalFilters, search: '' })}>×</button>}
                  </div>
                  <div className="sv-filter-row">
                    <label>セット</label>
                    <div className="sv-filter-btns">
                      {['', 'スターター', '第一弾', '第二弾', 'プロモ'].map(s => (
                        <button key={s} className={normalFilters.set === s ? 'active' : ''} onClick={() => setNormalFilters({ ...normalFilters, set: s })}>
                          {s || '全て'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sv-filter-row">
                    <label>分類</label>
                    <div className="sv-filter-btns">
                      {['', 'キャラ', 'スペル', '行動'].map(t => (
                        <button key={t} className={normalFilters.type === t ? 'active' : ''} onClick={() => setNormalFilters({ ...normalFilters, type: t })}>
                          {t || '全て'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sv-filter-row">
                    <label>コスト</label>
                    <div className="sv-filter-btns cost">
                      <button className={normalFilters.cost.length === 0 ? 'active' : ''} onClick={() => setNormalFilters({ ...normalFilters, cost: [] })}>
                        全
                      </button>
                      {['0', '1', '2', '3', '4', '5', '6', '7', '8'].map(c => (
                        <button key={c} className={normalFilters.cost.includes(c) ? 'active' : ''} onClick={() => {
                          const newCost = normalFilters.cost.includes(c)
                            ? normalFilters.cost.filter(x => x !== c)
                            : [...normalFilters.cost, c]
                          setNormalFilters({ ...normalFilters, cost: newCost })
                        }}>
                          {c === '8' ? '8+' : c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sv-filter-row">
                    <label>種族</label>
                    <select value={normalFilters.race} onChange={e => setNormalFilters({ ...normalFilters, race: e.target.value })}>
                      <option value="">全て</option>
                      {races.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="sv-filter-row">
                    <label>キーワード</label>
                    <div className="sv-filter-btns">
                      <button className={normalFilters.keyword === '' ? 'active' : ''} onClick={() => setNormalFilters({ ...normalFilters, keyword: '' })}>
                        全て
                      </button>
                      {KEYWORDS.map(kw => (
                        <button key={kw} className={normalFilters.keyword === kw ? 'active' : ''} onClick={() => setNormalFilters({ ...normalFilters, keyword: kw })}>
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sv-filter-row sv-filter-stats">
                    <label>攻撃力</label>
                    <div className="sv-filter-stat-input">
                      <select value={normalFilters.attackOp} onChange={e => setNormalFilters({ ...normalFilters, attackOp: e.target.value })}>
                        <option value=">=">以上</option>
                        <option value="<=">以下</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={normalFilters.attack}
                        onChange={e => setNormalFilters({ ...normalFilters, attack: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="sv-filter-row sv-filter-stats">
                    <label>体力</label>
                    <div className="sv-filter-stat-input">
                      <select value={normalFilters.hpOp} onChange={e => setNormalFilters({ ...normalFilters, hpOp: e.target.value })}>
                        <option value=">=">以上</option>
                        <option value="<=">以下</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        placeholder="-"
                        value={normalFilters.hp}
                        onChange={e => setNormalFilters({ ...normalFilters, hp: e.target.value })}
                      />
                    </div>
                  </div>
                  <button className="sv-filter-reset" onClick={() => setNormalFilters({ search: '', type: '', cost: [], race: '', set: '', keyword: '', attack: '', attackOp: '>=', hp: '', hpOp: '>=' })}>
                    条件をリセット
                  </button>
                </div>
              )}
            </div>
          )}

          {/* フィルター（弾幕カードタブ） */}
          {activeTab === 'danmaku' && (
            <div className="sv-filter-section">
              <div className="sv-filter-header" onClick={() => setFilterOpen(!filterOpen)}>
                <span>絞り込み検索</span>
                <span className={`sv-filter-toggle ${filterOpen ? 'open' : ''}`}>▼</span>
              </div>
              {filterOpen && (
                <div className="sv-filter-body">
                  <div className="sv-filter-row">
                    <input
                      type="text"
                      placeholder="名前・テキスト・ID"
                      value={danmakuFilters.search}
                      onChange={e => setDanmakuFilters({ ...danmakuFilters, search: e.target.value })}
                    />
                    {danmakuFilters.search && <button className="sv-clear-btn" onClick={() => setDanmakuFilters({ ...danmakuFilters, search: '' })}>×</button>}
                  </div>
                  <div className="sv-filter-row">
                    <label>弾幕タイプ</label>
                    <div className="sv-filter-btns">
                      <button className={danmakuFilters.danmakuType === '' ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, danmakuType: '' })}>
                        全て
                      </button>
                      <button className={danmakuFilters.danmakuType === 'normal' ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, danmakuType: 'normal' })}>
                        通常弾幕
                      </button>
                      <button className={danmakuFilters.danmakuType === 'special' ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, danmakuType: 'special' })}>
                        特殊弾幕
                      </button>
                    </div>
                  </div>
                  <div className="sv-filter-row">
                    <label>セット</label>
                    <div className="sv-filter-btns">
                      {['', 'スターター', '第一弾', '第二弾', 'プロモ'].map(s => (
                        <button key={s} className={danmakuFilters.set === s ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, set: s })}>
                          {s || '全て'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sv-filter-row">
                    <label>キーワード</label>
                    <div className="sv-filter-btns sv-filter-btns-wrap">
                      <button className={danmakuFilters.keyword === '' ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, keyword: '' })}>
                        全て
                      </button>
                      {DANMAKU_KEYWORDS.map(kw => (
                        <button key={kw} className={danmakuFilters.keyword === kw ? 'active' : ''} onClick={() => setDanmakuFilters({ ...danmakuFilters, keyword: kw })}>
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="sv-filter-reset" onClick={() => setDanmakuFilters({ search: '', set: '', keyword: '', danmakuType: '' })}>
                    条件をリセット
                  </button>
                </div>
              )}
            </div>
          )}

          {/* カード一覧 */}
          <div className="sv-cards-section">
            <div className="sv-cards-header">
              <span>{activeTab === 'normal' ? '通常カード一覧' : '弾幕カード一覧'}</span>
              <span className="sv-cards-count">{filtered.length}件</span>
            </div>
            <div className="sv-cards-grid">
              {filtered.map(card => (
                <CardItem key={card.id} card={card} onClick={setModal} onAdd={addToDeck} count={getCount(card.id)} />
              ))}
            </div>
          </div>
        </section>

        {/* 右：デッキ */}
        <aside className={`sv-right ${isMobileDevice && mobileView !== 'deck' ? 'sv-hidden' : ''}`}>
          <div className="sv-deck-tabs">
            <button className={activeTab === 'normal' ? 'active' : ''} onClick={() => setActiveTab('normal')}>
              通常デッキ <span>{normalCount}/60</span>
            </button>
            <button className={activeTab === 'danmaku' ? 'active' : ''} onClick={() => setActiveTab('danmaku')}>
              弾幕デッキ <span>{danmakuCount}/10</span>
            </button>
          </div>

          <div className="sv-deck-stats">
            <div className="sv-deck-count">
              <span className={`sv-deck-count-num ${
                (activeTab === 'normal' && currentCount > 60) || (activeTab === 'danmaku' && currentCount > 10)
                  ? 'sv-deck-over'
                  : (activeTab === 'normal' && currentCount >= 40 && currentCount <= 60) || (activeTab === 'danmaku' && currentCount === 10)
                    ? 'sv-deck-valid'
                    : ''
              }`}>{currentCount}</span>
              <span className="sv-deck-count-max">枚 ({activeTab === 'normal' ? '40〜60' : '10'})</span>
            </div>
            {activeTab === 'normal' && (
              <>
                <CostGraph deck={currentDeck} cards={cards} />
                <div className="sv-deck-types">
                  <span>キャラ: {counts.chara}</span>
                  <span>スペル: {counts.spell}</span>
                  <span>行動: {counts.action}</span>
                </div>
              </>
            )}
          </div>

          <div className="sv-deck-list">
            {getDeckCards(currentDeck).length === 0 ? (
              <div className="sv-deck-empty">カード一覧から追加したいカードをクリックしてください</div>
            ) : (
              getDeckCards(currentDeck).map(({ card, count }) => (
                <DeckCardItem key={card.id} card={card} count={count} onAdd={addToDeck} onRemove={removeFromDeck} onClick={setModal} onDelete={deleteFromDeck} />
              ))
            )}
          </div>

          <div className="sv-deck-actions">
            <button onClick={clearDeck}>クリア</button>
            <button
              className={`sv-deck-complete-btn ${isDeckComplete ? 'active' : ''}`}
              onClick={() => isDeckComplete && setViewMode('complete')}
              disabled={!isDeckComplete}
            >
              デッキ完成
            </button>
          </div>
        </aside>
      </main>

      {modal && <CardModal card={modal} onClose={() => setModal(null)} onAdd={addToDeck} />}

      {/* デッキ完成画面 */}
      {viewMode === 'complete' && (
        <div className="sv-complete-overlay">
          <div className="sv-complete-container">
            <div className="sv-complete-deck" ref={deckViewRef}>
              <div className="sv-complete-header">
                {isSaving ? (
                  <div className="sv-deck-name-display">{deckName || 'マイデッキ'}</div>
                ) : (
                  <input
                    type="text"
                    className="sv-deck-name-input"
                    value={deckName}
                    onChange={e => setDeckName(e.target.value)}
                    placeholder="デッキ名を入力"
                  />
                )}
              </div>

              <div className="sv-complete-section">
                <h3>通常デッキ ({normalCount}枚)</h3>
                <div className="sv-complete-cards">
                  {getExpandedDeckCards(normalDeck).map(({ card, index }) => (
                    <div key={`${card.id}-${index}`} className="sv-complete-card">
                      <img src={getImagePath(card.id)} alt={card.name} onError={e => e.target.style.display = 'none'} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="sv-complete-section">
                <h3>弾幕デッキ ({danmakuCount}枚)</h3>
                <div className="sv-complete-cards">
                  {getExpandedDeckCards(danmakuDeck).map(({ card, index }) => (
                    <div key={`${card.id}-${index}`} className="sv-complete-card">
                      <img src={getImagePath(card.id)} alt={card.name} onError={e => e.target.style.display = 'none'} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sv-complete-actions">
              <button onClick={saveDeckAsImage} className="sv-complete-save-btn">
                画像として保存
              </button>
              <button onClick={() => exportUdonarium('normal')} className="sv-complete-udonarium-btn">
                通常デッキ（ユドナリウム）
              </button>
              <button onClick={() => exportUdonarium('danmaku')} className="sv-complete-udonarium-btn">
                弾幕デッキ（ユドナリウム）
              </button>
              <button onClick={() => setViewMode('edit')} className="sv-complete-edit-btn">
                デッキ編集に戻る
              </button>
              <button onClick={startNewDeck} className="sv-complete-new-btn">
                新しくデッキを作る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
