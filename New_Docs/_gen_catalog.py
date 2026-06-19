"""Generates docs/03-data/spaces.catalog.json from the floor-plan analysis +
the existing ops-core seed. Run from the repo root: python New_Docs/_gen_catalog.py"""
import json, os

def uid(n): return f"50000000-0000-4000-8000-{n:012d}"

AUTH = "ops-core seed (authoritative -- already in seed.ts)"
def PLAN(f): return f"floor plan ({f}) + estimated attributes (hackathon)"

# n, slug, name, floor, kind, category, zone, isCirc, ceilingCm, caps, feats, rate, setBuf, tearBuf, adjacent, map, source
S = [
 (1,"blue_hall","Blue Hall",0,"MAIN","HALL","F0-N",False,None,
   {"THEATER":220,"CLASSROOM":120,"BANQUET":160,"RECEPTION":300},["stage","av_builtin","step_free"],80000,240,120,
   ["orange_hall","north_foyer","entrance_atrium","central_atrium_f0","east_ring_corridor_f0"],{"floor":0,"ring":"outer","sectorFrom":1,"sectorTo":3},AUTH),
 (2,"orange_hall","Orange Hall",0,"MAIN","HALL","F0-E",False,None,
   {"THEATER":180,"CLASSROOM":100,"BANQUET":140,"RECEPTION":240},["av_builtin","step_free"],70000,240,120,
   ["blue_hall","box_3_workshop","east_ring_corridor_f0","central_atrium_f0"],{"floor":0,"ring":"outer","sectorFrom":4,"sectorTo":6},AUTH),
 (3,"green_hall","Green Hall",-1,"MAIN","HALL","F-1-N",False,None,
   {"THEATER":120,"CLASSROOM":70,"BANQUET":90,"RECEPTION":160},["natural_light"],55000,180,90,
   ["yellow_hall","lower_gallery","lower_corridor","lower_atrium"],{"floor":-1,"ring":"outer","sectorFrom":1,"sectorTo":3},AUTH),
 (4,"yellow_hall","Yellow Hall",-1,"MAIN","HALL","F-1-E",False,None,
   {"THEATER":90,"CLASSROOM":50,"BANQUET":70,"RECEPTION":120},["step_free"],45000,180,90,
   ["green_hall","lower_gallery","lower_corridor"],{"floor":-1,"ring":"outer","sectorFrom":4,"sectorTo":6},AUTH),
 (5,"entrance_atrium","Entrance Atrium",0,"TRANSITIONAL","ENTRANCE","F0-S",True,None,
   {"RECEPTION":250},["natural_light","step_free"],30000,120,60,
   ["blue_hall","central_atrium_f0","north_foyer"],{"floor":0,"ring":"outer","sectorFrom":12,"sectorTo":14},AUTH),
 (6,"lower_corridor","Lower Corridor",-1,"TRANSITIONAL","CORRIDOR","F-1-ring",True,None,
   {"RECEPTION":120},[],15000,60,60,
   ["green_hall","yellow_hall","lower_gallery","lower_atrium"],{"floor":-1,"ring":"corridor","sectorFrom":1,"sectorTo":11},AUTH),
 (7,"central_atrium_f0","Central Atrium (floor 0)",0,"TRANSITIONAL","ATRIUM","F0-core",True,None,
   {"RECEPTION":200},["grand_stair","natural_light","step_free"],35000,120,90,
   ["blue_hall","orange_hall","entrance_atrium","north_foyer","east_ring_corridor_f0","lower_atrium","upper_atrium"],{"floor":0,"ring":"center"},PLAN("kati 0")),
 (8,"east_ring_corridor_f0","East Ring Corridor (floor 0)",0,"TRANSITIONAL","CORRIDOR","F0-ring",True,None,
   {"RECEPTION":80},["step_free"],12000,60,60,
   ["blue_hall","orange_hall","box_3_workshop","box_5_breakout","box_7_green_room","central_atrium_f0"],{"floor":0,"ring":"corridor","sectorFrom":4,"sectorTo":9},PLAN("kati 0")),
 (9,"box_7_green_room","Box 7 -- Green Room",0,"MAIN","BOX","F0-E",False,270,
   {"BOARDROOM":14,"CLASSROOM":20},["enclosed"],18000,60,60,
   ["east_ring_corridor_f0","orange_hall"],{"floor":0,"ring":"outer","sectorFrom":9,"sectorTo":9},PLAN("kati 0")),
 (10,"box_5_breakout","Box 5 -- Breakout",0,"MAIN","BOX","F0-E",False,270,
   {"BOARDROOM":12,"CLASSROOM":18},["enclosed"],16000,60,60,
   ["east_ring_corridor_f0"],{"floor":0,"ring":"outer","sectorFrom":8,"sectorTo":8},PLAN("kati 0")),
 (11,"box_3_workshop","Box 3 -- Workshop",0,"MAIN","BOX","F0-E",False,338,
   {"CLASSROOM":30,"BOARDROOM":16},["enclosed","av_builtin"],20000,90,60,
   ["east_ring_corridor_f0","orange_hall"],{"floor":0,"ring":"outer","sectorFrom":7,"sectorTo":7},PLAN("kati 0")),
 (12,"north_foyer","North Foyer (Space 30)",0,"TRANSITIONAL","TRANSITIONAL","F0-N",False,None,
   {"RECEPTION":120,"CABARET":60},["natural_light","step_free"],22000,90,60,
   ["blue_hall","central_atrium_f0","entrance_atrium"],{"floor":0,"ring":"outer","sectorFrom":10,"sectorTo":11},PLAN("kati 0")),
 (13,"lower_gallery","Lower Gallery (Space 12-13)",-1,"MAIN","HALL","F-1-W",False,None,
   {"RECEPTION":200,"BANQUET":120,"THEATER":140,"CUSTOM":200},["step_free"],50000,180,90,
   ["green_hall","yellow_hall","lower_corridor","lower_atrium"],{"floor":-1,"ring":"outer","sectorFrom":7,"sectorTo":11},PLAN("kati -1")),
 (14,"box_1_boh","Box 1 -- Back-of-house",-1,"MAIN","BOX","F-1-W",False,230,
   {"BOARDROOM":10},["enclosed"],12000,60,60,
   ["lower_corridor"],{"floor":-1,"ring":"outer","sectorFrom":12,"sectorTo":12},PLAN("kati -1")),
 (15,"lower_atrium","Lower Atrium (floor -1)",-1,"TRANSITIONAL","ATRIUM","F-1-core",True,None,
   {"RECEPTION":150},["grand_stair","step_free"],28000,120,90,
   ["green_hall","lower_corridor","lower_gallery","central_atrium_f0"],{"floor":-1,"ring":"center"},PLAN("kati -1")),
 (16,"skyline_room","Skyline Room (Space 31/34)",3,"MAIN","HALL","F3-N",False,None,
   {"THEATER":80,"RECEPTION":120,"BANQUET":70},["natural_light","panoramic_view"],60000,180,120,
   ["upper_atrium","roof_terrace","box_16_meeting"],{"floor":3,"ring":"outer","sectorFrom":1,"sectorTo":4},PLAN("kati 3")),
 (17,"box_16_meeting","Box 16 -- Upper Meeting",3,"MAIN","BOX","F3-N",False,300,
   {"BOARDROOM":16,"CLASSROOM":24},["enclosed","av_builtin"],22000,60,60,
   ["upper_atrium","skyline_room"],{"floor":3,"ring":"outer","sectorFrom":5,"sectorTo":5},PLAN("kati 3")),
 (18,"roof_terrace","Roof Terrace (Pyramid Slope)",3,"MAIN","TERRACE","F3-slope",False,None,
   {"RECEPTION":300,"CUSTOM":300},["outdoor","panoramic_view","iconic","weather_dependent"],75000,180,120,
   ["skyline_room","upper_atrium"],{"floor":3,"ring":"outer","sectorFrom":9,"sectorTo":14},PLAN("kati 3")),
 (19,"upper_atrium","Upper Atrium (floor 3)",3,"TRANSITIONAL","ATRIUM","F3-core",True,None,
   {"RECEPTION":120},["grand_stair"],25000,120,90,
   ["skyline_room","box_16_meeting","roof_terrace","central_atrium_f0"],{"floor":3,"ring":"center"},PLAN("kati 3")),
]

