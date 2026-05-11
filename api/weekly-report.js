/**
 * RESPACE 주간 인사이트 생성 API — System 05 (v2)
 * Vercel Serverless Function — Node.js 20.x
 *
 * respace-weekly-report 스킬 기반으로 재구현.
 * 대시보드 WEEKLY_REPORTS 배열에 삽입할 엔트리를 생성한다.
 *
 * POST body:
 *   weekInfo   { weekNum, weekLabel, meetingDate, periodLabel, comparePeriod, startDate, endDate }
 *   rawData    { naver, google, meta, leads, prevNaver, prevGoogle, prevMeta, prevLeads }
 *   userInputs { adjustments, issues, nextAgenda }
 */

const SYSTEM_PROMPT = `당신은 리스페이스(RESPACE) 전담 B2B 퍼포먼스 마케팅 애널리스트입니다.
글로업(GLOUP)의 인하우스 마케팅 파트너 관점에서 매주 퍼포먼스 데이터를 분석하고
팀이 즉각 액션할 수 있는 인사이트를 도출하는 역할입니다.

## 핵심 원칙
1. 모든 인사이트 문장에 반드시 수치 근거(절대값·비율·변화량 중 하나 이상) 포함
2. "~로 보인다", "~일 수 있다" 같은 추측 표현 금지 — 데이터 기반으로만 기술
3. Referral·Direct·(not set) 채널은 유입 경위 단정 금지 → "내부 확인 필요" 처리
4. 네이버의 역할: CAC 수치만으로 평가 절하하지 않는다. 국내 메이저 포탈 상위 노출은 브랜드 신뢰 신호이며, 네이버 유입 리드는 충분한 탐색 과정을 거친 고의도 타겟일 가능성이 높다는 맥락을 유지한다
5. 전환 목표/트래킹 변경 이력이 있으면 단순 전주 비교에 주의 문구 추가

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
  "oneLineSummary": "총 광고비 ₩XXX · 핵심 변화 · 주요 이슈 한 줄 요약 (80자 이내)",
  "kpis": [
    { "label": "총 광고비", "value": "₩XXX", "delta": "X%", "trend": "pos" },
    { "label": "총 광고 전환", "value": "XX건", "delta": "X%", "trend": "pos" },
    { "label": "구글 전환", "value": "XX건", "delta": "X% vs 전주", "trend": "pos" },
    { "label": "실제 리드", "value": "XX건", "delta": "X% vs 전주", "trend": "pos" },
    { "label": "네이버 CAC", "value": "₩X,XXX", "delta": "X% vs 전주", "trend": "pos" },
    { "label": "Meta 전환", "value": "XX건", "delta": "상태 메모", "trend": "neg" }
  ],
  "sections": [
    {
      "title": "1. 통합 데이터 기반 인사이트",
      "html": "<div class=\\"weekly-summary-card\\">...</div><table class=\\"weekly-table\\">...</table>"
    },
    {
      "title": "2-1. 네이버 검색광고",
      "html": "..."
    },
    {
      "title": "2-2. 구글 검색광고",
      "html": "..."
    },
    {
      "title": "2-3. 검색 광고 총평",
      "html": "..."
    },
    {
      "title": "3. Meta 광고",
      "html": "..."
    },
    {
      "title": "4. 지난주 변화 사항 중심 인사이트",
      "html": "..."
    }
  ]
}

## 섹션별 HTML 작성 기준
- weekly-summary-card: <div class="weekly-summary-card"><strong>핵심 문장</strong> 부연 설명</div>
- weekly-table: <table class="weekly-table"><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>
- delta-pos / delta-neg: <td class="delta-pos">+X% ✓</td> / <td class="delta-neg">-X% ✗</td>
- 인사이트 항목: <p>• <strong>판단</strong>: 근거 수치 (벤치마크 대비 포지션)</p>
- 조정사항 있을 때 [P0] 섹션: { "title": "5. [P0] 키워드 조정 현황", "html": "..." }
- 전주 대비 -20% 이상 하락 시: { "title": "8. [P0] 리드·딜·예산 이상 분석", "html": "..." }
- trend 값: "pos" (좋음) / "neg" (나쁨) / "neutral"`;


module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버 설정 오류입니다.' });

  const { weekInfo, rawData, userInputs } = req.body || {};

  if (!weekInfo || !rawData) {
    return res.status(400).json({ error: '주차 정보와 데이터가 필요합니다.' });
  }

  const userMessage = buildUserMessage(weekInfo, rawData, userInputs);

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
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) throw new Error(data.error?.message || `API 오류 (${upstream.status})`);

    const raw = data.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('인사이트 파싱 실패 — JSON을 찾을 수 없습니다.');

    const insight = JSON.parse(jsonMatch[0]);

    // WEEKLY_REPORTS 엔트리 형식으로 조립
    const entry = {
      id: weekInfo.id,
      weekLabel: weekInfo.weekLabel,
      meetingDate: weekInfo.meetingDate,
      periodLabel: weekInfo.periodLabel,
      comparePeriod: weekInfo.comparePeriod,
      isLatest: true,
      oneLineSummary: insight.oneLineSummary,
      kpis: insight.kpis,
      sections: insight.sections
    };

    return res.status(200).json({ ok: true, entry });

  } catch (err) {
    return res.status(500).json({ error: `인사이트 생성 중 오류: ${err.message}` });
  }
};


