from pathlib import Path
from urllib.request import urlopen,Request
from PIL import Image,ImageDraw,ImageFont
import io,json,numpy as np
out=Path('assets/org-logos');out.mkdir(parents=True,exist_ok=True)
qa=Path('qa-portal');qa.mkdir(exist_ok=True)
refs={'infracos':('РГП','ИНФРАКОС','https://cdn1.kdt.kz/files/sites/1724080693382947/files/images/ru/logo.jpg?_=1749447599','https://gh-ecology.agartu.kz/history?lang=ru'),'baiterek':('АО «СП»','БАЙТЕРЕК','https://static.tildacdn.pro/tild6464-3361-4266-a334-643933363633/1_page-0001.jpg','https://bayterek.kz/types_of_activities')}
font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';reports={}
for key,(prefix,name,url,page) in refs.items():
 canvas=Image.new('RGBA',(1280,480),(0,0,0,0));kind='museum-typographic-nameplate';box=None
 try:
  raw=urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25).read();im=Image.open(io.BytesIO(raw)).convert('RGB');im.save(qa/(key+'-reference.png'))
  a=np.asarray(im).astype(float);chroma=a.max(axis=2)-a.min(axis=2);mask=(chroma>60)&(a.min(axis=2)<180)
  if key=='baiterek':mask[:,:int(im.width*.45)]=False
  ys,xs=np.where(mask)
  if len(xs)<40:raise ValueError('No clear logo component')
  box=(max(0,int(xs.min())-5),max(0,int(ys.min())-5),min(im.width,int(xs.max())+6),min(im.height,int(ys.max())+6))
  im=im.crop(box);im.thumbnail((370,370),Image.Resampling.LANCZOS);a=np.asarray(im);alpha=np.minimum(255,((255-a.min(axis=2).astype(float))*2.5)).astype('uint8')
  rgba=np.empty((im.height,im.width,4),dtype='uint8');rgba[:,:,:3]=[216,230,234];rgba[:,:,3]=alpha
  canvas.alpha_composite(Image.fromarray(rgba),(20+(370-im.width)//2,(480-im.height)//2));kind='monochrome-adaptation-of-official-site-reference'
 except Exception as e:print(key,'using explicit text nameplate:',type(e).__name__)
 draw=ImageDraw.Draw(canvas);x=420 if kind.startswith('monochrome') else 38
 draw.text((x,116),prefix,font=ImageFont.truetype(font,54),fill=(180,199,207,255));size=82
 while draw.textbbox((0,0),name,font=ImageFont.truetype(font,size))[2]>1240-x:size-=1
 draw.text((x,195),name,font=ImageFont.truetype(font,size),fill=(224,236,241,255));canvas.save(out/(key+'.png'))
 reports[key]={'kind':kind,'sourcePage':page,'sourceImage':url,'crop':box,'attribution':'Organisation assignments supplied by museum owner; logo source is not evidence of ownership.'}
(out/'portal-partner-sources.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
