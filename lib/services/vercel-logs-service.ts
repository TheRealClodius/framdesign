const VERCEL_API = 'https://api.vercel.com';

interface FramMessage {
  userId: string;
  message: string;
  tools: string[];
  ts: number;
}

export interface ParsedLogEntry {
  userId: string;
  message: string;
  toolsCalled: string[];
  timestamp: number;
}

function getConfig() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token) throw new Error('Missing VERCEL_TOKEN');
  if (!projectId) throw new Error('Missing VERCEL_PROJECT_ID');

  return { token, projectId, teamId };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function getProductionDeploymentId(token: string, projectId: string, teamId?: string): Promise<string> {
  const params = new URLSearchParams({
    projectId,
    target: 'production',
    limit: '1',
    state: 'READY',
  });
  if (teamId) params.set('teamId', teamId);

  const res = await fetch(`${VERCEL_API}/v6/deployments?${params}`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Vercel deployments API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const deployment = data.deployments?.[0];
  if (!deployment?.uid) {
    throw new Error('No production deployment found');
  }

  return deployment.uid;
}

export async function fetchRecentUserMessages(hours = 24): Promise<ParsedLogEntry[]> {
  const { token, projectId, teamId } = getConfig();
  const deploymentId = await getProductionDeploymentId(token, projectId, teamId);

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const url = `${VERCEL_API}/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs${params.toString() ? '?' + params : ''}`;

  const res = await fetch(url, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Vercel runtime-logs API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const logs: Array<{ message?: string; timestampInMs?: number }> = Array.isArray(data) ? data : data.logs || [];

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const entries: ParsedLogEntry[] = [];

  for (const log of logs) {
    if (!log.message) continue;

    const match = log.message.match(/\[FRAM_MSG]\s*(.+)/);
    if (!match) continue;

    try {
      const parsed: FramMessage = JSON.parse(match[1]);
      if (parsed.ts < cutoff) continue;

      entries.push({
        userId: parsed.userId,
        message: parsed.message,
        toolsCalled: parsed.tools || [],
        timestamp: parsed.ts,
      });
    } catch {
      // Skip malformed log lines
    }
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}
