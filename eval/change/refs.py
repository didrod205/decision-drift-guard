import json,urllib.request,urllib.parse,time,re
T=open('/tmp/.gt_ddg2').read().strip()
def get(u):
    r=urllib.request.Request(u,headers={'Authorization':'Bearer '+T,'Accept':'application/vnd.github+json'})
    return json.loads(urllib.request.urlopen(r,timeout=30).read())
d=json.load(open('status_scan.json'))
out=[]
for repo,v in d.items():
    for x in v['rows']:
        if not x['retired']: continue
        stem=x['file'][:-3]; num=re.match(r'(adr-?\d+)',stem,re.I).group(1)
        since=x['retired_commit']['date'][:10]
        items={}
        for q in [f'repo:{repo} "{stem}"', f'repo:{repo} "{num}"']:
            page=1
            while page<=3:
                res=get('https://api.github.com/search/issues?per_page=100&page=%d&q=%s'%(page,urllib.parse.quote(q)))
                for it in res.get('items',[]): items[it['number']]=it
                time.sleep(2.5)
                if len(res.get('items',[]))<100: break
                page+=1
        rows=[]
        for n,it in sorted(items.items()):
            rows.append({'n':n,'pr':'pull_request' in it,'created':it['created_at'],'after':it['created_at'][:10]>=since,'title':it['title'][:120],'url':it['html_url']})
        out.append({'repo':repo,'file':x['file'],'retired_on':since,'total':len(rows),'after':sum(r['after'] for r in rows),'rows':rows})
        print(repo,x['file'],'retired',since,'refs',len(rows),'after',sum(r['after'] for r in rows),flush=True)
json.dump(out,open('refs.json','w'),indent=1)
