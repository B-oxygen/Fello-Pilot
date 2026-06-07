# Ralphathon — Retrospective #1

Source: prior Ralphathon session (pre-FelloPilot `src/`). 24 fail/rework events across 11 categories with proposed harness checks, priorities, and target file layout. This document is the immutable input for the harness checks under `scripts/harness/` and the rules under `.omo/rules/`. Do NOT delete or summarize — the next session reads this file end-to-end before starting work.

---

## A. Spec/Doc drift (3건) — 사양과 코드의 진실이 어긋남

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| A1 | 첫 세션 summary가 "ggui 완전 제거"라 주장했으나 6개 파일에 잔재 (.env, .env.example, CLAUDE.md, HANDOFF.md, 2개 subagent specs) | 자가 grep으로 검증 안 함 | 금기 문구 grep gate: `judge \| harness \| ggui \| (deprecated names)` 0건 enforced at pre-commit + CI |
| A2 | `.claude/agents/ui-builder.md` Step 7이 Phase 3 pivot 후에도 Judge Score로 남아 있음 | subagent spec이 source-of-truth 아님 | Spec vs UI 일관성 check: ui-builder spec의 step 목록 ↔ `app/page.tsx` `<StepTitle step="STEP N"` 매칭 |
| A3 | README state machine 표기가 `none → pending`인데 enum은 `wallet_connected`로 변경됨 (Oracle 발견) | type 변경 시 doc 동시 업데이트 누락 | Type-doc 동기화 check: 핵심 enum 값을 doc에서 자동 grep → AST와 diff |

## B. Blast-radius 오산 (1건) — 변경 파급 누락

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| B1 | T2가 `DelegationStatus` enum에서 `"pending"` 제거 시 `src/core/delegation.ts`의 literal `"pending"` 2곳을 plan agent가 놓침 → T2 agent가 collateral 수정 | blast-radius 분석이 type-level만 보고 string literal narrowing 안 봄 | 변경 전 blast-radius 강제: 임의 string union 변경 시 `grep -n '"removed_value"' src/ app/` 자동 실행 + 결과를 agent prompt에 inject |

## C. Determinism 위반 (1건) — pure function이 pure 아님

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| C1 | `buildDelegationIntent`가 `expiry = Date.now() + N`로 호출 시점마다 다른 hash 생성 → 클라이언트 hash ≠ 서버 hash → 모든 브라우저 서명 fail | T5 smoke test는 빠른 chained call로 같은 second 안에서 통과해서 버그 숨김 | Property test: 핵심 build/hash 함수 `f(x)` 두 번 호출 → `assert(f(x).hash === f(x).hash)` after 1s delay. CI에서 강제 |

## D. State isolation 부재 (2건) — 테스트가 서로 오염

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| D1 | `demo_safe.sh`와 `demo_blocked.sh`를 병렬 실행하니 `data/risk_report.json`을 서로 덮어쓰며 demo_safe가 delegation:rejected 받음 | 두 스크립트가 같은 `data/*.json` 공유 | Per-test data dir: demo 스크립트는 `data/test-$(uuidgen)/` 사용, 또는 mutex lock |
| D2 | 테스트 간 `printf 'null\n' > data/*.json` 수동 reset 필요 | reset hook 없음 | Setup/teardown hook: 데모 entry/exit에 자동 reset (`data/*.json → null`) |

