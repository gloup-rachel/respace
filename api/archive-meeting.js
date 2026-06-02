/**
 * RESPACE 주간 미팅 액션 자동 아카이빙 API — System 02
 * Vercel Serverless Function — Node.js 20.x
 *
 * meeting.html이 추출한 Next Action JSON을 받아
 * GitHub 저장소의 data/meeting-actions.json 누적 파일에 append(또는 같은 주차면 교체) 커밋한다.
 * Vercel 자동 배포로 1~2분 내 /meeting-archive 뷰어에 반영된다.
 *
 * 환경변수: GITHUB_TOKEN (repo 권한 classic PAT — update-dashboard.js와 동일)
 *
 * POST body:
 *   week              string  — 예: "6월 1주차"
 *   meeting_date      string  — YYYY-MM-DD (중복 판단 키)
 *   next_meeting_date string  — YYYY-MM-DD
 *   actions           array   — [{ category, owner, due, action, context }, ...]
 */

const REPO_OWNER = 'gloup-rachel';
const REPO_NAME  = 'respace';
const FILE_PATH  = 'data/meeting-actions.json';
const BRANCH     = 'main';
const GITHUB_API = 'https://api.github.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다.' });

  const { week = '', meeting_date = '', next_meeting_date = '', actions } = req.body || {};

  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: '아카이빙할 actions 배열이 없습니다.' });
  }
  if (!meeting_date) {
    return res.status(400).json({ error: 'meeting_date가 필요합니다. (중복 판단 키)' });
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'respace-ai-system'
  };

  const archivedAt = new Date().toISOString();
  const entry = { week, meeting_date, next_meeting_date, actions, archived_at: archivedAt };

  try {
    // 1. 기존 누적 파일 조회 (없으면 새로 생성)
    let existing = [];
    let sha;

    const getRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`,
      { headers }
    );

    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
      try {
        const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) existing = parsed;
      } catch (_) {
        existing = []; // 손상 시 빈 배열로 복구
      }
    } else if (getRes.status !== 404) {
      const err = await getRes.json();
      throw new Error(`아카이브 파일 조회 실패 (${getRes.status}): ${err.message}`);
    }

    // 2. 같은 meeting_date면 교체, 아니면 append → 날짜 내림차순 정렬
    const replaced = existing.some(e => e.meeting_date === meeting_date);
    const filtered = existing.filter(e => e.meeting_date !== meeting_date);
    filtered.push(entry);
    filtered.sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''));

    // 3. 커밋
    const content = JSON.stringify(filtered, null, 2) + '\n';
    const encoded = Buffer.from(content, 'utf-8').toString('base64');
    const commitMessage = `chore(meeting): ${replaced ? 'update' : 'add'} ${week || meeting_date} 액션 아카이브 (${meeting_date})`;

    const body = { message: commitMessage, content: encoded, branch: BRANCH };
    if (sha) body.sha = sha;

    const putRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      { method: 'PUT', headers, body: JSON.stringify(body) }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(`아카이브 커밋 실패 (${putRes.status}): ${err.message}`);
    }

    const putData = await putRes.json();

    return res.status(200).json({
      ok: true,
      replaced,
      saved: actions.length,
      total_weeks: filtered.length,
      commitUrl: putData.commit?.html_url || '',
      message: `${week || meeting_date} 액션 ${actions.length}건이 아카이브에 ${replaced ? '갱신' : '저장'}되었습니다.`
    });

  } catch (err) {
    return res.status(500).json({ error: `아카이빙 실패: ${err.message}` });
  }
};
