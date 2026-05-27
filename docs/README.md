# RESPACE 인사이트 생성기 — System 06 v2
> 2026-05-27 시스템 재정비

`respace-two.vercel.app/insight` 페이지를 리스페이스·글로업 공동 검토한 3개 기초 문서를 기준으로 재구축한 버전.

---

## 무엇이 바뀌었나

### v1 → v2 (2026-05-27 단계화 + max_tokens 재산정)
| 영역 | v1 (한 번 호출) | v2 (3단계 분할) |
|---|---|---|
| 호출 방식 | 한 번에 7섹션 생성 | STEP 1·2·3 명시적 클릭 분할 |
| max_tokens | 10000 (한 번) | **6000 / 6000 / 4500** (시뮬 검증 반영) |
| 타임아웃 위험 | 응답 5,000~8,000자 → 네트워크 끊김 위험 ↑ | 각 단계 1,500~3,500자 → 안정성 ↑ |
| 부분 실패 처리 | 실패 시 전체 재시도 | 실패한 단계만 재시도 가능 |
| 이상 매체 0개 | 무조건 빈 섹션 4 생성 | STEP 2 자동 SKIP (LLM 호출 안 함) |
| 사용자 통제력 | 결과 한 번에 받음 | STEP 1 검토 후 다음 진행 결정 가능 |
| 잘림 감지 | 없음 | `stop_reason="max_tokens"` 캡처 → 명확한 에러 |

### max_tokens 시뮬레이션 (2026-05-27)
실제 LLM 응답으로 예상되는 분량을 사전 시뮬레이션하여 각 step의 한도를 산정.

| Mode | 시뮬 응답 글자수 | 추정 토큰 (×1.2배) | max_tokens | 여유 배수 |
|---|---|---|---|---|
| STEP 1 | 2,901자 | ~3,480 토큰 | **6,000** | 1.7배 |
| **STEP 2-channel** (매체별, 신규) | 1,369자/매체 | ~1,640 토큰 | **3,500** | 2.1배 |
| STEP 2 (구버전, deprecated) | 매체 2~3개 합산 | ~3,240~4,800 토큰 | 6,000 | 잘림 위험 |
| STEP 3 | 1,378자 | ~1,650 토큰 | **4,500** | 2.7배 |
| refine-section | 가장 무거운 딥다이브 1,359자 | ~1,631 토큰 | **3,500** | 2.1배 |
| refine | (전체 entry) | ~6,000~8,000 토큰 | **10,000** | 1.3배 |

### STEP 2 매체별 분할 효과 (2026-05-27 추가)
| 이상 매체 수 | 구버전 (한 번에) | 신규 (매체별 N번 호출) | 비교 |
|---|---|---|---|
| 1개 | ~15초 / 1,631 토큰 | ~10~15초 / 1,631 토큰 | 동일 |
| 2개 | ~25~40초 / ~3,240 토큰 | ~10~15초 × 2 / 1,631 토큰/회 | **호출당 부담 50%↓** |
| 3개 | ~35~50초 ⚠ / ~4,800 토큰 | ~10~15초 × 3 / 1,631 토큰/회 | **잘림 위험 제거** |

- 매체별 응답 즉시 표시 — 전체 대기 없음
- 매체별 실패 시 해당 매체만 재시도 / 건너뛰기 가능
- 4-a (Google) / 4-b (Naver) 등 서브 알파벳은 클라이언트가 자동 부여

> 한국어 + JSON + HTML escape 환경에서 글자수 × 1.2배로 토큰 보수 추정.
> 초기 v2(3500)는 STEP 1의 실제 응답이 한계 근접이라 사용자 환경에서 잘림 발생 → 6000으로 상향.

