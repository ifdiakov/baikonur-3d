import json,math
from shapely.geometry import LineString
from shapely.ops import unary_union
base=[62.8609924,46.0698491];k=6371008.8*math.pi/180*3.4/65/.14;c=math.cos(math.radians(45.9256))
def xy(q):return [(q[0]-base[0])*k*c,-(q[1]-base[1])*k]
features=json.load(open('data/osm/roads.geojson'))['features']
ids={172710405,172710408,172710410,172710413,172710415,172710416,172710417,172710419,172710422,172710425,172710446,172710448,172710449,172710450,172710457,172710459,466850237,466850238}
roads=[LineString([xy(p) for p in f['geometry']['coordinates']]) for f in features if f['properties']['osmId'] in ids]
assert len(roads)==18
roads += [LineString([[34,6],[34,10],[27.616,11.105]]),LineString([[-43.869,400.126],[-43.869,417.5]])]
lanes=unary_union([r.buffer(3.1,cap_style=2,join_style=1,quad_segs=3) for r in roads]);outer=unary_union([r.buffer(4.4,cap_style=2,join_style=1,quad_segs=3) for r in roads])
main=next(f for f in features if f['properties']['osmId']==172710451)
main_mask=LineString([xy(p) for p in main['geometry']['coordinates']]).buffer(2.4/.14/2,cap_style=2,join_style=1)
shoulder=outer.difference(lanes).difference(main_mask)
lanes=lanes.difference(main_mask)
earth=outer.buffer(35,join_style=1,quad_segs=3).difference(outer).difference(main_mask)
def shapes(g):
 polys=[g] if g.geom_type=='Polygon' else list(g.geoms)
 return [{'outer':[[round(x,4),round(z,4)]for x,z in p.exterior.coords],'holes':[[[round(x,4),round(z,4)]for x,z in r.coords]for r in p.interiors]}for p in polys]
data={'source':'Existing project OSM snapshot, OpenStreetMap contributors, ODbL 1.0','ids':sorted(ids),'roads':shapes(lanes),'shoulders':shapes(shoulder),'boundary':shapes(outer),'earth':shapes(earth)}
open('src/site94-streets.js','w',encoding='utf-8').write('// Local service streets only; main roads and traffic remain unchanged.\n// © OpenStreetMap contributors, ODbL 1.0. Source: existing data/osm/roads.geojson.\nexport const SITE94_STREETS='+json.dumps(data,separators=(',',':'))+';\n')
# The candidate already has its exact UI integration. Redirect only the road
# builder; do not rewrite other model or scene modules.
p='src/archive-models.js';s=open(p,encoding='utf-8').read()
old="import {buildSite94,connectSite94} from './site94.js?v=20261112-site94-94a-photo-v1';"
new="import {buildSite94} from './site94.js?v=20261112-site94-94a-photo-v1';\nimport {connectSite94} from './site94-road-grade.js?v=20261112-site94-94a-photo-v1';"
if old in s:s=s.replace(old,new);open(p,'w',encoding='utf-8').write(s)
