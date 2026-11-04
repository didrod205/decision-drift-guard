import json,urllib.request,time,os,re
T=open('/tmp/.gt_ddg2').read().strip()
def get(u,raw=False):
    for i in range(3):
        try:
            r=urllib.request.Request(u,headers={'Authorization':'Bearer '+T,'Accept':'application/vnd.github+json'})
            d=urllib.request.urlopen(r,timeout=30).read(); return d.decode() if raw else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(3)
    return None
scan=json.load(open('status_scan.json'))
meta={}
for repo,v in scan.items():
    for row in v['rows']:
        f=row['file']; p=f"{v['path']}/{f}"
        cm=get(f'https://api.github.com/repos/{repo}/commits?path={p}&per_page=100') or []
        cm=list(reversed(cm)); vers=[]
        d=f"versions/{repo.replace('/','_')}/{f[:-3]}"; os.makedirs(d,exist_ok=True)
        for i,c in enumerate(cm):
            fn=f"{d}/{i:03d}_{c['sha'][:10]}.md"
            if not os.path.exists(fn):
                t=get(f"https://raw.githubusercontent.com/{repo}/{c['sha']}/{p}",raw=True)
                if t is None: continue
                open(fn,'w').write(t)
            vers.append({'file':fn,'sha':c['sha'],'date':c['commit']['committer']['date'],'msg':c['commit']['message'].split('\n')[0][:140],'url':f"https://github.com/{repo}/commit/{c['sha']}"})
        meta[f"{repo}/{f}"]=vers
    print(repo,'done',flush=True)
json.dump(meta,open('versions.json','w'),indent=1)
print('files',len(meta),'versions',sum(len(x) for x in meta.values()))