### System 05 v2 → 06 (전체 재구축)
| 영역 | 05 v2 | 06 |
|---|---|---|
| 분석 KPI | 매체별·지표별 혼재 (KPI 6개 평평) | **PRIMARY = CPL** 단일 기준 |
| 분석 흐름 | 7개 섹션 무조건 출력 | LEVEL 0 → 1 → (이상 시) 2~5 → 6 → 액션 → 다음 주 체크 |
| 이상 감지 | 없음 | ±20% 트리거 → 이상 매체만 딥다이브 |
| 원인 분석 | 단정·추측 혼재 | **[확인됨] / [추정]** 명확 구분 |
| 액션 | "Solution" 1줄 | **[즉시] / [검증 후] / [중장기]** 3분류 |

---

## 사용 흐름 (v2)

```
1. 데이터 수집 (Google Sheets gviz, 5개 시트)
2. 클라이언트 사전 계산 — CPL / 변화율 / 이상 매체 감지
3. 인사이트 분석 (단계별 클릭)
   ┌─ STEP 1 ─────────────────────────────────
   │  · 한 줄 요약 + KPI 6개 + LEVEL 0 + LEVEL 1
   │  · max_tokens 6000 / 약 2,900자 응답
   │  └ 사용자가 KPI strip + 매체 카드 검토
   ├─ STEP 2 (매체별 분할) ───────────────────
   │  · 이상 매체 N개면 N번 호출 — 1번에 1매체만
   │  · 매체별 max_tokens 3500, 각 ~10~15초
   │  · **CPL 변동률 큰 순 자동 정렬** — 중요한 매체부터 검토
   │  · 진행 인디케이터: "STEP 2 · 딥다이브 (1/2)"
   │  · 이상 매체 0개면 → STEP 3로 건너뛰기 자동 표시
   │  └ 한 매체 끝나면 다음 매체 버튼 노출 (검토 가능)
   │  ⚠ 한계: 매체 26개 초과 시 알파벳 한계 (현재 매체 3개라 무관)
   ├─ STEP 3 ─────────────────────────────────
   │  · LEVEL 6 외부 요인 + 액션 아이템 + 다음 주 체크
   │  · max_tokens 4500
   │  └ 액션 [즉시]/[검증 후]/[중장기] 3분류 + 체크포인트
   └─ 완료 후 피드백 · 대시보드 반영 활성화
4. 피드백 (필요 시) — 2가지 방식
   ├ 섹션별 refine: 각 카드의 "✏ 이 섹션 피드백" — 해당 섹션만 재생성 (토큰 70~90% 절감)
   └ 전체 refine: 우측 패널의 피드백 입력란 — 모든 섹션·KPI·요약 재생성 (큰 변경·톤 조정용)
5. 대시보드(WEEKLY_REPORTS)에 자동 반영
```

### 섹션별 refine 효과 (2026-05-27 추가)
| 비교 | 전체 refine | 섹션별 refine |
|---|---|---|
| 응답 토큰 | ~7,200 토큰 | ~600~1,800 토큰 |
| 절감률 | 기준 | **70~90% 절감** |
| 응답 시간 | 30~60초 | ~10~20초 (60~70% 단축) |
| 다른 섹션 영향 | 의도와 무관하게 변경 가능 | 보존 (해당 섹션만 교체) |
| 사용 케이스 | 톤 변경·여러 섹션 동시 수정 | 한 섹션의 표현·수치·구조 수정 |

각 단계 실패 시 **해당 단계만 재시도** 가능 (전체 재실행 불필요).

---

## 대시보드 CSS 의존성 (중요)

인사이트 엔진이 생성하는 HTML은 다음 CSS 클래스에 **반드시** 의존:

| 클래스 | 정의 위치 | 용도 |
|---|---|---|
| `.weekly-summary-card` | dashboard 608줄 | 일반 강조 카드 |
| `.weekly-summary-card-highlight` | dashboard 616줄 | **빨간 좌측 border** — 한 줄 요약·통합 총평 |
| `.weekly-table` | dashboard 621줄 | 수치 비교 표 |
| `.delta-pos / .delta-neg` | dashboard | 변화율 색상 (녹/적) |
| `.channel-card .normal/.anomaly` | dashboard 754줄+ | LEVEL 1 매체 카드 |
| `.anomaly-badge` | dashboard | 이상 매체 빨간 뱃지 |
| `.insight-block` (fact·cause·action) | dashboard | LEVEL 2~5 딥다이브 3단계 카드 |
| `.cause-tag .confirmed/.estimated` | dashboard | [확인됨]/[추정] 색상 태그 |
| `.action-grid .immediate/.verify/.longterm` | dashboard | 액션 3분류 그리드 |

