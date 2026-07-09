#!/usr/bin/env python3
"""Generate the branded festival social cards (maroon + gold, 1080x1080).

Run:  python3 marketing/graphics/generate-cards.py   (needs Pillow)
Edit the CARDS list at the bottom to add/adjust festivals. Pairs with
marketing/festival-posts.md (captions) and content-calendar.md (timing).
"""
from PIL import Image, ImageDraw, ImageFont
import math, pathlib

HERE = pathlib.Path(__file__).resolve().parent          # marketing/graphics
ROOT = HERE.parent.parent                                # repo root
OUT = HERE; OUT.mkdir(exist_ok=True)
ASSETS = ROOT / "landing" / "assets"

MAROON=(122,20,36); MAROON_LT=(150,32,50)
GOLD=(214,175,82); GOLD_LT=(240,214,140); CREAM=(245,233,210)

F_DIDOT="/System/Library/Fonts/Supplemental/Didot.ttc"
F_GEO  ="/System/Library/Fonts/Supplemental/Georgia.ttf"
F_GEOB ="/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
F_DEV  ="/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc"
def font(p,s): return ImageFont.truetype(p,s)

G=Image.open(ASSETS/"logo.png").convert("RGBA").crop((452,103,672,322))

def bg(size=1080):
    base=Image.new("RGB",(size,size),MAROON); px=base.load()
    cx=cy=size/2; maxd=math.hypot(cx,cy)
    for y in range(size):
        for x in range(size):
            t=min(1,math.hypot(x-cx,y-cy)/maxd)
            px[x,y]=(int(MAROON_LT[0]*(1-t)+MAROON[0]*t),
                     int(MAROON_LT[1]*(1-t)+MAROON[1]*t),
                     int(MAROON_LT[2]*(1-t)+MAROON[2]*t))
    return base

def ctext(d,y,text,fnt,fill,S,spacing=0):
    if spacing:
        ws=[d.textlength(c,font=fnt) for c in text]
        x=(S-(sum(ws)+spacing*(len(text)-1)))/2
        for c,w in zip(text,ws): d.text((x,y),c,font=fnt,fill=fill); x+=w+spacing
    else:
        d.text(((S-d.textlength(text,font=fnt))/2,y),text,font=fnt,fill=fill)

def card(fname,festival,hindi,tagline,accent=GOLD,fsize=132):
    S=1080; img=bg(S).convert("RGBA"); d=ImageDraw.Draw(img)
    m=46
    d.rectangle([m,m,S-m,S-m],outline=GOLD,width=3)
    d.rectangle([m+10,m+10,S-m-10,S-m-10],outline=(GOLD[0],GOLD[1],GOLD[2],120),width=1)
    for cx,cy in [(m,m),(S-m,m),(m,S-m),(S-m,S-m)]:
        d.polygon([(cx,cy-9),(cx+9,cy),(cx,cy+9),(cx-9,cy)],fill=GOLD)
    gw=180; g=G.resize((gw,int(G.height*gw/G.width)),Image.LANCZOS)
    img.alpha_composite(g,((S-gw)//2,118))
    ctext(d,330,"WHOLESALE FESTIVE SAREES",font(F_GEO,26),CREAM,S,spacing=6)
    ctext(d,375,festival,font(F_DIDOT,fsize),GOLD,S)
    yy=375+fsize+30
    if hindi: ctext(d,yy,hindi,font(F_DEV,60),GOLD_LT,S); yy+=95
    cy=yy+10
    d.line([(S/2-160,cy),(S/2-30,cy)],fill=GOLD,width=2)
    d.line([(S/2+30,cy),(S/2+160,cy)],fill=GOLD,width=2)
    d.polygon([(S/2,cy-8),(S/2+12,cy),(S/2,cy+8),(S/2-12,cy)],fill=accent)
    ctext(d,cy+34,tagline,font(F_GEO,38),CREAM,S)
    # footer
    ctext(d,822,"GOPIRAM  SAREES",font(F_GEOB,46),GOLD,S,spacing=4)
    ctext(d,886,"गोपीराम साड़ी",font(F_DEV,32),GOLD_LT,S)
    ctext(d,942,"Naya Bazaar, Gwalior",font(F_GEO,27),CREAM,S)
    ctext(d,980,"WhatsApp  +91 89828 61210",font(F_GEOB,27),GOLD_LT,S)
    img.convert("RGB").save(OUT/fname,quality=92)
    print("wrote",fname)

CARDS=[
 ("navratri.png","Navratri","शुभ नवरात्रि","All nine colours — now in wholesale",(230,120,60)),
 ("diwali.png","Diwali","शुभ दीपावली","Gold & festive party-wear sarees",(240,200,90)),
 ("karwachauth.png","Karwa Chauth","करवा चौथ","Bridal reds & maroon, in wholesale",(200,40,60)),
 ("wedding.png","Wedding Season","शादी का सीज़न","Banarasi, silk & bridal sarees",GOLD,110),
 ("teej.png","Teej","हरतालिका तीज","Festive greens & reds in wholesale",(90,170,90)),
 ("holi.png","Holi","होली की शुभकामनाएँ","The season's brightest sarees",(90,150,220),150),
 ("akshaya.png","Akshaya Tritiya","अक्षय तृतीया","Auspicious gold-toned silks",GOLD,96),
 ("newarrivals.png","New Arrivals","नई डिज़ाइन","Fresh designs every week",GOLD,120),
]
for c in CARDS:
    if len(c)==5: card(c[0],c[1],c[2],c[3],c[4])
    else: card(c[0],c[1],c[2],c[3],c[4],c[5])
