# Second field-test set: cosmos/cosmos-sdk (Apache-2.0). Same method as eval/real/collect.py.
import json,re,urllib.request,time
T=open('/tmp/.gt_ddg').read().strip()
def get(u):
    for k in range(3):
        try:
            r=urllib.request.Request(u,headers={'Authorization':'Bearer '+T,'Accept':'application/vnd.github+json'})
            return json.load(urllib.request.urlopen(r,timeout=30))
        except Exception as e: time.sleep(5)
    return []
nums=[]
for q in ['"docs/architecture/adr"+in:comments+is:issue','"docs/architecture/adr"+in:comments+is:pr']:
    for p in (1,2,3):
        d=get(f'https://api.github.com/search/issues?q=repo:cosmos/cosmos-sdk+{q}&per_page=100&page={p}')
        nums+=[(x['number'],'pull_request' in x) for x in d.get('items',[])]
        time.sleep(3)
        if len(d.get('items',[]))<100: break
out=[]
for n,ispr in dict.fromkeys(nums):
    it=get(f'https://api.github.com/repos/cosmos/cosmos-sdk/issues/{n}')
    cs=get(f'https://api.github.com/repos/cosmos/cosmos-sdk/issues/{n}/comments?per_page=100')
    if ispr: cs+=get(f'https://api.github.com/repos/cosmos/cosmos-sdk/pulls/{n}/comments?per_page=100')+get(f'https://api.github.com/repos/cosmos/cosmos-sdk/pulls/{n}/reviews?per_page=100')
    hits=[]
    for c in cs:
        b=c.get('body') or ''
        for m in re.finditer(r'docs/architecture/adr[^\s)\]]*',b):
            adr=re.search(r'adr-?0*(\d{1,3})',m.group(0),re.I)
            i=m.start(); hits.append({'adr':adr.group(1).zfill(3) if adr else None,'url':c.get('html_url'),'user':(c.get('user') or {}).get('login'),'ctx':b[max(0,i-350):i+150]})
    out.append({'n':n,'pr':ispr,'title':it.get('title',''),'body':(it.get('body') or '')[:6000],'url':it.get('html_url'),'state':it.get('state'),'created':it.get('created_at'),'hits':hits})
json.dump(out,open('candidates.json','w'),indent=1)
print(len(out),'items',sum(1 for o in out if any(h['adr'] for h in o['hits'])),'with specific ADR')
