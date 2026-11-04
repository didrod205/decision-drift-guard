import json,re,urllib.request,time,sys
T=open('/tmp/.gt_ddg').read().strip()
def get(u):
    r=urllib.request.Request(u,headers={'Authorization':'Bearer '+T,'Accept':'application/vnd.github+json'})
    return json.load(urllib.request.urlopen(r,timeout=30))
nums=[]
for q in ['"architecture-decisions"+in:comments+is:issue','"architecture-decisions"+in:comments+is:pr']:
    for p in (1,2):
        d=get(f'https://api.github.com/search/issues?q=repo:backstage/backstage+{q}&per_page=100&page={p}')
        nums+= [(x['number'],'pull_request' in x) for x in d['items']]
        time.sleep(2)
        if len(d['items'])<100: break
out=[]
for n,ispr in dict.fromkeys(nums):
    it=get(f'https://api.github.com/repos/backstage/backstage/issues/{n}')
    cs=get(f'https://api.github.com/repos/backstage/backstage/issues/{n}/comments?per_page=100')
    if ispr: cs+=get(f'https://api.github.com/repos/backstage/backstage/pulls/{n}/comments?per_page=100')
    hits=[]
    for c in cs:
        b=c.get('body') or ''
        for m in re.finditer(r'architecture-decisions[^\s)\]]*',b):
            adr=re.search(r'adr0?(\d{2,3})',m.group(0),re.I)
            i=m.start(); hits.append({'adr':adr.group(1) if adr else None,'url':c['html_url'],'user':c['user']['login'],'ctx':b[max(0,i-350):i+150]})
    out.append({'n':n,'pr':ispr,'title':it['title'],'body':(it.get('body') or '')[:6000],'url':it['html_url'],'state':it['state'],'created':it['created_at'],'hits':hits})
json.dump(out,open('candidates.json','w'),indent=1)
print(len(out),'items',sum(1 for o in out if any(h['adr'] for h in o['hits'])),'with specific ADR')
