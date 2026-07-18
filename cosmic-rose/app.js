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
const evB=(pts,t)=>{if(pts.length===4){const u=1-t;return[u*u*u*pts[0][0]+3*u*u*t*pts[1][0]+3*u*t*t*pts[2][0]+t*t*t*pts[3][0],u*u*u*pts[0][1]+3*u*u*t*pts[1][1]+3*u*t*t*pts[2][1]+t*t*t*pts[3][1],u*u*u*pts[0][2]+3*u*u*t*pts[1][2]+3*u*t*t*pts[2][2]+t*t*t*pts[3][2]];}else{const u=1-t;return[u*u*pts[0][0]+2*u*t*pts[1][0]+t*t*pts[2][0],u*u*pts[0][1]+2*u*t*pts[1][1]+t*t*pts[2][1],u*u*pts[0][2]+2*u*t*pts[1][2]+t*t*pts[2][2]];}};
;

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const N=12000,NCORE=2000,RING_POOL=4;
const States={IDLE:0,GATHERING:1,PULSING:2,EXPLODING:3,SCATTERED:4,FORMING_SPHERE:5,SPHERE:6};
const HINTS=[
  '伸出食指召唤星辰',
  '星辰坠入漩涡…',
  '',
  '',
  '用手指在空中画一个圆',
  '光球正在凝聚…',
  '🖐 张握缩放',
  ''
];
let state=States.IDLE,prevState=-1,stateTime=0,pulseStart=0;
let explosionTime=0,explosionMaxVel=0;
let expPhase=0,expPhaseTime=0; // 0=slow creep, 1=fast burst, 2=decay
let armParticles=null,pillarUp=null,pillarDown=null; // particle role arrays

// ═══════════════════════════════════════════════════════════════════
// THREE.JS SETUP
// ═══════════════════════════════════════════════════════════════════
const ren=new T.WebGLRenderer({antialias:false});
ren.setPixelRatio(M.min(devicePixelRatio,1));
ren.setSize(innerWidth,innerHeight);
ren.domElement.style.background='radial-gradient(ellipse at center,#1a1410 0%,#0a0808 40%,#010108 100%)';
document.body.prepend(ren.domElement);

const scene=new T.Scene();scene.background=new T.Color(0x010108);
const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.5,50);
camera.position.set(0,0,6.5);camera.lookAt(0,0,0);

const comp=new EffectComposer(ren);
comp.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.55,.35,.38);
comp.addPass(bloom);

