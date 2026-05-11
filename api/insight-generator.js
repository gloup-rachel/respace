/**
 * RESPACE 퍼포먼스 인사이트 생성 API — System 05
 * Vercel Serverless Function — Node.js 20.x
 *
 * mode: "generate" — 첫 인사이트 생성
 * mode: "refine"   — 피드백 반영 재생성
 *
 * 응답: JSON { version, period, sections: { step1..6 }, summary }
 */

const SYSTEM_PROMPT = `당신은 리스페이스(RESPACE) 전담 B2B 퍼포먼스 마케팅 애널리스트입니다.
글로업(GLOUP)의 인하우스 마케팅 파트너 관점에서, 매주/매월 퍼포먼스 데이터를 분석하고
팀이 즉각 액션할 수 있는 인사이트를 도출하는 것이 역할입니다.

## 핵심 원칙
1. 모든 인사이트 문장에 반드시 수치 근거(절대값·비율·변화량 중 하나 이상) 포함
2. "~로 보인다", "~일 수 있다" 같은 추측 표현 금지 — 데이터 기반으로만 기술
3. Referral·Direct·(not set) 채널은 유입 경위 단정 금지 → "내부 확인 필요" 처리
4. GA4 데이터와 CRM(리캐치) 데이터 간 괴리가 있으면 반드시 명시

## 업종 벤치마크 (팝업/공간 컨설팅 B2B)
### 광고 성과
- Google CTR: >5% 양호, >10% 우수 | CPC: <₩1,000 우수
- Meta CTR: >1.5% 양호, >2% 우수 | CPC: <₩700 우수
- 네이버 CTR: >1% 양호 | CPC: <₩4,000 양호

### 전환 퍼널
- 세션→전환이벤트: >20% 양호, >30% 우수
- click_contact→딜: >7% 양호, >15% 우수
- click_download→리드: >5% 양호, >10% 우수
- 전체 세션→리드+딜: >1.5% 양호, >3% 우수

### 채널별 기대 참여율
- 유료 검색: >55% 양호 | 유료 디스플레이: >25% 양호
- 오가닉 검색: >60% 양호 | Direct: >50% 양호 | Referral: >65% 양호

### 경쟁사
스위트스팟(리테일 프롭테크), 팝플리(통합 플랫폼), 프로젝트렌트(자체 공간),
팝업코리아(공간 큐레이션), 팝업그라운드(팝업 전문 미디어)

## 리드/딜 수집 구조
- 경로A: click_contact → 딜 (상담문의)
- 경로B: click_download_intro → 리드 (소개서 다운)

## Meta 페르소나 세그먼트
Core A(엔터프라이즈), Core B(글로벌 브랜드), Core C(엔터/IP),
Strategic A(이커머스/D2C), Strategic B(공공기관)

## 출력 형식
반드시 아래 JSON만 출력하세요. 다른 텍스트는 일절 포함하지 마세요.

{
  "period": "분석 기간 (예: 2026년 4월)",
  "summary": "핵심 총평 1문장 (수치 포함, 50자 이내)",
  "sections": {
    "step1": {
      "title": "광고 매체 효율성 분석",
      "content": "섹션 내용 (마크다운 사용 가능, 표·목록 권장)"
    },
    "step2": {
      "title": "수집 퍼널 전환율 분석",
      "content": "..."
    },
    "step3": {
      "title": "채널 기여도 & 트래픽 품질",
      "content": "..."
    },
    "step4": {
      "title": "Meta 타겟 페르소나별 성과",
      "content": "..."
    },
    "step5": {
      "title": "시계열 트렌드 & 타이밍",
      "content": "..."
    },
    "step6": {
      "title": "종합 인사이트 & 액션 아이템",
      "content": "..."
    }
  }
}

각 섹션 content 작성 기준:
- 인사이트 항목마다 수치 근거 병기 (예: "네이버 CPC ₩4,120 — 벤치마크 ₩4,000 대비 +3%, 주의 수준")
- 판단 결론을 먼저, 근거 수치를 뒤에 배치 (결론-근거 순서)
- 벤치마크 대비 포지션을 명확히 표시 (우수/양호/주의/위험)
- Referral·Direct 등 해석 불확실 채널은 내용 끝에 ">> 내부 확인 필요: [확인 대상]" 형태로 추가
- step6은 종합 인사이트 3개 + 액션 아이템 표 형식으로 구성`;


