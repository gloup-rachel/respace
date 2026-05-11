/**
 * RESPACE 대시보드 자동 업데이트 API
 * Vercel Serverless Function — Node.js 20.x
 *
 * GitHub API로 respace_dashboard_v3.html을 직접 커밋한다.
 * Vercel 자동 배포가 연결되어 있으면 push 후 1~2분 내 반영된다.
 *
 * 환경변수: GITHUB_TOKEN (repo 권한 classic PAT)
 *
 * POST body:
 *   content  string — 업데이트된 HTML 전체 내용
 *   weekLabel string — 커밋 메시지용 주차 레이블 (예: "W19")
 */

const REPO_OWNER = 'gloup-rachel';
const REPO_NAME  = 'respace';
const FILE_PATH  = 'respace_dashboard_v3.html';
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

  const { content, weekLabel = '' } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content가 필요합니다.' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'respace-ai-system'
  };

  try {
    // 1. 현재 파일 SHA 조회 (업데이트에 필수)
    const getRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`,
      { headers }
    );

    if (!getRes.ok) {
      const err = await getRes.json();
      throw new Error(`파일 조회 실패 (${getRes.status}): ${err.message}`);
    }

    const fileData = await getRes.json();
    const sha = fileData.sha;

    // 2. 파일 내용을 Base64로 인코딩
    const encoded = Buffer.from(content, 'utf-8').toString('base64');

    // 3. 파일 업데이트 커밋
    const now = new Date().toISOString().slice(0, 10);
    const commitMessage = weekLabel
      ? `feat: ${weekLabel} 주간 인사이트 반영 (${now})`
      : `feat: 대시보드 주간 인사이트 업데이트 (${now})`;

    const putRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          content: encoded,
          sha,
          branch: BRANCH
        })
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(`커밋 실패 (${putRes.status}): ${err.message}`);
    }

    const putData = await putRes.json();

    return res.status(200).json({
      ok: true,
      commitUrl: putData.commit?.html_url || '',
      message: `${weekLabel || '대시보드'} 업데이트가 완료되었습니다. Vercel 배포 후 1~2분 내 반영됩니다.`
    });

  } catch (err) {
    return res.status(500).json({ error: `대시보드 업데이트 실패: ${err.message}` });
  }
};
