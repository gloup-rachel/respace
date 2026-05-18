/**
 * RESPACE 주간 인사이트 생성 API — System 05 (v2)
 * Vercel Serverless Function — Node.js 20.x
 *
 * respace-weekly-report 스킬 기반으로 재구현.
 * 대시보드 WEEKLY_REPORTS 배열에 삽입할 엔트리를 생성한다.
 *
 * POST body (mode: "generate"):
 *   weekInfo   { id, weekLabel, meetingDate, periodLabel, comparePeriod }
 *   rawData    { naver, google, meta, leads, deals, prevNaver, prevGoogle, prevMeta, prevLeads, prevDeals }
 *   userInputs { adjustments, issues, nextAgenda }
 *
 * POST body (mode: "refine"):
 *   weekInfo      (동일)
 *   rawData       (동일)
 *   userInputs    (동일)
 *   previousEntry { oneLineSummary, kpis, sections } — 직전 버전 엔트리
 *   feedback      string — 퍼포먼스 마케터 피드백
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

## 분석 필수 구조 — 모든 채널·지표에 반드시 적용
각 채널(네이버/구글/Meta)과 리드·딜 분석은 아래 3단계 구조를 반드시 따른다.
단순 수치 나열로 끝내지 말고, 성과가 좋든 나쁘든 반드시 이유와 액션까지 작성할 것.

[현상] 지표명 수치 변화 (전주 대비 +/-X%, 벤치마크 대비 상태)
  → Reason: 해당 변화가 발생한 구체적 이유를 데이터·맥락·운영 변수 기반으로 분석
             (예: CPC 상승 → 노출 순위 하락 → 클릭수 감소 / 시즌 이슈 / 경쟁 강도 변화 등)
  → Solution: 다음 주 즉시 실행 가능한 구체적 액션 또는 추가 확인 필요 항목
              (예: 특정 키워드 OFF / 입찰가 조정 / 소재 교체 / 추이 모니터링 등)

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
      "title": "4. 리드·딜 전환 분석",
      "html": "..."
    },
    {
      "title": "5. 지난주 변화 사항 중심 인사이트",
      "html": "..."
    }
  ]
}

## 섹션별 HTML 작성 기준
- weekly-summary-card: <div class="weekly-summary-card"><strong>핵심 문장</strong> 부연 설명</div>
- weekly-table: <table class="weekly-table"><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>
- delta-pos / delta-neg: <td class="delta-pos">+X% ✓</td> / <td class="delta-neg">-X% ✗</td>

### 인사이트 항목 작성 패턴 (현상 → Reason → Solution 3단계 필수)
<p>• <strong>[현상]</strong> 지표명 수치 변화 (전주 대비 / 벤치마크 대비)</p>
<p class="reason">&nbsp;&nbsp;→ <strong>Reason</strong>: 변화 원인 — 운영 변수·시즌·경쟁 등 다각도 분석</p>
<p class="solution">&nbsp;&nbsp;→ <strong>Solution</strong>: 다음 주 실행 액션 또는 확인 필요 항목</p>

- 조정사항 있을 때 [P0] 섹션: { "title": "6. [P0] 키워드 조정 현황", "html": "..." }
- 전주 대비 -20% 이상 하락 시: { "title": "7. [P0] 리드·딜·예산 이상 분석", "html": "..." }
- trend 값: "pos" (좋음) / "neg" (나쁨) / "neutral"`;


module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버 설정 오류입니다.' });

  const { mode = 'generate', weekInfo, rawData, userInputs, previousEntry, feedback } = req.body || {};

  if (!weekInfo || !rawData) {
    return res.status(400).json({ error: '주차 정보와 데이터가 필요합니다.' });
  }
  if (mode === 'refine' && (!previousEntry || !feedback)) {
    return res.status(400).json({ error: 'refine 모드에는 이전 인사이트와 피드백이 필요합니다.' });
  }

  const userMessage = mode === 'refine'
    ? buildRefineMessage(weekInfo, rawData, userInputs, previousEntry, feedback)
    : buildUserMessage(weekInfo, rawData, userInputs);

  // ── SSE 스트리밍 응답 설정 ──────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Vercel 버퍼링 비활성화

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

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
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      sendEvent({ type: 'error', message: errData.error?.message || `API 오류 (${upstream.status})` });
      return res.end();
    }

    // Anthropic SSE 스트림 읽기 + 클라이언트로 진행 상황 전달
    let fullText = '';
    let charCount = 0;
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 마지막 불완전 라인은 다음 청크로

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;

        try {
          const event = JSON.parse(raw);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            charCount += text.length;

            // 50자마다 진행 상황 전송 (너무 잦은 전송 방지)
            if (charCount % 50 < text.length) {
              sendEvent({ type: 'progress', chars: fullText.length });
            }
          }
        } catch (_) { /* JSON 파싱 실패 무시 */ }
      }
    }

    // 전체 텍스트에서 JSON 파싱
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      sendEvent({ type: 'error', message: '인사이트 파싱 실패 — Claude 응답에서 JSON을 찾을 수 없습니다.' });
      return res.end();
    }

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

    sendEvent({ type: 'done', entry });
    return res.end();

  } catch (err) {
    sendEvent({ type: 'error', message: `인사이트 생성 중 오류: ${err.message}` });
    return res.end();
  }
};


// ── 피드백 refine 메시지 ──────────────────────────────────────────
function buildRefineMessage(weekInfo, raw, inputs, prev, feedback) {
  return `아래는 이번 주(${weekInfo.weekLabel}) 퍼포먼스 인사이트의 직전 버전과 퍼포먼스 마케터의 피드백입니다.
피드백을 반영하여 수정된 인사이트를 생성해 주세요.

## 원본 데이터
${buildUserMessage(weekInfo, raw, inputs)}

## 직전 인사이트 버전
oneLineSummary: ${prev.oneLineSummary}
섹션 목록:
${(prev.sections || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n')}

## 퍼포먼스 마케터 피드백
${feedback}

## 지침
- 피드백이 언급한 섹션을 우선 수정하되, 전체 맥락 일관성도 유지해 주세요.
- 수정되지 않은 섹션도 동일한 JSON 구조로 포함해 주세요.
- oneLineSummary도 변경 내용을 반영하여 업데이트해 주세요.
- 반드시 동일한 JSON 형식으로만 출력하세요.`;
}

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
