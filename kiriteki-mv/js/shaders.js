/* 霧笛 MV — GLSL sources. All shaders are original; techniques: steep-parallax height-field marching on
   monocular depth, fbm fog, screen-space light scattering, procedural rain-on-glass, height-field ocean,
   generalized Kuwahara (Papari et al.), dual-filter bloom. */
'use strict';
(function (MV) {
  const S = (MV.SH = {});
  S.head = `#version 300 es
precision highp float;
precision highp int;
`;
  S.vsFS = S.head + `
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  S.common = `
#define PI 3.14159265
#define TAU 6.28318531
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash32(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float noise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float n=i.x+i.y*157.+113.*i.z;
  vec4 a=fract(sin(vec4(n,n+1.,n+157.,n+158.))*43758.5453);
  vec4 b=fract(sin(vec4(n+113.,n+114.,n+270.,n+271.))*43758.5453);
  vec4 m=mix(a,b,u.z); vec2 m2=mix(m.xz,m.yw,u.x); return mix(m2.x,m2.y,u.y); }
float fbm2(vec2 p){ float s=0.,a=.5; mat2 r=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*noise2(p); p=r*p+3.1; a*=.5; } return s; }
float fbm3(vec3 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*noise3(p); p=p*2.02+vec3(1.7,9.2,3.3); a*=.5; } return s; }
mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec3 softClip(vec3 x){ const float k=.82; vec3 o=x; for(int i=0;i<3;i++){ if(o[i]>k) o[i]=k+(1.-k)*(1.-exp(-(o[i]-k)/(1.-k))); } return o; }
vec3 toLin(vec3 c){ return pow(max(c,0.), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c,0.), vec3(1./2.2)); }
`;

  // ------------------------------------------------------------------ PLATE (2.5D painted backgrounds)
  S.plate = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform sampler2D uImg, uDep, uFx, uSketch, uGlassMask;
uniform int uHasFx, uSteps;
uniform float uAsp, uImgAsp, uZoom, uRoll, uFocus, uDolly, uTime;
uniform vec2 uCam, uPar;
uniform float uExposure, uSat, uContrast, uAlpha;
uniform vec3 uTint, uLift;
uniform vec3 uFogCol; uniform float uFogAmt, uFogNear, uFogFar, uFogScale; uniform vec2 uFogVel;
uniform int uLN; uniform vec2 uLPos[6]; uniform float uLDep[6]; uniform vec3 uLCol[6]; uniform float uLRad[6];
uniform float uBeamInt, uBeamAng, uBeamW, uBeamDep; uniform vec2 uBeamPos; uniform vec3 uBeamCol;
uniform float uWater, uSway, uSkyMove, uEmis, uWaterAll;
uniform int uRipN; uniform vec4 uRip[8];
uniform float uDof, uDofF;
uniform float uGlass, uGlassClear; uniform vec4 uGlassRect;
uniform float uSketchOn, uReveal; uniform vec2 uRevO;
uniform float uErode;
uniform float uDuo; uniform vec3 uDuoA, uDuoB; uniform float uHalftone, uHTScale;
uniform float uVig; uniform vec4 uSweep; uniform vec3 uSweepCol;

vec2 imgUV(vec2 p, float z){
  float s = uZoom*(1.0+uDolly*(z-uFocus));
  vec2 q = uCam + (rot2(uRoll)*p)/s + uPar*(z-uFocus);
  return vec2(q.x/uImgAsp+0.5, q.y+0.5);
}
// own rain-on-glass model. Resting drops are tiny fish-eye lenses: each shows an inverted, minified view of the
// scene behind (sharp, while the fogged glass around it is blurred). Sliding drops move with stick-slip motion
// down meandering paths and leave a clear trail with beads. g is p-space (y down), px = one pixel in g units.
void glassModel(vec2 g, float t, float px, out vec2 off, out float clear, out float spec, out float rim, out float mag){
  off=vec2(0.); clear=0.; spec=0.; rim=0.; mag=0.;
  const float RV=.032;   // radius of the background region every drop "sees"
  for(int L=0; L<3; L++){
    float sc = L==0 ? 12. : (L==1 ? 27. : 58.);
    float prob = L==0 ? .36 : (L==1 ? .38 : .42);
    vec2 gp = g*sc + float(L)*vec2(.37,.71);
    vec2 id=floor(gp); vec2 f=fract(gp)-.5;
    vec3 h=hash32(id+float(L)*17.3);
    if(h.z>prob) continue;
    vec2 c=(h.xy-.5)*.34;
    float r=mix(.13,.3,fract(h.z*13.7+h.x*3.1));
    float life=fract(t*.045*(.5+h.x)+h.y);
    r*=smoothstep(0.,.05,life)*smoothstep(1.,.8,life);
    vec2 d=(f-c)*vec2(1.,1.1);
    float an=atan(d.y,d.x);
    float dl=length(d)*(1.+.06*sin(an*2.+h.x*6.28)+.035*sin(an*3.+h.y*6.28));
    float rg=r/sc;                         // radius in g units
    float m=smoothstep(rg, rg-px*1.3, dl/sc);
    if(m<=0.) continue;
    float k=1.+RV/max(rg,1e-4);
    float q=clamp(dl/max(r,1e-4),0.,1.);
    off += -(d/sc)*k*m;
    clear += m; mag += log2(k)*m;
    rim += smoothstep(.62,1.,q)*m*(L==2?.45:1.);
    spec += smoothstep(.26,.0,length(d/max(r,1e-4)-vec2(-.3,-.42)))*m*(L==2?.4:1.);
  }
  for(int L=0; L<2; L++){
    float cw = L==0 ? .09 : .14;
    float gx = g.x/cw + float(L)*.5;
    float cx = floor(gx);
    vec3 h = hash32(vec2(cx*1.7+3.1, 9.7*float(L)+2.3));
    if(h.z>.42) continue;
    float P=1.7;
    float v=mix(.06,.15,h.y); float w=mix(2.2,3.6,h.x);
    float s=t*v + (v/w)*.9*sin(t*w+h.x*6.28);           // stick-slip
    float yd=fract(s/P+h.z*7.31)*P-P*.5-.1;
    float xc=(cx+.5-float(L)*.5)*cw;
    float ph=h.y*6.28, ph2=h.x*6.28;
    float pathX=xc+cw*(.16*sin(g.y*7.+ph)+.06*sin(g.y*19.+ph2));
    float headX=xc+cw*(.16*sin(yd*7.+ph)+.06*sin(yd*19.+ph2));
    float r=mix(.0095,.0145,h.x);
    vec2 d=g-vec2(headX,yd); d.y-=P*floor(d.y/P+.5);
    vec2 e=d; e.y*= e.y<0. ? .72 : 1.12;               // tail stretched upward
    float dl=length(e);
    float m=smoothstep(r, r-px*1.3, dl);
    float k=1.+RV/r;
    off += -d*k*m; clear += m; mag += log2(k)*m;
    rim += smoothstep(.6,1.,dl/r)*m;
    spec += smoothstep(.26,.0,length(e/r-vec2(-.3,-.45)))*m;
    float ty=-d.y;
    float trailOn=step(0.,ty)*smoothstep(.5,.04,ty);
    float tw=r*.95*(.65+.35*noise2(vec2(g.y*36.,cx)));
    float tdx=g.x-pathX;
    clear += smoothstep(tw, 0., abs(tdx))*trailOn*.6;
    float by=g.y*34.+h.x*5.; float bid=floor(by); float bf=fract(by)-.5;
    vec3 hb=hash32(vec2(bid, cx*3.+float(L)*11.));
    float br=r*mix(.22,.45,hb.x)*step(.5,hb.y)*trailOn;
    vec2 bd=vec2(tdx-(hb.z-.5)*tw, bf/34.);
    float bdl=length(bd);
    float bm=smoothstep(br, br-px, bdl);
    if(bm>0.){ float bk=1.+RV/max(br,1e-4); off += -bd*bk*bm; clear += bm; mag += log2(bk)*bm; rim += smoothstep(.55,1.,bdl/max(br,1e-4))*bm*.5; }
  }
  clear=clamp(clear,0.,1.); rim=clamp(rim,0.,1.); spec=clamp(spec,0.,1.); mag=min(mag,4.5);
}
void main(){
  vec2 p = (vUv-.5)*vec2(uAsp,1.); p.y=-p.y;
  // ---- height-field march: from near (z=1) to far (z=0)
  float zHit=0.; vec2 uv=imgUV(p,0.);
  float zPrev=1.;
  vec2 u1=imgUV(p,1.); if(textureLod(uDep,u1,0.).r>=1.0){ zHit=1.; uv=u1; }
  else {
    for(int i=1;i<=64;i++){
      if(i>uSteps) break;
      float z=1.-float(i)/float(uSteps);
      vec2 u=imgUV(p,z); float d=textureLod(uDep,u,0.).r;
      if(d>=z){ float a=z,b=zPrev; for(int k=0;k<6;k++){ float m=(a+b)*.5; vec2 um=imgUV(p,m); if(textureLod(uDep,um,0.).r>=m) a=m; else b=m; } zHit=a; uv=imgUV(p,a); break; }
      zPrev=z; if(i==uSteps){ zHit=0.; uv=imgUV(p,0.); }
    }
  }
  vec4 fx = uHasFx==1 ? texture(uFx, uv) : vec4(0.);
  // ---- surface motion from fx masks
  if(uSway>0.){ float m=fx.r; uv += vec2(sin(uTime*1.3+uv.y*7.)*.0025+(noise2(uv*5.+uTime*.5)-.5)*.004, (noise2(uv*4.-uTime*.4)-.5)*.002)*m*uSway; }
  if(uWater>0.){
    float m=max(fx.g,uWaterAll);
    vec2 w = vec2(noise2(vec2(uv.x*60.,uv.y*18.)+vec2(0.,uTime*.9))-.5, noise2(vec2(uv.x*40.,uv.y*120.)-vec2(uTime*.3,uTime*1.2))-.5);
    vec2 dsp = w*vec2(.004,.0025);
    for(int i=0;i<8;i++){ if(i>=uRipN) break; vec4 r=uRip[i]; float age=uTime-r.z; if(age<0.||age>3.) continue;
      vec2 dv=(uv-r.xy)*vec2(uImgAsp,1.); float dist=length(dv); float rad=age*.16;
      float ring=sin((dist-rad)*140.)*exp(-abs(dist-rad)*55.)*exp(-age*1.4)*r.w;
      dsp += normalize(dv+1e-5)*ring*.006; }
    uv += dsp*m*uWater;
  }
  if(uSkyMove>0.){ uv += (vec2(noise2(uv*3.+vec2(uTime*.05,0.)), noise2(uv*3.+7.+vec2(0.,uTime*.04)))-.5)*.006*fx.b*uSkyMove; }
  // ---- rain on glass (screen space inside a rect)
  float glassFog=0., glassSpec=0., glassRim=0., glassLod=0., glassEdge=0.;
  if(uGlass>0.){
    vec2 sp=(vUv-.5)*vec2(uAsp,1.); vec2 g=vec2(sp.x,-sp.y);
    float px=fwidth(g.y);
    float inRect = step(uGlassRect.x,vUv.x)*step(vUv.x,uGlassRect.z)*step(uGlassRect.y,vUv.y)*step(vUv.y,uGlassRect.w)*uGlass;
    vec2 goff; float gcl, gsp, grim, gmag;
    glassModel(g, uTime, px, goff, gcl, gsp, grim, gmag);
    float txt = texture(uGlassMask, vec2(vUv.x,1.-vUv.y)).a;
    float wipe=0.;
    if(uGlassClear>0.){ float front=mix(-1.25,1.15,uGlassClear); float n=(noise2(vec2(g.y*2.6,1.7))-.5)*.3;
      float arc=g.y+.22*sin(g.x*2.2+1.3);   // palm-wipe smears follow a gentle arc
      wipe=smoothstep(front+.05,front-.16,g.x+n)*(1.-.22*smoothstep(.55,.85,noise2(vec2(g.x*1.5,arc*26.)))); }
    float thick=.78+.42*fbm2(g*2.3+3.7)+smoothstep(.1,.5,g.y)*.2;   // uneven condensation, heavier low down
    float cl=clamp(gcl+txt+wipe,0.,1.);
    uv += vec2(goff.x/uImgAsp, goff.y)/uZoom*inRect;
    glassFog=(1.-cl)*clamp(thick,0.,1.15)*inRect;
    glassSpec=gsp*inRect*(1.-wipe); glassRim=grim*inRect*(1.-wipe); glassLod=gmag*inRect;
    glassEdge=txt*(1.-txt)*4.*inRect;
  }
  // ---- depth of field (mip blur) + glass condensation blur
  float lod = clamp(abs(zHit-uDofF)*uDof*7.,0.,5.) + glassFog*2.6 + glassLod;
  vec3 col = textureLod(uImg, uv, lod).rgb;
  if(lod>.6){ vec2 px=vec2(1./uImgAsp,1.)*exp2(lod)*.0012; col=(col*2.+textureLod(uImg,uv+px*vec2(1,.3),lod).rgb+textureLod(uImg,uv+px*vec2(-.6,.9),lod).rgb+textureLod(uImg,uv+px*vec2(-.3,-1.),lod).rgb+textureLod(uImg,uv+px*vec2(.9,-.6),lod).rgb)/6.; }
  // ---- sketch → watercolor
  if(uSketchOn>0.){
    float ln = texture(uSketch, uv).a;
    float grain = noise2(uv*vec2(uImgAsp,1.)*900.)*.06 + noise2(uv*vec2(uImgAsp,1.)*180.)*.05;
    vec3 paper = toLin(vec3(.94,.92,.87))*(0.93+grain);
    float tone = 1.-pow(clamp(luma(col)*1.6,0.,1.),.5);
    vec2 hp = uv*vec2(uImgAsp,1.)*260.; float wob = noise2(uv*40.)*.6;
    float h1 = smoothstep(.32,.0,abs(fract(hp.x+hp.y+wob)-.5)) * smoothstep(.35,.55,tone);
    float h2 = smoothstep(.32,.0,abs(fract(hp.x-hp.y+wob)-.5)) * smoothstep(.62,.8,tone);
    float hatch = max(h1,h2)*uSketchOn*.55;
    vec3 graph = mix(paper, toLin(vec3(.12,.12,.15)), clamp(ln*.9+hatch*.5,0.,1.));
    float dist = length((uv-uRevO)*vec2(uImgAsp,1.)) + (fbm2(uv*7.)-.5)*.35;
    float m = smoothstep(uReveal, uReveal-.08, dist);
    float rim = exp(-abs(dist-uReveal)*40.)*step(.001,uReveal);
    vec3 paint = col*(0.88+grain*1.5); paint = mix(vec3(luma(paint)), paint, 1.12);
    paint *= 1.-rim*.35; paint = mix(paint, graph, ln*.35);
    col = mix(graph, paint, m);
  }
  // ---- chalk erosion
  if(uErode>0.){
    float l=luma(col); float sat=length(col-vec3(l));
    float chalk=smoothstep(.45,.75,l)*smoothstep(.12,.02,sat)*smoothstep(.2,.45,uv.y);
    float n=fbm2(uv*vec2(5.,14.)+vec2(uTime*.3,0.));
    float er=smoothstep(uv.x*.9+n*.5-.25, uv.x*.9+n*.5-.1, uErode*1.6-.2);
    vec3 ground=textureLod(uImg,uv+vec2(.0,.004),5.).rgb*.92;
    col=mix(col, ground, chalk*er);
  }
  // ---- emissive flicker
  col *= 1.+fx.a*uEmis*(.7+.3*noise2(vec2(uTime*7.,uv.x*30.)));
  // ---- fog (depth-aware, lit by lights)
  float fogBase = mix(uFogFar, uFogNear, zHit);
  vec3 wp = vec3((uv-.5)*vec2(uImgAsp,1.)*uFogScale, (1.-zHit)*2.5);
  float fn = fbm3(wp*2.+vec3(uFogVel*uTime, uTime*.06));
  float fog = clamp(uFogAmt*fogBase*(.45+fn*1.1),0.,1.);
  vec3 fc = uFogCol;
  vec3 halo=vec3(0.);
  for(int i=0;i<6;i++){ if(i>=uLN) break;
    float d=length(p-uLPos[i]); float r=uLRad[i];
    float occ = zHit>uLDep[i]+.035 ? .25 : 1.;
    fc += uLCol[i]*exp(-d*d/(r*r*6.))*.55;
    halo += uLCol[i]*(exp(-d/(r*.18))*.45 + exp(-d*d/(r*r))*.32)*occ;
  }
  col = mix(col, fc, fog);
  col += halo*(.55+fog*1.4);
  // ---- lighthouse beam
  if(uBeamInt>0.){
    vec2 v=p-uBeamPos; float L=length(v); float ang=atan(v.y,v.x);
    float da=abs(mod(ang-uBeamAng+PI,TAU)-PI);
    float cone=pow(smoothstep(uBeamW,0.,da),1.6)*smoothstep(0.,.05,L)*exp(-L*1.1);
    float tex=.55+.9*fbm3(vec3(p*3.,uTime*.15));
    float occ = zHit>uBeamDep+.03 ? .12 : 1.;
    col += uBeamCol*cone*tex*occ*uBeamInt*(.22+fog*.85);
    col += uBeamCol*exp(-L*90.)*uBeamInt*1.1;
  }
  // ---- condensation: milky scatter of the room light; drops: dark refracting rim + specular glint
  if(uGlass>0.){
    vec3 amb=textureLod(uImg, uv, 6.).rgb;
    col = mix(col, col*.7+amb*.45+vec3(.042,.048,.056), clamp(glassFog,0.,1.));
    col *= 1.-glassRim*.4;
    col += (vec3(1.,.95,.88)*.22+amb*1.4)*glassSpec;
    col += (amb*.9+vec3(.03,.034,.04))*glassEdge*.6;
  }
  // ---- grade
  col *= uExposure;
  float lm=luma(col); col=mix(vec3(lm),col,uSat);
  col = col*uTint+uLift;
  col = .18*pow(max(col,0.)/.18, vec3(uContrast));
  if(uDuo>0.){ float l=clamp(pow(luma(col),.45),0.,1.); vec3 d=mix(uDuoA,uDuoB,smoothstep(.08,.85,l)); col=mix(col,d,uDuo); }
  if(uHalftone>0.){
    vec2 hp=rot2(.785)*p*uHTScale; vec2 cell=fract(hp)-.5; float l=clamp(pow(luma(col),.5),0.,1.);
    float r=sqrt(1.-l)*.62; float dot_=smoothstep(r+.05,r-.05,length(cell));
    vec3 ink=uDuoA; vec3 pap=uDuoB; col=mix(col, mix(pap,ink,dot_), uHalftone);
  }
  if(uSweep.w>0.){ vec2 dir=vec2(cos(uSweep.y),sin(uSweep.y)); float b=exp(-pow((dot(p,dir)-uSweep.x)/uSweep.z,2.)); col+=uSweepCol*b*uSweep.w*smoothstep(.25,.85,zHit)*(.25+luma(col)*1.6); }
  if(uVig>0.){ vec2 q=vUv-.5; col*=mix(1.,smoothstep(.95,.25,length(q*vec2(1.,1.15))),uVig); }
  o = vec4(col*uAlpha, uAlpha);
}`;

  // ------------------------------------------------------------------ SPRITE (textured quad in screen p-space)
  S.spriteVS = S.head + `
layout(location=0) in vec2 aPos;
uniform vec2 uC; uniform vec2 uSize; uniform float uRot; uniform float uAsp; uniform vec4 uUVR;
out vec2 vT; out vec2 vL;
void main(){
  vec2 c=aPos-.5; vL=c; vT=mix(uUVR.xy,uUVR.zw,aPos);
  vec2 p=uC+mat2(cos(uRot),sin(uRot),-sin(uRot),cos(uRot))*(c*uSize);
  gl_Position=vec4(p.x/(uAsp*.5), -p.y/.5, 0., 1.);
}`;
  S.spriteFS = S.head + S.common + `
in vec2 vT; in vec2 vL; out vec4 o;
uniform sampler2D uTex; uniform float uAlpha, uTime, uSeed; uniform vec3 uTint; uniform vec3 uAdd;
uniform float uDuo; uniform vec3 uDuoA, uDuoB; uniform float uSil; uniform vec3 uSilCol; uniform float uRim; uniform vec3 uRimCol;
uniform float uDissolve; uniform float uSoft; uniform float uLod; uniform float uPaperEdge; uniform int uLinear; uniform int uPremul;
uniform int uShape; uniform float uCircle; uniform float uBurn; uniform vec2 uBurnPt; uniform vec2 uDGrad; uniform float uFogMask; uniform float uSprAsp;
void main(){
  float gd=length(vL)*2.;
  vec4 c = uShape==1 ? vec4(1.,1.,1., exp(-gd*gd*3.2)*smoothstep(1.,.6,gd)) : textureLod(uTex,vT,uLod);
  if(uPremul==1) c.rgb/=max(c.a,1e-4);
  if(uLinear==0) c.rgb=toLin(c.rgb);
  vec3 col=c.rgb*uTint+uAdd*c.a;
  if(uDuo>0.){ float l=clamp(pow(luma(col),.45),0.,1.); col=mix(col,mix(uDuoA,uDuoB,smoothstep(.06,.9,l)),uDuo); }
  if(uSil>0.) col=mix(col,uSilCol,uSil);
  if(uRim>0.){ float e=0.; vec2 px=vec2(.006); e+=textureLod(uTex,vT+vec2(px.x,0),uLod).a; e+=textureLod(uTex,vT-vec2(px.x,0),uLod).a; e+=textureLod(uTex,vT+vec2(0,px.y),uLod).a; e+=textureLod(uTex,vT-vec2(0,px.y),uLod).a; float rim=clamp(c.a*4.-e,0.,1.); col+=uRimCol*rim*uRim; }
  float a=c.a;
  if(uDissolve>0.){ float n=fbm2(vT*9.+uSeed)+dot(vL,uDGrad); a*=smoothstep(uDissolve-.08,uDissolve+.08,n*1.1); }
  if(uFogMask>0.){ float n=fbm2(vL*4.+vec2(uTime*.05,-uTime*.03)+uSeed); a*=mix(1.,smoothstep(.25,.75,n),uFogMask); }
  if(uCircle>0.){ a*=smoothstep(1.,1.-uCircle,length(vL)*2.); }
  if(uBurn>0.){ float n=fbm2(vL*5.+uSeed)*.22; float d=length((vL-uBurnPt)*vec2(uSprAsp,1.))+n; float r=uBurn*(uSprAsp*.5+.6); float hole=smoothstep(r,r-.025,d); float edge=exp(-abs(d-r)*45.)*step(.001,uBurn); float ch=smoothstep(r+.08,r,d)*(1.-hole);
    col=col*(1.-ch*.85)+vec3(3.,1.1,.25)*edge*2.; a*=1.-hole; }
  if(uSoft>0.){ vec2 q=abs(vL)*2.; float e=max(q.x,q.y); a*=smoothstep(1.,1.-uSoft,e); }
  if(uPaperEdge>0.){ vec2 q=abs(vL)*2.; float n=fbm2(vL*22.+uSeed)*.06; a*=smoothstep(1.,.985-n*uPaperEdge, max(q.x,q.y)+n*.5*uPaperEdge); }
  a*=uAlpha;
  o=vec4(col*a,a);
}`;

  // ------------------------------------------------------------------ PARTICLES (stateless, instanced)
  S.partVS = S.head + S.common + `
layout(location=0) in vec2 aPos;
uniform int uType; uniform float uTime, uT0, uSeed, uAsp, uSize, uSizeVar, uSpeed, uWind, uZMin, uZMax, uLife, uSpread, uStack;
uniform vec4 uBox; uniform vec2 uVel, uOrigin, uCamOff, uTarget; uniform float uCount;
out vec2 vL; out float vA; out float vZ; flat out int vCell; out float vSeed; out float vRot;
void main(){
  float id=float(gl_InstanceID);
  vec3 h=hash32(vec2(id*1.37+uSeed, id*.71+uSeed*3.1));
  vec3 h2=hash32(vec2(id*3.1+uSeed*7.7, id*1.9));
  float z=mix(uZMin,uZMax,h.z);
  vec2 bmin=uBox.xy, bmax=uBox.zw, bs=bmax-bmin;
  vec2 pos; float size=uSize*mix(1.-uSizeVar,1.+uSizeVar,h2.x)*(.35+z*1.3); float a=1.; vec2 stretch=vec2(1.); float rot=0.;
  float t=uTime*uSpeed;
  vCell=int(floor(h2.y*16.)); vSeed=h2.z; vZ=z;
  if(uType==0){ // dust motes
    pos=bmin+bs*h.xy + vec2(sin(t*.3+h.x*20.),cos(t*.23+h.y*17.))*.04*bs.y + uVel*t*(.4+z);
    pos=bmin+mod(pos-bmin,bs); a=.3+.7*pow(.5+.5*sin(t*1.7+h.z*30.),3.);
  } else if(uType==1){ // petals
    vec2 v=uVel*(.6+z*.9)*vec2(1.,.8+h2.x*.4);
    pos=bmin+bs*h.xy + v*t + vec2(sin(t*1.3+h.x*9.)*.05, sin(t*.9+h.y*7.)*.03)*(1.+uWind);
    pos=bmin+mod(pos-bmin,bs); rot=t*(1.5+h2.z*2.)+h.x*6.; stretch=vec2(abs(cos(t*(1.2+h2.x)+h.y*5.))*.85+.15,1.);
  } else if(uType==2){ // rain streaks
    vec2 v=uVel*(.7+z*.8);
    pos=bmin+bs*h.xy + v*t; pos=bmin+mod(pos-bmin,bs);
    stretch=vec2(.06,1.)*vec2(1.,1.+z*2.5); rot=atan(v.x,v.y); a=.25+.5*z;
  } else if(uType==3){ // snow
    vec2 v=uVel*(.35+z*.9);
    pos=bmin+bs*h.xy + v*t + vec2(sin(t*.8+h.x*12.)*.03*(1.+z), 0.);
    pos=bmin+mod(pos-bmin,bs); a=.55+.45*z;
  } else if(uType==4){ // rising lanterns / wish lights; uStack gathers them into a column
    float life=uLife; float st=uT0+h.x*uSpread; float age=uTime-st;
    if(age<0.) a=0.;
    float rise=age*(.05+.04*h.y);
    pos=vec2(bmin.x+bs.x*h.y, bmax.y) - vec2(sin(age*.7+h.z*9.)*.02, rise);
    vec2 tgt=uTarget+vec2(0., -id/uCount*0.55);
    pos=mix(pos,tgt,smoothstep(0.,1.,uStack)*smoothstep(0.,.6,age*.5));
    a*=smoothstep(0.,.6,age)*(.75+.25*sin(uTime*9.+id));
  } else if(uType==5){ // spark burst
    float age=uTime-uT0-h.x*.08; if(age<0.) a=0.;
    float ang=h.y*TAU; float sp=(.15+.6*h.z)*uSpread;
    pos=uOrigin+vec2(cos(ang),sin(ang))*sp*(1.-exp(-age*3.))+vec2(0.,age*age*.12);
    a*=exp(-age*(1.4+h2.x*2.))*step(0.,age); stretch=vec2(.25,1.); rot=ang+PI*.5;
  } else if(uType==6){ // bokeh
    pos=bmin+bs*h.xy+uVel*t*(.3+z); pos=bmin+mod(pos-bmin,bs); a=.35+.65*(.5+.5*sin(t*.5+h.z*40.));
  } else if(uType==7){ // gulls
    vec2 v=uVel*(.6+h.z*.6);
    pos=bmin+bs*h.xy+v*t+vec2(0.,sin(t*.6+h.x*9.)*.02); pos=bmin+mod(pos-bmin,bs); rot=v.x<0.?3.14159:0.;
  } else { // 8 embers rising
    pos=bmin+bs*h.xy - vec2(sin(t*.7+h.x*9.)*.03, t*(.05+.1*h.y)); pos=bmin+mod(pos-bmin,bs);
    a=pow(.5+.5*sin(t*3.+h.z*50.),2.);
  }
  pos+=uCamOff*(z-.5);
  vA=a; vRot=rot;
  vec2 c=aPos-.5; vL=c;
  vec2 q=c*size*stretch; q=mat2(cos(rot),sin(rot),-sin(rot),cos(rot))*q;
  vec2 P=pos+q;
  gl_Position=vec4(P.x/(uAsp*.5), -P.y/.5, 0., 1.);
}`;
  S.partFS = S.head + S.common + `
in vec2 vL; in float vA; in float vZ; flat in int vCell; in float vSeed; in float vRot; out vec4 o;
uniform int uType; uniform vec3 uCol; uniform float uAlpha, uDofF, uDof, uTime; uniform sampler2D uAtlas;
void main(){
  float d=length(vL)*2.; float a=0.; vec3 col=uCol;
  float blur=clamp(abs(vZ-uDofF)*uDof,0.,1.);
  if(uType==1){
    float cx=float(vCell%4), cy=float(vCell/4);
    vec2 uv=(vec2(cx,cy)+vL+.5)/4.;
    vec4 t=textureLod(uAtlas,uv,blur*3.);
    col=toLin(t.rgb)*uCol; a=t.a;
  } else if(uType==2){ a=smoothstep(1.,0.,abs(vL.x)*2.)*smoothstep(.5,.1,abs(vL.y))*.9; }
  else if(uType==3){ a=smoothstep(1.,mix(.2,.95,blur),d); if(blur>.6) a*= .55+.45*smoothstep(.7,1.,d); }
  else if(uType==4){ a=exp(-d*d*6.)*1.4+smoothstep(.25,0.,d)*1.6; col=uCol*(1.+smoothstep(.2,0.,d)); }
  else if(uType==5){ a=smoothstep(1.,0.,d)*smoothstep(.5,.0,abs(vL.x)); col=uCol*2.; }
  else if(uType==6){ float ring=smoothstep(1.,.9,d)*smoothstep(.8,.95,d); a=smoothstep(1.,.85,d)*.35+ring*.35; }
  else if(uType==7){ // gull: two curved wings
    vec2 q=vL*vec2(2.,2.); float flap=sin(uTime*9.+vSeed*20.)*.35;
    float w1=abs(q.y+abs(q.x)*(.55+flap)-abs(q.x)*abs(q.x)*.4); a=smoothstep(.09,.03,w1)*smoothstep(1.,.85,abs(q.x));
    col=uCol;
  } else if(uType==8){ a=exp(-d*d*8.)*1.5; }
  else { a=exp(-d*d*5.)+smoothstep(.35,0.,d)*.6; }
  a*=vA*uAlpha*(1.-blur*.35);
  o=vec4(col*a, uType==4||uType==5||uType==8||uType==0 ? 0. : a);
}`;

  // ------------------------------------------------------------------ RIBBONS (threads / staff / rings)
  S.ribVS = S.head + `
layout(location=0) in vec2 aPos; layout(location=1) in vec4 aCol; layout(location=2) in vec2 aSide;
uniform float uAsp; out vec4 vCol; out float vSide; out float vU;
void main(){ vCol=aCol; vSide=aSide.x; vU=aSide.y; gl_Position=vec4(aPos.x/(uAsp*.5), -aPos.y/.5, 0., 1.); }`;
  S.ribFS = S.head + `
in vec4 vCol; in float vSide; in float vU; out vec4 o; uniform float uCore, uGlow;
void main(){ float d=vSide; float core=exp(-d*d*uCore); float glow=exp(-d*d*uGlow)*.32; float a=(core*1.25+glow)*vCol.a; o=vec4(vCol.rgb*a, 0.); }`;

  // ------------------------------------------------------------------ GLYPHS (lyrics with ink / dissolve)
  S.glyphVS = S.head + `
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 iPos;  // center.xy, size.xy
layout(location=2) in vec4 iUV;   // atlas rect
layout(location=3) in vec4 iP;    // reveal, dissolve, rotation, seed
layout(location=4) in vec4 iCol;  // rgb (linear, may be HDR), alpha
uniform float uAsp; out vec2 vT; out vec2 vL; out vec4 vP; out vec4 vC;
void main(){
  vec2 c=aPos-.5; vL=c; vT=mix(iUV.xy,iUV.zw,aPos); vP=iP; vC=iCol;
  float r=iP.z; vec2 q=mat2(cos(r),sin(r),-sin(r),cos(r))*(c*iPos.zw)*1.25;
  vec2 P=iPos.xy+q; gl_Position=vec4(P.x/(uAsp*.5), -P.y/.5, 0., 1.);
}`;
  S.glyphFS = S.head + S.common + `
in vec2 vT; in vec2 vL; in vec4 vP; in vec4 vC; out vec4 o; uniform sampler2D uAtlas; uniform float uGlow, uInkBleed, uTime; uniform int uSoftOnly;
void main(){
  vec4 g=texture(uAtlas,vT); float sharp=g.r, soft=g.g;
  float rev=vP.x, dis=vP.y, seed=vP.w;
  float n=noise2(vL*7.+seed*13.)*.6+noise2(vL*19.+seed)*.4;
  float field=mix(soft,sharp,.55)+ (n-.5)*.35;
  float vis=smoothstep(1.02-rev*1.1, 1.12-rev*1.1, field+.1);
  float a=sharp*vis;
  a+= soft*uInkBleed*(1.-rev)*rev*1.6; // ink bleeding halo while appearing
  if(dis>0.){ float m=smoothstep(dis-.12,dis+.12, n*1.05); a*=m; }
  if(uSoftOnly==1){ float A2=soft*smoothstep(0.,1.,rev)*(1.-dis)*vC.a; o=vec4(vC.rgb*A2,A2); return; }
  vec3 col=vC.rgb;
  float glow=soft*uGlow*(1.-dis)*rev;
  float A=clamp(a,0.,1.)*vC.a;
  o=vec4(col*A + col*glow*vC.a*.6, A);
}`;

  // ------------------------------------------------------------------ PROCEDURAL SEA (height-field ocean)
  S.sea = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform float uAsp, uTime, uFov, uWave, uFogDen, uMoon, uExposure;
