import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text, Heading, Stack, Inline, Box, Lozenge, Button, Link, SectionMessage, Spinner, TextArea, Strong, Em, Select, xcss,
} from '@forge/react';
import { invoke, rovo, view } from '@forge/bridge';

const AGENT = { type: 'forge', agentKey: 'decision-drift-guard-agent', agentName: 'Decision Drift Guard' };

const cardStyle = xcss({ padding: 'space.150', borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'border.radius' });

const STATE = {
  conflict: { appearance: 'removed', label: 'Conflicts with a decision' },
  'possible-conflict': { appearance: 'moved', label: 'Possible conflict' },
  'needs-judgment': { appearance: 'inprogress', label: 'Needs judgment' },
  clear: { appearance: 'success', label: 'No decision covers this' },
  'no-decisions': { appearance: 'default', label: 'No decisions found' },
  insufficient: { appearance: 'default', label: 'Not enough detail' },
  'no-confluence': { appearance: 'default', label: 'Confluence not connected' },
};

const SOURCE = { label: 'labelled page', template: 'Decision template', 'decision-item': 'inline decision', title: 'title match' };

const DecisionCard = ({ c, kind, issueKey, onFollow, followed }) => {
  const conflict = kind === 'conflict';
  const possible = kind === 'possible';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const send = async () => {
    setBusy(true);
    try {
      await invoke('reopen', { pageId: c.pageId, itemId: c.itemId, title: c.title, url: c.url, reason });
      setDone('Reopen request posted on the decision page. The decision itself was not changed.');
    } catch (e) {
      setDone(`Could not post: ${e.message}`);
    }
    setBusy(false);
  };
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance={conflict ? 'removed' : possible ? 'moved' : 'default'} maxWidth={160}>{c.key || (possible ? 'Possible' : 'Decision')}</Lozenge>
          <Text size="small" color="color.text.subtlest">{SOURCE[c.source] || 'decision'}</Text>
        </Inline>
        <Link href={c.url} openNewTab>{c.title}</Link>
        <Text>{c.outcome}</Text>
        {(conflict || possible) && c.evidence ? (
          <Stack space="space.050">
            <Text><Strong>{conflict ? 'Rule broken: ' : 'Decision rule: '}</Strong>{c.evidence.rule.replace(/^Do not: /, 'Do not ')}</Text>
            {c.evidence.issueQuote ? <Text><Strong>{issueKey} says: </Strong><Em>{c.evidence.issueQuote}</Em></Text> : null}
            {possible && c.evidence.readAs && c.evidence.readAs.length ? <Text size="small"><Strong>Matched by meaning: </Strong>{c.evidence.readAs.join('; ')}</Text> : null}
          </Stack>
        ) : (
          <Text><Strong>Shared topic: </Strong>{c.matchedScope.join(', ')}</Text>
        )}
        {c.instead ? <Text><Strong>Instead: </Strong>{c.instead}</Text> : null}
        <Text size="small" color="color.text.subtlest">{c.status === 'Unknown' ? 'No status field' : c.status}{c.decidedOn ? ` since ${c.decidedOn}` : ''}</Text>
        {done ? <Text>{done}</Text> : open ? (
          <Stack space="space.050">
            <TextArea placeholder="Why should this decision be reconsidered?" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Inline space="space.100">
              <Button appearance="primary" isDisabled={busy || reason.trim().length < 5} onClick={send}>Post reopen request</Button>
              <Button appearance="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            </Inline>
          </Stack>
        ) : (
          <Inline space="space.100" shouldWrap>
            <Button appearance="subtle" onClick={() => setOpen(true)}>Request reopen</Button>
            {onFollow && !followed ? <Button appearance="subtle" onClick={() => onFollow(c)}>This work follows it</Button> : null}
          </Inline>
        )}
      </Stack>
    </Box>
  );
};