module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버 설정 오류입니다.' });

  const { mode = 'generate', input_data, previous_output, feedback } = req.body || {};

  if (!input_data) return res.status(400).json({ error: '입력 데이터가 없습니다.' });

  // ── 유저 메시지 구성 ──────────────────────────────────────
  let userMessage = '';

  if (mode === 'generate') {
    userMessage = `아래 리스페이스 퍼포먼스 데이터를 분석하여 6-STEP 인사이트를 생성해 주세요.

${formatInputData(input_data)}

각 STEP별 인사이트 2-3개씩 도출하고, 벤치마크 대비 포지션을 명확히 판단해 주세요.`;

  } else if (mode === 'refine') {
    if (!previous_output || !feedback) {
      return res.status(400).json({ error: '피드백 모드에는 이전 결과와 피드백이 필요합니다.' });
    }
    userMessage = `아래는 직전 분석 결과와 피드백입니다. 피드백을 반영하여 수정된 인사이트를 생성해 주세요.

## 원본 데이터
${formatInputData(input_data)}

## 직전 분석 결과
${JSON.stringify(previous_output, null, 2)}

## 피드백
${feedback}

피드백이 언급한 섹션을 중심으로 수정하되, 나머지 섹션도 전체 맥락에 맞게 조정해 주세요.
수정되지 않은 섹션도 동일한 JSON 구조로 포함해 주세요.`;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) throw new Error(data.error?.message || `API 오류 (${upstream.status})`);

    const raw = data.content[0].text.trim();

    // JSON 추출 (마크다운 코드블럭 제거)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('분석 결과 파싱 실패 — JSON을 찾을 수 없습니다.');

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ok: true, result });

  } catch (err) {
    return res.status(500).json({ error: `인사이트 생성 중 오류: ${err.message}` });
  }
};


// ── 입력 데이터 포맷터 ────────────────────────────────────────
function formatInputData(d) {
  const lines = [`[분석 기간] ${d.period || '미입력'}`];

  if (d.naver || d.google || d.meta) {
    lines.push('\n[광고 매체 데이터]');
    if (d.naver) lines.push(`네이버 검색광고 | 광고비: ${d.naver.spend} | 노출: ${d.naver.impressions} | 클릭: ${d.naver.clicks} | CTR: ${d.naver.ctr} | CPC: ${d.naver.cpc} | 전환: ${d.naver.conv}건`);
    if (d.google) lines.push(`구글 검색광고  | 광고비: ${d.google.spend} | 노출: ${d.google.impressions} | 클릭: ${d.google.clicks} | CTR: ${d.google.ctr} | CPC: ${d.google.cpc} | 전환: ${d.google.conv}건`);
    if (d.meta) lines.push(`Meta 광고      | 광고비: ${d.meta.spend} | 노출: ${d.meta.impressions} | 클릭: ${d.meta.clicks} | CTR: ${d.meta.ctr} | CPC: ${d.meta.cpc} | 전환: ${d.meta.conv}건`);
  }

  if (d.funnel) {
    lines.push('\n[퍼널 전환 데이터 - GA4]');
    lines.push(`GA4 세션: ${d.funnel.sessions} | 전환이벤트 합계: ${d.funnel.total_events}`);
    lines.push(`click_contact: ${d.funnel.click_contact}건 | click_download_intro: ${d.funnel.click_download}건`);
    lines.push(`실제 딜: ${d.funnel.actual_deal}건 | 실제 리드: ${d.funnel.actual_lead}건`);
  }

  if (d.channels) {
    lines.push('\n[채널별 트래픽 (GA4)]');
    lines.push(d.channels);
  }

  if (d.personas) {
    lines.push('\n[Meta 페르소나별 성과]');
    const p = d.personas;
    if (p.core_a) lines.push(`Core A (엔터프라이즈)   | CTR: ${p.core_a.ctr} | CPC: ${p.core_a.cpc} | 전환: ${p.core_a.conv}건`);
    if (p.core_b) lines.push(`Core B (글로벌 브랜드)   | CTR: ${p.core_b.ctr} | CPC: ${p.core_b.cpc} | 전환: ${p.core_b.conv}건`);
    if (p.core_c) lines.push(`Core C (엔터/IP)         | CTR: ${p.core_c.ctr} | CPC: ${p.core_c.cpc} | 전환: ${p.core_c.conv}건`);
    if (p.str_a)  lines.push(`Strategic A (이커머스)   | CTR: ${p.str_a.ctr}  | CPC: ${p.str_a.cpc}  | 전환: ${p.str_a.conv}건`);
    if (p.str_b)  lines.push(`Strategic B (공공기관)   | CTR: ${p.str_b.ctr}  | CPC: ${p.str_b.cpc}  | 전환: ${p.str_b.conv}건`);
  }

  if (d.trend) {
    lines.push('\n[시계열/트렌드 메모]');
    lines.push(d.trend);
  }

  if (d.notes) {
    lines.push('\n[기타 컨텍스트]');
    lines.push(d.notes);
  }

  return lines.join('\n');
}
