import json, re, numpy as np
from pypinyin import lazy_pinyin
wins=json.load(open('sv_windows.json'))
coarse=json.load(open('aligned.json'))
lines=open('lyrics.txt').read().split('\n')
units=lambda s: re.findall(r'[A-Za-z]+|\d+|[一-鿿]', s)
A=[]; CT=[]
for i,l in enumerate(coarse):
    for t,u in l['chars']: A.append((i,u)); CT.append(t)
py=lambda u: (lazy_pinyin(u)[0].lower() if re.match(r'[一-鿿]',u) else u.lower())
PY=[py(u) for _,u in A]
def cost(a,pa,b,pb):
    if a==b: return 0
    if pa==pb: return 0.25
    if pa[:2]==pb[:2] or pa[-2:]==pb[-2:]: return 0.7
    return 1.3
cands=[[] for _ in A]
for w in wins:
    B=[]
    for t,tok in w['toks']:
        for k,u in enumerate(units(tok)): B.append((t+0.1*k,u))
    if len(B)<3: continue
    idx=[i for i in range(len(A)) if w['t']-10 <= CT[i] <= w['t']+20]
    if not idx: continue
    a0,a1=idx[0],idx[-1]+1
    AA=A[a0:a1]; PA=PY[a0:a1]; PB=[py(u) for _,u in B]
    n,m=len(AA),len(B)
    D=np.zeros((n+1,m+1)); D[0,:]=np.arange(m+1)*0.9; P=np.zeros((n+1,m+1),int)
    for i in range(1,n+1):
        D[i,0]=0  # free start in lyrics
        for j in range(1,m+1):
            c=(D[i-1,j-1]+cost(AA[i-1][1],PA[i-1],B[j-1][1],PB[j-1]), D[i-1,j]+0.8, D[i,j-1]+0.9)
            k=int(np.argmin(c)); D[i,j]=c[k]; P[i,j]=k
    i=int(np.argmin(D[:,m])); j=m  # free end in lyrics
    if D[i,m] > 0.6*m: continue
    while i>0 and j>0:
        k=P[i,j]
        if k==0:
            if cost(AA[i-1][1],PA[i-1],B[j-1][1],PB[j-1])<1:
                # skip tokens at window edges (truncated)
                bt=B[j-1][0]
                if w['t']+0.4 < bt < w['t']+9.6: cands[a0+i-1].append(bt)
            i-=1;j-=1
        elif k==1: i-=1
        else: j-=1
times=[float(np.median(c)) if len(c)>=2 else None for c in cands]
# enforce monotonic, drop outliers
for i in range(len(times)):
    if times[i] is not None:
        prev=[times[k] for k in range(max(0,i-4),i) if times[k] is not None]
        if prev and times[i] < max(prev)-0.05: times[i]=None
idx=[i for i,t in enumerate(times) if t is not None]
for i in range(len(times)):
    if times[i] is None:
        lo=max([k for k in idx if k<i],default=None); hi=min([k for k in idx if k>i],default=None)
        if lo is None: times[i]=times[hi]-0.3*(hi-i)
        elif hi is None: times[i]=times[lo]+0.3*(i-lo)
        else: times[i]=times[lo]+(times[hi]-times[lo])*(i-lo)/(hi-lo)
out=[]
for li,l in enumerate(lines):
    ks=[k for k in range(len(A)) if A[k][0]==li]
    got=sum(1 for k in ks if len(cands[k])>=2)
    out.append({"zh":l,"chars":[[round(times[k],2),A[k][1]] for k in ks]})
    print(f"{times[ks[0]]:7.2f}-{times[ks[-1]]:7.2f} {got:2d}/{len(ks):2d} {l}")
json.dump(out,open('aligned2.json','w'),ensure_ascii=False,indent=0)
