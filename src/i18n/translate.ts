// 화면 번역: 게임 코드는 한국어 원문을 그대로 그리고, 영어 설정이면 화면에 그려진 글자를 사전으로 바꾼다.
// 사전 키는 한국어 원문, {0}{1}… 은 숫자·이름처럼 바뀌는 자리(값도 다시 번역). 바꿀 수 없는 글은 누락 목록에 모은다.
import { LANG } from './lang'
import { EN_DICTIONARY } from './dictionary'

const HANGUL = /[가-힣]/
const SEPARATORS = ['\n', ' — ', ' | ', ' · ', ': ', ', ', '/']
const norm = (text: string) => text.replace(/\s+/g, ' ').trim()

interface Pattern { re: RegExp; out: string; weight: number }
const exact = new Map<string, string>()
const patterns: Pattern[] = []
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function load(dictionary: Record<string, string>): void {
  for (const [key, value] of Object.entries(dictionary)) {
    const k = norm(key)
    if (!/\{\d+\}/.test(k)) { exact.set(k, value); continue }
    const parts = k.split(/(\{\d+\})/).filter(part => part !== '')
    // 자리가 붙어 있으면({0}{1}) 앞을 길게 잡는 틀을 먼저 본다(뒤 자리는 비어도 됨: 덧붙는 설명)
    const variants = /\}\{/.test(k) ? [true, false] : [false]
    for (const greedy of variants) {
      let source = '^'
      let weight = 0
      parts.forEach((part, index) => {
        const slot = /^\{\d+\}$/.test(part)
        if (!slot) { source += escapeRe(part); weight += part.length; return }
        const nextIsSlot = /^\{\d+\}$/.test(parts[index + 1] ?? '')
        const prevIsSlot = /^\{\d+\}$/.test(parts[index - 1] ?? '')
        source += greedy && nextIsSlot ? '(.+)' : greedy && prevIsSlot ? '(.*?)' : '(.+?)'
      })
      patterns.push({ re: new RegExp(`${source}$`), out: value, weight: weight + (greedy ? 0.5 : 0) })
    }
  }
  patterns.sort((a, b) => b.weight - a.weight)
}
load(EN_DICTIONARY)

/** 번역하지 못한 글(개발 확인용) */
export const missing = new Set<string>()
const cache = new Map<string, string>()

function viaPattern(body: string): string | null {
  for (const pattern of patterns) {
    const match = pattern.re.exec(body)
    if (!match) continue
    // 자리값도 번역돼야 맞는 짝: 한글이 남으면 우연히 걸린 것으로 보고 다음 틀을 본다
    const values = match.slice(1).map(value => translateCore(value, false))
    if (values.some(value => HANGUL.test(value))) continue
    return pattern.out.replace(/\{(\d+)\}/g, (_, index: string) => values[Number(index)] ?? '')
  }
  return null
}

function translateCore(text: string, record = true): string {
  if (!HANGUL.test(text)) return text
  const lead = text.match(/^\s*/)?.[0] ?? ''
  const trail = text.match(/\s*$/)?.[0] ?? ''
  const body = norm(text)
  const direct = exact.get(body) ?? viaPattern(body)
  if (direct !== null && direct !== undefined) return lead + direct + trail
  // 앞뒤 기호·숫자를 떼고 다시(예: "✦ 무장 모집", "보유 무장 →")
  const affix = /^([^가-힣]*?)([가-힣](?:.*[가-힣])?)([^가-힣]*)$/.exec(body)
  if (affix && (affix[1] || affix[3])) {
    const inner = exact.get(affix[2]) ?? viaPattern(affix[2])
    if (inner !== null && inner !== undefined) return lead + affix[1] + inner + affix[3] + trail
  }
  // 끝의 괄호 덧말: "… (3성에서 열림)"
  const paren = /^(.*\S) \(([^()]*)\)$/.exec(body)
  if (paren) {
    const head = translateCore(paren[1], false), note = translateCore(paren[2], false)
    if (!HANGUL.test(head) && !HANGUL.test(note)) return `${lead}${head} (${note})${trail}`
  }
  // 큰 구분자부터 하나씩 나눠 조각마다(조각은 다시 통째 → 더 작은 구분자 순)
  for (const separator of SEPARATORS) {
    if (!body.includes(separator)) continue
    const pieces = body.split(separator)
    return lead + pieces.map(piece => (piece.trim() ? translateCore(piece, record) : piece)).join(separator) + trail
  }
  if (affix && (affix[1] || affix[3])) {
    const inner = translateCore(affix[2], record)
    if (inner !== affix[2]) return lead + affix[1] + inner + affix[3] + trail
  }
  if (record) missing.add(body)
  return text
}

/** 언어 설정과 상관없이 영어로(시험·미리보기용) */
export const toEnglish = (text: string): string => translateCore(text, false)

/** 글 하나를 지금 언어로(한국어면 그대로) */
export function tr(text: string): string {
  if (LANG !== 'en' || !text || !HANGUL.test(text)) return text
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const result = translateCore(text)
  if (cache.size > 20000) cache.clear()
  cache.set(text, result)
  return result
}

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'] as const
const SKIP = 'SCRIPT,STYLE,TEXTAREA,INPUT,[data-no-tr],[contenteditable="true"]'

function skipped(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return Boolean(element?.closest(SKIP))
}

function translateText(node: Text): void {
  if (!HANGUL.test(node.data) || skipped(node)) return
  const next = tr(node.data)
  if (next !== node.data) node.data = next
}

function translateAttrs(element: Element): void {
  for (const name of ATTRS) {
    const value = element.getAttribute(name)
    if (value && HANGUL.test(value)) { const next = tr(value); if (next !== value) element.setAttribute(name, next) }
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
  if (root.nodeType === Node.ELEMENT_NODE) { if (skipped(root)) return; translateAttrs(root as Element) }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text)
    else translateAttrs(node as Element)
  }
}

/** 영어 설정이면 문서 전체와 이후 바뀌는 글을 계속 번역한다 */
export function startDomTranslation(): void {
  if (LANG !== 'en' || typeof document === 'undefined') return
  document.documentElement.lang = 'en'
  document.title = tr(document.title)
  translateTree(document.body)
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateText(mutation.target as Text)
      else if (mutation.type === 'attributes') translateAttrs(mutation.target as Element)
      else mutation.addedNodes.forEach(node => translateTree(node))
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
  const title = document.querySelector('title')
  if (title) new MutationObserver(() => { const next = tr(document.title); if (next !== document.title) document.title = next }).observe(title, { childList: true, characterData: true, subtree: true })
  ;(globalThis as unknown as { __i18nMissing?: Set<string> }).__i18nMissing = missing
}