// "This work item follows these decisions": when one of them is retired or rewritten, the app comments here.
const Follows = ({ data, onLink, onUnlink, busy }) => {
  const [pick, setPick] = useState(null);
  const linked = new Set(data.links.map((l) => l.pageId));
  const options = data.pages.filter((p) => !linked.has(p.pageId)).map((p) => ({ label: p.title, value: p.pageId }));
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Text><Strong>Follows these decisions</Strong></Text>
        {data.links.length ? data.links.map((l) => (
          <Inline key={l.pageId} space="space.100" alignBlock="center" spread="space-between">
            <Stack space="space.0">
              <Link href={l.url} openNewTab>{l.title || l.pageId}</Link>
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Lozenge appearance={l.retired ? 'removed' : 'success'}>{String(l.status || '').slice(0, 30)}</Lozenge>
                {l.replacement ? (l.replacement.url ? <Link href={l.replacement.url} openNewTab>{`Replaced by ${l.replacement.title}`}</Link> : <Text size="small">{`Replaced by ${l.replacement.title}`}</Text>) : null}
              </Inline>
              <Text size="small" color="color.text.subtlest">{`Linked by ${l.via}, ${String(l.linkedAt).slice(0, 10)}`}</Text>
            </Stack>
            <Button appearance="subtle" isDisabled={busy} onClick={() => onUnlink(l)}>Unlink</Button>
          </Inline>
        )) : <Text size="small" color="color.text.subtlest">Not following any decision yet. Paste a decision page link in the description, add it as a Confluence link, pick one below, or run Scan in the app settings.</Text>}
        {options.length ? (
          <Inline space="space.100" alignBlock="center">
            <Box xcss={xcss({ minWidth: '200px', flexGrow: 1 })}><Select inputId="ddg-follow" placeholder="Pick a decision" options={options} value={pick} onChange={setPick} /></Box>
            <Button isDisabled={busy || !pick} onClick={() => { const p = data.pages.find((x) => x.pageId === pick.value); onLink(p); setPick(null); }}>Follow</Button>
          </Inline>
        ) : null}
        <Text size="small" color="color.text.subtlest">When a followed decision is marked Superseded, Deprecated or Rejected, or its decision text is edited, this work item gets a comment with what changed.</Text>
      </Stack>
    </Box>
  );
};

// Shown at the top when a followed decision was retired: deterministic, read from the page status now.
const CloseWarning = ({ retired, onAck, busy }) => {
  const open = retired.filter((r) => !r.checked);
  if (!retired.length) return null;
  if (!open.length) return <SectionMessage appearance="success" title="Checked against the current decision"><Text>{retired.map((r) => r.title).join(', ')}: retired, and someone marked this work as checked. The close check will let it through.</Text></SectionMessage>;
  return (
    <SectionMessage appearance="warning" title="Check before closing: a decision this work follows was retired">
      <Stack space="space.100">
        {open.map((r) => (
          <Stack key={r.pageId} space="space.050">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Link href={r.url} openNewTab>{r.title}</Link>
              <Lozenge appearance="removed">{String(r.status).slice(0, 30)}</Lozenge>
              {r.replacement ? (r.replacement.url ? <Link href={r.replacement.url} openNewTab>{`Replaced by ${r.replacement.title}`}</Link> : <Text>{`Replaced by ${r.replacement.title}`}</Text>) : null}
            </Inline>
            <Inline space="space.100"><Button isDisabled={busy} onClick={() => onAck(r)}>Checked against the current decision</Button></Inline>
          </Stack>
        ))}
        <Text size="small">If the workflow uses the "Followed decisions are still current" rule, moving this work item to Done is stopped until it is checked or unlinked.</Text>
      </Stack>
    </SectionMessage>
  );
};

