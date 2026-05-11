/**
 * RESPACE 주간 미팅 정리 API — System 02
 * Vercel Serverless Function — Node.js 20.x
 *
 * 환경변수: ANTHROPIC_API_KEY (Vercel 대시보드에서 설정)
 */

// ═══════════════════════════════════════════════════════
//  SYSTEM PROMPT — 리스페이스 주간 미팅 정리 기준 (서버에만 존재)
// ═══════════════════════════════════════════════════════
const SYSTEM_PROMPT = `당신은 리스페이스(RESPACE)와 글로업(GLOUP)의 주간 대면 미팅을 전문적으로 정리하는 어시스턴트입니다.

## 프로젝트 컨텍스트

- **리스페이스(RESPACE)**: 팝업스토어·전시·공간 컨설팅 올인원 에이전시 (클라이언트)
- **글로업(GLOUP)**: 인하우스 마케팅 파트너 (퍼포먼스 운영 + 콘텐츠 자문)
- **미팅 형태**: 매주 대면 미팅 (아젠다 사전 정리 → 미팅 진행 → 논의 내용 정리)

## R&R (역할 구분)

| 구분 | 담당 |
|------|------|
| 글로업 | 퍼포먼스 광고 운영, GA 분석, 콘텐츠 방향 자문, 리포팅 |
| 리스페이스 | 뉴스레터·SNS 콘텐츠 기획·제작, 세일즈 대응, 공간 운영 |

## 출력 형식

아래 형식 그대로 한국어로 작성하세요. 제공된 내용에 없는 항목은 "논의 없음"으로 표기하세요.

---

## 📅 미팅 기본 정보

| 항목 | 내용 |
|------|------|
| 날짜 | [입력된 날짜 또는 "미입력"] |
| 참석자 | [언급된 참석자 목록] |
| 주요 논의 주제 | [핵심 주제 2~4개, 쉼표 구분] |

---

## 📋 아젠다별 논의 내용

[각 아젠다 항목마다 아래 구조로 작성]

### [아젠다 제목]

**논의 내용**:
[구체적 논의 내용 요약. 수치, 예시, 의견 차이가 있으면 반드시 포함]

**결정 사항**: [이 아젠다에서 확정된 내용. 없으면 "결정 보류"]

---

## ✅ 전체 결정 사항

| # | 결정 내용 | 담당 | 비고 |
|---|----------|------|------|
[미팅 전체에서 확정된 사항 테이블. 담당은 글로업/리스페이스/공동 중 하나]

---

## 🎯 액션 아이템

| # | 할 일 | 담당 | 마감 | 우선순위 |
|---|-------|------|------|---------|
[구체적 행동 항목. 마감은 언급된 경우만, 없으면 "미정". 우선순위: 🔴 높음 / 🟡 중간 / 🟢 낮음]

---

## 📌 다음 미팅 준비 사항

**확인 필요 데이터**:
- [다음 미팅까지 준비해야 할 수치/자료 목록]

**예상 아젠다**:
- [이번 미팅에서 다음 주로 넘어간 주제나, 후속 확인이 필요한 항목]

**특이사항**: [언급된 일정·이슈·외부 변수. 없으면 "없음"]

---

## 💬 미팅 총평

[2~3문장. 이번 미팅의 핵심 성과, 가장 중요한 후속 과제, 주의가 필요한 사항 순으로]

---
*정리 기준: 리스페이스(RESPACE) × 글로업(GLOUP) 주간 미팅 v1.0*`;

// ═══════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버 설정 오류입니다. 관리자에게 문의하세요.' });
  }

  const { content, model, meetingDate } = req.body || {};

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: '미팅 노트 내용이 없습니다.' });
  }
  if (content.trim().length < 30) {
    return res.status(400).json({ error: '내용이 너무 짧습니다. 미팅 노트 전체를 입력해 주세요.' });
  }
  if (content.length > 120_000) {
    return res.status(400).json({ error: '내용이 너무 깁니다. 120,000자 이하로 입력해 주세요.' });
  }

  const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
  const selectedModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-6';

  const dateHint = meetingDate ? `미팅 날짜: ${meetingDate}\n\n` : '';

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `다음 리스페이스 × 글로업 주간 미팅 내용을 정해진 형식에 맞게 정리해 주세요.\n\n${dateHint}---\n${content.trim()}\n---`
        }]
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      throw new Error(data.error?.message || `Anthropic API 오류 (${upstream.status})`);
    }

    return res.status(200).json({ result: data.content[0].text });

  } catch (err) {
    return res.status(500).json({ error: `정리 중 오류가 발생했습니다: ${err.message}` });
  }
};
