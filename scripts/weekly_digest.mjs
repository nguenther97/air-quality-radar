import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'nguenther97/air-quality-radar';
const DASHBOARD_URL = 'https://nguenther97.github.io/air-quality-radar/';
const ISSUES_URL = `https://github.com/${REPO}/issues`;
const TO_ADDRESSES = [
  'wlee@alen.com',
  'jpolland@alen.com',
  'wevans@alen.com',
  'Jeffm@ampersandagency.com',
];

async function fetchOpenIssues() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues?state=open&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

async function readRoadmap() {
  try {
    return await readFile(path.join(ROOT, 'ROADMAP.md'), 'utf8');
  } catch {
    return null;
  }
}

async function getCompetitorPulse() {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 800,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }],
    messages: [
      {
        role: 'user',
        content: `You are writing a "competitor pulse" paragraph for a weekly internal email at Alen Air, an air purifier brand. The audience is marketing, paid media, and the CEO.

Do ONE web search covering recent news about air purifier competitors and air quality marketing. Search for: "air purifier IQAir Dyson Blueair Levoit Coway marketing campaign 2026"

Write 2-4 sentences in plain English summarizing anything notable from the past 7 days. Be specific — name the company and what they did. If nothing notable happened this week, say "Nothing notable this week in the competitive landscape." Do not use bullet points. Use at most 1 search.`,
      },
    ],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text ?? 'No competitive intelligence available this week.';
}

function roadmapToHtml(markdown) {
  const lines = [];
  let inList = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (inList) { lines.push('</ul>'); inList = false; }
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { lines.push('</ul>'); inList = false; }
      lines.push(`<h4 style="margin:12px 0 4px; color:#444;">${line.slice(3)}</h4>`);
    } else if (line.startsWith('# ')) {
      if (inList) { lines.push('</ul>'); inList = false; }
    } else if (line.startsWith('- ')) {
      if (!inList) { lines.push('<ul style="margin:4px 0; padding-left:20px;">'); inList = true; }
      lines.push(`<li style="margin:3px 0;">${line.slice(2)}</li>`);
    } else {
      if (inList) { lines.push('</ul>'); inList = false; }
      lines.push(`<p style="margin:4px 0;">${line}</p>`);
    }
  }
  if (inList) lines.push('</ul>');
  return lines.join('\n');
}

function buildEmailHtml(issues, roadmap, competitorPulse) {
  const weekStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const alertIssues = issues.filter((i) => i.labels.some((l) => l.name === 'alert'));
  const watchIssues = issues.filter(
    (i) => i.labels.some((l) => l.name === 'watch') && !i.labels.some((l) => l.name === 'alert'),
  );

  const issueList = (arr, color) =>
    arr.length > 0
      ? `<ul style="margin:4px 0; padding-left:20px;">${arr
          .map((i) => `<li style="margin:3px 0;"><a href="${i.html_url}" style="color:${color};">${i.title}</a></li>`)
          .join('')}</ul>`
      : '<p style="color:#888; font-style:italic; margin:4px 0;">None this week.</p>';

  const roadmapHtml = roadmap
    ? roadmapToHtml(roadmap)
    : '<p style="color:#888; font-style:italic;">No roadmap updates.</p>';

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif; max-width:620px; margin:0 auto; color:#222; padding:20px;">
  <div style="border-bottom:3px solid #0066cc; padding-bottom:12px; margin-bottom:20px;">
    <h2 style="margin:0; color:#0066cc;">Alen Air Quality Radar</h2>
    <p style="margin:4px 0 0; color:#666; font-size:13px;">Weekly Digest &mdash; ${weekStr}</p>
  </div>

  <h3 style="color:#333; margin-bottom:4px;">📊 Dashboard</h3>
  <p style="margin:4px 0 6px;"><a href="${DASHBOARD_URL}" style="color:#0066cc; font-size:15px;">${DASHBOARD_URL}</a></p>
  <p style="margin:0 0 20px; font-size:13px; color:#555;">Real-time US + Canada air quality, updated every 30 minutes. Elevated markets and top marketing opportunities are surfaced automatically.</p>

  <h3 style="color:#cc3300; margin-bottom:4px;">🚨 Active Alerts</h3>
  ${issueList(alertIssues, '#cc3300')}

  <h3 style="color:#e68a00; margin-bottom:4px; margin-top:16px;">👀 Watch List</h3>
  ${issueList(watchIssues, '#e68a00')}

  <p style="font-size:12px; margin:8px 0 20px;"><a href="${ISSUES_URL}" style="color:#888;">View all open alerts on GitHub →</a></p>

  <h3 style="color:#333; margin-bottom:4px;">🔧 What We're Building</h3>
  ${roadmapHtml}

  <div style="margin-top:20px; padding:16px; background:#f8f8f8; border-left:4px solid #ccc; border-radius:0 4px 4px 0;">
    <h3 style="color:#333; margin:0 0 8px;">🏁 Competitor Pulse</h3>
    <p style="margin:0; font-size:14px; line-height:1.6;">${competitorPulse}</p>
  </div>

  <hr style="border:none; border-top:1px solid #eee; margin:24px 0 12px;">
  <p style="font-size:11px; color:#aaa; margin:0;">Auto-generated by the Alen AQR system. Questions? Natalie Guenther &mdash; nguenther@alen.com</p>
</body>
</html>`;
}

async function main() {
  console.log('Fetching open issues, roadmap, and competitor pulse...');
  const [issues, roadmap, competitorPulse] = await Promise.all([
    fetchOpenIssues(),
    readRoadmap(),
    getCompetitorPulse(),
  ]);

  console.log(`Issues: ${issues.length} open. Competitor pulse: ${competitorPulse.length} chars.`);

  const html = buildEmailHtml(issues, roadmap, competitorPulse);

  const webhookUrl = process.env.DIGEST_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DIGEST_WEBHOOK_URL secret not set — add it under repo Settings → Secrets → Actions.');

  const weekStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const subject = `Alen Air Quality Radar — Weekly Digest (${weekStr})`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, body: html, to: TO_ADDRESSES }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Power Automate webhook failed: ${res.status} — ${text}`);
  }

  console.log(`Done. Outlook draft created for review. Recipients: ${TO_ADDRESSES.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