// ── Sprite ──────────────────────────────────────────────────────
function mkSprite(sz){
  const c=document.createElement('canvas');c.width=sz;c.height=sz;
  const x=c.getContext('2d'),g=x.createRadialGradient(sz/2,sz/2,0,sz/2,sz/2,sz/2);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(.04,'rgba(255,255,254,.92)');
  g.addColorStop(.12,'rgba(255,252,248,.45)');
  g.addColorStop(.25,'rgba(255,245,235,.08)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,sz,sz);
  return new T.CanvasTexture(c);
}
function mkSoftSprite(sz){
  const c=document.createElement('canvas');c.width=sz;c.height=sz;
  const x=c.getContext('2d'),g=x.createRadialGradient(sz/2,sz/2,0,sz/2,sz/2,sz/2);
  g.addColorStop(0,'rgba(255,255,252,.45)');
  g.addColorStop(.15,'rgba(255,250,240,.25)');
  g.addColorStop(.4,'rgba(255,240,220,.06)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,sz,sz);
  return new T.CanvasTexture(c);
}
const sprite=mkSprite(64);
const softSprite=mkSoftSprite(128);

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

// ═══════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════
const pos=new Float32Array(N*3),vel=new Float32Array(N*3),col=new Float32Array(N*3);
const tgt=new Float32Array(N*3),tgtCol=new Float32Array(N*3);
const idlePos=new Float32Array(N*3),idleCol=new Float32Array(N*3);
const treePos=new Float32Array(N*3),treeCol=new Float32Array(N*3);
// Core: hot inner sphere
const cPos=new Float32Array(NCORE*3),cVel=new Float32Array(NCORE*3),cCol=new Float32Array(NCORE*3);
const cTgt=new Float32Array(NCORE*3),cTgtCol=new Float32Array(NCORE*3);
const cTreePos=new Float32Array(NCORE*3),cTreeCol=new Float32Array(NCORE*3);

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

// Compute sphere shape: Fibonacci even distribution ───────────
{
  const R=1.2;
  const gr=(1+M.sqrt(5))/2; // golden ratio
  for(let i=0;i<N;i++){
    const j=i*3;
    // Fibonacci sphere: uniform surface coverage
    const phi=M.acos(1-2*(i+.5)/N);
    const th=P*2*((i*gr)%1);
    // Slight radial noise for texture (not too deep, just enough for fluff)
    const rr=R*(.94+Rn()*.06);
    treePos[j]=rr*M.sin(phi)*M.cos(th);
    treePos[j+1]=rr*M.sin(phi)*M.sin(th);
    treePos[j+2]=rr*M.cos(phi);
    // Latitude gradient: equator warm → poles cool
    const lat=M.abs(phi/P-.5)*2;
    const hue=lerp(lerp(.15,.70,lat),.58,lat*lat);
    const sat=lerp(.6,.35,lat);
    const lit=lerp(.55,.78,lat);
    const c=hsl(hue,sat,lit);
    treeCol[j]=c.r;treeCol[j+1]=c.g;treeCol[j+2]=c.b;
  }
  // Hot core: Fibonacci too
  const cR=.35;
  for(let i=0;i<NCORE;i++){
    const j=i*3;
    const phi=M.acos(1-2*(i+.5)/NCORE);
    const th=P*2*((i*gr)%1);
    const rr=cR*(.94+Rn()*.06);
    cTreePos[j]=rr*M.sin(phi)*M.cos(th);
    cTreePos[j+1]=rr*M.sin(phi)*M.sin(th);
    cTreePos[j+2]=rr*M.cos(phi);
    const c=hsl(.58+(Rn()-.5)*.03,.2+Rn()*.15,.72+Rn()*.2);
    cTreeCol[j]=c.r;cTreeCol[j+1]=c.g;cTreeCol[j+2]=c.b;
  }
}
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
// Init core particles scattered (they'll snap to core on SPHERE)
for(let i=0;i<NCORE;i++){
  const j=i*3;
  const ang=Rn()*P*2,phi=M.acos(2*Rn()-1),rr=1.5+Rn()*3;
  cPos[j]=rr*M.sin(phi)*M.cos(ang);cVel[j]=(Rn()-.5)*.02;
  cPos[j+1]=rr*M.sin(phi)*M.sin(ang);cVel[j+1]=(Rn()-.5)*.02;
  cPos[j+2]=rr*M.cos(phi);cVel[j+2]=(Rn()-.5)*.02;
  cCol[j]=.8;cCol[j+1]=.85;cCol[j+2]=1;
  cTgtCol[j]=.8;cTgtCol[j+1]=.85;cTgtCol[j+2]=1;
  cTgt[j]=cPos[j];cTgt[j+1]=cPos[j+1];cTgt[j+2]=cPos[j+2];
}

// ── Geometry ────────────────────────────────────────────────────
function mkGeo(p,c){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('color',new T.BufferAttribute(c,3));return g}
const pGeo=mkGeo(pos,col);
const pMat=new T.PointsMaterial({size:.06,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
const pts=new T.Points(pGeo,pMat);
// Core: hot inner sphere, smaller but brighter
const cGeo=mkGeo(cPos,cCol);
const cMat=new T.PointsMaterial({size:.045,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
const corePts=new T.Points(cGeo,cMat);corePts.visible=false;
const grp=new T.Group();grp.add(pts);scene.add(grp);
scene.add(corePts); // core independent from outer sphere scaling

// ── Ghost trails ────────────────────────────────────────────────
const ghosts=[];
for(let g=0;g<2;g++){
  const m=new T.PointsMaterial({size:.04-.01*g,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:.35-g*.15});
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
const DEBRIS_N=500;
const dPos=new Float32Array(DEBRIS_N*3),dVel=new Float32Array(DEBRIS_N*3),dCol=new Float32Array(DEBRIS_N*3);
const dTgt=new Float32Array(DEBRIS_N*3),dTgtCol=new Float32Array(DEBRIS_N*3);
for(let i=0;i<DEBRIS_N;i++){const j=i*3;dPos[j]=dPos[j+1]=dPos[j+2]=0;dVel[j]=dVel[j+1]=dVel[j+2]=0;dCol[j]=dCol[j+1]=dCol[j+2]=0;}
const dGeo=mkGeo(dPos,dCol);
const dMat=new T.PointsMaterial({size:.06,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});
const debrisPts=new T.Points(dGeo,dMat);debrisPts.visible=false;grp.add(debrisPts);

// ═══════════════════════════════════════════════════════════════════
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
  if(newState===States.PULSING){pulseStart=performance.now();coreMat.opacity=0;pts.material=pMat;}
  if(newState===States.EXPLODING){explosionTime=performance.now();explosionMaxVel=0;triggerExplosion();pts.material=pMat;}
  if(newState===States.FORMING_SPHERE){
    copyTargets(treePos,treeCol);
    for(let i=0;i<NCORE*3;i++){cTgt[i]=cTreePos[i];cTgtCol[i]=cTreeCol[i];}
    debrisPts.visible=true;dMat.opacity=.65;
    corePts.visible=true;
  }
  if(newState===States.SPHERE){
    if(prevState!==States.FORMING_SPHERE){
      copyTargets(treePos,treeCol);
      for(let i=0;i<NCORE*3;i++){cTgt[i]=cTreePos[i];cTgtCol[i]=cTreeCol[i];}
    }
    debrisPts.visible=true;dMat.opacity=.5;
    corePts.visible=true;
  }
  if(newState===States.IDLE){
    copyTargets(idlePos,idleCol);debrisPts.visible=false;dMat.opacity=0;
    glowShell.visible=false;corePts.visible=false;
  }
  if(newState===States.SCATTERED){
    circleBuf.length=0;dMat.opacity=.85;debrisPts.visible=true;pts.material=pMat;
  }
  if(newState===States.GATHERING){
    pts.material=pMat;
  }
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
      if(detectCircle()){circleDetected=true;setState(States.FORMING_SPHERE);}
    }
    // Timeout: if idle too long, go back to IDLE
    if(stateTime>20&&!handPresent){setState(States.IDLE);}
  }

  if(state===States.FORMING_SPHERE){
    H.textContent=HINTS[5];
    let avgD=0;
    for(let i=0;i<N;i++){const j=i*3;avgD+=Sq((pos[j]-tgt[j])**2+(pos[j+1]-tgt[j+1])**2+(pos[j+2]-tgt[j+2])**2);}
    avgD/=N;
    if(avgD<.06&&stateTime>1.5){setState(States.SPHERE);}
  }

  if(state===States.SPHERE){
    H.textContent=HINTS[6];
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

  if(state===States.FORMING_SPHERE){
    const sk=8,sd=5;
    for(let i=0;i<N;i++){
      const j=i*3;
      vel[j]+=((tgt[j]-pos[j])*sk-vel[j]*sd)*dt;
      vel[j+1]+=((tgt[j+1]-pos[j+1])*sk-vel[j+1]*sd)*dt;
      vel[j+2]+=((tgt[j+2]-pos[j+2])*sk-vel[j+2]*sd)*dt;
    }
    for(let i=0;i<NCORE;i++){
      const j=i*3;
      cVel[j]+=((cTgt[j]-cPos[j])*sk-cVel[j]*sd)*dt;
      cVel[j+1]+=((cTgt[j+1]-cPos[j+1])*sk-cVel[j+1]*sd)*dt;
      cVel[j+2]+=((cTgt[j+2]-cPos[j+2])*sk-cVel[j+2]*sd)*dt;
    }
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      dVel[j]+=((Rn()-.5)*.08-dVel[j]*1.5)*dt;
      dVel[j+1]+=((Rn()-.5)*.08-dVel[j+1]*1.5)*dt;
      dVel[j+2]+=((Rn()-.5)*.04-dVel[j+2]*1.5)*dt;
    }
    pMat.opacity=lerp(pMat.opacity,.85,3*dt);
    cMat.opacity=lerp(cMat.opacity,.9,3*dt);
  }

  if(state===States.SPHERE){
    const sk=5,sd=3.5;
    for(let i=0;i<N;i++){
      const j=i*3;
      vel[j]+=((treePos[j]-pos[j])*sk-vel[j]*sd+((Rn()-.5)*.01))*dt;
      vel[j+1]+=((treePos[j+1]-pos[j+1])*sk-vel[j+1]*sd+((Rn()-.5)*.01))*dt;
      vel[j+2]+=((treePos[j+2]-pos[j+2])*sk-vel[j+2]*sd+((Rn()-.5)*.006))*dt;
      tgtCol[j]=lerp(tgtCol[j],treeCol[j],3*dt);
      tgtCol[j+1]=lerp(tgtCol[j+1],treeCol[j+1],3*dt);
      tgtCol[j+2]=lerp(tgtCol[j+2],treeCol[j+2],3*dt);
    }
    // Core: pulse gently
    for(let i=0;i<NCORE;i++){
      const j=i*3;
      cVel[j]+=((cTreePos[j]-cPos[j])*sk-cVel[j]*sd+((Rn()-.5)*.008))*dt;
      cVel[j+1]+=((cTreePos[j+1]-cPos[j+1])*sk-cVel[j+1]*sd+((Rn()-.5)*.008))*dt;
      cVel[j+2]+=((cTreePos[j+2]-cPos[j+2])*sk-cVel[j+2]*sd+((Rn()-.5)*.005))*dt;
      cTgtCol[j]=lerp(cTgtCol[j],cTreeCol[j],3*dt);
      cTgtCol[j+1]=lerp(cTgtCol[j+1],cTreeCol[j+1],3*dt);
      cTgtCol[j+2]=lerp(cTgtCol[j+2],cTreeCol[j+2],3*dt);
    }
    // Debris orbit
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      const dx=dPos[j],dy=dPos[j+1],dz=dPos[j+2];
      const d=Sq(dx*dx+dy*dy+dz*dz)||.01;
      dVel[j]+=((-dx*.8-dy*.5)*.3-dVel[j]*.7)*dt;
      dVel[j+1]+=((-dy*.8+dx*.3)*.3-dVel[j+1]*.7)*dt;
      dVel[j+2]+=((-dz*.8)*.3-dVel[j+2]*.7)*dt;
      if(d>2.5||d<1.0){dPos[j]=1.5*dx/d;dPos[j+1]=1.5*dy/d;dPos[j+2]=1.5*dz/d;}
      dCol[j]=lerp(dCol[j],.95,2*dt);dCol[j+1]=lerp(dCol[j+1],.8,2*dt);dCol[j+2]=lerp(dCol[j+2],.45,2*dt);
    }
    dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;
    pts.material.opacity=lerp(pts.material.opacity,.88,2*dt);
    cMat.opacity=lerp(cMat.opacity,.92,2*dt);
    bloom.strength=lerp(bloom.strength,.55,2*dt);
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
  // Core update
  for(let i=0;i<NCORE;i++){const j=i*3;cPos[j]+=cVel[j]*dt;cPos[j+1]+=cVel[j+1]*dt;cPos[j+2]+=cVel[j+2]*dt;cCol[j]=lerp(cCol[j],cTgtCol[j],3*dt);cCol[j+1]=lerp(cCol[j+1],cTgtCol[j+1],3*dt);cCol[j+2]=lerp(cCol[j+2],cTgtCol[j+2],3*dt);}
  cGeo.attributes.position.needsUpdate=true;cGeo.attributes.color.needsUpdate=true;
  // Debris update
  for(let i=0;i<DEBRIS_N;i++){const j=i*3;dPos[j]+=dVel[j]*dt;dPos[j+1]+=dVel[j+1]*dt;dPos[j+2]+=dVel[j+2]*dt;}
  dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;

  // ── Ghost update ──────────────────────────────────────────────
  for(let g=0;g<ghosts.length;g++){
    ghosts[g].rotation.y=grp.rotation.y;
    ghosts[g].scale.copy(grp.scale);
    ghosts[g].material.opacity=(state===States.PULSING?.25:.2)-g*.08;
  }

  // ═══════════════════════════════════════════════════════════════
  // SPHERE interactions
  // ═══════════════════════════════════════════════════════════════
  if(state===States.SPHERE){
    // Camera pierces through outer shell toward inner core
    // hand open → camera forward (penetrate), closed → back (outside)
    const tgtZ=6.5-openness*6.1; // closed=6.5 outside, fully open=0.4 near core
    camera.position.z=lerp(camera.position.z,tgtZ,4*dt);
    // Outer sphere fixed scale, slight drift
    grp.scale.lerp(new T.Vector3(1,1,1),2*dt);
    corePts.scale.lerp(new T.Vector3(1,1,1),2*dt);
    // Closer → brighter core
    const close=M.max(0,1-(camera.position.z/3));
    cMat.opacity=lerp(cMat.opacity,.7+close*.3,3*dt);
    if(handPresent){
      grp.rotation.y+=pointDir*1.5*dt;
      corePts.rotation.y+=pointDir*.8*dt;
    }else{
      grp.rotation.y+=dt*.2;
      corePts.rotation.y+=dt*.1;
      camera.position.z=lerp(camera.position.z,6.5,1.5*dt);
    }
    const sName='🔮 光球';
    if(handPresent){
      const l=openness>.5?'🖐':openness<.2?'✊':'✋';
      S.textContent=sName+' · '+l;
      S.className='on';
    }else{
      S.textContent=sName;S.className='on';
    }
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
    S.textContent='✨ 画一个圆来召唤光球';S.className=handPresent?'on':'';
  }else if(state===States.FORMING_SPHERE){
    S.textContent='🔮 光球正在凝聚…';S.className='on';
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
// DEBUG: press 't' to force TREE state for visual testing
addEventListener('keydown',e=>{if(e.key==='s'&&state!==States.SPHERE){copyTargets(treePos,treeCol);for(let i=0;i<NCORE*3;i++){cTgt[i]=cTreePos[i];cTgtCol[i]=cTreeCol[i];}prevState=States.SCATTERED;state=States.SPHERE;stateTime=0;debrisPts.visible=true;dMat.opacity=.5;corePts.visible=true;}});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════
addEventListener('beforeunload',stopCam);
initMP();tick();