uniform vec3 uCamPos; uniform vec2 uCamAng; uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uFogCol, uWaterCol;
uniform vec4 uRing[4]; uniform vec3 uBeam; uniform float uRain;
float waveH(vec2 p, int oct){
  float h=0.; float amp=.62*uWave; float fr=.11; vec2 dir=normalize(vec2(1.,.35));
  for(int i=0;i<9;i++){ if(i>=oct) break;
    vec2 d=rot2(float(i)*1.73)*dir;
    float n=noise2(p*fr*.55+float(i)*3.1)*1.25;
    float ph=dot(p,d)*fr + uTime*sqrt(9.8*fr)*.75 + n;
    float w=1.-abs(sin(ph)); w=w*w*(3.-2.*w);
    h+=(w-.55)*amp; amp*=.47; fr*=1.83; }
  for(int i=0;i<4;i++){ vec4 r=uRing[i]; float age=uTime-r.z; if(age<0.||age>14.) continue;
    float dd=length(p-r.xy); float rad=age*3.2; h+=sin((dd-rad)*1.6)*exp(-abs(dd-rad)*.45)*exp(-age*.22)*r.w*.35; }
  return h;
}
vec3 sky(vec3 rd){
  float y=max(rd.y,0.);
  vec3 c=mix(uSkyHor,uSkyTop,pow(y,.55));
  float s=max(dot(rd,uSunDir),0.);
  c+= uMoon>0. ? uSunCol*(smoothstep(.99965,.99985,s)*2.4+pow(s,260.)*.35+pow(s,12.)*.06) : uSunCol*(smoothstep(.9993,.9997,s)*9.+pow(s,90.)*.35+pow(s,7.)*.1);
  if(uMoon>0.){ vec2 st=rd.xz/(rd.y+.15)*90.; float star=step(.995,hash12(floor(st)))*smoothstep(.3,.0,length(fract(st)-.5)); c+=vec3(star)*y*.8; }
  return c;
}
void main(){
  vec2 p=(vUv-.5)*vec2(uAsp,1.);
  float yaw=uCamAng.x, pit=uCamAng.y;
  vec3 fw=normalize(vec3(sin(yaw)*cos(pit), sin(pit), cos(yaw)*cos(pit)));
  vec3 rt=normalize(cross(vec3(0,1,0),fw)); vec3 up=cross(fw,rt);
  vec3 rd=normalize(fw+(p.x*rt+p.y*up)*uFov);
  vec3 ro=uCamPos;
  vec3 col;
  if(rd.y>-.002){ col=sky(rd); }
  else {
    float t0=0., t1=ro.y/(-rd.y); t1=min(t1,400.);
    float hx=0.; vec3 pp;
    // bracket + bisection against the moving height-field
    float tt=0.; float prevD=ro.y-waveH(ro.xz,4); float stepL=.4; float tA=0.;
    for(int i=0;i<90;i++){ tt+=stepL; pp=ro+rd*tt; float d=pp.y-waveH(pp.xz,4); if(d<0.){ float a=tA,b=tt; for(int k=0;k<7;k++){ float m=(a+b)*.5; vec3 q=ro+rd*m; if(q.y-waveH(q.xz,4)<0.) b=m; else a=m; } tt=(a+b)*.5; break; } tA=tt; stepL=max(.25, d*.6+tt*.012); if(tt>400.) break; }
    pp=ro+rd*tt;
    vec2 e=vec2(.04+tt*.004,0.);
    float h=waveH(pp.xz,8);
    vec3 n=normalize(vec3(h-waveH(pp.xz+e.xy,8), e.x, h-waveH(pp.xz+e.yx,8)));
    n=normalize(mix(n,vec3(0,1,0),smoothstep(30.,220.,tt)*.6));
    float fres=pow(1.-max(dot(n,-rd),0.),5.)*.75+.04;
    vec3 refl=sky(reflect(rd,n));
    vec3 deep=uWaterCol*(0.4+0.6*max(dot(n,uSunDir),0.));
    col=mix(deep, refl, fres);
    float spec=pow(max(dot(reflect(rd,n),uSunDir),0.),uMoon>0.?90.:220.);
    col+=uSunCol*spec*(uMoon>0.?2.5:6.);
    float foam=smoothstep(.62,.95,h/max(uWave,.01))*.35; col=mix(col,vec3(.8,.85,.9)*luma(uSkyHor)*1.3,foam);
    // lighthouse beam sweeping across water
    if(uBeam.z>0.){ float ang=atan(pp.z-uBeam.y, pp.x-uBeam.x); col+=uSunCol*.0; }
    float fd=1.-exp(-tt*uFogDen); col=mix(col,uFogCol,fd);
  }
  // atmospheric fog band near horizon
  float hz=exp(-abs(rd.y)*18.)*uFogDen*14.; col=mix(col,uFogCol,clamp(hz,0.,.85));
  if(uRain>0.){ float r=step(.985,hash12(floor(vec2(p.x*220.,p.y*18.+uTime*30.)))); col+=r*uRain*.15; }
  o=vec4(col*uExposure,1.);
}`;

  // ------------------------------------------------------------------ FOG FLY-THROUGH (procedural, layered)
  S.fogfly = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform float uAsp, uTime, uSpeed, uDensity, uSeed, uExposure, uTilt;
uniform vec3 uFogA, uFogB, uLampCol; uniform float uLamps, uWarp;
void main(){
  vec2 p=(vUv-.5)*vec2(uAsp,1.); p.y-=uTilt;
  vec3 acc=vec3(0.); float T=1.;
  vec3 bg=mix(uFogA,uFogB,smoothstep(-.6,.6,-p.y));
  const int N=14;
  for(int i=0;i<N;i++){
    float fi=float(i);
    float z=fract(fi/float(N)-uTime*uSpeed*.1);
    float depth=mix(9.,.35,z);
    vec2 q=p*depth*(1.+uWarp*.05*sin(uTime+fi));
    float d=fbm3(vec3(q*.55+vec2(fi*7.3+uSeed,fi*3.1), uTime*.08+fi))*1.25-.32;
    float dens=clamp(d,0.,1.)*uDensity*smoothstep(0.,.15,z)*smoothstep(1.,.75,z);
    vec3 c=mix(uFogB,uFogA,clamp(d,0.,1.));
    // lamps embedded in some layers
    if(uLamps>0.){ for(int j=0;j<2;j++){ vec2 lp=(hash22(vec2(fi*3.+float(j),uSeed))-.5)*vec2(3.2,1.3); vec2 dq=q-lp*depth*.35; dq.x*=mix(1.,.35,uWarp*z); float ld=length(dq); float lmp=(exp(-ld*ld*60.)*1.4+exp(-ld*7.)*.12)*smoothstep(1.,.7,z); c+=uLampCol*lmp*uLamps*smoothstep(0.,.25,z); dens=max(dens,clamp(lmp*.35,0.,.6)*uLamps*smoothstep(1.,.6,z)*smoothstep(0.,.2,z)); } }
    acc+=T*c*dens; T*=1.-dens;
  }
  vec3 col=acc+T*bg;
  o=vec4(col*uExposure,1.);
}`;

  // ------------------------------------------------------------------ TRANSITIONS
  S.trans = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform sampler2D uA, uB; uniform float uP, uAsp, uSeed, uTime; uniform int uType; uniform vec2 uDir, uPt; uniform vec3 uCol;
