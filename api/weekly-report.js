/**
 * RESPACE 주간 인사이트 생성 API — System 06 v2 (3단계 분할 호출)
 * Vercel Edge Runtime — 스트리밍 타임아웃 없음
 *
 * 기반 문서:
 *  - 01-분석기초.md         (단일 KPI · 펀넬 분해 · 3단계 시퀀스)
 *  - 02-생성기가이드.md     (보고서 구조 템플릿)
 *  - 03-리스페이스설정.md   (CPL Primary · 매체 우선순위 · 벤치마크)
 *
 * v1 → v2 변경 (2026-05-27):
 *  - 한 번에 7섹션 생성 → 3단계 분할 호출 (응답 안정성 ↑)
 *  - 각 호출 max_tokens 3500 이하 → 네트워크 끊김·JSON 파싱 실패 리스크 ↓
 *  - 부분 실패 시 해당 step만 재시도 가능
 *
 * POST body:
 *   mode: "step1" | "step2" | "step3" | "refine"
 *   weekInfo   { id, weekLabel, meetingDate, periodLabel, comparePeriod }
 *   rawData    { naver, google, meta, leads, deals, prev* }
 *   userInputs { adjustments, issues, nextAgenda }
 *   (step2/3) previousResult { oneLineSummary, kpis, sections: [...] }  ← step1 또는 누적
 *   (refine)  previousEntry, feedback
 *
 * step별 응답:
 *   step1 → { oneLineSummary, kpis, sections[0..2] }  // 한 줄 요약 + LEVEL 0 + LEVEL 1
 *   step2 → { sections[N] }                            // LEVEL 2~5 딥다이브 (이상 매체별)
 *   step3 → { sections[3] }                            // LEVEL 6 + 액션 + 다음 주 체크
 *   refine → 기존과 동일 (전체 entry)
 */

// ────────────────────────────────────────────────────────────────────
// 1. 분석 기초 프레임워크 (01-분석기초.md 의 코드화)
// ────────────────────────────────────────────────────────────────────
const ANALYSIS_FRAMEWORK = `
# 분석 기초 프레임워크 (데이터 분석 원칙 v1)

## 원칙 1 — 단일 KPI 기준
모든 분석은 하나의 KPI를 처음부터 끝까지 일관되게 흐른다.
- 리스페이스 PRIMARY KPI = **CPL (Cost Per Lead, 리드당 비용)**
- 리드 정의 = 폼 제출 완료 (리캐치_리드 + 리캐치_딜의 폼 제출 일자 기준)
- 모든 매체·캠페인·소재 비교는 CPL 단위로 통일
- 보조 지표(CPC/CTR/CVR/노출수)는 CPL 변화의 근거로만 사용

## 원칙 2 — 펀넬 분해 순서 (Top-Down)
[LEVEL 0] 전체 통합 성과
  → [LEVEL 1] 매체별 (Google / Naver / Meta)
    → [LEVEL 2] 캠페인별
      → [LEVEL 3] 광고그룹별
        → [LEVEL 4] 키워드/소재 유형별
          → [LEVEL 5] 키워드/소재 내용별 (실제 텍스트·이미지)
            → [LEVEL 6] 외부 요인 (시즌·경쟁·랜딩·예산·외부 이슈)

분해 규칙:
- 상위 레벨에서 이상 신호 감지 시에만 하위 레벨로 내려간다.
- 정상 매체는 LEVEL 1에서 1~2줄 정상 확인으로 종료.
- 이상 매체만 LEVEL 2~5 딥다이브 진행.
- 원인이 특정되면 그 아래는 생략 가능.

## 원칙 3 — 3단계 분석 시퀀스
모든 인사이트 = [팩트] → [원인] → [액션] 순서 강제.

### STEP 1. 팩트 (What — 데이터 기반, 단정 금지)
- 비교 기준 명시 (전주/전월/목표 중 어느 기준인지)
- 수치로만 서술. 원인 단정 금지.
- 예) "3주차 전체 CPL이 전주 대비 23% 상승 (32,000원 → 39,400원)"

### STEP 2. 원인 (Why — 임팩트 순서)
- 원인은 하나만 있을 수 없다는 전제
- 임팩트 큰 것부터 나열
- [확인됨] 데이터로 검증된 원인 / [추정] 가설은 명확히 구분

### STEP 3. 액션 (What to do — 임팩트 큰 것 먼저)
- [즉시]     이번 주~다음 주 내 실행 가능
- [검증 후]  추가 데이터 확인 후 실행
- [중장기]   1개월 이상 호흡

## Anti-Pattern (금지)
- "경쟁사 때문에 CPL이 올랐다" → 경쟁 요인은 [추정]으로만 표기
- "소재 A가 좋아서 CTR이 높다" → CPL과 연결 없는 보조 지표만 언급 금지
- "전반적으로 성과가 좋다" → 어떤 KPI가 얼마나, 무엇 대비로 좋은지 수치로
- 부정 성과는 깊게, 긍정 성과는 얕게 → 동일 분석 깊이 적용
- 가장 눈에 띄는 지표부터 분석 → 반드시 LEVEL 0부터 시작
`;

