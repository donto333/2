// 레이드 도전 1회의 진행: 1군 → 2군 → 3군을 차례로 싸우고 군별 피해를 모은다.
// (화면·서버와 떼어 둔 순수한 진행 기록이라 테스트로 순서를 확인할 수 있다)
export const SQUAD_NAMES = ['1군', '2군', '3군']

export interface RaidStep { done: boolean; finished: { index: number; label: string; damage: number }; next: { index: number; label: string; ids: string[] } | null; total: number }

export class RaidRunner {
  readonly squads: string[][]
  readonly damages: number[] = []
  index = 0

  /** squads: 1·2·3군(빈 군은 넣지 않는다). 군마다 원래 번호를 함께 기억한다 */
  constructor(squads: Array<{ index: number; ids: string[] }>) {
    this.entries = squads.filter(squad => squad.ids.length).slice(0, 3)
    this.squads = this.entries.map(entry => [...entry.ids])
  }

  private readonly entries: Array<{ index: number; ids: string[] }>

  get count(): number { return this.squads.length }
  /** 지금 싸울 군의 무장 id */
  get currentIds(): string[] { return this.squads[this.index] ?? [] }
  /** 지금 싸울 군 이름(1군·2군·3군) */
  get currentLabel(): string { return SQUAD_NAMES[this.entries[this.index]?.index ?? 0] }
  get total(): number { return this.damages.reduce((sum, value) => sum + value, 0) }
  get finished(): boolean { return this.index >= this.count }

  /** 한 군의 전투가 끝났다: 피해를 기록하고 다음 군으로 넘어간다 */
  record(damage: number): RaidStep {
    const value = Math.max(0, Math.round(Number(damage) || 0))
    const finished = { index: this.index, label: this.currentLabel, damage: value }
    this.damages.push(value)
    this.index += 1
    const next = this.finished ? null : { index: this.index, label: this.currentLabel, ids: this.currentIds }
    return { done: this.finished, finished, next, total: this.total }
  }

  /** 군별 피해 요약(1군 12,345 · 2군 ...) */
  summary(): string {
    return this.damages.map((value, index) => `${SQUAD_NAMES[this.entries[index]?.index ?? index]} ${value.toLocaleString('ko-KR')}`).join(' · ')
  }
}