void main(){
  vec2 uv=vUv; vec2 p=(uv-.5)*vec2(uAsp,1.);
  vec4 A=texture(uA,uv), B=texture(uB,uv); float t=uP; vec3 c;
  if(uType==1){ c=mix(A.rgb,B.rgb,smoothstep(0.,1.,t)); }
  else if(uType==2){ // fog wipe
    float n=fbm2(p*2.4+uSeed)*.75+fbm2(p*7.+uSeed*2.)*.25; float edge=mix(-.2,1.2,t);
    float m=smoothstep(edge-.18,edge+.18,n+ (uv.x-.5)*.15*uDir.x); m=1.-m;
    float band=exp(-pow((n-edge)/.12,2.));
    c=mix(A.rgb,B.rgb,m)+uCol*band*.9;
  } else if(uType==3){ // flash through white
    float w=sin(t*PI); c=mix(A.rgb,B.rgb,smoothstep(.42,.58,t))+uCol*pow(w,1.5)*3.;
  } else if(uType==4){ // ink bleed
    float n=fbm2(p*3.+uSeed)*.6+noise2(p*28.)*.15+length(p-uPt)*-.55;
    float th=mix(.55,-.6,t); float m=smoothstep(th,th-.05,n);
    float rim=exp(-pow((n-th)/.03,2.));
    c=mix(A.rgb,B.rgb,m)*(1.-rim*.65);
  } else if(uType==5){ // film burn
    float n=fbm2(p*3.+uSeed)*.35; float d=length(p-uPt)+n; float r=t*1.35;
    float hole=smoothstep(r,r-.03,d); float edge=exp(-abs(d-r)*30.)*step(.001,t);
    float char_=smoothstep(r+.09,r,d)*(1.-hole);
    c=mix(A.rgb*(1.-char_*.8),B.rgb,hole)+vec3(3.,1.1,.25)*edge*1.6;
  } else if(uType==6){ // directional soft wipe
    float s=dot(p,normalize(uDir))+ (fbm2(p*4.+uSeed)-.5)*.12; float e=mix(-1.,1.,t)*(uAsp*.6+.2);
    float m=smoothstep(e+.06,e-.06,s); c=mix(A.rgb,B.rgb,m)+uCol*exp(-pow((s-e)/.04,2.))*.6;
  } else if(uType==7){ // iris from point
    float d=length(p-uPt); float r=t*1.25; float m=smoothstep(r,r-.04,d); c=mix(A.rgb,B.rgb,m)+uCol*exp(-pow((d-r)/.02,2.))*.8;
  } else if(uType==8){ // zoom-blur whoosh
    vec3 a=vec3(0.),b=vec3(0.); float k=sin(t*PI)*.18;
    for(int i=0;i<12;i++){ float f=float(i)/11.; vec2 q=(uv-.5)*(1.-k*f)+.5; a+=texture(uA,q).rgb; b+=texture(uB,(uv-.5)*(1.+k*(1.-f))+.5).rgb; }
    c=mix(a/12.,b/12.,smoothstep(.35,.65,t))+uCol*pow(sin(t*PI),4.)*.6;
  } else if(uType==9){ // push / slide with motion blur
    vec2 d=normalize(uDir); float e=(t<.5? 4.*t*t*t : 1.-pow(-2.*t+2.,3.)/2.); vec3 acc=vec3(0.);
    for(int i=0;i<10;i++){ float f=(float(i)/9.-.5)*.05*sin(t*PI); vec2 qa=uv+d*(e+f); vec2 qb=qa-d;
      bool inA=all(greaterThanEqual(qa,vec2(0.)))&&all(lessThanEqual(qa,vec2(1.)));
      acc+= inA ? texture(uA,qa).rgb : texture(uB,qb).rgb; }
    c=acc/10.;
  } else if(uType==10){ // glitch split
    float g=step(.5,hash12(vec2(floor(uv.y*28.),floor(uTime*24.))))*sin(t*PI);
    vec2 off=vec2((hash12(vec2(floor(uv.y*28.),3.))-.5)*.12*g,0.);
    vec3 a=vec3(texture(uA,uv+off+vec2(.01*g,0)).r,texture(uA,uv+off).g,texture(uA,uv+off-vec2(.01*g,0)).b);
    vec3 b=vec3(texture(uB,uv-off+vec2(.01*g,0)).r,texture(uB,uv-off).g,texture(uB,uv-off-vec2(.01*g,0)).b);
    c=mix(a,b,step(.5,t+ (hash12(vec2(floor(uv.y*40.),floor(uTime*30.)))-.5)*.4*g));
  } else if(uType==11){ // water ripple crossfade
    float d=length(p-uPt); float w=sin(d*60.-t*30.)*exp(-d*3.)*sin(t*PI)*.012;
    c=mix(texture(uA,uv+w*normalize(p-uPt+1e-4)).rgb, texture(uB,uv+w*normalize(p-uPt+1e-4)).rgb, smoothstep(.2,.8,t));
  } else if(uType==12){ // light leak
    vec3 leak=uCol*(smoothstep(.9,0.,length((uv-vec2(uDir.x,uDir.y))*vec2(uAsp,1.)*.7)))*sin(t*PI)*2.2;
    c=mix(A.rgb,B.rgb,smoothstep(.3,.7,t))+leak;
  } else { c=t<.5?A.rgb:B.rgb; }
  o=vec4(c,1.);
}`;

  // ------------------------------------------------------------------ POST
  S.prefilter = S.head + S.common + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh, uKnee;
void main(){
  vec3 c=texture(uSrc,vUv).rgb*.25+texture(uSrc,vUv+uTexel*vec2(1,1)).rgb*.1875+texture(uSrc,vUv+uTexel*vec2(-1,1)).rgb*.1875+texture(uSrc,vUv+uTexel*vec2(1,-1)).rgb*.1875+texture(uSrc,vUv+uTexel*vec2(-1,-1)).rgb*.1875;
  float br=max(c.r,max(c.g,c.b)); float rq=clamp(br-uThresh+uKnee,0.,2.*uKnee); rq=rq*rq/(4.*uKnee+1e-4);
  float w=max(rq,br-uThresh)/max(br,1e-4); o=vec4(c*w,1.);
}`;
  S.down = S.head + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 t=uTexel; vec3 a=texture(uSrc,vUv+t*vec2(-2,-2)).rgb, b=texture(uSrc,vUv+t*vec2(0,-2)).rgb, c=texture(uSrc,vUv+t*vec2(2,-2)).rgb;
  vec3 d=texture(uSrc,vUv+t*vec2(-2,0)).rgb, e=texture(uSrc,vUv).rgb, f=texture(uSrc,vUv+t*vec2(2,0)).rgb;
  vec3 g=texture(uSrc,vUv+t*vec2(-2,2)).rgb, h=texture(uSrc,vUv+t*vec2(0,2)).rgb, i=texture(uSrc,vUv+t*vec2(2,2)).rgb;
  vec3 j=texture(uSrc,vUv+t*vec2(-1,-1)).rgb, k=texture(uSrc,vUv+t*vec2(1,-1)).rgb, l=texture(uSrc,vUv+t*vec2(-1,1)).rgb, m=texture(uSrc,vUv+t*vec2(1,1)).rgb;
  vec3 r=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125; o=vec4(r,1.);
}`;
  S.up = S.head + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uR;
void main(){
  vec2 t=uTexel*uR; vec3 s=texture(uSrc,vUv+t*vec2(-1,-1)).rgb+texture(uSrc,vUv+t*vec2(0,-1)).rgb*2.+texture(uSrc,vUv+t*vec2(1,-1)).rgb
   +texture(uSrc,vUv+t*vec2(-1,0)).rgb*2.+texture(uSrc,vUv).rgb*4.+texture(uSrc,vUv+t*vec2(1,0)).rgb*2.
   +texture(uSrc,vUv+t*vec2(-1,1)).rgb+texture(uSrc,vUv+t*vec2(0,1)).rgb*2.+texture(uSrc,vUv+t*vec2(1,1)).rgb; o=vec4(s/16.,1.);
}`;
  // generalized Kuwahara, 8 sectors with polynomial weights (Papari, Petkov, Campisi 2007; Kyprianidis 2011)
  S.kuwa = S.head + S.common + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uRad;