const App = () => {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [issueKey, setIssueKey] = useState('');
  const [rovoOn, setRovoOn] = useState(false);
  const [fol, setFol] = useState(null);
  const [folBusy, setFolBusy] = useState(false);
  const [guard, setGuard] = useState(null);
  const loadGuard = () => invoke('closeCheck').then(setGuard).catch(() => setGuard(null));
  const loadFollows = () => Promise.all([invoke('links').then(setFol).catch(() => setFol(null)), loadGuard()]);
  const doLink = async (p) => { setFolBusy(true); await invoke('link', { pageId: p.pageId, title: p.title, url: p.url }).catch(() => {}); await loadFollows(); setFolBusy(false); };
  const doUnlink = async (l) => { setFolBusy(true); await invoke('unlink', { pageId: l.pageId }).catch(() => {}); await loadFollows(); setFolBusy(false); };
  const doAck = async (r) => { setFolBusy(true); await invoke('ack', { pageId: r.pageId }).catch(() => {}); await loadGuard(); setFolBusy(false); };

  const run = async () => {
    setLoading(true); setErr(null);
    try { setRes(await invoke('check')); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => {
    view.getContext().then((c) => setIssueKey(c.extension.issue.key)).catch(() => {});
    rovo.isEnabled().then(setRovoOn).catch(() => setRovoOn(false));
    run();
    loadFollows();
  }, []);

  const ask = () => rovo.open({ ...AGENT, prompt: `Check ${issueKey} against our recorded decisions. Quote the decision and the part of ${issueKey} that conflicts, or say clearly that it does not conflict.` });

  const followed = (c) => !!(fol && fol.links.some((l) => l.pageId === c.pageId));
  const retiredOpen = guard ? guard.retired.filter((r) => !r.checked).length : 0;
  const head = retiredOpen ? { appearance: 'removed', label: 'Followed decision retired' }
    : fol && fol.links.length ? { appearance: 'success', label: `Follows ${fol.links.length} ${fol.links.length === 1 ? 'decision' : 'decisions'}` }
      : { appearance: 'default', label: 'Not linked to a decision' };
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Lozenge appearance={head.appearance} isBold>{head.label}</Lozenge>
        <Button appearance="subtle" onClick={() => { run(); loadFollows(); }}>Refresh</Button>
      </Inline>
      {guard ? <CloseWarning retired={guard.retired} onAck={doAck} busy={folBusy} /> : null}
      {fol ? <Follows data={fol} onLink={doLink} onUnlink={doUnlink} busy={folBusy} /> : <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>Reading followed decisions...</Text></Inline>}
      <Heading as="h4">Explicit bans</Heading>
      {loading ? <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>Checking recorded bans...</Text></Inline> : null}
      {!loading && err ? <SectionMessage appearance="error" title="Check failed"><Text>{err}</Text><Button onClick={run}>Try again</Button></SectionMessage> : null}
      {!loading && res ? (
        <Stack space="space.100">
          {res.conflicts.length ? <Lozenge appearance="removed">Names something a decision bans</Lozenge> : null}
          <Text size="small">{res.state === 'conflict' ? res.message : res.state === 'possible-conflict' || res.state === 'needs-judgment' ? (res.experimental ? res.message : 'No recorded ban is named here.') : res.message}</Text>
          {res.conflicts.map((c) => <DecisionCard key={c.pageId + (c.itemId || '')} c={c} kind="conflict" issueKey={issueKey} onFollow={doLink} followed={followed(c)} />)}
          {res.experimental && ((res.possible || []).length || res.related.length) ? <Heading as="h4">Experimental: matched by meaning</Heading> : null}
          {res.experimental ? (res.possible || []).map((c) => <DecisionCard key={c.pageId + (c.itemId || '')} c={c} kind="possible" issueKey={issueKey} onFollow={doLink} followed={followed(c)} />) : null}
          {res.experimental ? res.related.map((c) => <DecisionCard key={c.pageId + (c.itemId || '')} c={c} kind="related" issueKey={issueKey} onFollow={doLink} followed={followed(c)} />) : null}
          {rovoOn ? <Inline><Button appearance="subtle" onClick={ask}>Ask the Decision Drift Guard agent</Button></Inline> : null}
          <Text size="small" color="color.text.subtlest">{`${res.decisionCount} active decisions read. Bans are matched word for word in code, no AI.${res.experimental ? ' Experimental meaning check is on (set in Settings).' : ''}`}</Text>
        </Stack>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
