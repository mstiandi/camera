import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── DOM ─────────────────────────────────────────────────────────
const S=document.getElementById('s'),H=document.getElementById('h'),Ld=document.getElementById('l'),Lt=document.getElementById('lt'),cam=document.getElementById('pip'),D=document.getElementById('d'),flash=document.getElementById('flash');
const M=Math,P=M.PI,C=M.cos,Sf=M.sin,Sq=M.sqrt,Ab=M.abs,Rn=M.random;
const lerp=(a,b,t)=>a+(b-a)*t;
const hsl=(h,s,l)=>{const c=new T.Color();c.setHSL(h,s,l);return c};
const dist=(x1,y1,x2,y2)=>Sq((x1-x2)**2+(y1-y2)**2);

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const N=2500,RING_POOL=4;
const States={IDLE:0,GATHERING:1,PULSING:2,EXPLODING:3,SCATTERED:4,FORMING_ROSE:5,ROSE:6,BUTTERFLY:7};
const HINTS=[
  '伸出食指召唤星辰',
  '星辰坠入漩涡…',
  '',
  '',
  '用手指在空中画一个圆',
  '玫瑰正在绽放…',
  '🖐 张握缩放 · ☜☞ 旋转 · 🙌 双手→蝴蝶',
  '🖐 张握缩放 · ☜☞ 旋转 · 🙌 双手→玫瑰'
];
let state=States.IDLE,prevState=-1,stateTime=0,pulseStart=0,twoHandCd=0;
let explosionTime=0,explosionMaxVel=0;
let expPhase=0,expPhaseTime=0; // 0=slow creep, 1=fast burst, 2=decay
let armParticles=null,pillarUp=null,pillarDown=null; // particle role arrays

// ═══════════════════════════════════════════════════════════════════
// THREE.JS SETUP
// ═══════════════════════════════════════════════════════════════════
const ren=new T.WebGLRenderer({antialias:false});
ren.setPixelRatio(M.min(devicePixelRatio,2));
ren.setSize(innerWidth,innerHeight);
ren.domElement.style.background='radial-gradient(ellipse at center,#0a0a2e 0%,#030310 40%,#010108 100%)';
document.body.prepend(ren.domElement);

const scene=new T.Scene();scene.background=new T.Color(0x010108);
const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.5,50);
camera.position.set(0,.3,8);camera.lookAt(0,0,0);

const comp=new EffectComposer(ren);
comp.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),1.2,.35,.5);
comp.addPass(bloom);

// ── Sprite ──────────────────────────────────────────────────────
function mkSprite(sz){
  const c=document.createElement('canvas');c.width=sz;c.height=sz;
  const x=c.getContext('2d'),g=x.createRadialGradient(sz/2,sz/2,0,sz/2,sz/2,sz/2);
  g.addColorStop(0,'#fff');g.addColorStop(.04,'rgba(255,255,255,.97)');
  g.addColorStop(.15,'rgba(255,255,255,.4)');g.addColorStop(.45,'rgba(255,255,255,.03)');
  g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(0,0,sz,sz);
  return new T.CanvasTexture(c);
}
const sprite=mkSprite(128);

