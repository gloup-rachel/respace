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

| Step | 시뮬 응답 글자수 | 추정 토큰 (×1.2배) | max_tokens | 여유 배수 |
|---|---|---|---|---|
| STEP 1 | 2,901자 | ~3,480 토큰 | **6,000** | 1.7배 |
| STEP 2 (이상 매체 1개) | 1,369자 | ~1,640 토큰 | **6,000** | 3.6배 (매체 2~3개 대비) |
| STEP 3 | 1,378자 | ~1,650 토큰 | **4,500** | 2.7배 |
| refine-section | 가장 무거운 딥다이브 1,359자 | ~1,631 토큰 | **3,500** | 2.1배 |
| refine | (전체 entry) | ~6,000~8,000 토큰 | **10,000** | 1.3배 |

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
3. 인사이트 분석 (3단계 클릭)
   ┌─ STEP 1 (자동 시작) ───────────────────────
   │  · 한 줄 요약 + KPI 6개 + LEVEL 0 + LEVEL 1
   │  · max_tokens 3500 / 약 1,500자 응답
   │  └ 사용자가 KPI strip + 매체 카드 검토
   ├─ STEP 2 (사용자 클릭) ───────────────────
   │  · 이상 매체만 LEVEL 2~5 딥다이브
   │  · max_tokens 3500
   │  · 이상 매체 0개면 → "STEP 3로 건너뛰기" 자동 표시
   │  └ 캠페인·그룹·키워드 단위 원인 분석 추가
   ├─ STEP 3 (사용자 클릭) ───────────────────
   │  · LEVEL 6 외부 요인 + 액션 아이템 + 다음 주 체크
   │  · max_tokens 3000
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

## 향후 확장 포인트

- **Prompt caching**: ANALYSIS_FRAMEWORK + RESPACE_CONFIG 등 시스템 프롬프트가 모든 단계 반복 → Anthropic prompt caching 적용 시 비용·지연시간 ↓
- **월간 모드**: `mode: "monthly-step1/2/3"` 분기 신설, 4주 추세 기반 분석
- **벤치마크 자동 비교**: 매체별 CTR/CPC가 벤치마크 범위 안인지 자동 마킹
- **리드 품질 구분**: 리캐치_딜 vs 리캐치_리드 분리 추적 (미팅 전환 리드)
- **부분 refine**: 피드백이 특정 섹션만 가리키면 그 섹션만 재생성 (전체 refine 대신)

다른 클라이언트로 확장 시:
1. `docs/0X-{클라이언트}설정.md` 신규 작성
2. `api/weekly-report.js`의 `RESPACE_CONFIG`를 클라이언트별 분기 (또는 별도 vercel 프로젝트 fork)