// ────────────────────────────────────────────────────────────────────
// 2. 리스페이스 설정 (03-리스페이스설정.md 의 코드화)
// ────────────────────────────────────────────────────────────────────
const RESPACE_CONFIG = `
# 리스페이스(RESPACE) 클라이언트 설정

## 기본 정보
- 업종: B2B 팝업스토어 / 공간 컨설팅
- 세일즈 모델: 리드 → 미팅 → 계약 (B2B 롱세일즈)
- 담당자: Hayley (데이터·퍼포마케팅)
- 리포트 주기: 주간 (매주 월요일 기준 전주 정리)

## PRIMARY KPI = CPL
- 리드 정의: 폼 제출 완료 (리캐치 리드 + 딜의 폼 제출 일자)
- 매체별 CPL = 매체 비용 / 매체 전환수
- 전체 CPL = 3매체 총 비용 / 리캐치 리드(폼 제출)

## 매체 우선순위
1. Google SA (검색) — 주력. 키워드 경쟁 강도 주시
2. Naver SA (검색) — 보완. 국내 B2B 의사결정자 검색 패턴
3. Meta (DA) — 보완. 리타겟팅·유사타겟 중심

## 이상 신호 트리거 (딥다이브 진입 기준)
- 특정 매체 CPL ±20% 이상 변동 → 해당 매체 LEVEL 2~5 딥다이브
- 리드 수 주간 목표 대비 -30% 이하 → 전 매체 긴급 점검
- 매체 비용 ±30% 이상 변동 시 LEVEL 6 외부 요인 우선 점검

## 캠페인 구조 맵
### Google SA
- 유형 A: 브랜드 검색 (리스페이스 / 팝업스토어 플랫폼 브랜드명)
- 유형 B: 서비스 검색 (팝업스토어 대행 / 공간 컨설팅)
- 유형 C: 경쟁사 키워드

### Naver SA
- 유형 A: 브랜드 검색
- 유형 B: 서비스 관련 일반 키워드

### Meta
- 유형 A: 신규 타겟 (관심사·직군)
- 유형 B: 리타겟팅 (방문자·문의 미완료)

## 벤치마크 (방향 판단용)
- B2B 팝업 업종 CVR: 1.5~3.5%
- Google SA CTR: 5~12%
- Naver SA CTR: 3~8%
- Meta CTR (링크): 0.5~2.0%
- 벤치마크 초과 = 좋음이 아님. CPL 기준 판단.

## 외부 요인 체크리스트 (LEVEL 6)
- 시즌/계절성: 팝업 성수기(봄 3~5월, 가을 9~11월), 연말
- 경쟁 변화: 주요 경쟁 플랫폼 광고 집행 증감 (Auction Insights)
- 랜딩페이지 변경: 소재 교체, 폼 위치·문구 변경
- 예산 증감: 주간 예산 변경 여부
- 외부 이슈: 업계 뉴스, 규제, 대형 이벤트

## 리스페이스 특이사항 (B2B 사이클)
1. 리드→미팅→계약 시간 차 있음. 단기 CPL 급등락에 과반응 금지.
   → 2주 이상 추세 확인될 때 구조적 원인 판단.
2. 가능하면 '미팅 전환 리드' vs '단순 문의' 구분 추적.
3. 봄/가을 팝업 성수기 CPL 상승은 경쟁 심화 가능성 → [추정] 명시.

## 경쟁사
스위트스팟, 팝플리, 프로젝트렌트, 팝업코리아, 팝업그라운드

## Meta 페르소나
Core A(엔터프라이즈), Core B(글로벌 브랜드), Core C(엔터/IP),
Strategic A(이커머스/D2C), Strategic B(공공기관)
`;