// Sharp shard sprite — angular fragments distinct from soft star glow
function mkShardSprite(sz){
  const c=document.createElement('canvas');c.width=sz;c.height=sz;
  const x=c.getContext('2d');
  const cx=sz/2,cy=sz/2,h=sz/2;
  // Diamond/rhombus shape — sharp, crystalline
  x.beginPath();
  x.moveTo(cx,cy-h);   // top
  x.lineTo(cx+h*.7,cy-h*.15);
  x.lineTo(cx+h*.4,cy+h*.65);
  x.lineTo(cx-h*.4,cy+h*.5);
  x.lineTo(cx-h*.7,cy-h*.15);
  x.closePath();
  // Fill: bright core, crisp falloff
  const g=x.createRadialGradient(cx,cy,0,cx,cy,h*.7);
  g.addColorStop(0,'rgba(255,255,255,.95)');
  g.addColorStop(.06,'rgba(230,245,255,.85)');
  g.addColorStop(.25,'rgba(140,200,240,.3)');
  g.addColorStop(.5,'rgba(60,120,180,.06)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fill();
  // Crisp edge line
  x.strokeStyle='rgba(200,230,255,.35)';x.lineWidth=1.2;x.stroke();
  return new T.CanvasTexture(c);
}
const shardSprite=mkShardSprite(128);
// Oval botanical sprite for stem and leaf particles
function mkLeafSprite(sz){
  const c=document.createElement('canvas');c.width=sz;c.height=sz;
  const x=c.getContext('2d'),cx=sz/2,cy=sz/2;
  const g=x.createRadialGradient(cx,cy*.6,0,cx,cy,sz/2);
  g.addColorStop(0,'rgba(200,255,200,.85)');
  g.addColorStop(.1,'rgba(120,210,130,.55)');
  g.addColorStop(.3,'rgba(40,140,50,.18)');
  g.addColorStop(.6,'rgba(10,70,20,.03)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,sz,sz);
  return new T.CanvasTexture(c);
}
const leafSprite=mkLeafSprite(128);

// ═══════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════
const pos=new Float32Array(N*3),vel=new Float32Array(N*3),col=new Float32Array(N*3);
const tgt=new Float32Array(N*3),tgtCol=new Float32Array(N*3);
const idlePos=new Float32Array(N*3),idleCol=new Float32Array(N*3);
const rosePos=new Float32Array(N*3),roseCol=new Float32Array(N*3);
const bflyPos=new Float32Array(N*3),bflyCol=new Float32Array(N*3);

// ── Compute idle: scattered across view volume ──────────────────
{
  const aspect=innerWidth/innerHeight,halfH=8*M.tan(25*P/180);
  for(let i=0;i<N;i++){
    const j=i*3;
    idlePos[j]=(Rn()-.5)*halfH*2*aspect;
    idlePos[j+1]=(Rn()-.5)*halfH*2;
    idlePos[j+2]=(Rn()-.5)*4;
    const hue=Rn()<.7?.55+Rn()*.15:.12+Rn()*.06;
    const c=hsl(hue,.4+Rn()*.3,.45+Rn()*.35);
    idleCol[j]=c.r;idleCol[j+1]=c.g;idleCol[j+2]=c.b;
  }
}

// ── Compute rose shape — closed, wrapped philospiral bloom ─────
// Envelope: asymmetric bell (ovoid), max at y≈0.35, closing toward top
// Petals: 5 spiral arms wrapping from core outward, inward at tips
// Radial: 70% surface + 30% deep wrap, petals envelope the core
{
  const Y_MIN=-.2,Y_MAX=1.65;          // height range
  const PEAK_Y=.35;                     // widest point
  const R_PEAK=1.05,R_STEM=.06;        // max & min radii
  const SIG_UP=.23,SIG_DOWN=.48;       // bell asymmetry (sharper rise, gradual fall)
  const PETALS=5,TWIST=5.5;            // 5 petals, spiral twist per unit height

  for(let i=0;i<N;i++){
    const j=i*3;
    // ── 1. Height: importance-sample toward widest region ──────
    const rawH=Rn();
    const peakInfluence=.3+.7*M.exp(-(((rawH-.35)/.25)**2)); // weight middle
    const h=Rn()<peakInfluence?.08+Rn()*.65:Rn();
    const y=Y_MIN+h*(Y_MAX-Y_MIN);
    const t=(y-Y_MIN)/(Y_MAX-Y_MIN); // normalized [0,1]
    const tp=(PEAK_Y-Y_MIN)/(Y_MAX-Y_MIN);
    // ── 2. Envelope radius ────────────────────────────────────
    const dNorm=t<=tp?(tp-t)/SIG_UP:(t-tp)/SIG_DOWN;
    const envR=R_STEM+(R_PEAK-R_STEM)*M.exp(-dNorm*dNorm);
    // ── 3. Angle: bias toward petal lobe peaks ────────────────
    const petIdx=M.floor(Rn()*PETALS);
    const lobeCtr=(petIdx/PETALS)*P*2+(Rn()<.5?-.06:.06);
    const spread=M.pow(Rn(),2.2)*(P*2/PETALS)*.5;
    let th=(Rn()<.5?lobeCtr+spread:lobeCtr-spread)%(P*2);
    if(th<0)th+=P*2;
    // ── 4. Petal modulation (surface waviness) ────────────────
    const petalWave=.45+.55*C(PETALS*th+TWIST*h); // 0~1, peaks at petal centers
    // ── 5. Radial: inward wrap ────────────────────────────────
    // 65% near surface (petal exterior), 35% wrap inward (petal layers)
    const wrapSample=Rn();
    let wrap;
    if(wrapSample<.25){wrap=.65+Rn()*.35;}        // surface layer
    else if(wrapSample<.55){wrap=.35+Rn()*.3;}     // mid-depth
    else if(wrapSample<.9){wrap=.08+Rn()*.27;}     // deep wrap
    else{wrap=.01+Rn()*.07;}                        // core
    // ── 6. Final radius ──────────────────────────────────────
    const surfaceR=envR*petalWave;
    // Tip: petal edges curl inward more at top
    const tipInward=M.max(0,(t-.5)/.5); // 0→1 as we go up
    const tipShrink=1-tipInward*.55;     // shrink toward core at top
    const r=surfaceR*wrap*tipShrink;
    // ── 7. Shape refinement ───────────────────────────────────
    // Receptacle: slight flare at bottom (base of the flower)
    const receptFlare=t<.12?1+(.12-t)/.12*.15:1;
    const r2=r*receptFlare;
    // Organic noise
    const jit=r<.15?.005+r*.04:.015+r*.03;
    const rj=r2+(Rn()-.5)*jit;
    // ── 8. Write position ─────────────────────────────────────
    rosePos[j]=C(th)*rj;
    rosePos[j+1]=y+(Rn()-.5)*jit*.4;
    rosePos[j+2]=Sf(th)*rj;
    // ── 9. Color ──────────────────────────────────────────────
    const coreDepth=wrap<.15?0:wrap<.5?1:2; // 0=core,1=mid,2=surface
    let hue,sat,lit;
    if(coreDepth===0){hue=.99;sat=.8;lit=.04+Rn()*.06;}
    else if(coreDepth===1){hue=.985;sat=.65+Rn()*.2;lit=.08+Rn()*.14;}
    else{const ef=M.min(1,rj/R_PEAK);hue=lerp(.978,.955,ef);sat=.55+.25*Rn();lit=.12+Rn()*.2;}
    const c=hsl(hue,sat,lit);
    roseCol[j]=c.r;roseCol[j+1]=c.g;roseCol[j+2]=c.b;
  }
}

// ── Compute butterfly shape ─────────────────────────────────────
{
  const halfN=N/2;
  for(let i=0;i<N;i++){
    const j=i*3,side=i<halfN?-1:1;
    const upper=Rn()<.58;
    let x,y,z;
    if(upper){
      const a=(Rn()-.05)*P*.7;
      const r=Rn()*1.6;
      x=side*(.25+C(a)*r);
      y=.25+Sf(a)*r*.65;
      z=(Rn()-.5)*.12;
    }else{
      const a=Rn()*P*.4+P*.35;
      const r=Rn()*.85;
      x=side*(.15+C(a)*r);
      y=-.2-Sf(a)*r*.55;
      z=(Rn()-.5)*.12;
    }
    bflyPos[j]=x;bflyPos[j+1]=y;bflyPos[j+2]=z;
    // Monarch-ish: warm orange with dark edges
    const hue=Rn()<.85?.11+Rn()*.05:(Rn()<.5?.08:.65+Rn()*.1);
    const sat=Rn()<.85?.8+Rn()*.2:.4+Rn()*.3;
    const lit=Rn()<.6?.35+Rn()*.3:.15+Rn()*.2;
    const c=hsl(hue,sat,lit);
    bflyCol[j]=c.r;bflyCol[j+1]=c.g;bflyCol[j+2]=c.b;
  }
}

// ── Init particles to idle ──────────────────────────────────────
for(let i=0;i<N;i++){
  const j=i*3;
  pos[j]=idlePos[j];vel[j]=(Rn()-.5)*.02;
  pos[j+1]=idlePos[j+1];vel[j+1]=(Rn()-.5)*.02;
  pos[j+2]=idlePos[j+2];vel[j+2]=(Rn()-.5)*.02;
  col[j]=idleCol[j];tgtCol[j]=idleCol[j];
  col[j+1]=idleCol[j+1];tgtCol[j+1]=idleCol[j+1];
  col[j+2]=idleCol[j+2];tgtCol[j+2]=idleCol[j+2];
  tgt[j]=idlePos[j];tgt[j+1]=idlePos[j+1];tgt[j+2]=idlePos[j+2];
}

// ── Geometry ────────────────────────────────────────────────────
function mkGeo(p,c){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('color',new T.BufferAttribute(c,3));return g}
const pGeo=mkGeo(pos,col);
const pMat=new T.PointsMaterial({size:.08,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
const pts=new T.Points(pGeo,pMat);
const grp=new T.Group();grp.add(pts);scene.add(grp);

// ── Ghost trails ────────────────────────────────────────────────
const ghosts=[];
for(let g=0;g<2;g++){
  const m=new T.PointsMaterial({size:.06-.02*g,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:.35-g*.15});
  const p=new T.Points(pGeo,m);scene.add(p);
  ghosts.push(p);
}

// ── Core glow sphere ────────────────────────────────────────────
const coreGeo=new T.SphereGeometry(.15,32,32);
const coreMat=new T.MeshBasicMaterial({color:0xffffff,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});
const coreSphere=new T.Mesh(coreGeo,coreMat);scene.add(coreSphere);

// ── Shockwave rings ─────────────────────────────────────────────
const rings=[];
for(let r=0;r<RING_POOL;r++){
  const m=new T.MeshBasicMaterial({color:0xffffff,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});
  const mesh=new T.Mesh(new T.TorusGeometry(.3,.02,16,48),m);
  mesh.visible=false;scene.add(mesh);
  rings.push({mesh,mat:m,alive:false,born:0,delay:0});
}

// ── Glow shell (expanding bubble at explosion) ─────────────────
const shellGeo=new T.SphereGeometry(.1,40,40);
const shellMat=new T.MeshBasicMaterial({color:0xcc88ff,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});
const glowShell=new T.Mesh(shellGeo,shellMat);glowShell.visible=false;scene.add(glowShell);

// ── Debris shard system (angular fragments, separate from stars) ─
const DEBRIS_N=350;
const dPos=new Float32Array(DEBRIS_N*3),dVel=new Float32Array(DEBRIS_N*3),dCol=new Float32Array(DEBRIS_N*3);
const dTgt=new Float32Array(DEBRIS_N*3),dTgtCol=new Float32Array(DEBRIS_N*3);
const dRosePos=new Float32Array(DEBRIS_N*3),dRoseCol=new Float32Array(DEBRIS_N*3);
// Precompute debris rose positions (outer petals, larger shards)
{
  const Y_MIN=-.2,Y_MAX=1.65,PEAK_Y=.35;
  const R_PEAK=1.05,R_STEM=.06,SIG_UP=.23,SIG_DOWN=.48;
  const PETALS=5,TWIST=5.5;
  for(let i=0;i<DEBRIS_N;i++){
    const j=i*3;
    const h=.08+Rn()*.55;
    const y=Y_MIN+h*(Y_MAX-Y_MIN);
    const t=(y-Y_MIN)/(Y_MAX-Y_MIN);
    const tp=(PEAK_Y-Y_MIN)/(Y_MAX-Y_MIN);
    const dNorm=t<=tp?(tp-t)/SIG_UP:(t-tp)/SIG_DOWN;
    const envR=R_STEM+(R_PEAK-R_STEM)*M.exp(-dNorm*dNorm);
    const petalIdx=M.floor(Rn()*PETALS);
    const lobeCtr=(petalIdx/PETALS)*P*2;
    const spread=(Rn()-.5)*(P*2/PETALS)*.45;
    let th=(lobeCtr+spread)%(P*2);if(th<0)th+=P*2;
    const petalWave=.45+.55*C(PETALS*th+TWIST*h);
    const wrap=.3+Rn()*.7;
    const tipInward=M.max(0,(t-.5)/.5);
    const tipShrink=1-tipInward*.55;
    const r=envR*petalWave*wrap*tipShrink;
    const rj=r+(Rn()-.5)*.03;
    dRosePos[j]=C(th)*rj;dRosePos[j+1]=y;dRosePos[j+2]=Sf(th)*rj;
    const hue=lerp(.982,.955,Rn());
    const c=hsl(hue,.55+Rn()*.25,.14+Rn()*.22);
    dRoseCol[j]=c.r;dRoseCol[j+1]=c.g;dRoseCol[j+2]=c.b;
  }
}
for(let i=0;i<DEBRIS_N;i++){const j=i*3;dPos[j]=dPos[j+1]=dPos[j+2]=0;dVel[j]=dVel[j+1]=dVel[j+2]=0;dCol[j]=dCol[j+1]=dCol[j+2]=0;}
const dGeo=mkGeo(dPos,dCol);
const dMat=new T.PointsMaterial({size:.4,map:shardSprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});
const debrisPts=new T.Points(dGeo,dMat);debrisPts.visible=false;grp.add(debrisPts);

// ═══════════════════════════════════════════════════════════════════
// BOTANICAL: stem + thorns + leaves (appear during ROSE)
// ═══════════════════════════════════════════════════════════════════
const PLANT_N=650;
const pPos=new Float32Array(PLANT_N*3),pCol=new Float32Array(PLANT_N*3);
const plantTgt=new Float32Array(PLANT_N*3),plantTgtCol=new Float32Array(PLANT_N*3);
{
  let idx=0;
  const STEM=220,THORNS=45,LEAF1=160,LEAF2=160,PAD=65;
  // ── Stem: cubic bezier tube ───────────────────────────────────
  // P0=(0,0,0) bloom base → P1=(0,-2.2,0) root
  for(let i=0;i<STEM;i++){
    const t=i/(STEM-1),u=1-t;
    const bx=u*u*u*0+3*u*u*t*.06+3*u*t*t*(-.02)+t*t*t*0;
    const by=u*u*u*0+3*u*u*t*(-.7)+3*u*t*t*(-1.5)+t*t*t*(-2.2);
    const bz=u*u*u*0+3*u*u*t*.02+3*u*t*t*(-.01)+t*t*t*0;
    const rad=.03+t*.05;
    const phi=Rn()*P*2;
    const j=idx*3;
    plantTgt[j]=bx+C(phi)*rad;
    plantTgt[j+1]=by;
    plantTgt[j+2]=bz+Sf(phi)*rad*.4;
    const c=hsl(.26+Rn()*.05,.35+Rn()*.3,.12+Rn()*.15);
    plantTgtCol[j]=c.r;plantTgtCol[j+1]=c.g;plantTgtCol[j+2]=c.b;
    idx++;
  }
  // ── Thorns: 3 small spike clusters ─────────────────────────────
  const thornBases=[{t:.22,dir:-1},{t:.4,dir:1},{t:.6,dir:-1}];
  for(const tb of thornBases){
    const u=1-tb.t;
    const bx=u*u*u*0+3*u*u*tb.t*.06+3*u*tb.t*tb.t*(-.02)+tb.t*tb.t*tb.t*0;
    const by=u*u*u*0+3*u*u*tb.t*(-.7)+3*u*tb.t*tb.t*(-1.5)+tb.t*tb.t*tb.t*(-2.2);
    const bz=u*u*u*0+3*u*u*tb.t*.02+3*u*tb.t*tb.t*(-.01)+tb.t*tb.t*tb.t*0;
    for(let k=0;k<15;k++){
      const j=idx*3;
      const tipA=-P*.35+Rn()*.3+tb.dir*P*.4;
      const tipL=.04+Rn()*.1;
      plantTgt[j]=bx+C(tipA)*tipL;
      plantTgt[j+1]=by+Sf(tipA)*tipL;
      plantTgt[j+2]=bz+(Rn()-.5)*.03;
      const c=hsl(.1+Rn()*.05,.25+Rn()*.2,.2+Rn()*.12);
      plantTgtCol[j]=c.r;plantTgtCol[j+1]=c.g;plantTgtCol[j+2]=c.b;
      idx++;
    }
  }
  // ── Leaf helper ────────────────────────────────────────────────
  function addLeaf(tBase,attAngle,flipSign){
    const u=1-tBase;
    const bx=u*u*u*0+3*u*u*tBase*.06+3*u*tBase*tBase*(-.02)+tBase*tBase*tBase*0;
    const by=u*u*u*0+3*u*u*tBase*(-.7)+3*u*tBase*tBase*(-1.5)+tBase*tBase*tBase*(-2.2);
    const bz=u*u*u*0+3*u*u*tBase*.02+3*u*tBase*tBase*(-.01)+tBase*tBase*tBase*0;
    const leafLen=.7,leafMaxW=.14;
    for(let k=0;k<LEAF1;k++){
      const j=idx*3;
      const dist=M.pow(Rn(),.5);
      const wProfile=M.sin(dist*P)*leafMaxW*(1+dist*.15);
      const veinBend=dist*dist*.1*flipSign;
      const lx=dist*leafLen+veinBend,lz=(Rn()-.5)*1.8*wProfile*C(dist*.5);
      const cosA=C(attAngle),sinA=Sf(attAngle);
      const rx=lx*cosA-lz*sinA,rz=lx*sinA+lz*cosA;
      plantTgt[j]=bx+rx;plantTgt[j+1]=by+(Rn()-.5)*.04;plantTgt[j+2]=bz+rz;
      // Dark green, lighter at center vein and edges
      const veinDist=Ab(lz/wProfile);
      const hue=.24+Rn()*.06,sat=.45+Rn()*.3;
      const lit=veinDist<.15?.22+Rn()*.1:.1+Rn()*.14;
      const c=hsl(hue,sat,lit);
      plantTgtCol[j]=c.r;plantTgtCol[j+1]=c.g;plantTgtCol[j+2]=c.b;
      idx++;
    }
  }
  addLeaf(.38,-P*.22,1);
  addLeaf(.56,P*.22,-1);
  // ── Fill remaining with stem filler ────────────────────────────
  while(idx<PLANT_N){
    const j=idx*3,t=.2+Rn()*.5,u=1-t;
    const bx=u*u*u*0+3*u*u*t*.06+3*u*t*t*(-.02)+t*t*t*0;
    const by=u*u*u*0+3*u*u*t*(-.7)+3*u*t*t*(-1.5)+t*t*t*(-2.2);
    const rad=.03+t*.04,phi=Rn()*P*2;
    plantTgt[j]=bx+C(phi)*rad;
    plantTgt[j+1]=by;
    plantTgt[j+2]=Sf(phi)*rad*.4;
    const c=hsl(.26+Rn()*.05,.35+Rn()*.3,.1+Rn()*.12);
    plantTgtCol[j]=c.r;plantTgtCol[j+1]=c.g;plantTgtCol[j+2]=c.b;
    idx++;
  }
}
// Init plant positions offset (will spring into place during ROSE)
for(let i=0;i<PLANT_N;i++){const j=i*3;pPos[j]=plantTgt[j];pPos[j+1]=plantTgt[j+1]-3;pPos[j+2]=plantTgt[j+2];pCol[j]=plantTgtCol[j];pCol[j+1]=plantTgtCol[j+1];pCol[j+2]=plantTgtCol[j+2];}
const plantGeo=mkGeo(pPos,pCol);
const plantMat=new T.PointsMaterial({size:.08,map:leafSprite,vertexColors:true,blending:T.NormalBlending,depthWrite:true,transparent:true,opacity:0});
const plantPts=new T.Points(plantGeo,plantMat);plantPts.visible=false;grp.add(plantPts);

// ── Background stars (distant, static) ──────────────────────────
const BG=600;
const bgPosA=new Float32Array(BG*3),bgColA=new Float32Array(BG*3);
for(let i=0;i<BG;i++){
  const j=i*3,th=Rn()*P*2,ph=M.acos(2*Rn()-1),r=7+Rn()*16;
  bgPosA[j]=r*Sf(ph)*C(th);bgPosA[j+1]=r*Sf(ph)*Sf(th);bgPosA[j+2]=r*C(ph);
  const b=.15+Rn()*.45;bgColA[j]=b;bgColA[j+1]=b;bgColA[j+2]=b;
}
const bgStars=new T.Points(mkGeo(bgPosA,bgColA),new T.PointsMaterial({size:.04,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:.5}));
bgStars.renderOrder=-1;bgStars.material.depthTest=false;
scene.add(bgStars);

// ═══════════════════════════════════════════════════════════════════
// GESTURE DETECTION
// ═══════════════════════════════════════════════════════════════════
let handPresent=false,lastHandTime=0;
let fingerWorld={x:0,y:0,z:0},prevFinger={x:0,y:0,z:0};
let openness=0,pointDir=0,pointDirRaw=0,prevOpenness=0;
let numHands=0,indexExtended=false,currentLandmarks=null;

// Circle tracker
const circleBuf=[];const CIRCLE_BUF_MAX=100;

function countFingers(lm){
  const tips=[4,8,12,16,20],pips=[3,6,10,14,18];let c=0;
  for(let i=0;i<5;i++)if(lm[tips[i]].y<lm[pips[i]].y)c++;
  return c;
}

function isIndexExtended(lm){
  return lm[8].y<lm[6].y;
}

function analyzeHand(lm){
  const w=lm[0],tips=[4,8,12,16,20],pips=[3,6,10,14,18];let ts=0,ps=0;
  for(let i=0;i<5;i++){ts+=M.hypot(lm[tips[i]].x-w.x,lm[tips[i]].y-w.y);ps+=M.hypot(lm[pips[i]].x-w.x,lm[pips[i]].y-w.y);}
  return{
    openness:M.max(0,M.min(1,(ts/M.max(ps,.01)-1.02)/.28)),
    pointDir:Ab(lm[8].x-lm[9].x)<.015?0:M.max(-1,M.min(1,(lm[8].x-lm[9].x)*18))
  };
}

function imageToWorld(lm){
  const aspect=innerWidth/innerHeight,halfH=8*M.tan(25*P/180);
  return{x:(lm.x-.5)*halfH*2*aspect,y:(.5-lm.y)*halfH*2,z:0};
}

function addCirclePoint(pt){
  circleBuf.push({x:pt.x,y:pt.y,t:performance.now()});
  while(circleBuf.length>CIRCLE_BUF_MAX)circleBuf.shift();
}

function detectCircle(){
  if(circleBuf.length<20)return false;
  // Use recent points (last 1.5s)
  const now=performance.now();
  const recent=circleBuf.filter(p=>now-p.t<1800);
  if(recent.length<15)return false;
  // Centroid
  let cx=0,cy=0;
  for(const p of recent){cx+=p.x;cy+=p.y;}
  cx/=recent.length;cy/=recent.length;
  // Average radius
  let avgR=0;
  for(const p of recent)avgR+=dist(p.x,p.y,cx,cy);
  avgR/=recent.length;
  if(avgR<.25||avgR>3.5)return false; // too small/large
  // Radius variance check
  let rVar=0;
  for(const p of recent){
    const d=dist(p.x,p.y,cx,cy);
    rVar+=(d-avgR)**2;
  }
  rVar/=recent.length;
  if(rVar>avgR*avgR*.6)return false; // too irregular
  // Cumulative angle
  let totalAngle=0;
  for(let i=1;i<recent.length;i++){
    const a0=M.atan2(recent[i-1].y-cy,recent[i-1].x-cx);
    const a1=M.atan2(recent[i].y-cy,recent[i].x-cx);
    let da=a1-a0;
    while(da>P)da-=P*2;
    while(da<-P)da+=P*2;
    totalAngle+=da;
  }
  return Ab(totalAngle)>P*1.7; // ~306°, lenient
}

// ═══════════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════
function setState(newState){
  prevState=state;state=newState;stateTime=0;
  if(newState===States.PULSING){pulseStart=performance.now();coreMat.opacity=0;}
  if(newState===States.EXPLODING){explosionTime=performance.now();explosionMaxVel=0;triggerExplosion();}
  if(newState===States.FORMING_ROSE){copyTargets(rosePos,roseCol);}
  if(newState===States.ROSE){if(prevState!==States.BUTTERFLY)copyTargets(rosePos,roseCol);}
  if(newState===States.BUTTERFLY){copyTargets(bflyPos,bflyCol);twoHandCd=1.5;}
  if(newState===States.IDLE){copyTargets(idlePos,idleCol);debrisPts.visible=false;dMat.opacity=0;glowShell.visible=false;plantPts.visible=false;plantMat.opacity=0;}
  if(newState===States.ROSE||newState===States.BUTTERFLY){plantPts.visible=true;plantMat.opacity=.9;}
  if(newState===States.SCATTERED){circleBuf.length=0;dMat.opacity=.85;debrisPts.visible=true;}
}

function copyTargets(posArr,colArr){
  for(let i=0;i<N*3;i++){tgt[i]=posArr[i];tgtCol[i]=colArr[i];}
}

function triggerExplosion(){
  expPhase=0;expPhaseTime=0;
  // Sort particles by distance from origin for role assignment
  const indexed=[];
  for(let i=0;i<N;i++){const j=i*3;indexed.push({i,d:Sq(pos[j]*pos[j]+pos[j+1]*pos[j+1]+pos[j+2]*pos[j+2])});}
  indexed.sort((a,b)=>a.d-b.d); // closest first
  // Assign roles
  const ARM_N=400,PILLAR_N=300;
  armParticles=new Set();pillarUp=new Set();pillarDown=new Set();
  const mid=Math.floor(N/2);
  for(let k=0;k<ARM_N;k++)armParticles.add(indexed[mid-ARM_N/2+k].i);
  for(let k=0;k<PILLAR_N/2;k++)pillarUp.add(indexed[k].i);
  for(let k=0;k<PILLAR_N/2;k++)pillarDown.add(indexed[N-1-k].i);
  // Phase 0: slow creep — give particles very low radial velocity
  for(let i=0;i<N;i++){
    const j=i*3,dx=pos[j],dy=pos[j+1],dz=pos[j+2];
    const d=Sq(dx*dx+dy*dy+dz*dz)||.01;
    const nx=dx/d,ny=dy/d,nz=dz/d;
    // Slow creep velocity (will be multiplied by dt, kept small)
    const baseSpd=.15+Rn()*.4;
    // Arm particles: tangential spin
    if(armParticles.has(i)){
      const tangX=-ny,tangY=nx; // CCW rotation
      const armDir=Rn()>.5?1:-1;
      vel[j]=(nx*.2+tangX*armDir)*baseSpd;
      vel[j+1]=(ny*.2+tangY*armDir)*baseSpd;
      vel[j+2]=nz*baseSpd*.3;
    }else if(pillarUp.has(i)){
      vel[j]=nx*baseSpd*.2;vel[j+1]=baseSpd*1.5;vel[j+2]=nz*baseSpd*.1;
    }else if(pillarDown.has(i)){
      vel[j]=nx*baseSpd*.2;vel[j+1]=-baseSpd*1.5;vel[j+2]=nz*baseSpd*.1;
    }else{
      vel[j]=nx*baseSpd;
      vel[j+1]=ny*baseSpd;
      vel[j+2]=nz*baseSpd;
    }
    col[j]=.92;col[j+1]=.88;col[j+2]=1; // aurora purple
  }
  // Flash + bloom
  flash.style.opacity='.25';setTimeout(()=>{flash.style.opacity='0';},150);
  bloom.strength=2.5;
  // Staggered rings
  for(let r=0;r<RING_POOL;r++){
    const ring=rings[r];
    ring.alive=true;ring.born=performance.now()+r*200;
    ring.mat.color.setHSL(.75+Rn()*.12,1,.5+Rn()*.4);
    ring.mat.opacity=0;ring.mesh.visible=false;
    ring.mesh.position.set(0,0,0);
    ring.mesh.rotation.set(P/2+(Rn()-.5)*.3,Rn()*P*2,(Rn()-.5)*.3);
  }
  // Glow shell: spawn at center, will expand
  glowShell.position.set(0,0,0);
  glowShell.scale.setScalar(.05);
  glowShell.visible=true;shellMat.opacity=.9;
  // Reset core
  coreMat.opacity=0;coreSphere.position.set(0,0,0);
  // Debris: spawn angular shards from center with strong outward punch
  for(let i=0;i<DEBRIS_N;i++){
    const j=i*3;
    const th=Rn()*P*2,ph=M.acos(2*Rn()-1);
    const spd=1.5+Rn()*4.5; // strong: 1.5~6.0
    dPos[j]=0;dPos[j+1]=0;dPos[j+2]=0;
    dVel[j]=Sf(ph)*C(th)*spd;dVel[j+1]=Sf(ph)*Sf(th)*spd;dVel[j+2]=C(ph)*spd;
    dCol[j]=lerp(.65,.95,Rn());dCol[j+1]=lerp(.55,.9,Rn());dCol[j+2]=lerp(.75,1,Rn());
  }
  dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;
  debrisPts.visible=true;dMat.opacity=.85;
}

// ═══════════════════════════════════════════════════════════════════
// MEDIAPIPE
// ═══════════════════════════════════════════════════════════════════
let hl=null,stream=null,lvt=0;
async function initMP(){
  Lt.textContent='加载手势模型…';
  try{
    const {HandLandmarker,FilesetResolver}=await import('./vision_bundle.mjs');
    const v=await FilesetResolver.forVisionTasks('./wasm');
    hl=await HandLandmarker.createFromOptions(v,{baseOptions:{modelAssetPath:'./hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minTrackingConfidence:.45});
    Lt.textContent='启动摄像头…';await startCam();
  }catch(e){
    Lt.textContent='加载失败: '+e.message.slice(0,40);
    setTimeout(()=>Ld.classList.add('done'),2500);
  }
}
async function startCam(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});
    cam.srcObject=stream;await cam.play();
    await new Promise(res=>{if(cam.currentTime>0){res();return;}cam.addEventListener('timeupdate',res,{once:true});});
    Lt.textContent='就绪';setTimeout(()=>Ld.classList.add('done'),500);
  }catch(e){
    Lt.textContent='摄像头不可用 ('+e.message.slice(0,30)+')';
    setTimeout(()=>Ld.classList.add('done'),2500);
  }
}
function stopCam(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}

// ═══════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════
const clk=new T.Clock();
let circleDetected=false;

function tick(){
  requestAnimationFrame(tick);
  const dt=M.min(clk.getDelta(),.12),now=performance.now();
  stateTime+=dt;

  // ── Hand detection ────────────────────────────────────────────
  handPresent=false;numHands=0;
  if(hl&&stream&&cam.currentTime>0&&cam.currentTime!==lvt){
    lvt=cam.currentTime;
    try{
      const res=hl.detectForVideo(cam,now);
      if(res.landmarks&&res.landmarks.length>0){
        handPresent=true;lastHandTime=now;
        numHands=res.landmarks.length;
        currentLandmarks=res.landmarks;
        // Use first hand for primary interaction
        const lm=res.landmarks[0];
        indexExtended=isIndexExtended(lm);
        const g=analyzeHand(lm);
        prevOpenness=openness;openness=g.openness;
        pointDirRaw=g.pointDir;
        const fw=imageToWorld(lm[8]);
        prevFinger={...fingerWorld};
        fingerWorld=fw;
        pointDir=pointDirRaw;
        D.innerHTML=`手:${numHands} 指:${countFingers(lm)} 张:${openness.toFixed(2)} 态:${state}`;
      }else{
        handPresent=false;numHands=0;currentLandmarks=null;indexExtended=false;
        D.innerHTML=`无手 态:${state}`;
      }
    }catch(e){handPresent=false;numHands=0;currentLandmarks=null;indexExtended=false;D.innerHTML='检测异常 态:'+state;}
  }

  // ── Two-hand cooldown ─────────────────────────────────────────
  if(twoHandCd>0)twoHandCd-=dt;

  // ═══════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════════════
  if(state===States.IDLE){
    H.textContent=HINTS[0];
    if(handPresent&&indexExtended){
      setState(States.GATHERING);
    }
  }

  if(state===States.GATHERING){
    H.textContent=HINTS[1];
    // Check convergence: all particles near origin (0,0)
    let avgD=0;
    for(let i=0;i<N;i++){const j=i*3;avgD+=Sq(pos[j]*pos[j]+pos[j+1]*pos[j+1]+pos[j+2]*pos[j+2]);}
    avgD=Sq(avgD/N);
    if(avgD<.35){setState(States.PULSING);}
    // Timeout: if no hand for 3s, drift back
    if(!handPresent&&stateTime>3){setState(States.IDLE);}
  }

  if(state===States.PULSING){
    H.textContent=HINTS[2];
    if(now-pulseStart>2200){setState(States.EXPLODING);}
  }

  if(state===States.EXPLODING){
    H.textContent=HINTS[3];
    // Check if particles have slowed
    let mv=0;
    for(let i=0;i<N;i++){const j=i*3;const s=vel[j]*vel[j]+vel[j+1]*vel[j+1]+vel[j+2]*vel[j+2];if(s>mv)mv=s;}
    explosionMaxVel=M.max(explosionMaxVel,mv);
    const elapsed=(now-explosionTime)/1000;
    if(elapsed>2.5||(elapsed>1.2&&mv<.04)){setState(States.SCATTERED);}
  }

  if(state===States.SCATTERED){
    H.textContent=HINTS[4];
    if(handPresent){
      addCirclePoint(fingerWorld);
      if(detectCircle()){circleDetected=true;setState(States.FORMING_ROSE);}
    }
    // Timeout: if idle too long, go back to IDLE
    if(stateTime>20&&!handPresent){setState(States.IDLE);}
  }

  if(state===States.FORMING_ROSE){
    H.textContent=HINTS[5];
    // Check if particles settled
    let avgD=0;
    for(let i=0;i<N;i++){const j=i*3;avgD+=Sq((pos[j]-tgt[j])**2+(pos[j+1]-tgt[j+1])**2+(pos[j+2]-tgt[j+2])**2);}
    avgD/=N;
    if(avgD<.06&&stateTime>1.5){setState(States.ROSE);}
  }

  if(state===States.ROSE){
    H.textContent=HINTS[6];
    if(numHands>=2&&twoHandCd<=0&&stateTime>1){setState(States.BUTTERFLY);}
  }

  if(state===States.BUTTERFLY){
    H.textContent=HINTS[7];
    if(numHands>=2&&twoHandCd<=0&&stateTime>1){setState(States.ROSE);}
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTICLE PHYSICS
  // ═══════════════════════════════════════════════════════════════
  if(state===States.IDLE){
    // Gentle drift back to idle positions
    for(let i=0;i<N;i++){
      const j=i*3;
      const k=1.5,dmp=2.5;
      vel[j]+=((idlePos[j]-pos[j])*k-vel[j]*dmp)*dt+((Rn()-.5)*.15)*dt;
      vel[j+1]+=((idlePos[j+1]-pos[j+1])*k-vel[j+1]*dmp)*dt+((Rn()-.5)*.15)*dt;
      vel[j+2]+=((idlePos[j+2]-pos[j+2])*k-vel[j+2]*dmp)*dt+((Rn()-.5)*.08)*dt;
      tgtCol[j]=idleCol[j];tgtCol[j+1]=idleCol[j+1];tgtCol[j+2]=idleCol[j+2];
    }
  }

  if(state===States.GATHERING){
    // Black-hole vortex: attract to origin (0,0,0) with tangential rotation
    // Particles spiral inward — accretion disc effect
    const CENTER_X=0,CENTER_Y=0,CENTER_Z=0;
    for(let i=0;i<N;i++){
      const j=i*3;
      const dx=CENTER_X-pos[j],dy=CENTER_Y-pos[j+1],dz=CENTER_Z-pos[j+2];
      const d2=dx*dx+dy*dy+dz*dz;
      const d=Sq(d2)+.03;
      // Radial suction: strong, inverse-square-ish
      const radialF=12/(d+.08);
      // Tangential swirl: perpendicular in XY plane, stronger near center
      // Cross product with Z axis: (-dy, dx, 0) = counter-clockwise rotation
      const swirlStr=4.5/(d+.25); // stronger as d shrinks
      // Z flattening: squeeze toward z=0 near center → accretion disc
      const zFlatten=3/(d+.4);
      vel[j]+=(dx*radialF-vel[j]*5.5+(-dy)*swirlStr)*dt;
      vel[j+1]+=(dy*radialF-vel[j+1]*5.5+(dx)*swirlStr)*dt;
      vel[j+2]+=(dz*radialF-vel[j+2]*5.5-CENTER_Z-pos[j+2]*zFlatten)*dt;
      // Color gradient: distant blue-white → warm gold near center → white-hot at core
      const distF=M.min(1,d/2.5);
      const hue=lerp(.6,lerp(.18,.12,distF*.7),distF);
      const sat=lerp(.3,lerp(.7,1,distF),distF);
      const lit=lerp(.35,lerp(.55,.8,distF*.6),distF);
      const c=hsl(hue,sat,lit);
      tgtCol[j]=lerp(col[j],c.r,4*dt);tgtCol[j+1]=lerp(col[j+1],c.g,4*dt);tgtCol[j+2]=lerp(col[j+2],c.b,4*dt);
    }
    // Central dark glow growing visible (progress estimated by stateTime, ~2s to converge)
    coreSphere.position.set(0,0,0);
    const gatherFrac=M.min(1,stateTime/1.8);
    coreMat.color.setHSL(.65,.8,.12+gatherFrac*.3);
    coreMat.opacity=lerp(coreMat.opacity,.04+gatherFrac*.18,2*dt);
    coreSphere.scale.setScalar(lerp(coreSphere.scale.x,.12+gatherFrac*.35,2*dt));
  }

  if(state===States.PULSING){
    // Particles oscillate around origin with increasing intensity
    const elapsed=(now-pulseStart)/1000;
    const pulseFreq=7;
    const pulseAmp=.12;
    const pulseScale=1+pulseAmp*M.sin(elapsed*pulseFreq*P*2)*(1-elapsed/2.5);
    const brightBoost=elapsed/2.2;
    for(let i=0;i<N;i++){
      const j=i*3;
      // Bind to origin with pulse oscillation
      const tx=pos[j]*pulseScale*.08;
      const ty=pos[j+1]*pulseScale*.08;
      const tz=pos[j+2]*pulseScale*.05;
      vel[j]+=((tx-pos[j])*22-vel[j]*10)*dt;
      vel[j+1]+=((ty-pos[j+1])*22-vel[j+1]*10)*dt;
      vel[j+2]+=((tz-pos[j+2])*22-vel[j+2]*10)*dt;
      const c=hsl(.13,.3+brightBoost*.5,.55+brightBoost*.4);
      tgtCol[j]=c.r;tgtCol[j+1]=c.g;tgtCol[j+2]=c.b;
    }
    coreSphere.position.set(0,0,0);
    coreMat.color.setHSL(.15,.9,.5+brightBoost*.45);
    coreMat.opacity=lerp(coreMat.opacity,.35+brightBoost*.6,5*dt);
    coreSphere.scale.setScalar(pulseScale*.7+.3);
    bloom.strength=lerp(bloom.strength,1.2+brightBoost*1.5,3*dt);
  }

  if(state===States.EXPLODING){
    // Plan B — creation explosion
    const elapsed=(now-explosionTime)/1000;
    expPhaseTime+=dt;
    if(expPhase===0&&elapsed>.3){expPhase=1;expPhaseTime=0;}
    else if(expPhase===1&&elapsed>1.0){expPhase=2;expPhaseTime=0;}
    // accelMul: scales forces (not velocity!) — 0.1=slow creep, 2.0=burst, 0.3=decay
    let accelMul;
    if(expPhase===0)accelMul=lerp(.08,.35,elapsed/.3);
    else if(expPhase===1)accelMul=1.6+M.sin(elapsed*9)*.6;
    else accelMul=M.max(.15,.9-((elapsed-1.0)/1.5)*.75);
    const damping=expPhase===0?4:expPhase===1?1.8:3;
    // ── Main particles ──────────────────────────────────────────
    for(let i=0;i<N;i++){
      const j=i*3;
      const dx=pos[j],dy=pos[j+1],dz=pos[j+2];
      const d2=dx*dx+dy*dy+dz*dz+.05;
      const d=Sq(d2),nx=dx/d,ny=dy/d,nz=dz/d;
      const radF=3.2*accelMul/(d2+.15);
      vel[j]+=nx*radF*dt-vel[j]*damping*dt;
      vel[j+1]+=ny*radF*dt-vel[j+1]*damping*dt;
      vel[j+2]+=nz*radF*dt-vel[j+2]*damping*dt;
      if(armParticles&&armParticles.has(i)){
        vel[j]+=-ny*2.2*accelMul/(d2+.2)*dt;
        vel[j+1]+=nx*2.2*accelMul/(d2+.2)*dt;
      }
      if(pillarUp&&pillarUp.has(i))vel[j+1]+=4*accelMul/(d2+.15)*dt;
      if(pillarDown&&pillarDown.has(i))vel[j+1]-=4*accelMul/(d2+.15)*dt;
      let hue;
      if(armParticles&&armParticles.has(i))hue=lerp(.78,lerp(.85,.58,elapsed/1.8),elapsed/1.8);
      else if(pillarUp&&pillarUp.has(i)||pillarDown&&pillarDown.has(i))hue=lerp(.83,.72,elapsed/2.2);
      else hue=lerp(.76,lerp(.68,.62,elapsed/2.2),elapsed/2.2);
      const c=hsl(hue,.65+.25*M.sin(elapsed*4+i*.1),.4+.3*M.sin(elapsed*3.5+i*.13));
      tgtCol[j]=c.r;tgtCol[j+1]=c.g;tgtCol[j+2]=c.b;
    }
    // ── Glow shell ──────────────────────────────────────────────
    glowShell.scale.setScalar(glowShell.scale.x+3.5*accelMul*dt);
    shellMat.opacity=lerp(shellMat.opacity,elapsed>.7?0:.5,3*dt);
    if(elapsed>1.0&&shellMat.opacity<.02)glowShell.visible=false;
    // ── Debris: outward push proportional to distance ────────────
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3,dx=dPos[j],dy=dPos[j+1],dz=dPos[j+2];
      const d2=dx*dx+dy*dy+dz*dz+.06;
      const d=Sq(d2);
      const radF=2.5*accelMul/(d2+.12);
      dVel[j]+=(dx/d)*radF*dt-dVel[j]*damping*dt;
      dVel[j+1]+=(dy/d)*radF*dt-dVel[j+1]*damping*dt;
      dVel[j+2]+=(dz/d)*radF*dt-dVel[j+2]*damping*dt;
      // Cool metallic blue-purple
      dCol[j]=lerp(dCol[j],lerp(.5,.7,Rn()),2*dt);
      dCol[j+1]=lerp(dCol[j+1],lerp(.55,.75,Rn()),2*dt);
      dCol[j+2]=lerp(dCol[j+2],lerp(.65,.9,Rn()),2*dt);
    }
    dGeo.attributes.color.needsUpdate=true;
    // Bloom
    bloom.strength=lerp(bloom.strength,1.2+.7*M.exp(-elapsed*.7),2*dt);
    // ── Transition ──────────────────────────────────────────────
    let mv=0;
    for(let i=0;i<N;i++){const j=i*3;const s=vel[j]*vel[j]+vel[j+1]*vel[j+1]+vel[j+2]*vel[j+2];if(s>mv)mv=s;}
    if(elapsed>2.5||(elapsed>1.3&&mv<.04)){setState(States.SCATTERED);}
  }

  if(state===States.SCATTERED){
    // Main particles: gentle drift, warm pink dim dust
    for(let i=0;i<N;i++){
      const j=i*3;
      vel[j]+=((Rn()-.5)*.1-vel[j]*1.5)*dt;
      vel[j+1]+=((Rn()-.5)*.1-vel[j+1]*1.5)*dt;
      vel[j+2]+=((Rn()-.5)*.06-vel[j+2]*1.5)*dt;
      tgtCol[j]=lerp(tgtCol[j],.95,2*dt);tgtCol[j+1]=lerp(tgtCol[j+1],.5,2*dt);tgtCol[j+2]=lerp(tgtCol[j+2],.45,2*dt);
    }
    // Debris shards: float, slow rotation simulated by drift
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      dVel[j]+=((Rn()-.5)*.08-dVel[j]*1.2)*dt;
      dVel[j+1]+=((Rn()-.5)*.08-dVel[j+1]*1.2)*dt;
      dVel[j+2]+=((Rn()-.5)*.04-dVel[j+2]*1.2)*dt;
      // Metallic cool colors
      dCol[j]=lerp(dCol[j],lerp(.55,.7,Rn()),1.5*dt);
      dCol[j+1]=lerp(dCol[j+1],lerp(.6,.8,Rn()),1.5*dt);
      dCol[j+2]=lerp(dCol[j+2],lerp(.7,.95,Rn()),1.5*dt);
    }
    dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;
  }

  if(state===States.FORMING_ROSE||state===States.ROSE||state===States.BUTTERFLY){
    const springK=state===States.FORMING_ROSE?8:6;
    const springD=state===States.FORMING_ROSE?5:5;
    for(let i=0;i<N;i++){
      const j=i*3;
      vel[j]+=((tgt[j]-pos[j])*springK-vel[j]*springD)*dt;
      vel[j+1]+=((tgt[j+1]-pos[j+1])*springK-vel[j+1]*springD)*dt;
      vel[j+2]+=((tgt[j+2]-pos[j+2])*springK-vel[j+2]*springD)*dt;
    }
    // Debris shards morph to rose outer petals (or fade during butterfly)
    const dSpringK=state===States.FORMING_ROSE?7:5;
    const dSpringD=5;
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      const tx=state===States.BUTTERFLY?0:dRosePos[j];
      const ty=state===States.BUTTERFLY?0:dRosePos[j+1];
      const tz=state===States.BUTTERFLY?0:dRosePos[j+2];
      dVel[j]+=((tx-dPos[j])*dSpringK-dVel[j]*dSpringD)*dt;
      dVel[j+1]+=((ty-dPos[j+1])*dSpringK-dVel[j+1]*dSpringD)*dt;
      dVel[j+2]+=((tz-dPos[j+2])*dSpringK-dVel[j+2]*dSpringD)*dt;
      // Color-shift to rose colors in rose states, keep metallic during butterfly
    if(state===States.BUTTERFLY){
      dCol[j]=lerp(dCol[j],dRoseCol[j],1.5*dt);
      dCol[j+1]=lerp(dCol[j+1],dRoseCol[j+1],1.5*dt);
      dCol[j+2]=lerp(dCol[j+2],dRoseCol[j+2],1.5*dt);
    }else{
      dCol[j]=lerp(dCol[j],dRoseCol[j],2.5*dt);
      dCol[j+1]=lerp(dCol[j+1],dRoseCol[j+1],2.5*dt);
      dCol[j+2]=lerp(dCol[j+2],dRoseCol[j+2],2.5*dt);
    }
    }
    // Plant: spring into place (slides up from below)
    for(let i=0;i<PLANT_N;i++){
      const j=i*3;
      const k=state===States.FORMING_ROSE?3:4,dmp=4;
      pPos[j]+=((plantTgt[j]-pPos[j])*k)*dt;
      pPos[j+1]+=((plantTgt[j+1]-pPos[j+1])*k)*dt;
      pPos[j+2]+=((plantTgt[j+2]-pPos[j+2])*k)*dt;
      pCol[j]=lerp(pCol[j],plantTgtCol[j],3*dt);
      pCol[j+1]=lerp(pCol[j+1],plantTgtCol[j+1],3*dt);
      pCol[j+2]=lerp(pCol[j+2],plantTgtCol[j+2],3*dt);
    }
    // Fade in plant
    if(state===States.FORMING_ROSE||state===States.ROSE||state===States.BUTTERFLY){
      plantMat.opacity=lerp(plantMat.opacity,.9,3*dt);
      plantPts.visible=true;
    }
  }

  // ── Apply velocity & update positions ─────────────────────────
  for(let i=0;i<N;i++){
    const j=i*3;
    pos[j]+=vel[j]*dt;pos[j+1]+=vel[j+1]*dt;pos[j+2]+=vel[j+2]*dt;
    // Lerp colors
    col[j]=lerp(col[j],tgtCol[j],3*dt);
    col[j+1]=lerp(col[j+1],tgtCol[j+1],3*dt);
    col[j+2]=lerp(col[j+2],tgtCol[j+2],3*dt);
  }
  pGeo.attributes.position.needsUpdate=true;
  pGeo.attributes.color.needsUpdate=true;
  // Debris update
  for(let i=0;i<DEBRIS_N;i++){const j=i*3;dPos[j]+=dVel[j]*dt;dPos[j+1]+=dVel[j+1]*dt;dPos[j+2]+=dVel[j+2]*dt;}
  dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;
  plantGeo.attributes.position.needsUpdate=true;plantGeo.attributes.color.needsUpdate=true;

  // ── Ghost update ──────────────────────────────────────────────
  for(let g=0;g<ghosts.length;g++){
    ghosts[g].rotation.y=grp.rotation.y;
    ghosts[g].scale.copy(grp.scale);
    ghosts[g].material.opacity=(state===States.PULSING?.25:.2)-g*.08;
  }

  // ═══════════════════════════════════════════════════════════════
  // ROSE / BUTTERFLY interactions
  // ═══════════════════════════════════════════════════════════════
  if(state===States.ROSE||state===States.BUTTERFLY){
    if(handPresent){
      // Fist/Open = scale
      // Fist(openness≈0)→large(1.8x), Open(openness≈1)→small bud(0.3x)
      const tgtScale=1.8-openness*1.5;
      grp.scale.lerp(new T.Vector3(tgtScale,tgtScale,tgtScale),8*dt);
      // Point = rotate Y
      const rotSpd=pointDir*(state===States.BUTTERFLY?3.2:2.5);
      grp.rotation.y+=rotSpd*dt;
      // Butterfly wing flap
      if(state===States.BUTTERFLY){
        const flapFreq=3.5;
        const flapAmp=.08;
        grp.scale.x=lerp(grp.scale.x,grp.scale.y*(1+flapAmp*M.sin(now*.001*flapFreq*P*2)),2*dt);
      }
    }else{
      // Auto-rotate slowly
      grp.rotation.y+=dt*(state===States.BUTTERFLY?.25:.15);
      grp.scale.lerp(new T.Vector3(1,1,1),1.5*dt);
      if(state===States.BUTTERFLY)grp.scale.x=lerp(grp.scale.x,1,2*dt);
    }
    // Status text
    const sName=state===States.ROSE?'🌹 玫瑰':'🦋 蝴蝶';
    if(handPresent){
      const l=openness>.55?'🖐':openness<.22?'✊':'✋';
      S.textContent=sName+' · '+l+(pointDir<-.08?' ↺':pointDir>.08?' ↻':'');
      S.className='on';
    }else{
      S.textContent=sName;S.className='on';
    }
    // Keep ghost rotation synced
    for(const gh of ghosts)gh.rotation.y=grp.rotation.y;
  }else if(state===States.IDLE||state===States.GATHERING){
    grp.scale.lerp(new T.Vector3(1,1,1),2*dt);
    grp.rotation.y=lerp(grp.rotation.y,0,2*dt);
    S.textContent=state===States.IDLE?'✨ 伸出食指开始…':'✨ 星点聚拢中…';
    S.className=handPresent?'on':'';
  }else if(state===States.PULSING){
    S.textContent='⚡ 核心脉冲…';S.className='on';
  }else if(state===States.EXPLODING){
    S.textContent='💥 宇宙大爆炸！';S.className='on';
  }else if(state===States.SCATTERED){
    S.textContent='✨ 画一个圆来创造玫瑰';S.className=handPresent?'on':'';
  }else if(state===States.FORMING_ROSE){
    S.textContent='🌹 玫瑰正在绽放…';S.className='on';
  }

  // ═══════════════════════════════════════════════════════════════
  // RINGS
  // ═══════════════════════════════════════════════════════════════
  for(const r of rings){
    if(!r.alive)continue;
    const age=(now-r.born)/1000;
    if(age<0){continue;} // delayed start
    const maxAge=1.8;
    if(age>maxAge){r.alive=false;r.mesh.visible=false;r.mat.opacity=0;continue;}
    const prog=age/maxAge;
    r.mesh.scale.setScalar(.3+prog*5);
    r.mat.opacity=(1-prog)*.7;
    if(age<.1)r.mesh.visible=true;
  }

  // ── Core sphere ───────────────────────────────────────────────
  if(state!==States.PULSING){
    coreMat.opacity=lerp(coreMat.opacity,0,4*dt);
  }

  // ── Background stars rotation ────────────────────────────────
  bgStars.rotation.y+=dt*.015;
  bgStars.rotation.x+=dt*.005;

  // ── Render ────────────────────────────────────────────────────
  comp.render();
}

// ═══════════════════════════════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════════════════════════════
addEventListener('resize',()=>{
  ren.setSize(innerWidth,innerHeight);comp.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════
addEventListener('beforeunload',stopCam);
initMP();tick();
