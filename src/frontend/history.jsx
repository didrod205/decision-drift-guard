import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Text, Stack, Inline, Lozenge, Link, DynamicTable, Spinner, SectionMessage, Button, Strong } from '@forge/react';
import { invoke } from '@forge/bridge';

const KIND = { conflict: ['removed', 'Conflict'], 'possible-conflict': ['moved', 'Possible conflict'], 'reopen-requested': ['inprogress', 'Reopen requested'], 'decision-changed': ['new', 'Decision changed'] };
const CH = { retired: ['removed', 'Retired'], changed: ['moved', 'Text changed'], ignored: ['default', 'Ignored edit'] };
const day = (s) => String(s || '').slice(0, 16).replace('T', ' ');

const App = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [chg, setChg] = useState(null);
  const load = () => { setData(null); invoke('history').then(setData).catch((e) => setErr(e.message)); invoke('changes').then(setChg).catch(() => setChg(null)); };
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
      <Heading as="h3">Decision changes and the work they affected</Heading>
      {chg && chg.changes.length ? (
        <DynamicTable
          head={{ cells: [{ key: 'd', content: 'Decision' }, { key: 'v', content: 'Version' }, { key: 'k', content: 'Result' }, { key: 'w', content: 'What changed' }, { key: 'a', content: 'Work items commented' }, { key: 't', content: 'When (UTC)' }] }}
          rows={chg.changes.filter((c) => c.state === 'done').map((c, n) => ({ key: `c-${n}`, cells: [
            { key: 'd', content: c.url ? <Link href={c.url} openNewTab>{c.title || c.pageId}</Link> : (c.title || c.pageId) },
            { key: 'v', content: `${c.version - 1} to ${c.version}` },
            { key: 'k', content: <Lozenge appearance={(CH[c.kind] || ['default'])[0]}>{(CH[c.kind] || [c.kind, c.kind])[1]}</Lozenge> },
            { key: 'w', content: `${c.reason}${c.replacement ? `. Replaced by ${c.replacement.title}` : ''}` },
            { key: 'a', content: c.affected && c.affected.length ? <Inline space="space.050" shouldWrap>{c.affected.map((k) => <Link key={k} href={`${chg.base}/browse/${k}`} openNewTab>{k}</Link>)}</Inline> : `none (${(c.linked || []).length} linked)` },
            { key: 't', content: day(c.at) },
          ] }))}
        />
      ) : <Text>No followed decision has changed yet.</Text>}
      {chg ? <Text size="small" color="color.text.subtlest">{chg.links.length} links between work items and decisions. Rule: a version counts only if the status becomes Superseded, Deprecated, Rejected (or similar), or a sentence of the decision text is added or removed; other edits are listed as Ignored edit and nobody is notified.</Text> : null}
      <Heading as="h3">Drift found in new work items</Heading>
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