// ────────────────────────────────────────────────────────────────────
// 3. HTML 공통 규칙
// ────────────────────────────────────────────────────────────────────
const HTML_GUIDE = `
## 공통 HTML 작성 규칙

### 핵심 카드
<div class="weekly-summary-card"><strong>한 줄 핵심</strong> 부연 1문장</div>

### 수치 비교 표
<table class="weekly-table">
  <thead><tr><th>지표</th><th>이번 주</th><th>전주</th><th>변화율</th></tr></thead>
  <tbody>
    <tr><td>CPL (Primary)</td><td class="num">₩XX,XXX</td><td class="num">₩XX,XXX</td><td class="num delta-pos">-X%</td></tr>
  </tbody>
</table>

### 변화율 색상
<span class="delta-pos">-X%</span>  ← CPL 하락 또는 리드 상승 (좋음)
<span class="delta-neg">+X%</span>  ← CPL 상승 또는 리드 하락 (나쁨)

### 매체 카드 (LEVEL 1)
<div class="channel-card normal">  ← 정상
  <div class="channel-head"><span class="channel-name">Naver SA</span></div>
  <div class="channel-cpl"><strong>CPL ₩XX,XXX</strong> (전주 ₩XX,XXX · <span class="delta-pos">-3%</span>)</div>
  <p class="channel-note">정상 범위 — 별도 딥다이브 불필요</p>
</div>

<div class="channel-card anomaly">  ← 이상 매체
  <div class="channel-head">
    <span class="channel-name">Google SA</span>
    <span class="anomaly-badge">⚠ ANOMALY (CPL +24%)</span>
  </div>
  <div class="channel-cpl"><strong>CPL ₩XX,XXX</strong> (전주 ₩XX,XXX · <span class="delta-neg">+24%</span>)</div>
  <p class="channel-note">→ LEVEL 2 딥다이브 진행</p>
</div>

### 3단계 시퀀스 (LEVEL 2~5)
<div class="insight-block">
  <p class="fact">📊 <strong>[팩트]</strong> 지표 변화 (수치 + 비교 기준)</p>
  <p class="cause"><strong>[원인]</strong></p>
  <ul class="cause-list">
    <li><span class="cause-tag confirmed">[확인됨]</span> 데이터 기반 원인 — 임팩트 큰 것 먼저</li>
    <li><span class="cause-tag estimated">[추정]</span> 가설 — 검증 방법 명시</li>
  </ul>
  <p class="action"><strong>[액션]</strong> 다음 단계로</p>
</div>

### 액션 아이템 (3분류)
<div class="action-grid">
  <div class="action-box immediate">
    <div class="action-head">⚡ 즉시 (이번 주~다음 주)</div>
    <ul><li>구체적 액션 1줄</li></ul>
  </div>
  <div class="action-box verify">
    <div class="action-head">🔍 검증 후</div>
    <ul><li>추가 확인 후 실행할 액션</li></ul>
  </div>
  <div class="action-box longterm">
    <div class="action-head">📅 중장기 (1개월+)</div>
    <ul><li>구조 개선 액션</li></ul>
  </div>
</div>
`;

// ────────────────────────────────────────────────────────────────────
// 4. step별 OUTPUT_SCHEMA
// ────────────────────────────────────────────────────────────────────
const STEP1_SCHEMA = `
# STEP 1 출력 스키마 — 한 줄 요약 + KPI + LEVEL 0~1

반드시 아래 JSON만 출력. 다른 텍스트 일절 금지.

{
  "oneLineSummary": "이번 주 CPL 기준 한 줄 요약 (80자 이내). CPL 수치 + 전주 변화 + 핵심 원인 1개.",
  "kpis": [
    { "label": "CPL (Primary)", "value": "₩XX,XXX", "delta": "+/-X% vs 전주", "trend": "pos|neg|neutral" },
    { "label": "총 리드", "value": "XX건", "delta": "+/-X% vs 전주", "trend": "..." },
    { "label": "총 광고비", "value": "₩XXX", "delta": "+/-X% vs 전주", "trend": "..." },
    { "label": "Google CPL", "value": "₩XX,XXX", "delta": "+/-X%", "trend": "..." },
    { "label": "Naver CPL", "value": "₩XX,XXX", "delta": "+/-X%", "trend": "..." },
    { "label": "Meta CPL", "value": "₩XX,XXX", "delta": "+/-X%", "trend": "..." }
  ],
  "sections": [
    {
      "title": "1. 한 줄 요약 — CPL 기준",
      "html": "weekly-summary-card 1개로 핵심 1문장 + 부연 1문장. CPL 중심."
    },
    {
      "title": "2. LEVEL 0 — 전체 통합 성과",
      "html": "weekly-table로 CPL/리드/광고비/CPC/CTR/CVR 전주 비교. CPL에만 평가 코멘트 1줄."
    },
    {
      "title": "3. LEVEL 1 — 매체별 CPL 비교",
      "html": "3개 매체 channel-card 형태. 이상 매체는 anomaly 클래스 + anomaly-badge. 정상 매체는 1줄."
    }
  ]
}

## 작성 지침
- trend 방향: CPL/CPC/CAC 하락=pos, 리드/전환/CTR 상승=pos.
- 사전 계산 값을 그대로 사용. CPL을 다시 계산하지 말 것.
- LEVEL 2 이하 분석은 STEP 2에서 진행하므로 여기서 다루지 말 것.
`;

