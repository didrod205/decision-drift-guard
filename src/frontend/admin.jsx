import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, Heading, Stack, Inline, Button, Textfield, TextArea, Checkbox, Label, SectionMessage, Spinner, Link, Strong, List, ListItem } from '@forge/react';
import { invoke } from '@forge/bridge';

const join = (a) => (a || []).join(', ');

const App = () => {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [space, setSpace] = useState('');
  const [project, setProject] = useState('');
  const [seed, setSeed] = useState(null);
  const [scanKey, setScanKey] = useState('');
  const [scan, setScan] = useState(null);
  const runScan = async () => {
    setBusy(true);
    const tot = { scanned: 0, withPageLinks: 0, following: 0, newLinks: 0, items: [], pages: 0, done: false };
    setScan({ ...tot, running: true });
    try {
      // A second run on the same project continues with older work items where the last one stopped.
      let token = scan && scan.key === scanKey && !scan.done && scan.token ? scan.token : null;
      for (let i = 0; i < 20; i++) {
        const r = await invoke('scan', { projectKey: scanKey, nextPageToken: token });
        tot.scanned += r.scanned; tot.withPageLinks += r.withPageLinks; tot.following += r.following; tot.newLinks += r.newLinks; tot.items = tot.items.concat(r.items).slice(0, 20); tot.pages++; tot.jql = r.jql; tot.key = scanKey;
        token = r.nextPageToken; tot.token = token;
        setScan({ ...tot, running: !!token });
        if (!token) { tot.done = true; break; }
      }
      setScan({ ...tot, running: false });
    } catch (e) { setScan({ ...tot, running: false, error: e.message }); }
    setBusy(false);
  };
  useEffect(() => { invoke('getSettings').then((s) => setSt({ ...s, labels: join(s.labels), titleWords: join(s.titleWords), spaces: join(s.spaces) })); }, []);
  if (!st) return <Spinner />;
  const set = (k) => (e) => setSt({ ...st, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await invoke('saveSettings', st); const p = await invoke('preview'); setPreview(p); setMsg({ ok: true, text: 'Saved.' }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const check = async () => { setBusy(true); try { setPreview(await invoke('preview')); } catch (e) { setMsg({ ok: false, text: e.message }); } setBusy(false); };
  const makeSample = async () => {
    setBusy(true); setSeed(null);
    try {
      const args = { spaceKey: space, projectKey: project };
      let r = await invoke('seed', args);
      if (!r.issues || !r.issues.length) {
        setSeed({ ok: true, wait: true, r });
        for (let i = 0; i < 20; i++) {
          const ix = await invoke('seedIndexed', { pageIds: r.pages.map((p) => p.id) });
          if (ix.ready) break;
          await new Promise((res) => setTimeout(res, 3000));
        }
        r = await invoke('seedIssues', args);
      }
      setSeed({ ok: true, r });
    } catch (e) { setSeed({ ok: false, text: e.message }); }
    setBusy(false);
  };
  return (
    <Stack space="space.300">
      <Heading as="h2">Decision Drift Guard settings</Heading>
      <Stack space="space.150">
        <Heading as="h3">1. Try it with sample data (one click)</Heading>
        <Text>Creates 3 decision pages in a Confluence space (one per recording style: labelled page, Decision template page, inline /decision in meeting notes) and 5 Jira work items that say the same things in other words. The checks run on create, so warnings appear as comments within seconds. Everything is created as you and is safe to delete.</Text>
        <Inline space="space.150" alignBlock="end" shouldWrap>
          <Stack space="space.050"><Label labelFor="sp">Confluence space key</Label><Textfield id="sp" value={space} placeholder="e.g. MD" onChange={(e) => setSpace(e.target.value)} /></Stack>
          <Stack space="space.050"><Label labelFor="pr">Jira project key</Label><Textfield id="pr" value={project} placeholder="e.g. MOBL" onChange={(e) => setProject(e.target.value)} /></Stack>
          <Button appearance="primary" isDisabled={busy || !space || !project} onClick={makeSample}>Create sample data</Button>
        </Inline>
        {seed && seed.wait ? <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>Decision pages created. Waiting for Confluence search to index them before creating the work items...</Text></Inline> : null}
        {seed && !seed.wait ? (seed.ok ? (
          <SectionMessage appearance="success" title={seed.r.again ? 'Sample data already exists for this space and project' : 'Sample data created'}>
            <Text>Decision pages: {seed.r.pages.map((p) => p.title).join('; ')}</Text>
            <Text>Work items: {seed.r.issues.join(', ')}. Open one and look at the Decision check panel and the comments. Space {seed.r.space} was added to the decision spaces below.</Text>
          </SectionMessage>
        ) : <SectionMessage appearance="error" title="Could not create sample data"><Text>{seed.text}</Text></SectionMessage>) : null}
      </Stack>
      <Stack space="space.150">
        <Heading as="h3">2. Link existing work items to their decisions</Heading>
        <Text>New and edited work items are linked automatically. This scan does the same for work that already exists: every work item in the project whose description or Confluence links point to a decision page starts following it. Up to 1,000 work items per run, newest first. Nothing is commented.</Text>
        <Inline space="space.150" alignBlock="end" shouldWrap>
          <Stack space="space.050"><Label labelFor="sc">Jira project key</Label><Textfield id="sc" value={scanKey} placeholder="e.g. PLAT" onChange={(e) => setScanKey(e.target.value)} /></Stack>
          <Button appearance="primary" isDisabled={busy || !scanKey} onClick={runScan}>Scan project</Button>
        </Inline>
        {scan ? (
          <SectionMessage appearance={scan.error ? 'error' : scan.running ? 'information' : 'success'} title={scan.error ? 'Scan stopped' : scan.running ? 'Scanning...' : 'Scan finished'}>
            <Text>{`${scan.scanned} work items read, ${scan.withPageLinks} link to a Confluence page, ${scan.following} follow a decision, ${scan.newLinks} new links made.${scan.error ? ` ${scan.error}` : ''}${!scan.running && !scan.done && !scan.error ? ' Stopped at 1,000 work items; run it again for older ones.' : ''}`}</Text>
            {scan.items.length ? <List type="unordered">{scan.items.map((x) => <ListItem key={x}>{x}</ListItem>)}</List> : null}
            {scan.jql ? <Text size="small">{`Search used: ${scan.jql}`}</Text> : null}
          </SectionMessage>
        ) : null}
      </Stack>
      <Stack space="space.150">
        <Heading as="h3">3. Where your decisions live</Heading>
        <Text>No label habit needed. A page counts as a decision record if any of these match.</Text>
        <Stack space="space.050"><Label labelFor="lb">Labels (comma separated)</Label><Textfield id="lb" value={st.labels} onChange={set('labels')} /></Stack>
        <Stack space="space.050"><Label labelFor="tw">Title words, for example decision, ADR, RFC</Label><Textfield id="tw" value={st.titleWords} onChange={set('titleWords')} /></Stack>
        <Stack space="space.050"><Label labelFor="sk">Decision spaces (space keys). Every page in them is scanned for inline decisions and Decision template pages.</Label><Textfield id="sk" value={st.spaces} onChange={set('spaces')} /></Stack>
        <Checkbox label="Read pages made from Confluence's Decision documentation template (Status + Outcome)" isChecked={st.useTemplate} onChange={(e) => setSt({ ...st, useTemplate: e.target.checked })} />
        <Checkbox label="Read inline decisions typed with /decision (only those marked decided)" isChecked={st.useInline} onChange={(e) => setSt({ ...st, useInline: e.target.checked })} />
        <Stack space="space.050"><Label labelFor="sy">Team words (optional), one per line: concept: word, word. Example: payments: stripe, adyen</Label><TextArea id="sy" value={st.synonyms} onChange={set('synonyms')} /></Stack>
        <Heading as="h4">Checks on new work items</Heading>
        <Checkbox label="Explicit bans: warn when a new work item names something a decision says must not be used (a Do not row, or a must not, never, avoid sentence). Word for word, quoted, no AI." isChecked={st.banCheck !== false} onChange={(e) => setSt({ ...st, banCheck: e.target.checked })} />
        <Checkbox label="Experimental, off by default: possible conflicts by meaning and related decisions. On real open source data it caught 2 of 64 known cases (a set we tuned on) and 0 of 6 (an untuned set)." isChecked={st.experimentalMeaning === true} onChange={(e) => setSt({ ...st, experimentalMeaning: e.target.checked })} />
        <Inline space="space.100">
          <Button appearance="primary" isDisabled={busy} onClick={save}>Save</Button>
          <Button isDisabled={busy} onClick={check}>Show which decisions are found</Button>
        </Inline>
        {msg ? <SectionMessage appearance={msg.ok ? 'success' : 'error'}><Text>{msg.text}</Text></SectionMessage> : null}
        {preview ? (
          <Stack space="space.050">
            <Text><Strong>{preview.count}</Strong> decisions found, {preview.active} active. By source: {Object.entries(preview.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.</Text>
            <List type="unordered">{preview.sample.map((d) => <ListItem key={d.url + d.title}><Link href={d.url} openNewTab>{d.title}</Link> ({d.source}, {d.status})</ListItem>)}</List>
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