⚠ 인사이트 엔진의 HTML_GUIDE 변경 시 위 클래스가 깨지지 않는지 반드시 확인.
새 클래스 추가 시 `respace_dashboard_v3.html`에도 동일 정의 추가 필수.

---

## 파일 구조

```
respace-ai-system/
├── api/
│   ├── weekly-report.js          ← 분석 엔진 (step1/step2/step3/refine 분기)
│   └── update-dashboard.js       ← 변경 없음
├── insight-generator.html        ← /insight 페이지 (3단계 UI)
├── respace_dashboard_v3.html     ← 대시보드 (변경 없음)
├── vercel.json                   ← 라우팅 (변경 없음)
└── docs/
    ├── 01-분석기초.md             ← 분석 원칙 (단일 KPI · 펀넬 · 3단계 시퀀스)
    ├── 02-생성기가이드.md         ← 보고서 구조 템플릿
    ├── 03-리스페이스설정.md       ← CPL Primary · 매체 우선순위 · 벤치마크
    └── README.md                  ← 이 문서
```

### 3개 기초 문서의 역할
`api/weekly-report.js`의 `SYSTEM_PROMPT` 안에 3개 문서의 핵심 원칙이
`ANALYSIS_FRAMEWORK` / `RESPACE_CONFIG` / `HTML_GUIDE` + step별 `OUTPUT_SCHEMA` 상수로 박혀 있다.
`docs/` 폴더의 MD 파일은 **참조용 원본** — 코드를 다시 손볼 때 기준 문서.

> ⚠ 분석 원칙을 수정할 때는 두 곳을 모두 업데이트해야 한다:
> 1. `docs/0X-*.md` (원본 문서)
> 2. `api/weekly-report.js` 상수 (실제 LLM 프롬프트)

---

## API 스펙

### Endpoint
`POST /api/weekly-report` (Vercel Edge Runtime, SSE 스트리밍)

### Request body
```js
{
  mode: "step1" | "step2" | "step3" | "refine",
  weekInfo: { id, weekLabel, meetingDate, periodLabel, comparePeriod },
  rawData: { naver, google, meta, leads, deals, prev* },
  userInputs: { adjustments, issues, nextAgenda },
  // step2/step3에서만
  previousResult: { oneLineSummary, kpis, sections },
  // refine에서만
  previousEntry: {...},
  feedback: "..."
}
```

### Response (SSE)
```
data: { "type": "progress", "chars": 1234 }
data: { "type": "progress", "chars": 1850 }
data: { "type": "done", "result": { sections: [...] }, "computed": {...} }
   또는
data: { "type": "done", "entry": {...} }   // refine
   또는
data: { "type": "error", "message": "..." }
```

---

## 배포 절차

```bash
cd respace-ai-system
git add api/weekly-report.js insight-generator.html docs/
git commit -m "feat(insight): System 06 v2 — 3단계 분할 호출로 응답 안정성 개선"
git push origin main
```

배포 후 확인:
1. `https://respace-two.vercel.app/insight` 접속
2. 우측 상단 뱃지 `System 06 · 데이터 분석 원칙 v1`
3. 데이터 수집 → 이상 신호 박스(빨간색) 표시 여부
4. STEP 1 클릭 → KPI + LEVEL 0~1 즉시 표시 + 진행도 인디케이터 ●●○○ 상태
5. STEP 2 (또는 SKIP) → 딥다이브 섹션 누적 표시
6. STEP 3 → 액션 아이템 + 체크포인트 추가, 피드백·대시보드 반영 활성화

---

## 응답 안정성 개선 (2026-05-27)

LLM 응답 일관성 부족으로 "첫 시도 실패 → 두 번째 성공" 패턴이 반복되던 문제를 3단 방어로 해결:

