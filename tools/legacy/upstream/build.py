import json,re
U='src/apps/';O=''
def rep(s,a,b):
    assert s.count(a)==1,('count',s.count(a),a[:70]); return s.replace(a,b)
# --- image app (janya): add handoff
j=open(U+'janya.html').read()
hook_j="""<script>
addEventListener('message',async e=>{if(!e.data||e.data.cmd!=='grab')return;
try{const{w}=dims(1),k=1080/w,c=document.createElement('canvas'),kp=PH;PH=null;try{render(k,c)}finally{PH=kp}
const b=await tb(c),r=new FileReader();r.onload=()=>parent.postMessage({flow:'asset',kind:'image',data:r.result},'*');r.readAsDataURL(b)}
catch(err){parent.postMessage({flow:'error',kind:'image',msg:String(err&&err.message||err)},'*')}});
</script></body>"""
# --- vector app (arnav): add handoff
a=open(U+'arnav.html').read()
hook_a="""<script>
addEventListener('message',e=>{if(!e.data||e.data.cmd!=='grab')return;
if(!res||!res.svg)return parent.postMessage({flow:'error',kind:'vector',msg:'nothing generated yet'},'*');
parent.postMessage({flow:'asset',kind:'vector',svg:res.svg,W:res.W,H:res.H},'*')});
</script></body>"""
# --- generator: patch earlier workspace
g=open('src/generator.html').read()
g=rep(g,'</style>','#fmt,#slw,header h1{display:none!important}</style>')
g=rep(g,'const BASE={head:55,','const BASE={svg:44,head:55,')
g=rep(g,'const AR={head:.5,','const AR={svg:1,head:.5,')
g=rep(g,'FOC={head:78,obj:62,img:60}','FOC={svg:60,head:78,obj:62,img:60}')
g=rep(g,'z:{head:4,sub:4,obj:3,img:2,vec:1,motion:1}[k]','z:{head:4,sub:4,svg:3,obj:3,img:2,vec:1,motion:1}[k]')
g=rep(g,"find('img')||find('obj')||find('head')","find('svg')||find('img')||find('obj')||find('head')")
g=rep(g,'const el=assets.filter(a=>a.on);if(!el.length)return[];','const el=assets.filter(a=>a.on&&!a.bgOnly);if(!el.length)return[];')
g=rep(g,'rules(S.assets,c,rngF(seed+i*31),i,L)','rules(S.assets.filter(a=>a.slide==null||a.slide===i),c,rngF(seed+i*31),i,L)')
g=rep(g,"(assets.find(a=>a.type==='img'&&a.src)||{}).src","(assets.find(a=>a.type==='img'&&a.src&&a.on)||{}).src")
g=rep(g,"else if(k==='vec'){","else if(k==='svg'){st+=`aspect-ratio:${a.W}/${a.H}`;h=`<img alt=\"\" src=\"${a.src}\" style=\"width:100%;height:100%;display:block\">`}else if(k==='vec'){")
g=rep(g,"aspect_h_over_w:AR[kind(a)]})","aspect_h_over_w:AR[kind(a)],slide:a.slide==null?'all':a.slide})")
g=rep(g,'Place these elements: ${JSON.stringify(el)}.','Place these elements: ${JSON.stringify(el)}. An element with a numeric slide (0-based) appears only on that slide; "all" appears on every slide.')
g=rep(g,"background:linear-gradient(${P.b1}66,${P.b2}aa),url(${img}) center/cover","background:linear-gradient(#0009,#0003 45%,#000b),url(${img}) center/cover")
g=rep(g,"head();assets();gen();","""addEventListener('message',e=>{const m=e.data;if(!m||m.type!=='setup')return;
S.fmt=m.n>1?'carousel':'post';S.slides=m.n;S.assets=[];
m.texts.forEach((t,i)=>{S.assets.push({id:'h'+i,type:'text',role:'head',text:t.head,on:1,slide:i});if(t.sub)S.assets.push({id:'s'+i,type:'text',role:'sub',text:t.sub,on:1,slide:i})});
if(m.svg){AR.svg=m.svg.H/m.svg.W;S.assets.push({id:'v1',type:'svg',name:'Vector',src:m.svg.src,W:m.svg.W,H:m.svg.H,on:1})}
if(m.img){S.assets.push({id:'p1',type:'img',name:'Photo (background)',src:m.img,on:1,bgOnly:1});}
if(!window._init||window._hi!==!!m.img){if(m.img){S.ctl.background='Image-based';S.ctl.colour='High contrast'}else{S.ctl.background='Atmospheric';S.ctl.colour='Preserve original'}}
document.querySelectorAll('#ct select').forEach(s=>{s.value=S.ctl[s.dataset.c]});
if(!window._init){S.seed=1;S.sel=0}window._init=1;window._hi=!!m.img;head();assets();gen()});
head();assets();gen();""")
gs=g
# --- shell
sh=open('src/shell.html').read()
src={'image':j,'vector':a,'gen':gs}
js=json.dumps(src).replace('</','<\\/').replace('<!--','<\\!--')
out=rep(sh,'__SRC__',js)
open('index.html','w').write(out)
print(len(out)//1024,'KB')
