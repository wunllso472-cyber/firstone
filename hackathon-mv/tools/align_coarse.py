import json, re
from pypinyin import lazy_pinyin
toks=json.load(open('sv_tokens.json'))
lines=open('lyrics.txt').read().split('\n')
def units(s):
    return re.findall(r'[A-Za-z]+|\d+|[一-鿿]', s)
A=[]  # (line, unit)
for i,l in enumerate(lines):
    for u in units(l): A.append((i,u))
B=[(t,tok.strip()) for t,tok in toks if tok.strip()]
# split multi-char tokens
B2=[]
for t,tok in B:
    us=units(tok)
    for k,u in enumerate(us): B2.append((t+0.12*k,u))
B=B2
py=lambda u: (lazy_pinyin(u)[0].lower() if re.match(r'[一-鿿]',u) else u.lower())
def cost(a,b):
    if a==b: return 0
    pa,pb=py(a),py(b)
    if pa==pb: return 0.25
    if pa[:2]==pb[:2] or pa[-2:]==pb[-2:]: return 0.7
    return 1.2
n,m=len(A),len(B); G=0.8
import numpy as np
D=np.full((n+1,m+1),1e9); D[0,:]=np.arange(m+1)*0.3; D[:,0]=np.arange(n+1)*G
P=np.zeros((n+1,m+1),int)
for i in range(1,n+1):
    for j in range(1,m+1):
        c=[D[i-1,j-1]+cost(A[i-1][1],B[j-1][1]), D[i-1,j]+G, D[i,j-1]+0.3]
        k=int(np.argmin(c)); D[i,j]=c[k]; P[i,j]=k
i,j=n,int(np.argmin(D[n,:])); match={}
while i>0 and j>0:
    k=P[i,j]
    if k==0:
        if cost(A[i-1][1],B[j-1][1])<1: match[i-1]=B[j-1][0]
        i-=1;j-=1
    elif k==1: i-=1
    else: j-=1
times=[match.get(i) for i in range(n)]
# interpolate
idx=[i for i,t in enumerate(times) if t is not None]
for i in range(n):
    if times[i] is None:
        lo=max([k for k in idx if k<i],default=None); hi=min([k for k in idx if k>i],default=None)
        if lo is None: times[i]=times[hi]-0.3*(hi-i)
        elif hi is None: times[i]=times[lo]+0.3*(i-lo)
        else: times[i]=times[lo]+(times[hi]-times[lo])*(i-lo)/(hi-lo)
out=[]
for li,l in enumerate(lines):
    ts=[(times[k],A[k][1],k in match) for k in range(n) if A[k][0]==li]
    out.append({"zh":l,"chars":[[round(t,2),u] for t,u,_ in ts],"matched":sum(1 for *_,mm in ts if mm),"n":len(ts)})
    print(f"{ts[0][0]:7.2f}-{ts[-1][0]:7.2f} {sum(1 for *_,mm in ts if mm)}/{len(ts)} {l}")
json.dump(out,open('aligned.json','w'),ensure_ascii=False,indent=0)
