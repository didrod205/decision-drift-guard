import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, Stack, Inline, Lozenge, Link, DynamicTable, Spinner, SectionMessage, Button, Strong } from '@forge/react';
import { invoke } from '@forge/bridge';

const KIND = { conflict: ['removed', 'Conflict'], 'possible-conflict': ['moved', 'Possible conflict'], 'reopen-requested': ['inprogress', 'Reopen requested'] };
const day = (s) => String(s || '').slice(0, 16).replace('T', ' ');

const App = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => { setData(null); invoke('history').then(setData).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  if (err) return <SectionMessage appearance="error" title="Could not load history"><Text>{err}</Text></SectionMessage>;
  if (!data) return <Spinner />;
  const groups = {};
  data.rows.forEach((r) => { (groups[r.decisionId] = groups[r.decisionId] || []).push(r); });
  const ids = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  const issues = new Set(data.rows.map((r) => r.issueKey));
  const reopens = data.rows.filter((r) => r.kind === 'reopen-requested').length;
  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Text>Which recorded decisions new work keeps drifting from, with the evidence for each flag.</Text>
        <Button onClick={load}>Refresh</Button>
      </Inline>
      <Text>Every time a work item was found to conflict, or possibly conflict, with a recorded decision, and every reopen request. Kept in this app's own storage on Atlassian; decision pages are never edited.</Text>
      <Text><Strong>{ids.length}</Strong> {ids.length === 1 ? 'decision' : 'decisions'} drifted from, <Strong>{issues.size}</Strong> {issues.size === 1 ? 'work item' : 'work items'} flagged, <Strong>{reopens}</Strong> {reopens === 1 ? 'reopen request' : 'reopen requests'}.</Text>
      {ids.length === 0 ? <SectionMessage appearance="information"><Text>Nothing yet. Create a work item that goes against a decision, or use Create sample data in the settings page.</Text></SectionMessage> : null}
      {ids.map((id) => {
        const rows = groups[id];
        const head = rows.find((r) => r.decisionTitle) || rows[0];
        return (
          <Stack key={id} space="space.100">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              {head.decisionUrl ? <Link href={head.decisionUrl} openNewTab>{head.decisionTitle || id}</Link> : <Text>{head.decisionTitle || id}</Text>}
              <Text size="small" color="color.text.subtlest">{rows.length} {rows.length === 1 ? 'event' : 'events'}</Text>
            </Inline>
            <DynamicTable
              head={{ cells: [{ key: 'i', content: 'Work item' }, { key: 'k', content: 'Result' }, { key: 's', content: 'Found by' }, { key: 'e', content: 'Evidence' }, { key: 'f', content: 'First seen (UTC)' }, { key: 'l', content: 'Last seen (UTC)' }] }}
              rows={rows.map((r, n) => ({ key: `${id}-${n}`, cells: [
                { key: 'i', content: <Link href={`${data.base}/browse/${r.issueKey}`} openNewTab>{r.issueKey}</Link> },
                { key: 'k', content: <Lozenge appearance={(KIND[r.kind] || ['default'])[0]}>{(KIND[r.kind] || [r.kind, r.kind])[1]}</Lozenge> },
                { key: 's', content: r.source },
                { key: 'e', content: r.quote ? `"${r.quote}"` : r.rule || '' },
                { key: 'f', content: day(r.firstSeen) },
                { key: 'l', content: day(r.lastSeen) },
              ] }))}
            />
          </Stack>
        );
      })}
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
