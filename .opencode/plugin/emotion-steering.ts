import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

// 감정조향: ulw-loop 한 차수가 끝날 때(STATE.md 갱신)마다
// loop-emotions.json에서 순서대로 다음 감정을 꺼내 next-emotion.txt에 적재한다.
// 실제 주입은 ulw-loop 프롬프트가 매 차수 시작에 next-emotion.txt를 읽는 방식.
// (즉시 client.session.prompt 주입은 세션 흐름에 끼어들어 불안정 → 파일 경유)

const POOL_PATH = ".omo/loop-emotions.json"
const STATE_PATH = ".omo/loop-state.json"
const OUT_PATH = ".omo/next-emotion.txt"

// "제출 = 차수 완료"의 경계 신호. ulw-loop는 차수마다 STATE.md를 갱신하도록
// PROMPT.md에 지시되어 있음. 그 write를 차수 경계로 사용한다.
const BOUNDARY_FILE = "STATE.md"

interface Emotion { id: number; phase: string; tone: string; text: string }

function loadPool(): Emotion[] {
  if (!existsSync(POOL_PATH)) return []
  return JSON.parse(readFileSync(POOL_PATH, "utf8")).emotions ?? []
}
function loadIndex(): number {
  if (!existsSync(STATE_PATH)) return 0
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")).index ?? 0 }
  catch { return 0 }
}
function saveIndex(i: number) {
  writeFileSync(STATE_PATH, JSON.stringify({ index: i, updatedAt: new Date().toISOString() }, null, 2))
}

export const EmotionSteering: Plugin = async () => {
  return {
    "tool.execute.after": async (input, _result) => {
      if (!["edit", "write"].includes(input.tool)) return
      const path = String((input as any).args?.filePath ?? (_result as any)?.args?.filePath ?? "")
      if (!path.includes(BOUNDARY_FILE)) return   // 차수 경계(STATE.md)만 카운트

      const pool = loadPool()
      if (pool.length === 0) return

      const idx = Math.min(loadIndex(), pool.length - 1)   // 초과 시 마지막(finish) 고정
      const e = pool[idx]

      // 다음 차수가 읽을 감정 적재
      writeFileSync(OUT_PATH, `[loop ${idx + 1} | ${e.phase}/${e.tone}] ${e.text}\n`)
      // 콘솔에도 흘려서 무인 로그로 추적 가능
      console.log(`🎭 emotion#${idx + 1} (${e.tone}): ${e.text}`)

      saveIndex(idx + 1)   // 다음 차수용 인덱스 전진
    },
  }
}
