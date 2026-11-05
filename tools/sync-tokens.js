#!/usr/bin/env node
/**
 * 同步设计令牌到小程序端
 *
 * video/src/tokens.ts 是唯一真源（Single Source of Truth）。
 * 小程序端没有 DOM、没有 React，但可以用同一套令牌画出一致的图表。
 *
 * 产物：miniprogram/utils/tokens.json
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'video/src/tokens.ts')
const OUT = path.join(ROOT, 'miniprogram/utils/tokens.json')

const ts = fs.readFileSync(SRC, 'utf8')

/** 从 TS 源码里抠出对象字面量（够用即可，不引 TS 编译器） */
function pickObject(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
  const m = ts.match(re)
  if (!m) throw new Error(`没找到 ${name}`)
  return m[1]
}

/** 解析对象字面量里的简单键值对 */
function parsePairs(body) {
  const out = {}
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*('[^']*'|"[^"]*"|[-+]?[\d.]+)/g
  let m
  while ((m = re.exec(body))) {
    const key = m[1]
    const raw = m[2]
    let val = raw
    if (raw.startsWith("'") || raw.startsWith('"')) val = raw.slice(1, -1)
    else if (raw.includes('.')) val = parseFloat(raw)
    else val = parseInt(raw, 10)
    out[key] = val
  }
  return out
}

const colors = parsePairs(pickObject('colors'))
const geo = parsePairs(pickObject('geo'))
const seriesColors = (ts.match(/export const seriesColors\s*=\s*\[([\s\S]*?)\]/)?.[1] || '')
  .split(',')
  .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
  .filter(Boolean)

const timing = parsePairs(pickObject('timing'))

const tokens = {
  _comment: '由 tools/sync-tokens.js 从 video/src/tokens.ts 自动生成，请勿手改',
  _source: 'video/src/tokens.ts',
  colors,
  seriesColors,
  geo,
  timing,
  format: {
    yuanShort: 'export function yuanShort(n){if(!Number.isFinite(n))return "0";if(Math.abs(n)>=10000)return (n/10000).toFixed(1).replace(/\\.0$/,"")+"万";return String(Math.round(n))}',
    yuanLabel: 'export function yuanLabel(n){return "¥"+yuanShort(n)}',
    comma: 'export function comma(n){return Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g,",")}',
    pct: 'export function pct(part,total){if(!total)return "0%";return Math.round((part/total)*100)+"%"}'
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(tokens, null, 2), 'utf8')

console.log(`  ✓ tokens 已同步 → ${path.relative(ROOT, OUT)}`)
console.log(`    颜色 ${Object.keys(colors).length} 项 · 序列色 ${seriesColors.length} 项 · 几何 ${Object.keys(geo).length} 项`)