**1. JSON 파싱 견고화** (`api/weekly-report.js`)
- 1차: 그대로 파싱
- 2차: HTML 안의 raw newline(`\n`)·tab을 `\\n`/`\\t`로 자동 변환 후 재파싱
- 3차: trailing comma 제거 + 닫는 `}` 부족 시 자동 보충
- 3회 모두 실패해야 에러. 응답 앞/끝 부분 콘솔 로깅으로 디버그 가능

**2. 클라이언트 자동 1회 재시도** (`insight-generator.html`)
- STEP 1·STEP 2-channel·STEP 3 모두 적용
- 1차 실패 시 800ms 딜레이 후 자동 재호출 — 사용자 클릭 불필요
- 진행 메시지: `"STEP 2 · Naver 자동 재시도 중 (2/2)..."`
- 2회째도 실패해야 사용자에게 실패 알림

**3. 시스템 프롬프트 JSON escape 절대 규칙 추가**
- HTML 안 큰따옴표 `\"` escape 강제
- HTML 한 줄 작성 강제 (raw newline 금지)
- trailing comma 금지

→ 사용자 경험: "재시도 중..." 메시지 잠깐 보고 자동으로 성공. 명시적 재시도 클릭 불필요.

---

## 최종 템플릿 변환 (transform-template, 2026-05-27 추가)

인사이트 생성기 결과를 대시보드 반영 시점에 **[Summary / 매체별 이슈 / 매체별 액션] 7섹션 최종 템플릿**으로 가공.

### 변환 흐름
```
STEP 1·2·3 완료 → entry (LEVEL 0/1/2~5/6 + 액션 등 9섹션)
   ↓ "🚀 최종 템플릿 변환 + 대시보드 반영" 클릭
transform-template API 호출 (max_tokens 7000)
   ↓
변환된 entry (7섹션):
  1. 통합 총평 Summary (CPD Primary)
  2-1. 네이버 이슈    /  3-1. 네이버 액션
  2-2. 구글 이슈      /  3-2. 구글 액션
  2-3. Meta 이슈      /  3-3. Meta 액션
   ↓
dashboard HTML 빌드 → GitHub push
   ↓
대시보드에서 매체별 좌측 컬러 border 자동 적용
  · 네이버 = #03c75a (초록)
  · 구글   = #4285f4 (파랑)
  · Meta   = #7e3aed (보라)
```

### KPI 변경
- 인사이트 생성기 (CPL Primary) — 분석·딥다이브용
- 최종 템플릿 (**CPD Primary**) — 리스페이스 팀 공유용 (B2B 롱세일즈 본질에 부합)

### 액션 카드 새 구조
```
⚡ 즉시 · [한 줄 액션 제목]
  · 어떻게: 구체적 실행 방법 (입찰가·키워드명·수치)
  · 왜: §2-X 근거 또는 [확인됨] 원인
  · 언제까지: 이번 주 / 다음 미팅 전 / 2주 / 1개월
```

---

## 향후 확장 포인트

- **Prompt caching**: ANALYSIS_FRAMEWORK + RESPACE_CONFIG 등 시스템 프롬프트가 모든 단계 반복 → Anthropic prompt caching 적용 시 비용·지연시간 ↓
- **월간 모드**: `mode: "monthly-step1/2/3"` 분기 신설, 4주 추세 기반 분석
- **벤치마크 자동 비교**: 매체별 CTR/CPC가 벤치마크 범위 안인지 자동 마킹
- **리드 품질 구분**: 리캐치_딜 vs 리캐치_리드 분리 추적 (미팅 전환 리드)
- **부분 refine**: 피드백이 특정 섹션만 가리키면 그 섹션만 재생성 (전체 refine 대신)

다른 클라이언트로 확장 시:
1. `docs/0X-{클라이언트}설정.md` 신규 작성
2. `api/weekly-report.js`의 `RESPACE_CONFIG`를 클라이언트별 분기 (또는 별도 vercel 프로젝트 fork)
