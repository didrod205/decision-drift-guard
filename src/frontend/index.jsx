import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text, Heading, Stack, Inline, Box, Lozenge, Button, Link, SectionMessage, Spinner, TextArea, Strong, Em, xcss,
} from '@forge/react';
import { invoke, rovo, view } from '@forge/bridge';

const AGENT = { type: 'forge', agentKey: 'decision-drift-guard-agent', agentName: 'Decision Drift Guard' };

const cardStyle = xcss({ padding: 'space.150', borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'border.radius' });

const STATE = {
  conflict: { appearance: 'removed', label: 'Conflicts with a decision' },
  'needs-judgment': { appearance: 'moved', label: 'Needs judgment' },
  clear: { appearance: 'success', label: 'No decision covers this' },
  'no-decisions': { appearance: 'default', label: 'No decisions found' },
  insufficient: { appearance: 'default', label: 'Not enough detail' },
  'no-confluence': { appearance: 'default', label: 'Confluence not connected' },
};

const DecisionCard = ({ c, conflict, issueKey }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const send = async () => {
    setBusy(true);
    try {
      await invoke('reopen', { pageId: c.pageId, reason });
      setDone('Reopen request posted on the decision page. The decision itself was not changed.');
    } catch (e) {
      setDone(`Could not post: ${e.message}`);
    }
    setBusy(false);
  };
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={conflict ? 'removed' : 'moved'}>{c.key || 'Decision'}</Lozenge>
          <Link href={c.url} openNewTab>{c.title}</Link>
        </Inline>
        <Text>{c.outcome}</Text>
        {conflict && c.evidence ? (
          <Stack space="space.050">
            <Text><Strong>Rule broken: </Strong>{c.evidence.rule}</Text>
            {c.evidence.issueQuote ? <Text><Strong>{issueKey} says: </Strong><Em>{c.evidence.issueQuote}</Em></Text> : null}
          </Stack>
        ) : (
          <Text><Strong>Shared topic: </Strong>{c.matchedScope.join(', ')}</Text>
        )}
        {c.instead ? <Text><Strong>Instead: </Strong>{c.instead}</Text> : null}
        <Text size="small" color="color.text.subtlest">{c.status}{c.decidedOn ? ` since ${c.decidedOn}` : ''}</Text>
        {done ? <Text>{done}</Text> : open ? (
          <Stack space="space.050">
            <TextArea placeholder="Why should this decision be reconsidered?" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Inline space="space.100">
              <Button appearance="primary" isDisabled={busy || reason.trim().length < 5} onClick={send}>Post reopen request</Button>
              <Button appearance="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            </Inline>
          </Stack>
        ) : (
          <Inline>
            <Button appearance="subtle" onClick={() => setOpen(true)}>Request reopen</Button>
          </Inline>
        )}
      </Stack>
    </Box>
  );
};

const App = () => {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [issueKey, setIssueKey] = useState('');
  const [rovoOn, setRovoOn] = useState(false);

  const run = async () => {
    setLoading(true); setErr(null);
    try { setRes(await invoke('check')); } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => {
    view.getContext().then((c) => setIssueKey(c.extension.issue.key)).catch(() => {});
    rovo.isEnabled().then(setRovoOn).catch(() => setRovoOn(false));
    run();
  }, []);

  const ask = () => rovo.open({ ...AGENT, prompt: `Check ${issueKey} against our recorded decisions. Quote the decision and the part of ${issueKey} that conflicts, or say clearly that it does not conflict.` });

  if (loading) return <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>Comparing with recorded decisions...</Text></Inline>;
  if (err) return <SectionMessage appearance="error" title="Check failed"><Text>{err}</Text><Button onClick={run}>Try again</Button></SectionMessage>;
  const s = STATE[res.state] || STATE.clear;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Lozenge appearance={s.appearance} isBold>{s.label}</Lozenge>
        <Button appearance="subtle" onClick={run}>Re-check</Button>
      </Inline>
      <Text>{res.message}</Text>
      {res.conflicts.map((c) => <DecisionCard key={c.pageId} c={c} conflict issueKey={issueKey} />)}
      {res.related.length ? <Heading as="h4">Related decisions</Heading> : null}
      {res.related.map((c) => <DecisionCard key={c.pageId} c={c} issueKey={issueKey} />)}
      {res.ignoredInactive.length ? (
        <Text size="small" color="color.text.subtlest">
          Ignored as no longer active: {res.ignoredInactive.map((d) => `${d.key || d.title} (${d.status}${d.supersededBy ? ', replaced by ' + d.supersededBy : ''})`).join('; ')}
        </Text>
      ) : null}
      {rovoOn && (res.state === 'needs-judgment' || res.state === 'conflict') ? (
        <Button appearance="primary" onClick={ask}>Ask the Decision Drift Guard agent</Button>
      ) : null}
      <Text size="small" color="color.text.subtlest">{res.decisionCount} active decisions checked. Decision pages are Confluence pages labelled "decision".</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