## E. Honesty rule enforcement (2건) — 가짜를 진짜처럼 보이게 하는 유혹

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| E1 | Oracle이 `app/page.tsx`에서 `<details>Raw receipt JSON</details>` 발견 → product/harness boundary 위반 | UI에 debug surface 누출 | 금기 element grep: `<details>` + `JSON.stringify` 조합을 product 페이지에서 금지 (harness/* 제외) |
| E2 | 위험: mock adapter가 fake `0x...` txHash 만들고 가짜 explorer link 거는 패턴 | "더 실감나게 보이도록" 유혹 | Mock contract test: `executeMock()` 결과의 `txHash === undefined && explorerUrl === undefined && simulated === true` 강제 |

## F. Provider capability matrix 미검증 (2건) — 외부 서비스 한계

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| F1 | CoinFello가 Base Sepolia swap route 미지원 ("isn't supported by this route") — 셋업 완료 후 마지막 단계에서 발견 | external provider capability matrix를 사전 검증 안 함 | Capability matrix CI: 각 provider × action × chain 조합을 README/SPEC에 매트릭스로 저장 + `--cli-help` 자동 파싱해서 supported chain 비교 |
| F2 | CoinFello default RPC `eth.merkle.io` Cloudflare 429 rate-limit (sign_in 막힘) | 외부 RPC 의존성 사전 확인 안 함 | Pre-flight check script: `scripts/preflight.sh` — 모든 외부 의존(RPC, CLI, API) ping + status 표시. demo 시작 전 자동 실행 |

## G. Environment hygiene (3건) — stale 프로세스/캐시

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| G1 | npm package의 `secure-enclave-signer` 바이너리 `chmod +x` 안 되어 있어 EACCES | `npm install` 후 perm 검증 누락 | Post-install verify: `find node_modules -name "*.app/Contents/MacOS/*" -not -perm +x` 0건 enforced |
| G2 | `npm run build` 후 dev server 재시작 시 `.next` 캐시 충돌 (app router 프로젝트가 pages router artifact 시도) | build와 dev가 같은 `.next` 공유 | Mode switch hook: `npm run dev` 진입 시 last-mode marker 비교 → 다르면 `.next` 자동 rm |
| G3 | 이전 세션의 next-server (PID 88535, 3:42AM부터)가 port 3000 점유 중 → 테스트 환경 오염 | demo 시작 전 stale process kill 안 함 | **`scripts/preflight.sh`**에 `pkill -f next-server` + `lsof :3000` 확인 포함 |

## H. Layered gate 일관성 (3건) — 같은 정책이 layer마다 다르게 enforce

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| H1 | Oracle: public API가 `cli_mock` signatureMethod 허용 → 외부 공격자가 위조 가능 | API enum과 core 함수 enum이 분리됨, defense-in-depth 누락 | Cross-layer enum match: API route의 허용 enum이 core 함수가 거부하는 값과 disjoint한지 type-level assert |
| H2 | Oracle: live mode에서 `cli_mock` 우회 가능 (defense-in-depth 누락) | 위와 동일 | (위와 통합) |
| H3 | Oracle: `submitSignature`가 `args.eoaAddress === existing.approver` 체크 누락 → state inconsistency 가능 | state machine invariant 미문서화 | State invariant test: 모든 status transition에 대해 invariant assert (e.g., `approved → signature must be present && approver matches`) |

## I. Boundary violation (1건) — 제품/harness 경계

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| I1 | Oracle: Raw receipt JSON이 product page에 노출됨 (이미 E1로 잡힘) | 동일 | (E1 통합) |

## J. Background-work observability (2건) — agent fan-out 시 blind spot

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| J1 | T5 (ultrabrain) 7m 57s 무신호 → orchestrator가 12 ralph cycle 동안 polling 거부 + 추측만 함 | background task가 mid-flight progress 없음 | Heartbeat protocol: 30s마다 agent가 `progress.json`에 phase + 100자 status 적기, orchestrator는 그것만 읽음 (`background_output` 폴링 안 함) |
| J2 | 14개 task fan-out으로 plan agent 단독 7m 18s → 가시성 0 | plan agent도 똑같이 long-running silent | Plan 산출 limit: 5개 wave max, wave당 3 task max, plan agent 자체에 streaming output 강제 |

## K. Adapter contract assumption (2건) — 외부 응답 형태 가정

| # | 사건 | 원인 | Harness 검사 |
|---|---|---|---|
| K1 | `getWallet()`가 CoinFello CLI stdout을 `JSON.parse` 시도 → CLI는 `0x...\n⚠️ Only fund...` 일반 텍스트 출력 → `smartAccountAddress: null` 잘못 표시 | adapter가 external 응답 형태를 추측 | Adapter fixture tests: 각 외부 CLI/API 응답을 fixture로 저장 (`fixtures/coinfello/get_account.real.txt`) → 파서 unit test enforced |
| K2 | `executeViaCoinFello`가 `send_prompt` 호출 전제 — 원래 manual CLI 스크립트 (`coinfello_send_prompt.sh`)로 채우는 줄 모름 → browser flow에서 fail | 외부 CLI의 prerequisite를 코드가 보장 안 함 | Sequence contract: CLI prerequisite를 명시적으로 wrapping (`runApproveDelegationRequest` 호출 전 `ensurePendingDelegation` 자동 호출) |

---

## 🛠 권장 harness 구조 (Ralphathon 적용용)

```
scripts/harness/
  preflight.sh           # F2, G3 — port/RPC/CLI 상태 확인 + stale process kill
  postinstall_verify.sh  # G1 — binary perm/quarantine 검사
  reset_state.sh         # D2 — data/*.json reset (setup/teardown)
  capability_matrix.json # F1 — provider × action × chain 명시
  forbidden_grep.sh      # A1, E1 — 금기 문구/element CI gate
  spec_diff.sh           # A2 — subagent spec vs product surface
  doc_type_sync.sh       # A3 — enum literal이 README에도 반영
  blast_radius.sh        # B1 — enum 값 변경 시 grep impact
  determinism_check.ts   # C1 — pure function 호출 반복 → 동일성
  layered_gate_test.ts   # H — 모든 enum/policy의 layer 일관성
  honesty_lint.sh        # E — fake hash/explorer URL 패턴 금지
  adapter_fixtures/      # K — 외부 CLI 응답 고정 + parser test
  heartbeat.sh           # J — background agent 30s heartbeat
```

## 🎯 우선순위 (Ralphathon 다음 회차 ROI)

| 등급 | 항목 | 이유 |
|---|---|---|
| **P0** | F1 (capability matrix), C1 (determinism), F2 (preflight RPC), G3 (stale process) | 데모 막판에 발견되면 즉사 |
| **P1** | A1/A2/A3 (drift), E1/E2 (honesty), B1 (blast radius) | 결과물 신뢰도 직접 영향 |
| **P2** | D1/D2 (state isolation), G1/G2 (env hygiene), H (gate consistency) | 디버깅 시간 폭증 방지 |
| **P3** | J1/J2 (observability), K1/K2 (adapter contract) | 장기 개발 효율 |

이 매핑을 `.claude/RALPH_HARNESS.md` 같은 곳에 박아두고 다음 Ralphathon 시작 전 `bash scripts/harness/preflight.sh` 한 줄로 P0/P1 9건을 사전 차단하면 이번 세션 같은 "막판에 CoinFello가 Base Sepolia 안 된다는 거 발견" 류 사고 방지됨.

---

## Implementation status in this harness (응답 #4 setup)

| 회고 ID | 박힌 위치 | 활성 여부 |
|---|---|---|
| A1 | `scripts/harness/forbidden_grep.sh` + (token list `.omo/rules/forbidden-tokens.txt` 미작성) | ⏳ token list 필요 |
| A2, A3 | 자리표시자 (`spec_diff.sh`, `doc_type_sync.sh` 미생성) | ⏳ src/ 후 |
| B1 | `scripts/harness/blast_radius.sh` | ✅ 즉시 |
| C1 | 자리표시자 (`determinism_check.ts` 미생성) | ⏳ src/ 후 |
| D1, D2 | `scripts/harness/reset_state.sh` | ✅ 즉시 |
| E1, E2 | 정책: `.omo/rules/crypto-safety.md` (E2 일부). enforce: `scripts/harness/honesty_lint.sh` | ✅ 즉시 (정책 일부) |
| F1 | `scripts/harness/capability_matrix.json` (Base Sepolia 미지원 박힘, RPC URL TBD) | ✅ 부분 (URL 미입력) |
| F2, G2, G3 | `scripts/harness/preflight.sh` | ✅ 즉시 (사용자 환경에서 lsof/jq/curl 필요) |
| G1 | `scripts/harness/postinstall_verify.sh` | ✅ 즉시 |
| H1, H2, H3 | 자리표시자 (`layered_gate_test.ts` 미생성) | ⏳ src/ 후 |
| I1 | E1 통합 | ✅ |
| J1, J2 | `.omo/rules/observability.md` (정책) + `PROMPT.md` (절차) | ✅ |
| K1 | `scripts/harness/adapter_fixtures/README.md` | ✅ skeleton |
| K2 | 자리표시자 | ⏳ src/ 후 |