void main(){
  const int N=8; vec3 m[8]; vec3 s[8]; float w[8];
  for(int k=0;k<N;k++){ m[k]=vec3(0.); s[k]=vec3(0.); w[k]=0.; }
  float zeta=2./uRad; float eta=.38;
  for(int j=-4;j<=4;j++) for(int i=-4;i<=4;i++){
    vec2 v=vec2(i,j)/4.; float r2=dot(v,v); if(r2>1.) continue;
    vec3 c=texture(uSrc,vUv+vec2(i,j)*uTexel*uRad/4.).rgb; vec3 cc=c*c;
    float g=exp(-r2*2.);
    for(int k=0;k<N;k++){
      vec2 vr=rot2(-float(k)*TAU/float(N))*v;
      float z=max(0., vr.y+zeta) - eta*vr.x*vr.x; float wk=z*z*g;
      m[k]+=c*wk; s[k]+=cc*wk; w[k]+=wk;
    }
  }
  vec3 acc=vec3(0.); float aw=0.;
  for(int k=0;k<N;k++){ if(w[k]<=0.) continue; vec3 mu=m[k]/w[k]; vec3 sg=abs(s[k]/w[k]-mu*mu); float sv=sg.r+sg.g+sg.b; float wk=1./(1.+pow(1000.*sv,4.)); acc+=mu*wk; aw+=wk; }
  o=vec4(acc/max(aw,1e-5),1.);
}`;
  S.overlay = S.head + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform float uAlpha; uniform float uGain;
void main(){ vec4 c=texture(uSrc,vec2(vUv.x,1.-vUv.y)); vec3 lin=pow(c.rgb/max(c.a,1e-4),vec3(2.2))*c.a; o=vec4(lin*uGain*uAlpha, c.a*uAlpha); }`;
  S.final = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uKuwa; uniform float uAsp, uTime, uBloomAmt, uPaint, uPaper, uGrain, uVig, uCA, uFade, uLetter, uExposure, uSat, uHalation, uFlash, uShakeA;