spaces=[]
for (n,slug,name,floor,kind,cat,zone,circ,ceil,caps,feats,rate,sb,tb,adj,mp,src) in S:
    o={"id":uid(n),"slug":slug,"name":name,"floor":floor,"kind":kind,"category":cat,"zone":zone,
       "isCirculation":circ,"capacities":caps,"features":feats,"dayRateMinor":rate,"currency":"ALL",
       "setupBufferMinutes":sb,"teardownBufferMinutes":tb,"status":"ACTIVE","adjacent":adj,"map":mp,"source":src}
    if ceil is not None: o["ceilingCm"]=ceil
    spaces.append(o)

catalog={
 "$meta":{
  "title":"Pyramid of Tirana -- space catalog",
  "purpose":"Single shared source for the venue's bookable spaces. Feeds three consumers: ops-core Space seed (Elis), ai-orchestrator venue_facts/RAG (Alvin), and the floor-map UI (Elis).",
  "source":"Derived from New_Docs floor plans (kati -1 / 0 / 3) + the existing ops-core seed. Radial building: central atrium of grand stairs -> ring corridors -> wedge rooms on 16 axes; terraced interior.",
  "conventions":{
   "id":"UUID, ops-core scheme 50000000-0000-4000-8000-<n>; n=1..6 already seeded, n>=7 new.",
   "enums_UPPER_SNAKE":True,"money":"integer minor units (ALL)",
   "kind":["MAIN","TRANSITIONAL"],
   "category":["HALL","BOX","CORRIDOR","ATRIUM","ENTRANCE","TERRACE","TRANSITIONAL"],
   "capacities":"layout -> seated/standing capacity. Layout enum: THEATER, CLASSROOM, BANQUET, RECEPTION, CABARET, BOARDROOM, CUSTOM.",
   "adjacent":"list of slugs that physically touch this space (for AI bundles + circulation reasoning).",
   "map":"schematic floor-map placement (ring + 16-axis sector range). NOT surveyed geometry -- for the stylized radial map.",
   "isCirculation":"true = booking this space affects access/egress for neighbours (corridors, atria)."
  },
  "field_ownership":{
   "ops_core_seed_fields":["id","name","floor","kind","capacities","features","dayRateMinor","currency","setupBufferMinutes","teardownBufferMinutes","status"],
   "catalog_extension_fields_AI_and_map_promote_to_ops_core_later_additive":["slug","category","zone","isCirculation","adjacent","map","ceilingCm"]
  },
  "caveats":"Rows 1-6 are authoritative (match seed.ts exactly). Rows 7-19: names/heights/structure are read from the plans; capacities, day rates, buffers, adjacency and map sectors are reasonable ESTIMATES for the demo, not surveyed facts. Color halls (Blue/Orange/Green/Yellow) are operational names; their exact plan-wedge mapping is unconfirmed.",
  "counts":{}
 },
 "spaces":spaces,
 "bundleTemplates":[
  {"key":"conference","when":"eventType=CONFERENCE","roles":[
     {"role":"main","category":"HALL","layout":"THEATER","note":"talks"},
     {"role":"registration","category":["ENTRANCE","ATRIUM","TRANSITIONAL"],"note":"check-in + coffee"},
     {"role":"green_room","category":"BOX","note":"speakers / staff","optional":True}]},
  {"key":"exhibition","when":"eventType=EXHIBITION","roles":[
     {"role":"main","category":"HALL","layout":"RECEPTION","note":"booths"},
     {"role":"overflow","category":["CORRIDOR","TRANSITIONAL"],"note":"extra booths / flow","optional":True}]},
  {"key":"gala","when":"eventType in (COMMUNITY,PRIVATE,PERFORMANCE)","roles":[
     {"role":"main","category":"HALL","layout":"BANQUET","note":"dinner"},
     {"role":"welcome","category":"ATRIUM","layout":"RECEPTION","note":"welcome drinks"}]}
 ],
 "circulationRules":[
  "Booking an isCirculation space for an event blocks/limits access to its 'adjacent' spaces during the effective window -- surface as an access warning, prefer an alternative.",
  "Step-free access: if an event needs step_free, prefer routing registration/flow through step_free circulation spaces."
 ]
}
sp=catalog["spaces"]
catalog["$meta"]["counts"]={"total":len(sp),
  "by_floor":{str(f):sum(1 for s in sp if s["floor"]==f) for f in sorted({s["floor"] for s in sp})},
  "by_category":{c:sum(1 for s in sp if s["category"]==c) for c in sorted({s["category"] for s in sp})}}

os.makedirs("docs/03-data",exist_ok=True)
path="docs/03-data/spaces.catalog.json"
with open(path,"w",encoding="utf-8") as f: json.dump(catalog,f,indent=2,ensure_ascii=False)
reloaded=json.load(open(path,encoding="utf-8"))
print("WROTE",path,"bytes:",os.path.getsize(path))
print("spaces:",len(reloaded["spaces"]))
print("by floor:",catalog["$meta"]["counts"]["by_floor"])
print("by category:",catalog["$meta"]["counts"]["by_category"])
slugs={s["slug"] for s in sp}
bad=[(s["slug"],a) for s in sp for a in s["adjacent"] if a not in slugs]
print("dangling adjacency refs:", bad if bad else "none")
