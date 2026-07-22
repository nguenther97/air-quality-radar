const API = 'https://api.github.com';

function repoSlug() {
  const slug = process.env.GITHUB_REPOSITORY;
  if (!slug) throw new Error('GITHUB_REPOSITORY not set (expected in Actions env)');
  return slug;
}

async function gh(path, options = {}) {
  const res = await fetch(`${API}/repos/${repoSlug()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'air-quality-radar-bot',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function createIssue({ title, body, labels }) {
  const issue = await gh('/issues', { method: 'POST', body: JSON.stringify({ title, body, labels }) });
  return issue.number;
}

export async function addComment(issueNumber, body) {
  await gh(`/issues/${issueNumber}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function closeIssue(issueNumber, comment) {
  if (comment) await addComment(issueNumber, comment);
  await gh(`/issues/${issueNumber}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
}