const STEP2_SCHEMA = `
# STEP 2 출력 스키마 — LEVEL 2~5 딥다이브 (이상 매체만)

반드시 아래 JSON만 출력. 다른 텍스트 일절 금지.

{
  "sections": [
    {
      "title": "4. LEVEL 2~5 — [매체명] 딥다이브",
      "html": "캠페인 → 그룹 → 키워드/소재 순서. 3~5개의 insight-block 사용. 각 block은 [팩트]→[원인 확인됨/추정]→[액션]."
    }
    // 이상 매체가 N개면 N개 섹션 (4-a, 4-b처럼 분리)
  ]
}

## 작성 지침
- 이상 매체로 명시된 채널만 분석. 정상 매체는 건드리지 말 것.
- 각 insight-block은 한 가지 핵심 이슈만 다룸. 한 매체당 3~5개 block.
- 원인 [확인됨]은 사전 계산 + LEVEL 1 raw data로 검증 가능한 것만.
- 원인 [추정]은 가설 + 검증 방법(예: "Auction Insights 확인 필요").
- 이상 매체가 0개로 전달되면 sections를 빈 배열 []로 반환.
`;

const STEP3_SCHEMA = `
# STEP 3 출력 스키마 — LEVEL 6 + 액션 + 다음 주 체크

반드시 아래 JSON만 출력. 다른 텍스트 일절 금지.

{
  "sections": [
    {
      "title": "5. LEVEL 6 — 외부 요인 체크",
      "html": "체크리스트 형태로 시즌·경쟁·랜딩·예산·외부 이슈 점검. userInputs.issues에서 단서 우선 활용."
    },
    {
      "title": "6. 액션 아이템",
      "html": "action-grid 사용 — immediate / verify / longterm 3박스. 임팩트 큰 것 먼저. 각 액션 1줄."
    },
    {
      "title": "7. 다음 주 체크 포인트",
      "html": "다음 주 모니터링할 지표·매체·캠페인 3~5개 bullet. userInputs.nextAgenda 반영."
    }
  ]
}

## 작성 지침
- 이전 단계(STEP 1, 2)에서 도출된 이상 신호·원인을 종합해서 액션 도출.
- [즉시] 박스에 P0 조정사항(userInputs.adjustments)이 있으면 상단에 명시.
- [중장기]는 1개월 이상 호흡의 구조 개선 (예: 캠페인 구조 재편, 새 매체 테스트).
`;

const REFINE_SCHEMA = `
# 피드백 반영 출력 스키마

반드시 아래 JSON만 출력. 다른 텍스트 일절 금지.

{
  "oneLineSummary": "수정된 한 줄 요약",
  "kpis": [...],
  "sections": [
    { "title": "1. ...", "html": "..." },
    { "title": "2. ...", "html": "..." },
    ... // 모든 섹션 동일 구조로 포함
  ]
}

## 작성 지침
- 피드백이 언급한 섹션을 우선 수정. 전체 맥락 일관성도 유지.
- 수정 안 한 섹션도 동일 JSON 구조로 모두 포함.
- 분석 원칙(단일 KPI · 펀넬 분해 · 3단계 시퀀스)은 절대 깨지 말 것.
`;


// ────────────────────────────────────────────────────────────────────
// 5. 시스템 프롬프트 빌더 (step별)
// ────────────────────────────────────────────────────────────────────
function buildSystemPrompt(mode) {
  const intro = `당신은 리스페이스(RESPACE) 전담 B2B 퍼포먼스 마케팅 애널리스트입니다.
글로업(GLOUP)의 인하우스 마케팅 파트너 관점에서 매주 퍼포먼스 데이터를 분석합니다.

아래 분석 원칙·클라이언트 설정·HTML 규칙을 모든 출력에 반드시 적용하세요.`;

  const schema =
    mode === 'step1' ? STEP1_SCHEMA :
    mode === 'step2' ? STEP2_SCHEMA :
    mode === 'step3' ? STEP3_SCHEMA :
    mode === 'refine' ? REFINE_SCHEMA :
    STEP1_SCHEMA;

  const rules = `
## 절대 규칙 (위반 시 출력 reject)
1. JSON 외 텍스트 출력 금지 (설명·인사·마크다운 fence 모두 금지).
2. PRIMARY KPI = CPL. 모든 평가는 CPL 기준.
3. 비교 기준 명시 없는 수치 금지 ("전주 대비" "전월 대비" "목표 대비" 중 하나).
4. 원인 단정 금지. [확인됨] vs [추정] 구분 필수.
5. 정상 매체는 1줄, 이상 매체는 딥다이브 — 분석 깊이 비대칭 허용.
6. 액션은 [즉시]/[검증 후]/[중장기] 3분류로만 작성.
7. 한 인사이트 = 최대 5문장 이내.
8. trend 값: "pos" (CPL 하락 = 좋음), "neg" (CPL 상승 = 나쁨), "neutral" (변동 미미).
   ※ 리드/전환/CTR은 상승이 pos.`;

  return [intro, ANALYSIS_FRAMEWORK, RESPACE_CONFIG, HTML_GUIDE, schema, rules].join('\n\n');
}


