import { TEMPLATES } from './src/data/mock';

const base = 'http://localhost:5000';
async function run() {
  const d = (await (await fetch(base + '/api/sync')).json()) as any;
  const body = { ...d, templates: TEMPLATES };
  const r = await fetch(base + '/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = (await r.json()) as any;
  console.log(
    'templates now:',
    Array.isArray(res.templates) ? res.templates.length : '?',
    '| projects:',
    Array.isArray(res.projects) ? res.projects.length : '?',
    '| team:',
    Array.isArray(res.team) ? res.team.length : '?'
  );
}
run().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});