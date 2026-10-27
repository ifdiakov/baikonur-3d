#!/usr/bin/env python3
"""Trace the Syr Darya around Baikonur from OpenStreetMap hydrography.

Output is an illustrative alignment of genuine river nodes to the existing
historical Baikonur diagram, NOT a cadastral or meter-accurate georeference.
OpenStreetMap contributors © ODbL 1.0. Run by GitHub Actions only.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "syrdarya-river.json"
OVERPASS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
QUERY = """[out:json][timeout:45];
way["waterway"="river"]["name"~"Сыр|Сір|Syr|Sir",i](45.28,61.50,46.42,65.28);
out geom;"""
# Approximate location anchors from open geographic references:
# Baikonur city (Mapcarta OSM), historical Site 1 and Site 31.
ANCHORS = [
    {"map": [658,958], "lon":63.30170, "lat":45.62850, "label":"Baikonur city"},
    {"map": [699,365], "lon":63.34225, "lat":45.92025, "label":"Gagarin Start 1/5"},
    {"map": [1017,228], "lon":63.56417, "lat":45.99611, "label":"Launch Site 31/6"},
]

def solve_three(points,values):
    rows=[[1.0,float(x),float(y)] for x,y in points]
    rhs=list(map(float,values))
    for col in range(3):
        pivot=max(range(col,3),key=lambda row:abs(rows[row][col]))
        rows[col],rows[pivot]=rows[pivot],rows[col]
        rhs[col],rhs[pivot]=rhs[pivot],rhs[col]
        if abs(rows[col][col])<1e-12:
            raise ValueError("Degenerate landmark configuration")
        q=rows[col][col]
        for j in range(col,3):rows[col][j]/=q
        rhs[col]/=q
        for row in range(3):
            if row==col:continue
            factor=rows[row][col]
            for j in range(col,3):rows[row][j]-=factor*rows[col][j]
            rhs[row]-=factor*rhs[col]
    return rhs

M=[a["map"] for a in ANCHORS]
longitude=solve_three(M,[a["lon"] for a in ANCHORS])
latitude=solve_three(M,[a["lat"] for a in ANCHORS])

def to_map(lon,lat):
    lon-=longitude[0]
    lat-=latitude[0]
    det=longitude[1]*latitude[2]-longitude[2]*latitude[1]
    x=(lon*latitude[2]-longitude[2]*lat)/det
    y=(longitude[1]*lat-lon*latitude[1])/det
    return [round(x,2),round(y,2)]

def near(a,b):
    # Longitude values scaled by cos(latitude); degrees converted roughly to meters.
    return math.hypot((a[0]-b[0])*77000,(a[1]-b[1])*111000)

def fetch_osm():
    payload=urllib.parse.urlencode({"data":QUERY}).encode()
    for url in OVERPASS:
        try:
            request=urllib.request.Request(
                url,data=payload,headers={"User-Agent":"RocketTrip-Baikonur-Museum/1.0 (historical map research)"},
            )
            with urllib.request.urlopen(request,timeout=65) as response:
                obj=json.load(response)
            ways=[]
            for item in obj.get("elements",[]):
                if item.get("type")!="way":continue
                coords=[(float(p["lon"]),float(p["lat"])) for p in item.get("geometry",[])]
                if len(coords)>=3:ways.append(coords)
            if ways:return ways,url
        except Exception as exc:
            print("Overpass endpoint failed:",url,type(exc).__name__,str(exc)[:180])
    raise RuntimeError("No named Syr Darya geometry available from OSM endpoints")

def dist_to_reference(path):
    return min(near(node,(63.329033,45.622663)) for node in path)

def join_osm_ways(ways):
    remaining=[list(w) for w in ways]
    seed=min(range(len(remaining)),key=lambda i:dist_to_reference(remaining[i]))
    chain=remaining.pop(seed)
    if dist_to_reference(chain)>6000:
        raise RuntimeError("None of the river ways passes near Baikonur")
    # Combine touching ways; do not connect unrelated tributaries.
    for _ in range(500):
        best=None
        ends=(chain[0],chain[-1])
        for j,segment in enumerate(remaining):
            for side,endpoint in enumerate(ends):
                for end in (0,-1):
                    dist=near(endpoint,segment[end])
                    if dist<1550 and (best is None or dist<best[0]):
                        best=(dist,j,side,end)
        if best is None:break
        dist,j,side,end=best
        segment=remaining.pop(j)
        if side==1:
            if end==-1:segment.reverse()
            chain.extend(segment[1:] if dist<6 else segment)
        else:
            if end==0:segment.reverse()
            chain=(segment[:-1] if dist<6 else segment)+chain
    # Orient geographically west -> east.
    if chain[0][0]>chain[-1][0]:chain.reverse()
    return chain

def simplify(points,distance_m=65):
    out=[points[0]]
    for p in points[1:-1]:
        if near(out[-1],p)>distance_m:out.append(p)
    out.append(points[-1])
    return out

def main():
    ways,source=fetch_osm()
    river=join_osm_ways(ways)
    print("Named river ways",len(ways),"connected path points",len(river),"source",source)
    projected=[to_map(lon,lat) for lon,lat in simplify(river)]
    projected=[p for p in projected if -8000<=p[0]<=10000 and -3000<=p[1]<=3500]
    if len(projected)<20:raise RuntimeError("Insufficient river nodes in diagram's region")
    if not any(p[0]<0 for p in projected) or not any(p[0]>1300 for p in projected):
        raise RuntimeError("Connected hydrography does not extend both edges of the historical plan")
    payload={
      "version":1,
      "source":"OpenStreetMap waterway=river named Syr Darya",
      "sourceUrl":"https://www.openstreetmap.org/copyright",
      "license":"Open Database License (ODbL) 1.0 — © OpenStreetMap contributors",
      "generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),
      "georeferenced":False,
      "note":"Open OSM river nodes approximately projected onto the user's historical diagram using Baikonur city, LC-1/5 and LC-31/6 landmarks. Core river within diagram remains traced directly from original image; only outside extensions use OSM-derived geometry. Transformation is approximate.",
      "anchors":ANCHORS,
      "affine":{"longitude":longitude,"latitude":latitude},
      "mapPoints":projected,
    }
    OUT.parent.mkdir(exist_ok=True,parents=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n")
    print("Wrote",OUT,"with",len(projected),"points; x range",
          (min(p[0] for p in projected),max(p[0] for p in projected)))
if __name__=="__main__":
    main()
