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
  const drift = data.rows.filter((r) => r.kind === 'conflict' || r.kind === 'possible-conflict' || r.kind === 'reopen-requested');
  const groups = {};
  drift.forEach((r) => { (groups[r.decisionId] = groups[r.decisionId] || []).push(r); });
  const ids = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  const done = chg ? chg.changes.filter((c) => c.state === 'done') : [];
  const count = (k) => done.filter((c) => c.kind === k).length;
  const touched = new Set(done.flatMap((c) => c.affected || []));
  const flagged = new Set(drift.filter((r) => r.kind !== 'reopen-requested').map((r) => r.issueKey));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Text>When a decision your work follows is retired or rewritten, the work items that follow it are told. Every version is listed here, including the edits that told nobody.</Text>
        <Button onClick={load}>Refresh</Button>
      </Inline>
      {chg ? <Inline space="space.100" alignBlock="center" shouldWrap>
        <Lozenge appearance="removed">{plural(count('retired'), 'retired', 'retired')}</Lozenge>
        <Lozenge appearance="moved">{plural(count('changed'), 'text change', 'text changes')}</Lozenge>
        <Lozenge appearance="default">{plural(count('ignored'), 'ignored edit', 'ignored edits')}</Lozenge>
        <Text>{`${plural(touched.size, 'work item', 'work items')} commented, ${plural(chg.links.length, 'follow link', 'follow links')} in total.`}</Text>
      </Inline> : null}
      <Heading as="h3">Decision changes and the work they affected</Heading>
      {done.length ? (
        <DynamicTable
          head={{ cells: [{ key: 'd', content: 'Decision' }, { key: 'v', content: 'Version' }, { key: 'k', content: 'Result' }, { key: 'w', content: 'What changed' }, { key: 'a', content: 'Work items commented' }, { key: 't', content: 'When (UTC)' }] }}
          rows={done.map((c, n) => ({ key: `c-${n}`, cells: [
            { key: 'd', content: c.url ? <Link href={c.url} openNewTab>{c.title || c.pageId}</Link> : (c.title || c.pageId) },
            { key: 'v', content: `${c.version - 1} to ${c.version}` },
            { key: 'k', content: <Lozenge appearance={(CH[c.kind] || ['default'])[0]}>{(CH[c.kind] || [c.kind, c.kind])[1]}</Lozenge> },
            { key: 'w', content: (
              <Stack space="space.050">
                {c.kind === 'retired' ? <Text>{`Status: ${c.fromStatus} to ${c.toStatus}`}</Text> : null}
                {c.replacement ? (c.replacement.url ? <Link href={c.replacement.url} openNewTab>{`Replaced by ${c.replacement.title}`}</Link> : <Text>{`Replaced by ${c.replacement.title}`}</Text>) : null}
                {(c.removed || []).slice(0, 3).map((x) => <Text key={`r${x}`} color="color.text.danger">{`Removed: "${x}"`}</Text>)}
                {(c.added || []).slice(0, 3).map((x) => <Text key={`a${x}`} color="color.text.success">{`Added: "${x}"`}</Text>)}
                {c.kind === 'ignored' ? <Text color="color.text.subtlest">{c.trivial ? `Only typo, spacing or link fixes (${c.trivial})` : 'Edit outside the decision text'}</Text> : null}
              </Stack>
            ) },
            { key: 'a', content: c.affected && c.affected.length ? <Inline space="space.050" shouldWrap>{c.affected.map((k) => <Link key={k} href={`${chg.base}/browse/${k}`} openNewTab>{k}</Link>)}</Inline> : <Text color="color.text.subtlest">{`none (${(c.linked || []).length} following)`}</Text> },
            { key: 't', content: day(c.at) },
          ] }))}
        />
      ) : <SectionMessage appearance="information" title="No followed decision has changed yet"><Text>Work items follow a decision when its page is linked in the description, added as a Confluence link, picked in the Decision check panel, or found by Scan in the app settings. When that page is marked Superseded, Deprecated, Rejected or Abandoned, or a decision sentence is added or removed, the change shows up here.</Text></SectionMessage>}
      <Text size="small" color="color.text.subtlest">Rule: a version counts only if the status becomes Superseded, Deprecated, Rejected, Abandoned (or similar), or a sentence of the decision text is added or removed. Typo, spacing, punctuation and link fixes and edits elsewhere on the page are listed as Ignored edit and nobody is told.</Text>
      <Heading as="h3">New work items that name a banned choice</Heading>
      <Text>{`${plural(ids.length, 'decision', 'decisions')}, ${plural(flagged.size, 'work item', 'work items')} flagged.`}</Text>
      {ids.length === 0 ? <SectionMessage appearance="information"><Text>Nothing flagged yet. This list fills when a new work item names something a decision bans, or, if turned on in Settings, from the experimental meaning check.</Text></SectionMessage> : null}
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