// ────────────────────────────────────────────────────────────────────
// 6. Edge Runtime 핸들러
// ────────────────────────────────────────────────────────────────────
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST만 허용됩니다.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '서버 설정 오류 (ANTHROPIC_API_KEY 누락).' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch (_) {
    return new Response(JSON.stringify({ error: '요청 바디 파싱 오류입니다.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { mode = 'step1', weekInfo, rawData, userInputs, previousResult, previousEntry, feedback } = body;

  if (!weekInfo || !rawData) {
    return new Response(JSON.stringify({ error: '주차 정보(weekInfo)와 데이터(rawData)가 필요합니다.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  if ((mode === 'step2' || mode === 'step3') && !previousResult) {
    return new Response(JSON.stringify({ error: `${mode} 모드: previousResult 필요.` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  if (mode === 'refine' && (!previousEntry || !feedback)) {
    return new Response(JSON.stringify({ error: 'refine 모드: previousEntry와 feedback 필요.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 사전 계산 — 모든 step에서 일관 사용
  const computed = computeMetrics(rawData);

  // step2에서 이상 매체 0개면 LLM 호출 없이 빈 sections 즉시 반환
  if (mode === 'step2' && computed.anomalies.length === 0) {
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(`data: ${JSON.stringify({
          type: 'done',
          result: { sections: [], _skipped: true, _reason: '이상 매체 없음 — LEVEL 2~5 딥다이브 생략' }
        })}\n\n`));
        controller.close();
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  // user message 빌드
  let userMessage;
  if (mode === 'step1') userMessage = buildStep1Message(weekInfo, rawData, userInputs, computed);
  else if (mode === 'step2') userMessage = buildStep2Message(weekInfo, rawData, userInputs, computed, previousResult);
  else if (mode === 'step3') userMessage = buildStep3Message(weekInfo, rawData, userInputs, computed, previousResult);
  else if (mode === 'refine') userMessage = buildRefineMessage(weekInfo, rawData, userInputs, computed, previousEntry, feedback);

  // max_tokens — step별로 다르게
  // 시뮬레이션 결과 (2026-05-27): 한국어+JSON+HTML escape 감안 1자당 ~1.2토큰으로 재산정.
  //   STEP 1 시뮬 응답 2,901자 ≈ 3,481 토큰 — 기존 3500은 한계 근접이라 잘림 발생.
  //   STEP 2 이상 매체 2~3개 시나리오에서 분량 3배 증가 가능 → 6000으로 상향.
  const maxTokens =
    mode === 'step1' ? 6000 :
    mode === 'step2' ? 6000 :
    mode === 'step3' ? 4500 :
    10000; // refine은 전체 entry 재생성이므로 가장 큰 한도

  const systemPrompt = buildSystemPrompt(mode);

  // ── SSE 스트리밍 ────────────────────────────────────────────────
  const sseHeaders = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }),
        });

        if (!upstream.ok) {
          const errData = await upstream.json().catch(() => ({}));
          send({ type: 'error', message: errData.error?.message || `Anthropic API 오류 (${upstream.status})` });
          controller.close();
          return;
        }

        let fullText = '';
        let charCount = 0;
        let stopReason = null;        // ← Anthropic message_delta에서 캡처
        let usageOutputTokens = null;  // ← 디버그용
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;

            let event;
            try { event = JSON.parse(raw); } catch (_) { continue; }

            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const text = event.delta.text;
              fullText += text;
              charCount += text.length;
              if (charCount % 50 < text.length) {
                send({ type: 'progress', chars: fullText.length });
              }
            } else if (event.type === 'message_delta') {
              // 스트림 종료 직전 — stop_reason과 output_tokens 캡처
              if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
              if (event.usage?.output_tokens != null) usageOutputTokens = event.usage.output_tokens;
            }
          }
        }

        // 응답이 max_tokens로 잘렸으면 명확한 에러 반환 (JSON 파싱 시도 전)
        if (stopReason === 'max_tokens') {
          send({
            type: 'error',
            message: `${mode} 응답이 토큰 한도(${maxTokens})에 도달하여 잘렸습니다.\n출력 토큰: ${usageOutputTokens ?? 'N/A'} / 한도: ${maxTokens}\n→ "재시도" 또는 다음 단계로 진행 후 해당 단계만 다시 실행해 주세요.`,
            stopReason,
            outputTokens: usageOutputTokens,
            maxTokens,
          });
          controller.close();
          return;
        }

        const cleaned = fullText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          send({ type: 'error', message: `${mode} JSON 파싱 실패 — 응답에서 JSON을 찾을 수 없습니다.` });
          controller.close();
          return;
        }

        let parsed;
        try { parsed = JSON.parse(jsonMatch[0]); }
        catch (e) {
          send({ type: 'error', message: `${mode} JSON 파싱 오류: ${e.message}` });
          controller.close();
          return;
        }

        // refine은 entry 전체, 그 외는 부분 결과
        if (mode === 'refine') {
          const entry = {
            id: weekInfo.id,
            weekLabel: weekInfo.weekLabel,
            meetingDate: weekInfo.meetingDate,
            periodLabel: weekInfo.periodLabel,
            comparePeriod: weekInfo.comparePeriod,
            isLatest: true,
            oneLineSummary: parsed.oneLineSummary || '',
            kpis: Array.isArray(parsed.kpis) ? parsed.kpis : [],
            sections: Array.isArray(parsed.sections) ? parsed.sections : [],
            _system: 'insight-v2',
            _computed: computed,
          };
          send({ type: 'done', entry });
        } else {
          // step별 부분 결과 + computed 메타 함께 전송
          send({ type: 'done', result: parsed, computed });
        }

        controller.close();

      } catch (err) {
        const enc2 = new TextEncoder();
        controller.enqueue(enc2.encode(`data: ${JSON.stringify({ type: 'error', message: `${mode} 생성 중 오류: ${err.message}` })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, { status: 200, headers: sseHeaders });
}


// ────────────────────────────────────────────────────────────────────
// 7. 사전 계산
// ────────────────────────────────────────────────────────────────────
function computeMetrics(raw) {
  const safe = (obj) => obj || { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConv: 0 };
  const n = safe(raw.naver), g = safe(raw.google), m = safe(raw.meta);
  const pn = safe(raw.prevNaver), pg = safe(raw.prevGoogle), pm = safe(raw.prevMeta);

  const totalSpend = n.totalSpend + g.totalSpend + m.totalSpend;
  const prevTotalSpend = pn.totalSpend + pg.totalSpend + pm.totalSpend;
  const leads = raw.leads || 0;
  const prevLeads = raw.prevLeads || 0;

  const cpl = (spend, conv) => (conv > 0 ? Math.round(spend / conv) : null);
  const naverCPL = cpl(n.totalSpend, n.totalConv);
  const googleCPL = cpl(g.totalSpend, g.totalConv);
  const metaCPL = cpl(m.totalSpend, m.totalConv);
  const totalCPL = cpl(totalSpend, leads);
  const prevNaverCPL = cpl(pn.totalSpend, pn.totalConv);
  const prevGoogleCPL = cpl(pg.totalSpend, pg.totalConv);
  const prevMetaCPL = cpl(pm.totalSpend, pm.totalConv);
  const prevTotalCPL = cpl(prevTotalSpend, prevLeads);

  const change = (now, prev) => {
    if (now == null || prev == null || prev === 0) return null;
    return Math.round(((now - prev) / prev) * 1000) / 10;
  };

  const ANOMALY_THRESHOLD = 20;
  const anomalies = [];
  const naverDelta = change(naverCPL, prevNaverCPL);
  const googleDelta = change(googleCPL, prevGoogleCPL);
  const metaDelta = change(metaCPL, prevMetaCPL);

  if (naverDelta != null && Math.abs(naverDelta) >= ANOMALY_THRESHOLD) {
    anomalies.push({ channel: 'Naver', delta: naverDelta, cpl: naverCPL, prevCpl: prevNaverCPL });
  }
  if (googleDelta != null && Math.abs(googleDelta) >= ANOMALY_THRESHOLD) {
    anomalies.push({ channel: 'Google', delta: googleDelta, cpl: googleCPL, prevCpl: prevGoogleCPL });
  }
  if (metaDelta != null && Math.abs(metaDelta) >= ANOMALY_THRESHOLD) {
    anomalies.push({ channel: 'Meta', delta: metaDelta, cpl: metaCPL, prevCpl: prevMetaCPL });
  }

  const leadsDelta = change(leads, prevLeads);
  const leadEmergency = leadsDelta != null && leadsDelta <= -30;

  return {
    totalCPL, prevTotalCPL, cplDelta: change(totalCPL, prevTotalCPL),
    naverCPL, prevNaverCPL, naverCplDelta: naverDelta,
    googleCPL, prevGoogleCPL, googleCplDelta: googleDelta,
    metaCPL, prevMetaCPL, metaCplDelta: metaDelta,
    totalSpend, prevTotalSpend, spendDelta: change(totalSpend, prevTotalSpend),
    leads, prevLeads, leadsDelta,
    anomalies, leadEmergency,
    anomalyChannels: anomalies.map(a => a.channel),
  };
}


// ────────────────────────────────────────────────────────────────────
// 8. step별 user message 빌더
// ────────────────────────────────────────────────────────────────────
function fmt(n) { return n == null ? 'N/A' : Number(n).toLocaleString('ko-KR'); }
function sign(v) { return v == null ? '-' : (v > 0 ? `+${v}%` : `${v}%`); }

function commonContext(weekInfo, raw, c) {
  const lines = [];
  lines.push(`# 분석 주차: ${weekInfo.weekLabel}`);
  lines.push(`기간: ${weekInfo.periodLabel}`);
  lines.push(`비교: ${weekInfo.comparePeriod}`);
  lines.push('');
  lines.push('## [사전 계산] PRIMARY KPI = CPL');
  lines.push(`- 전체 CPL: ${fmt(c.totalCPL)}원 (전주 ${fmt(c.prevTotalCPL)}원, ${sign(c.cplDelta)})`);
  lines.push(`- Google CPL: ${fmt(c.googleCPL)}원 (전주 ${fmt(c.prevGoogleCPL)}원, ${sign(c.googleCplDelta)})`);
  lines.push(`- Naver  CPL: ${fmt(c.naverCPL)}원 (전주 ${fmt(c.prevNaverCPL)}원, ${sign(c.naverCplDelta)})`);
  lines.push(`- Meta   CPL: ${fmt(c.metaCPL)}원 (전주 ${fmt(c.prevMetaCPL)}원, ${sign(c.metaCplDelta)})`);
  lines.push(`- 총 광고비: ${fmt(c.totalSpend)}원 (전주 ${fmt(c.prevTotalSpend)}원, ${sign(c.spendDelta)})`);
  lines.push(`- 리캐치 리드: ${c.leads}건 (전주 ${c.prevLeads}건, ${sign(c.leadsDelta)})`);
  lines.push(`- 리캐치 딜: ${raw.deals || 0}건 (전주 ${raw.prevDeals || 0}건)`);
  lines.push('');
  lines.push('## [사전 감지] 이상 신호');
  if (c.anomalies.length === 0) {
    lines.push('- 매체 CPL ±20% 이상 변동 없음');
  } else {
    c.anomalies.forEach(a => {
      lines.push(`- ⚠ ${a.channel} CPL ${sign(a.delta)} (${fmt(a.prevCpl)} → ${fmt(a.cpl)}원)`);
    });
  }
  if (c.leadEmergency) lines.push(`- 🚨 리드 수 ${sign(c.leadsDelta)} — 긴급 점검 트리거`);
  return lines.join('\n');
}

function rawDataBlock(raw) {
  const lines = [];
  lines.push('## [LEVEL 1] 매체별 원본 데이터');
  ['naver', 'google', 'meta'].forEach(ch => {
    const d = raw[ch]; if (!d) return;
    const ctr = d.totalClicks && d.totalImpressions ? ((d.totalClicks / d.totalImpressions) * 100).toFixed(2) : '0';
    const cpc = d.totalClicks ? Math.round(d.totalSpend / d.totalClicks) : 0;
    const cvr = d.totalClicks ? ((d.totalConv / d.totalClicks) * 100).toFixed(2) : '0';
    lines.push(`**${ch.toUpperCase()}**`);
    lines.push(`- 비용 ${fmt(d.totalSpend)}원 | 노출 ${fmt(d.totalImpressions)} | 클릭 ${fmt(d.totalClicks)} | 전환 ${d.totalConv}건`);
    lines.push(`- CTR ${ctr}% | CPC ${fmt(cpc)}원 | CVR ${cvr}%`);
    if (ch === 'naver' && d.groups && Object.keys(d.groups).length) {
      const grp = Object.entries(d.groups).map(([k, v]) => `${k}(비용 ${fmt(v.spend)}, 전환 ${v.conv})`).join(' | ');
      lines.push(`- 그룹별: ${grp}`);
    }
    if (ch === 'meta' && d.campaigns && Object.keys(d.campaigns).length) {
      const cmp = Object.entries(d.campaigns).map(([k, v]) => `${k}(비용 ${fmt(v.spend)}, 전환 ${v.conv})`).join(' | ');
      lines.push(`- 캠페인별: ${cmp}`);
    }
  });
  return lines.join('\n');
}

function inputsBlock(inputs) {
  return [
    '## [LEVEL 6 단서] 운영 정보',
    `- 이번 주 조정/변경: ${inputs?.adjustments || '없음'}`,
    `- 특이사항/이슈: ${inputs?.issues || '없음'}`,
    `- 다음 주 논의 안건: ${inputs?.nextAgenda || '없음'}`
  ].join('\n');
}

function summarizePrev(prev) {
  if (!prev) return '';
  const lines = [];
  if (prev.oneLineSummary) lines.push(`oneLineSummary: ${prev.oneLineSummary}`);
  if (Array.isArray(prev.kpis) && prev.kpis.length) {
    lines.push('이전 KPI:');
    prev.kpis.forEach(k => lines.push(`  - ${k.label}: ${k.value} (${k.delta})`));
  }
  if (Array.isArray(prev.sections) && prev.sections.length) {
    lines.push('이전 섹션 (요약):');
    prev.sections.forEach((s, i) => {
      const stripped = String(s.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 250);
      lines.push(`  ${i + 1}. ${s.title} — ${stripped}...`);
    });
  }
  return lines.join('\n');
}

function buildStep1Message(weekInfo, raw, inputs, c) {
  return [
    commonContext(weekInfo, raw, c),
    '',
    rawDataBlock(raw),
    '',
    inputsBlock(inputs),
    '',
    '---',
    '## STEP 1 작성 지시',
    '- 위 사전 계산 값을 그대로 사용. CPL을 다시 계산하지 말 것.',
    '- 한 줄 요약 + KPI 6개 + 섹션 1·2·3만 작성 (LEVEL 2 이하는 STEP 2에서).',
    '- 이상 매체는 channel-card anomaly + anomaly-badge로 명시.',
    '- 정상 매체는 1줄 요약만 — 분석 깊이 비대칭.'
  ].join('\n');
}

function buildStep2Message(weekInfo, raw, inputs, c, prevResult) {
  return [
    commonContext(weekInfo, raw, c),
    '',
    rawDataBlock(raw),
    '',
    inputsBlock(inputs),
    '',
    '## STEP 1 결과 (참고)',
    summarizePrev(prevResult),
    '',
    '---',
    '## STEP 2 작성 지시',
    `- 이상 매체로 명시된 채널만 LEVEL 2~5 딥다이브: [${c.anomalyChannels.join(', ') || '없음'}]`,
    '- 정상 매체는 절대 건드리지 말 것.',
    '- 각 매체별로 별도 섹션 (4-a, 4-b 형태로 구분).',
    '- 한 매체당 3~5개의 insight-block. [팩트]→[원인 확인됨/추정]→[액션] 3단계 강제.',
    '- [확인됨]은 사전 계산·LEVEL 1 raw로 검증 가능한 것만.',
    '- 이상 매체가 없으면 sections를 빈 배열 [] 로 반환.'
  ].join('\n');
}

function buildStep3Message(weekInfo, raw, inputs, c, prevResult) {
  return [
    commonContext(weekInfo, raw, c),
    '',
    inputsBlock(inputs),
    '',
    '## 이전 단계 결과 (STEP 1 + STEP 2)',
    summarizePrev(prevResult),
    '',
    '---',
    '## STEP 3 작성 지시',
    '- LEVEL 6 외부 요인 체크 + 액션 아이템(즉시/검증후/중장기) + 다음 주 체크포인트 3섹션만 작성.',
    '- 이전 단계에서 도출된 이상 신호·원인을 종합해서 액션 도출.',
    `- 이상 매체: [${c.anomalyChannels.join(', ') || '없음'}] → [즉시] 박스에서 우선 다룰 것.`,
    '- userInputs.adjustments에 P0 조정사항 있으면 [즉시] 박스 상단에 명시.',
    '- 다음 주 체크포인트는 userInputs.nextAgenda를 반영.'
  ].join('\n');
}


// ────────────────────────────────────────────────────────────────────
// 9. 피드백 refine 메시지 빌더
// ────────────────────────────────────────────────────────────────────
function buildRefineMessage(weekInfo, raw, inputs, computed, prev, feedback) {
  return [
    commonContext(weekInfo, raw, computed),
    '',
    rawDataBlock(raw),
    '',
    inputsBlock(inputs),
    '',
    '## 직전 인사이트 버전',
    `oneLineSummary: ${prev.oneLineSummary}`,
    '섹션 목록:',
    (prev.sections || []).map((s, i) => `  ${i + 1}. ${s.title}`).join('\n'),
    '',
    '## 마케터 피드백',
    feedback,
    '',
    '---',
    '## 수정 지침',
    '- 피드백이 언급한 섹션을 우선 수정. 전체 맥락 일관성도 유지.',
    '- 수정 안 한 섹션도 동일 JSON 구조로 모두 포함.',
    '- oneLineSummary와 KPI도 변경 사항을 반영해 업데이트.',
    '- 분석 원칙(단일 KPI · 펀넬 분해 · 3단계 시퀀스)은 절대 깨지 말 것.'
  ].join('\n');
}