// ── 사용자 메시지 구성 ──────────────────────────────────────────
function buildUserMessage(weekInfo, raw, inputs) {
  const lines = [];

  lines.push(`## 분석 주차: ${weekInfo.weekLabel}`);
  lines.push(`기간: ${weekInfo.periodLabel}`);
  lines.push(`비교: ${weekInfo.comparePeriod}`);
  lines.push('');

  // 광고 데이터 (이번 주)
  lines.push('### 이번 주 광고 데이터');
  if (raw.naver) {
    const n = raw.naver;
    lines.push(`**네이버 검색광고**`);
    lines.push(`- 총 비용: ${fmtNum(n.totalSpend)}원 | 노출: ${fmtNum(n.totalImpressions)} | 클릭: ${fmtNum(n.totalClicks)} | 전환: ${n.totalConv}건`);
    if (n.totalClicks > 0) lines.push(`- CTR: ${pct(n.totalClicks, n.totalImpressions)} | CPC: ${fmtNum(Math.round(n.totalSpend / n.totalClicks))}원`);
    if (n.totalConv > 0) lines.push(`- CAC: ${fmtNum(Math.round(n.totalSpend / n.totalConv))}원`);
    if (n.groups && Object.keys(n.groups).length) {
      lines.push(`- 그룹별: ${Object.entries(n.groups).map(([k, v]) => `${k}(비용 ${fmtNum(v.spend)}원, 전환 ${v.conv}건)`).join(' / ')}`);
    }
  }
  if (raw.google) {
    const g = raw.google;
    lines.push(`**구글 검색광고**`);
    lines.push(`- 총 비용: ${fmtNum(g.totalSpend)}원 | 노출: ${fmtNum(g.totalImpressions)} | 클릭: ${fmtNum(g.totalClicks)} | 전환: ${g.totalConv}건`);
    if (g.totalClicks > 0) lines.push(`- CTR: ${pct(g.totalClicks, g.totalImpressions)} | CPC: ${fmtNum(Math.round(g.totalSpend / g.totalClicks))}원`);
    if (g.totalConv > 0) lines.push(`- CAC: ${fmtNum(Math.round(g.totalSpend / g.totalConv))}원`);
  }
  if (raw.meta) {
    const m = raw.meta;
    lines.push(`**Meta 광고**`);
    lines.push(`- 총 비용: ${fmtNum(m.totalSpend)}원 | 노출: ${fmtNum(m.totalImpressions)} | 클릭: ${fmtNum(m.totalClicks)} | 전환: ${m.totalConv}건`);
    if (m.totalClicks > 0) lines.push(`- CTR: ${pct(m.totalClicks, m.totalImpressions)} | CPC: ${fmtNum(Math.round(m.totalSpend / m.totalClicks))}원`);
    if (m.campaigns && Object.keys(m.campaigns).length) {
      lines.push(`- 캠페인별: ${Object.entries(m.campaigns).map(([k, v]) => `${k}(비용 ${fmtNum(v.spend)}원, 전환 ${v.conv}건)`).join(' / ')}`);
    }
  }

  // 리드 데이터
  if (raw.leads !== undefined) {
    lines.push(`**실제 리드 (리캐치)**: ${raw.leads}건`);
  }
  if (raw.deals !== undefined) {
    lines.push(`**실제 딜 (리캐치)**: ${raw.deals}건`);
  }

  // 전주 비교 데이터
  lines.push('');
  lines.push('### 전주 비교 데이터');
  if (raw.prevNaver) {
    const pn = raw.prevNaver;
    lines.push(`전주 네이버: 비용 ${fmtNum(pn.totalSpend)}원 | 클릭 ${fmtNum(pn.totalClicks)} | 전환 ${pn.totalConv}건${pn.totalConv > 0 ? ` | CAC ${fmtNum(Math.round(pn.totalSpend / pn.totalConv))}원` : ''}`);
  }
  if (raw.prevGoogle) {
    const pg = raw.prevGoogle;
    lines.push(`전주 구글: 비용 ${fmtNum(pg.totalSpend)}원 | 클릭 ${fmtNum(pg.totalClicks)} | 전환 ${pg.totalConv}건${pg.totalConv > 0 ? ` | CAC ${fmtNum(Math.round(pg.totalSpend / pg.totalConv))}원` : ''}`);
  }
  if (raw.prevMeta) {
    const pm = raw.prevMeta;
    lines.push(`전주 Meta: 비용 ${fmtNum(pm.totalSpend)}원 | 클릭 ${fmtNum(pm.totalClicks)} | 전환 ${pm.totalConv}건`);
  }
  if (raw.prevLeads !== undefined) lines.push(`전주 리드: ${raw.prevLeads}건`);
  if (raw.prevDeals !== undefined) lines.push(`전주 딜: ${raw.prevDeals}건`);

  // 사용자 입력
  lines.push('');
  lines.push('### 운영 정보');
  if (inputs?.adjustments) lines.push(`**이번 주 조정/변경**: ${inputs.adjustments}`);
  if (inputs?.issues) lines.push(`**특이사항/이슈**: ${inputs.issues}`);
  if (inputs?.nextAgenda) lines.push(`**다음 주 논의 안건**: ${inputs.nextAgenda}`);

  lines.push('');
  lines.push('위 데이터를 기반으로 주간 인사이트를 생성해 주세요.');
  lines.push('벤치마크 대비 포지션을 명확히 판단하고, 전주 대비 증감을 모든 수치에 병기해 주세요.');

  return lines.join('\n');
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('ko-KR');
}

function pct(part, total) {
  if (!total || total === 0) return '0%';
  return (part / total * 100).toFixed(2) + '%';
}
