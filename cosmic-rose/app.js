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
const N=12000,NHALO=2000,RING_POOL=4;
const flickerP=new Float32Array(N+NHALO);
for(let i=0;i<N+NHALO;i++)flickerP[i]=Rn()*P*2;
const States={IDLE:0,GATHERING:1,PULSING:2,EXPLODING:3,SCATTERED:4,FORMING_TREE:5,TREE:6};
const HINTS=[
  '伸出食指召唤星辰',
  '星辰坠入漩涡…',
  '',
  '',
  '用手指在空中画一个圆',
  '光之树正在生长…',
  '🖐 张握缩放 · ☜☞ 旋转',
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
camera.position.set(0,.7,6.5);camera.lookAt(0,1.05,0);

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
const hPos=new Float32Array(NHALO*3),hCol=new Float32Array(NHALO*3);

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

// Compute tree shape — PURE STRUCTURE: roots + trunk + branches + foliage
{
  const yc=(y,hue0,hue1,sat0,sat1,lit0,lit1)=>{
    const t=M.min(1,y/2.7),h=lerp(hue0,hue1,t);
    const c=hsl(h,lerp(sat0,sat1,t),lerp(lit0,lit1,t));
    return[c.r,c.g,c.b];
  };
  const col=(y,h0,h1,s0,s1,l0,l1)=>yc(y,h0,h1,s0,s1,l0,l1);

  // Cubic bezier 3D ──────────────────────────────────────────
  const b3=(t,p0,p1,p2,p3)=>{const u=1-t;return[
    u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
    u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1],
    u*u*u*p0[2]+3*u*u*t*p1[2]+3*u*t*t*p2[2]+t*t*t*p3[2]];};

  // Quadratic bezier 3D ──────────────────────────────────────
  const b2=(t,p0,p1,p2)=>{const u=1-t;return[
    u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0],
    u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1],
    u*u*p0[2]+2*u*t*p1[2]+t*t*p2[2]];};

  // Fill a tube segment at curve point with thickness ───────
  const tubePoint=(cp,rad)=>{
    const ang=Rn()*P*2,ca=M.cos(ang),sa=M.sin(ang);
    const rr=Sq(Rn())*rad;
    return{x:cp[0]+rr*ca,y:cp[1]+rr*sa*.35,z:cp[2]+rr*ca};
  };

  let ki=0;
  const setP=(x,y,z,cr,cg,cb)=>{const j=ki*3;treePos[j]=x;treePos[j+1]=y;treePos[j+2]=z;treeCol[j]=cr;treeCol[j+1]=cg;treeCol[j+2]=cb;};

  // ══════ SMOOTH ROOTS: 10 cubic beziers ════════════════════
  const rootDefs=[
    {az:0,   len:.9, drop:.5,  cpOut:.25, cpUp:.08},
    {az:.4,  len:1.0,drop:.55, cpOut:.3,  cpUp:.06},
    {az:.8,  len:.85,drop:.48, cpOut:.22, cpUp:.1},
    {az:1.2, len:1.1,drop:.6,  cpOut:.35, cpUp:.05},
    {az:1.6, len:.95,drop:.52, cpOut:.28, cpUp:.07},
    {az:2.0, len:1.05,drop:.58,cpOut:.32, cpUp:.04},
    {az:2.4, len:.8, drop:.45, cpOut:.2,  cpUp:.09},
    {az:2.8, len:1.15,drop:.62,cpOut:.38, cpUp:.03},
    {az:3.2, len:.9, drop:.5,  cpOut:.26, cpUp:.08},
    {az:3.6, len:1.0,drop:.55, cpOut:.3,  cpUp:.06},
  ];
  for(const rd of rootDefs){
    const az=rd.az+(Rn()-.5)*.12;
    // Control points for smooth arching root
    const p0=[0,.04,0];
    const p1=[C(az)*rd.len*.25, .04-rd.drop*.15, Sf(az)*rd.len*.25];
    const p2=[C(az)*rd.len*.65, .04-rd.drop*.7, Sf(az)*rd.len*.65];
    const p3=[C(az)*rd.len, .04-rd.drop, Sf(az)*rd.len];
    for(let k=0;k<500;k++){
      const t=Rn(),cp=b3(t,p0,p1,p2,p3);
      const rad=lerp(.065,.01,t)*.75;
      const pt=tubePoint(cp,rad);
      const c=col(M.max(.01,cp[1]),38/360,41/360,.36,.46,.46,.60);
      setP(pt.x,pt.y,pt.z,c[0],c[1],c[2]);ki++;
    }
  }

  // ══════ TRUNK ═════════════════════════════════════════════
  const trunkH=1.3;
  for(let i=0;i<1300;i++){
    const y=Rn()*trunkH+.04;
    const rr=Sq(Rn())*lerp(.18,.12,y/trunkH)*.82,ang=Rn()*P*2;
    const c=col(y,39/360,41/360,.38,.44,.50,.64);
    setP(C(ang)*rr,y,Sf(ang)*rr,c[0],c[1],c[2]);ki++;
  }

  // ══════ BRANCHES: 15 main, each with subs + twigs ═════════
  const NBR=15,brP=400,subP=150,twigP=60,tipP=60;
  for(let b=0;b<NBR;b++){
    const tt=.08+(b/(NBR-1))*.68;
    const y0=lerp(.18,trunkH*.9,tt);
    const trR=lerp(.16,.1,tt)*.78;
    const baseAz=b/NBR*P*2+(Rn()-.5)*.4;
    const bx=C(baseAz)*trR,by=y0,bz=Sf(baseAz)*trR;
    // Branch endpoint
    const el=.08+Rn()*.28,len=.55+Rn()*.7;
    const mx=C(baseAz)*C(el),my=Sf(el),mz=Sf(baseAz)*C(el);
    const ex=bx+mx*len,ey=by+my*len,ez=bz+mz*len;
    // Control point bows outward & slightly up
    const bow=.12+Rn()*.28;
    const cpX=lerp(bx,ex,.45)+C(baseAz)*bow,cpY=lerp(by,ey,.4)+.12+Rn()*.15,cpZ=lerp(bz,ez,.45)+Sf(baseAz)*bow;

    // Main branch tube
    for(let k=0;k<brP;k++){
      const t=Rn(),cp=b2(t,[bx,by,bz],[cpX,cpY,cpZ],[ex,ey,ez]);
      const rad=lerp(.042,.018,t)*.7;
      const pt=tubePoint(cp,rad);
      const c=col(cp[1],38/360,42/360,.36,.42,.54,.76);
      setP(pt.x,pt.y,pt.z,c[0],c[1],c[2]);ki++;
    }
    // Sub-branches
    const nSub=2+M.floor(Rn()*3);
    for(let s=0;s<nSub;s++){
      const bt=.25+Rn()*.45;
      const sb=b2(bt,[bx,by,bz],[cpX,cpY,cpZ],[ex,ey,ez]);
      const saz=Rn()*P*2,sel=.05+Rn()*.35,slen=.12+Rn()*.26;
      const sex=sb[0]+C(saz)*C(sel)*slen,sey=sb[1]+Sf(sel)*slen,sez=sb[2]+Sf(saz)*C(sel)*slen;
      const scX=lerp(sb[0],sex,.45)+(Rn()-.5)*.08,scY=lerp(sb[1],sey,.4)+(Rn()-.5)*.06,scZ=lerp(sb[2],sez,.45)+(Rn()-.5)*.08;
      for(let k=0;k<subP;k++){
        const t2=Rn(),cp2=b2(t2,sb,[scX,scY,scZ],[sex,sey,sez]);
        const rad2=lerp(.025,.012,t2)*.6;
        const pt2=tubePoint(cp2,rad2);
        const c2=col(cp2[1],39/360,43/360,.34,.40,.60,.84);
        setP(pt2.x,pt2.y,pt2.z,c2[0],c2[1],c2[2]);ki++;
      }
      // Twigs from sub-branch
      const nTwig=1+M.floor(Rn()*2);
      for(let w=0;w<nTwig;w++){
        const wt=.35+Rn()*.4;
        const tw=b2(wt,sb,[scX,scY,scZ],[sex,sey,sez]);
        const waz=Rn()*P*2,wel=.05+Rn()*.3,wlen=.06+Rn()*.14;
        const wex=tw[0]+C(waz)*C(wel)*wlen,wey=tw[1]+Sf(wel)*wlen,wez=tw[2]+Sf(waz)*C(wel)*wlen;
        for(let k=0;k<twigP;k++){
          const t3=Rn(),cp3=lerp(tw[0],wex,t3),cp3y=lerp(tw[1],wey,t3),cp3z=lerp(tw[2],wez,t3);
          const rad3=lerp(.015,.006,t3)*.55;
          const pt3=tubePoint([cp3,cp3y,cp3z],rad3);
          const c3=col(cp3y,40/360,44/360,.30,.38,.66,.88);
          setP(pt3.x,pt3.y,pt3.z,c3[0],c3[1],c3[2]);ki++;
        }
      }
      // Foliage cluster at sub-branch tip
      for(let k=0;k<tipP;k++){
        const cr=.08,phi=M.acos(2*Rn()-1),th=Rn()*P*2,rd=Sq(Rn())*cr;
        const c4=col(sey,41/360,44/360,.26,.34,.68,.90);
        setP(sex+rd*Sf(phi)*C(th),sey+rd*Sf(phi)*Sf(th)*.65,sez+rd*C(phi),c4[0],c4[1],c4[2]);ki++;
      }
    }
  }

  // Fill any remaining slots with branch-like structure
  while(ki<N){
    const ci=M.floor(Rn()*NBR);
    const tt=.08+(ci/(NBR-1))*.68;
    const y0=lerp(.18,trunkH*.9,tt);
    const trR=lerp(.16,.1,tt)*.78;
    const baseAz=ci/NBR*P*2+(Rn()-.5)*.5;
    const bx=C(baseAz)*trR,by=y0,bz=Sf(baseAz)*trR;
    const el=.08+Rn()*.28,len=.55+Rn()*.7;
    const mx=C(baseAz)*C(el),my=Sf(el),mz=Sf(baseAz)*C(el);
    const ex=bx+mx*len,ey=by+my*len,ez=bz+mz*len;
    const bow=.12+Rn()*.28;
    const cpX=lerp(bx,ex,.45)+C(baseAz)*bow,cpY=lerp(by,ey,.4)+.12+Rn()*.15,cpZ=lerp(bz,ez,.45)+Sf(baseAz)*bow;
    const t=Rn(),cp=b2(t,[bx,by,bz],[cpX,cpY,cpZ],[ex,ey,ez]);
    const rad=lerp(.042,.018,t)*.7;
    const pt=tubePoint(cp,rad);
    const c=col(cp[1],38/360,43/360,.34,.40,.56,.80);
    setP(pt.x,pt.y,pt.z,c[0],c[1],c[2]);ki++;
  }

  // Halo: scatter around branch tips only (canopy rim light)
  for(let i=0;i<NHALO;i++){
    const ci=M.floor(Rn()*NBR);
    const tt=.08+(ci/(NBR-1))*.68;
    const y0=lerp(.18,trunkH*.9,tt);
    const trR=lerp(.16,.1,tt)*.78;
    const baseAz=ci/NBR*P*2+(Rn()-.5)*.5;
    const bx=C(baseAz)*trR,by=y0,bz=Sf(baseAz)*trR;
    const el=.08+Rn()*.28,len=.55+Rn()*.7;
    const mx=C(baseAz)*C(el),my=Sf(el),mz=Sf(baseAz)*C(el);
    const ex=bx+mx*len,ey=by+my*len,ez=bz+mz*len;
    const bow=.12+Rn()*.28;
    const cpX=lerp(bx,ex,.45)+C(baseAz)*bow,cpY=lerp(by,ey,.4)+.12+Rn()*.15,cpZ=lerp(bz,ez,.45)+Sf(baseAz)*bow;
    // Halo near branch tips (t > 0.7)
    const t=.7+Rn()*.3,cp=b2(t,[bx,by,bz],[cpX,cpY,cpZ],[ex,ey,ez]);
    const rad=.04+(Rn()-.3)*.08,rr=rad;
    const ang=Rn()*P*2;
    const j=i*3;
    hPos[j]=cp[0]+M.cos(ang)*rr;hPos[j+1]=cp[1]+M.sin(ang)*rr*.4;hPos[j+2]=cp[2]+M.sin(ang)*rr;
    const c=col(cp[1],41/360,44/360,.24,.30,.68,.92);
    hCol[j]=c[0];hCol[j+1]=c[1];hCol[j+2]=c[2];
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
const pMat=new T.PointsMaterial({size:.028,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
const treeMat=new T.PointsMaterial({size:.05,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
const pts=new T.Points(pGeo,pMat);
// Surface halo: soft glow rim on silhouette
const hGeo=mkGeo(hPos,hCol);
const hMat=new T.PointsMaterial({size:.12,map:softSprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:.35});
const haloPts=new T.Points(hGeo,hMat);
hGeo.attributes.position.needsUpdate=true;hGeo.attributes.color.needsUpdate=true;
haloPts.visible=false;
const grp=new T.Group();grp.add(pts);grp.add(haloPts);scene.add(grp);

// ── Ghost trails ────────────────────────────────────────────────
const ghosts=[];
for(let g=0;g<2;g++){
  const m=new T.PointsMaterial({size:.014-.004*g,map:sprite,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:.35-g*.15});
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
  if(newState===States.FORMING_TREE){
    copyTargets(treePos,treeCol);
    debrisPts.visible=true;dMat.opacity=.85;
    pts.material=treeMat;
  }
  if(newState===States.TREE){
    if(prevState!==States.FORMING_TREE)copyTargets(treePos,treeCol);
    debrisPts.visible=true;dMat.opacity=.6;
    pts.material=treeMat;haloPts.visible=true;hMat.opacity=.35;
  }
  if(newState===States.IDLE){
    copyTargets(idlePos,idleCol);debrisPts.visible=false;dMat.opacity=0;
    glowShell.visible=false;pts.material=pMat;haloPts.visible=false;
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
      if(detectCircle()){circleDetected=true;setState(States.FORMING_TREE);}
    }
    // Timeout: if idle too long, go back to IDLE
    if(stateTime>20&&!handPresent){setState(States.IDLE);}
  }

  if(state===States.FORMING_TREE){
    H.textContent=HINTS[5];
    // Check if particles settled
    let avgD=0;
    for(let i=0;i<N;i++){const j=i*3;avgD+=Sq((pos[j]-tgt[j])**2+(pos[j+1]-tgt[j+1])**2+(pos[j+2]-tgt[j+2])**2);}
    avgD/=N;
    if(avgD<.06&&stateTime>1.5){setState(States.TREE);}
  }

  if(state===States.TREE){
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

  if(state===States.FORMING_TREE){
    // Spring to target positions
    const springK=8,springD=5;
    for(let i=0;i<N;i++){
      const j=i*3;
      vel[j]+=((tgt[j]-pos[j])*springK-vel[j]*springD)*dt;
      vel[j+1]+=((tgt[j+1]-pos[j+1])*springK-vel[j+1]*springD)*dt;
      vel[j+2]+=((tgt[j+2]-pos[j+2])*springK-vel[j+2]*springD)*dt;
    }
    // Debris dissipates
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      dVel[j]+=((Rn()-.5)*.08-dVel[j]*1.5)*dt;
      dVel[j+1]+=((Rn()-.5)*.08-dVel[j+1]*1.5)*dt;
      dVel[j+2]+=((Rn()-.5)*.04-dVel[j+2]*1.5)*dt;
    }
    pMat.opacity=lerp(pMat.opacity,.85,3*dt);
  }

  if(state===States.TREE){
    // Gentle wobble toward treePos, color toward treeCol
    for(let i=0;i<N;i++){
      const j=i*3;
      const k=6,dmp=4;
      vel[j]+=((treePos[j]-pos[j])*k-vel[j]*dmp+((Rn()-.5)*.015))*dt;
      vel[j+1]+=((treePos[j+1]-pos[j+1])*k-vel[j+1]*dmp+((Rn()-.5)*.015))*dt;
      vel[j+2]+=((treePos[j+2]-pos[j+2])*k-vel[j+2]*dmp+((Rn()-.5)*.008))*dt;
      tgtCol[j]=lerp(tgtCol[j],treeCol[j],4*dt);
      tgtCol[j+1]=lerp(tgtCol[j+1],treeCol[j+1],4*dt);
      tgtCol[j+2]=lerp(tgtCol[j+2],treeCol[j+2],4*dt);
    }
    // Micro-flicker: update only 5% of particles per frame
    const fc=M.floor(N*.05),fs=M.floor(Rn()*(N-fc));
    for(let i=fs;i<fs+fc;i++){
      flickerP[i]+=dt;
      const bMul=1.08+.07*M.sin(flickerP[i]*6.7);
      const j=i*3;
      tgtCol[j]=lerp(tgtCol[j],treeCol[j]*bMul,8*dt);
      tgtCol[j+1]=lerp(tgtCol[j+1],treeCol[j+1]*bMul,8*dt);
      tgtCol[j+2]=lerp(tgtCol[j+2],treeCol[j+2]*bMul,8*dt);
    }
    // Incense smoke rising from canopy
    for(let i=0;i<DEBRIS_N;i++){
      const j=i*3;
      dVel[j]+=((Rn()-.5)*.05-dVel[j]*.4)*dt;
      dVel[j+1]+=.07*dt;
      dVel[j+2]+=((Rn()-.5)*.05-dVel[j+2]*.4)*dt;
      if(dPos[j+1]>3.8||dPos[j+1]<-1){
        const ang=Rn()*P*2,rad=Rn()*1.4;
        dPos[j]=C(ang)*rad;dPos[j+1]=1.5+Rn()*1.8;dPos[j+2]=Sf(ang)*rad;
        dVel[j]=(Rn()-.5)*.06;dVel[j+1]=.03+Rn()*.1;dVel[j+2]=(Rn()-.5)*.06;
      }
      dCol[j]=lerp(dCol[j],.98,2*dt);dCol[j+1]=lerp(dCol[j+1],.85,2*dt);dCol[j+2]=lerp(dCol[j+2],.5,2*dt);
    }
    dGeo.attributes.position.needsUpdate=true;dGeo.attributes.color.needsUpdate=true;
    pts.material.opacity=lerp(pts.material.opacity,.88,2*dt);
    bloom.strength=lerp(bloom.strength,.5,2*dt);
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

  // ── Ghost update ──────────────────────────────────────────────
  for(let g=0;g<ghosts.length;g++){
    ghosts[g].rotation.y=grp.rotation.y;
    ghosts[g].scale.copy(grp.scale);
    ghosts[g].material.opacity=(state===States.PULSING?.25:.2)-g*.08;
  }

  // ═══════════════════════════════════════════════════════════════
  // TREE interactions
  // ═══════════════════════════════════════════════════════════════
  if(state===States.TREE){
    if(handPresent){
      const tgtScale=1.8-openness*1.5;
      grp.scale.lerp(new T.Vector3(tgtScale,tgtScale,tgtScale),8*dt);
      const rotSpd=pointDir*2.5;
      grp.rotation.y+=rotSpd*dt;
    }else{
      grp.rotation.y+=dt*.15;
      grp.scale.lerp(new T.Vector3(1,1,1),1.5*dt);
    }
    const sName='🌳 光之树';
    if(handPresent){
      const l=openness>.55?'🖐':openness<.22?'✊':'✋';
      S.textContent=sName+' · '+l+(pointDir<-.08?' ↺':pointDir>.08?' ↻':'');
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
    S.textContent='✨ 画一个圆来创造光之树';S.className=handPresent?'on':'';
  }else if(state===States.FORMING_TREE){
    S.textContent='🌳 光之树正在生长…';S.className='on';
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
addEventListener('keydown',e=>{if(e.key==='t'&&state!==States.TREE){copyTargets(treePos,treeCol);prevState=States.SCATTERED;state=States.TREE;stateTime=0;debrisPts.visible=true;dMat.opacity=.6;pts.material=treeMat;haloPts.visible=true;hMat.opacity=.35;}});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════
addEventListener('beforeunload',stopCam);
initMP();tick();