uniform vec3 uLift, uGamma, uGain, uFadeCol, uFlashCol; uniform vec2 uShake; uniform int uRpN; uniform vec4 uRp[6];
void main(){
  vec2 uv=vUv+uShake;
  // optical shockwaves: refraction of the finished image (no drawn lines)
  vec2 rdisp=vec2(0.); float redge=0.;
  vec2 sp=(uv-.5)*vec2(uAsp,1.); sp.y=-sp.y;
  for(int i=0;i<6;i++){ if(i>=uRpN) break; vec4 r=uRp[i]; if(r.z<0.) continue;
    vec2 dv=sp-r.xy; float d=length(dv); float rad=r.z*.62; float w=.045+r.z*.02;
    float g=exp(-pow((d-rad)/w,2.))*exp(-r.z*1.15)*r.w;
    rdisp+=normalize(dv+1e-5)*g*.016; redge+=g; }
  rdisp.y=-rdisp.y; uv+=rdisp/vec2(uAsp,1.);
  vec2 cdir=(uv-.5); float ca=uCA*dot(cdir,cdir)*.06;
  vec2 rc=rdisp/vec2(uAsp,1.)*.35;
  vec3 col=vec3(texture(uScene,uv+cdir*ca+rc).r, texture(uScene,uv).g, texture(uScene,uv-cdir*ca-rc).b);
  col*=1.+redge*.06;
  if(uPaint>0.){
    vec3 k=texture(uKuwa,uv).rgb;
    // edge darkening on the painted image (watercolour pigment pooling)
    vec2 tx=vec2(1.5/1920.,1.5/1080.);
    float lx=luma(texture(uKuwa,uv+vec2(tx.x,0)).rgb)-luma(texture(uKuwa,uv-vec2(tx.x,0)).rgb);
    float ly=luma(texture(uKuwa,uv+vec2(0,tx.y)).rgb)-luma(texture(uKuwa,uv-vec2(0,tx.y)).rgb);
    float edge=clamp(length(vec2(lx,ly))*3.,0.,1.);
    k*=1.-edge*.28;
    col=mix(col,k,uPaint);
  }
  vec3 bl=texture(uBloom,uv).rgb;
  col+=bl*uBloomAmt;
  col+=bl*vec3(1.,.35,.12)*uHalation;
  col*=uExposure;
  float lm=luma(col); col=mix(vec3(lm),col,uSat);
  col=softClip(col);
  col=toSrgb(col);
  // lift / gamma / gain
  col=pow(max(col*uGain+uLift*(1.-col),0.), 1./uGamma);
  if(uPaper>0.){ float n=noise2(uv*vec2(uAsp,1.)*420.)*.5+noise2(uv*vec2(uAsp,1.)*90.)*.5; col*=1.-uPaper*(n-.5)*.18; col=mix(col,col*vec3(1.,.98,.93),uPaper*.5); }
  vec2 q=uv-.5; col*=mix(1.,smoothstep(.95,.2,length(q*vec2(1.,1.25))),uVig);
  float g=hash12(vUv*vec2(1920.,1080.)+fract(uTime*37.)*vec2(91.,57.))-.5; col+=g*uGrain*(.6+.4*(1.-luma(col)));
  col=mix(col,uFlashCol,uFlash);
  col=mix(col,uFadeCol,uFade);
  col*=step(uLetter,vUv.y)*step(vUv.y,1.-uLetter);
  col+=(hash12(gl_FragCoord.xy)-.5)/255.;
  o=vec4(col,1.);
}`;


  // ------------------------------------------------------------------ STRINGS: shaded metal strings, long-exposure vibration, DOF, snapping
  S.strings = S.head + S.common + `
