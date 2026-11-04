import json,re,urllib.request,urllib.parse,time,sys,base64
T=open('/tmp/.gt_ddg2').read().strip()
def get(u,raw=False):
    for i in range(4):
        try:
            r=urllib.request.Request(u,headers={'Authorization':'Bearer '+T,'Accept':'application/vnd.github+json'})
            d=urllib.request.urlopen(r,timeout=30).read()
            return d.decode() if raw else json.loads(d)
        except Exception as e:
            err=e; time.sleep(1 if '404' in str(e) else 3)
            if '404' in str(e): break
    raise err
STAT=re.compile(r'supersed|deprecat|rejected|abandon|replaced by|no longer applies',re.I)
def status_of(text):
    # status section or admonition / front matter title marker
    m=re.search(r'^#+\s*Status\s*\n+(.*?)(?=\n#|\Z)',text,re.S|re.M)
    s=m.group(1).strip()[:300] if m else ''
    n=re.search(r':::note\[(.*?)\]\s*\n+(.*?)\n:::',text,re.S)
    if n: s=(s+' | note: '+n.group(1)+' '+n.group(2).strip())[:300]
    t=re.search(r"^title:\s*'?(.*?)'?\s*$",text,re.M)
    if t and STAT.search(t.group(1)): s=(s+' | title: '+t.group(1))[:300]
    return s
out={}
for repo,path,ref in [('backstage/backstage','docs/architecture-decisions','master'),('cosmos/cosmos-sdk','docs/architecture','main')]:
    files=[x for x in get(f'https://api.github.com/repos/{repo}/contents/{path}?ref={ref}') if x['name'].endswith('.md') and re.match(r'adr',x['name'],re.I)]
    rows=[]
    for f in files:
        txt=get(f['download_url'],raw=True)
        s=status_of(txt)
        retired=bool(STAT.search(s))
        row={'file':f['name'],'status':s,'retired':retired}
        if retired:
            cm=get(f'https://api.github.com/repos/{repo}/commits?path={path}/{f["name"]}&per_page=100')
            cm=list(reversed(cm))
            row['first_commit']={'sha':cm[0]['sha'],'date':cm[0]['commit']['committer']['date']}
            for c in cm:
                try: t2=get(f'https://raw.githubusercontent.com/{repo}/{c["sha"]}/{path}/{f["name"]}',raw=True)
                except Exception: continue
                if STAT.search(status_of(t2)):
                    row['retired_commit']={'sha':c['sha'],'date':c['commit']['committer']['date'],'msg':c['commit']['message'].split('\n')[0][:120],'url':f'https://github.com/{repo}/commit/{c["sha"]}'}
                    break
        rows.append(row)
    out[repo]={'ref':ref,'path':path,'total':len(rows),'retired':sum(r['retired'] for r in rows),'rows':rows}
    print(repo,len(rows),'retired',out[repo]['retired'],flush=True)
json.dump(out,open('status_scan.json','w'),indent=1)
for repo,v in out.items():
    for r in v['rows']:
        if r['retired']: print(repo,r['file'],'|',r['status'][:110],'|',r.get('retired_commit',{}).get('date'),r.get('retired_commit',{}).get('sha','')[:8])
