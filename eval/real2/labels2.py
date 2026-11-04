# Labels for cosmos/cosmos-sdk, written by reading every ADR-linking comment (ctx.txt), before the run.
import json
pos={10570:['028'],13742:['028'],12182:['053'],12889:['059'],7771:['031'],17164:['064']}
evidence={10570:'"this needs to use types/address instead to derive the group module address ... see adr-028 derived addresses"',
 13742:'"I don\'t agree. Module subaccounts are not derived: adr-028 module account addresses"',
 12182:'"My position is to avoid breakage as much as possible as I outlined here: adr-053"',
 12889:'"We use simtestutil.Setup( which I understand should be an integration test by the ADR (adr-059 decision)"',
 7771:'"In Stargate, ideally remove keepers and only relay on MsgServer and QueryServer. See adr-031"',
 17164:'"We should update the ADR as well (adr-064)" (the change no longer matches the ADR text)'}
other_repo=[1171,3981,5997,7472]  # links to tendermint ADRs, not cosmos-sdk ones
neutral={3469:'answer',4732:'docs remark',5507:'question about the ADR',6290:'grep output',7459:'ADR text discussion',7526:'explains ADR',7563:'implements ADR',7584:'implements ADR',8173:'answers a question',8496:'spec link',8499:'docs link',8664:'implements ADR',8780:'answer',8814:'grep output',9245:'asks whether PR still needed, unsure',10709:'notes an assumption in the ADR',11526:'docs link',11726:'explains intended behaviour',12808:'design discussion',12935:'points to related work, question',13468:'answer',13516:'context link',13696:'asks to update ADR annex text',14898:'roadmap link',15963:'edits ADRs',17713:'changelog link',18498:'adds ADR',18824:'adds ADR',21203:'background link'}
json.dump({'positives':{str(k):v for k,v in pos.items()},'evidence':{str(k):v for k,v in evidence.items()},'other_repo':other_repo,'excluded':{str(k):v for k,v in neutral.items()},'bot_only':'all other candidates: only an automated review bot (coderabbitai) quoted an ADR path in a change summary','rule':'see LABEL_RULE.md'},open('labels.json','w'),indent=1)
print(len(pos),'positives',len(neutral),'neutral',len(other_repo),'other repo')