in vec2 vUv; out vec4 o;
uniform float uAsp, uTime, uExposure, uFocus, uDof;
uniform int uN; uniform vec4 uS[6]; uniform vec4 uV[6]; uniform vec4 uCut[6]; uniform vec3 uKey; uniform vec3 uTint;
void main(){
  vec2 p=(vUv-.5)*vec2(uAsp,1.); p.y=-p.y;
  vec3 col=vec3(0.); float A=0.;
  vec3 L=normalize(uKey);
  for(int i=0;i<6;i++){ if(i>=uN) break;
    vec4 s=uS[i]; vec4 v=uV[i]; vec4 cu=uCut[i];
    if(v.w<=0.001) continue;
    float u=p.x/uAsp+.5;
    float yc=mix(s.x,s.y,u);
    float r=s.z*(1.+.25*(1.-u));
    float blur=abs(p.x-uFocus)*uDof;
    float present=1.; float extra=0.;
    if(cu.y>0.){ float gap=cu.y*cu.y*1.6; float dist=abs(u-cu.x)-gap; if(dist<0.) present=0.; else { float side=sign(u-cu.x); extra=exp(-dist*9.)*cu.y*.09*sin(dist*24.-uTime*30.)*side*(1.-cu.y*.6); } }
    float cov=0.; vec3 c3=vec3(0.);
    float per=TAU/max(v.y,1.);
    for(int k=0;k<6;k++){
      float tt=uTime+per*float(k)/6.;
      float disp=v.x*sin(PI*u)*sin(tt*v.y+v.z)+v.x*.3*sin(2.*PI*u)*sin(tt*v.y*2.01+v.z*1.7);
      float d=p.y-(yc+disp+extra);
      float rr=r+blur*.006;
      float x=d/rr;
      float inside=smoothstep(1.,1.-max(.12,min(.9,blur*.8+.12)),abs(x));
      if(inside>0.){
        float nz=sqrt(max(0.,1.-x*x)); vec3 n=normalize(vec3(0.,x,nz));
        float diff=max(dot(n,L),0.);
        float spec=pow(max(dot(reflect(-L,n),vec3(0,0,1)),0.),36.);
        float rim=pow(1.-nz,3.)*.5;
        float wound = s.w>.5 ? (.68+.32*sin((p.x/rr)*1.9+x*2.6)) : (.92+.08*noise2(vec2(p.x*400.,float(i))));
        vec3 base = s.w>.5 ? vec3(.58,.47,.34) : vec3(.70,.72,.76);
        c3 += ((base*(.07+.75*diff)+vec3(1.,.96,.9)*spec*1.8)*wound + uTint*rim)*inside;
        cov += inside;
      }
    }
    float a=cov/6.*present*v.w*(1.-clamp(blur*.35,0.,.6));
    vec3 cc=c3/6.*present*v.w*(1.-clamp(blur*.35,0.,.6))*uTint;
    col=col*(1.-a)+cc; A=A+a*(1.-A);
  }
  o=vec4(col*uExposure,A);
}`;
  // ------------------------------------------------------------------ mask composite (circle / rect) of a full-screen RT
  S.maskcomp = S.head + S.common + `
