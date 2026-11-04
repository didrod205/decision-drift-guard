# Unrelated sample: closed issues and PRs from seven months, 4 each, skipping ADR mentions and labelled candidates.
import json,urllib.request,re,time
T=open('/tmp/.gt_ddg').read().strip()
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'Authorization':'Bearer '+T}),timeout=30))
cand={o['n'] for o in json.load(open('candidates.json'))}
out=[]
for kind in ('issue','pr'):
  for m in ('2020-11','2021-04','2021-09','2022-03','2023-05','2024-09','2025-06'):
    d=get(f'https://api.github.com/search/issues?q=repo:backstage/backstage+is:{kind}+is:closed+created:{m}-01..{m}-28&per_page=30&sort=created&order=asc')
    k=0
    for x in d['items']:
        b=x.get('body') or ''
        if x['number'] in cand or re.search(r'\badr|architecture.decision',b+x['title'],re.I): continue
        out.append({'n':x['number'],'pr':kind=='pr','title':x['title'],'body':b[:6000],'url':x['html_url'],'created':x['created_at']}); k+=1
        if k==4: break
    time.sleep(2.5)
json.dump(out,open('negatives.json','w'),indent=1); print(len(out),'negatives')