in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform int uShape; uniform vec2 uC; uniform float uR, uSoft, uAsp, uAlpha; uniform vec4 uRect;
void main(){
  vec2 p=(vUv-.5)*vec2(uAsp,1.); p.y=-p.y;
  float m;
  if(uShape==0){ float d=length(p-uC); m=smoothstep(uR, uR*(1.-uSoft)-0.0015, d); }
  else { vec2 q=step(uRect.xy,p)*step(p,uRect.zw); m=q.x*q.y; }
  vec4 c=texture(uSrc,vUv); m*=uAlpha; o=vec4(c.rgb*m,m);
}`;
  // ------------------------------------------------------------------ drifting fog sheet (premultiplied)
  S.foglayer = S.head + S.common + `
in vec2 vUv; out vec4 o; uniform float uAsp, uTime, uAmt, uSpeed, uSeed; uniform vec3 uCol;
void main(){ vec2 p=(vUv-.5)*vec2(uAsp,1.);
  float n=fbm3(vec3(p*1.6+vec2(uTime*uSpeed*3.,0.)+uSeed, uTime*.05)); float n2=fbm3(vec3(p*4.+vec2(uTime*uSpeed*6.,0.)-uSeed, uTime*.08));
  float a=clamp((n*.8+n2*.35-.35)*1.6,0.,1.)*uAmt; o=vec4(uCol*a,a); }`;
  // ------------------------------------------------------------------ light beam overlay (additive, screen space)
  S.beamov = S.head + S.common + `
in vec2 vUv; out vec4 o; uniform float uAsp, uTime, uAng, uW, uI; uniform vec2 uPos; uniform vec3 uCol;
void main(){ vec2 p=(vUv-.5)*vec2(uAsp,1.); p.y=-p.y; vec2 v=p-uPos; float L=length(v); float ang=atan(v.y,v.x);
  float da=abs(mod(ang-uAng+PI,TAU)-PI); float x=da/uW;
  float cone=(exp(-x*x*2.6)*.75+exp(-x*x*14.)*.35)*smoothstep(0.,.06,L)*exp(-L*.85);
  float tex=.45+1.*fbm3(vec3(p*2.4,uTime*.12)); vec3 c=uCol*(cone*tex+exp(-L*L*1400.)*1.6+exp(-L*12.)*.18)*uI; o=vec4(c,0.); }`;
})(window.MV);
