/* ═══════════════════════════════════════════════════════
   MolecuLens — app.js 
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── MOLECULE DATA ────────────────────────────────────── */
const MOLECULES = {
  ethane: {
    name: 'Ethane',
    atoms: [
      { el:'C', pos:[0,0,0] },
      { el:'C', pos:[1.54,0,0] },
      { el:'H', pos:[-0.62, 0.93,  0.00] },
      { el:'H', pos:[-0.62,-0.46,  0.80] },
      { el:'H', pos:[-0.62,-0.46, -0.80] },
      { el:'H', pos:[ 2.16, 0.93,  0.00] },
      { el:'H', pos:[ 2.16,-0.46,  0.80] },
      { el:'H', pos:[ 2.16,-0.46, -0.80] }
    ],
    bonds:[[0,1],[0,2],[0,3],[0,4],[1,5],[1,6],[1,7]],
    /* V = 6.3·(1 + cos3φ)  barrier ≈ 12.6 kJ/mol */
    energyFn: phi => 6.3*(1+Math.cos(3*phi*Math.PI/180)),
    frontGroups:['H','H','H'],
    backGroups: ['H','H','H']
  },
  butane: {
    name: 'Butane',
    atoms: [
      { el:'C', pos:[0,0,0] },
      { el:'C', pos:[1.54,0,0] },
      { el:'C', pos:[-0.77,1.26, 0] },
      { el:'C', pos:[ 2.31,1.26, 0] },
      { el:'H', pos:[-0.36,-0.51, 0.89] },
      { el:'H', pos:[-0.36,-0.51,-0.89] },
      { el:'H', pos:[ 1.90,-0.51, 0.89] },
      { el:'H', pos:[ 1.90,-0.51,-0.89] },
      { el:'H', pos:[-0.77, 1.90, 0.89] },
      { el:'H', pos:[-0.77, 1.90,-0.89] },
      { el:'H', pos:[-1.84, 1.06, 0.00] },
      { el:'H', pos:[ 2.31, 1.90, 0.89] },
      { el:'H', pos:[ 2.31, 1.90,-0.89] },
      { el:'H', pos:[ 3.38, 1.06, 0.00] }
    ],
    bonds:[[0,1],[0,2],[0,4],[0,5],[1,3],[1,6],[1,7],
           [2,8],[2,9],[2,10],[3,11],[3,12],[3,13]],
    /* asymmetric 3-barrier profile */
    energyFn: phi => {
      const r = phi*Math.PI/180;
      return 11.3 - 3.8*Math.cos(r) - 3.8*Math.cos(3*r) + 0.7*Math.cos(2*r);
    },
    frontGroups:['CH₃','H','H'],
    backGroups: ['CH₃','H','H']
  }
};

const CONF_DESCS = {
  'Eclipsed':
    'All substituents on front & back carbons are directly aligned — maximum torsional (Pitzer) strain.',
  'Staggered (gauche)':
    'Substituents alternate; groups are 60° apart — low torsional strain, moderate stability.',
  'Anti (staggered)':
    'Large groups are 180° apart — maximum separation, minimum strain, most stable conformation.',
  'Intermediate':
    'Angle between a minimum and maximum — intermediate energy state.'
};

function getConformationInfo(angle) {
  const a = ((angle%360)+360)%360, tol=12;
  if (a<=tol||a>=360-tol)             return {name:'Eclipsed',         color:'#f87171'};
  if (Math.abs(a-60) <=tol)           return {name:'Staggered (gauche)',color:'#3de6a0'};
  if (Math.abs(a-120)<=tol)           return {name:'Eclipsed',         color:'#f87171'};
  if (Math.abs(a-180)<=tol)           return {name:'Anti (staggered)', color:'#3de6a0'};
  if (Math.abs(a-240)<=tol)           return {name:'Staggered (gauche)',color:'#3de6a0'};
  if (Math.abs(a-300)<=tol)           return {name:'Eclipsed',         color:'#f87171'};
  return {name:'Intermediate',         color:'#f97316'};
}

/* ── STATE ────────────────────────────────────────────── */
let currentMol    = 'ethane';
let dihedralAngle = 0;
let autoRotating  = false;
let autoRotateRaf = null;
let wireframeMode = false;

/* ── THREE.JS globals ─────────────────────────────────── */
let renderer, scene, camera, molGroup;
let spheres=[], sticks=[];
let isDragging=false, prevMouse={x:0,y:0};

/* ── Chart.js global ──────────────────────────────────── */
let energyChart;

/* ══════════════════════════════════════════════════════
   1.  THREE.JS — 3-D VIEWER
   ══════════════════════════════════════════════════════ */
function init3D() {
  const container = document.getElementById('canvas3d');
  const W = container.clientWidth || 420;
  const H = container.clientHeight || 300;

  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0xdce8f8, 1);
  container.appendChild(renderer.domElement);

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 100);
  camera.position.set(0,0,8);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(5,8,6);
  scene.add(sun);
  const fill = new THREE.PointLight(0x4fa3f7, 0.5, 30);
  fill.position.set(-4,-3,4);
  scene.add(fill);

  molGroup = new THREE.Group();
  scene.add(molGroup);

  buildMolecule();

  // mouse drag
  const el = renderer.domElement;
  el.addEventListener('mousedown', e=>{isDragging=true;prevMouse={x:e.clientX,y:e.clientY};});
  window.addEventListener('mouseup',  ()=>{isDragging=false;});
  window.addEventListener('mousemove', e=>{
    if(!isDragging) return;
    molGroup.rotation.y += (e.clientX-prevMouse.x)*0.012;
    molGroup.rotation.x += (e.clientY-prevMouse.y)*0.012;
    prevMouse={x:e.clientX,y:e.clientY};
  });
  el.addEventListener('wheel', e=>{
    e.preventDefault();
    camera.position.z = Math.max(3,Math.min(20,camera.position.z+e.deltaY*0.012));
  },{passive:false});

  // touch
  el.addEventListener('touchstart',e=>{isDragging=true;prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  window.addEventListener('touchend',()=>{isDragging=false;});
  window.addEventListener('touchmove',e=>{
    if(!isDragging) return;
    molGroup.rotation.y+=(e.touches[0].clientX-prevMouse.x)*0.012;
    molGroup.rotation.x+=(e.touches[0].clientY-prevMouse.y)*0.012;
    prevMouse={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});

  window.addEventListener('resize',()=>{
    const W2=container.clientWidth, H2=container.clientHeight;
    camera.aspect=W2/H2; camera.updateProjectionMatrix();
    renderer.setSize(W2,H2);
  });

  (function loop(){requestAnimationFrame(loop);renderer.render(scene,camera);})();
}

const ATOM_COLOR={C:0x3a5fc4,H:0x8899cc,O:0xd94444,N:0x22aa55};
const ATOM_R    ={C:0.38,   H:0.22,   O:0.36,   N:0.36};
const BOND_COL  =0x0da86a;

function buildMolecule() {
  while(molGroup.children.length) molGroup.remove(molGroup.children[0]);
  spheres=[]; sticks=[];
  const mol=MOLECULES[currentMol];

  // centre
  let cx=0,cy=0,cz=0;
  mol.atoms.forEach(a=>{cx+=a.pos[0];cy+=a.pos[1];cz+=a.pos[2];});
  cx/=mol.atoms.length; cy/=mol.atoms.length; cz/=mol.atoms.length;

  const P = mol.atoms.map(a=>new THREE.Vector3(a.pos[0]-cx,a.pos[1]-cy,a.pos[2]-cz));

  mol.atoms.forEach((atom,i)=>{
    const geo=new THREE.SphereGeometry(ATOM_R[atom.el]||0.28,24,24);
    const mat=new THREE.MeshPhongMaterial({color:ATOM_COLOR[atom.el]||0xaaaaaa,shininess:80,wireframe:wireframeMode});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.copy(P[i]);
    molGroup.add(mesh); spheres.push(mesh);
  });

  mol.bonds.forEach(([a,b])=>{
    const dir=new THREE.Vector3().subVectors(P[b],P[a]);
    const len=dir.length();
    const mid=new THREE.Vector3().addVectors(P[a],P[b]).multiplyScalar(0.5);
    const geo=new THREE.CylinderGeometry(0.07,0.07,len,12);
    const mat=new THREE.MeshPhongMaterial({color:BOND_COL,shininess:60,wireframe:wireframeMode});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
    molGroup.add(mesh); sticks.push(mesh);
  });
}

function setWireframe(on){
  wireframeMode=on;
  [...spheres,...sticks].forEach(m=>m.material.wireframe=on);
}

function toggleAutoRotate(){
  autoRotating=!autoRotating;
  const btn=document.getElementById('btnAutoRotate');
  if(autoRotating){
    btn.classList.add('active'); btn.textContent='⏸ Auto Rotate';
    (function spin(){if(!autoRotating)return;molGroup.rotation.y+=0.008;autoRotateRaf=requestAnimationFrame(spin);})();
  } else {
    btn.classList.remove('active'); btn.textContent='▶ Auto Rotate';
    if(autoRotateRaf) cancelAnimationFrame(autoRotateRaf);
  }
}

/* ══════════════════════════════════════════════════════
   2.  NEWMAN PROJECTION
   ══════════════════════════════════════════════════════ */
function drawNewman(angle) {
  const canvas = document.getElementById('newmanCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const cx=W/2, cy=H/2;
  const R=W*0.33;
  const armLen=R*0.82;

  // clear + background (light)
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#eef4fc';
  ctx.fillRect(0,0,W,H);

  // subtle radial glow
  const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.2);
  glow.addColorStop(0,'rgba(13,168,106,0.06)');
  glow.addColorStop(1,'transparent');
  ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);

  const phi = angle*Math.PI/180;
  const mol  = MOLECULES[currentMol];

  // ── back-carbon dashed bonds ──
  const backBase = -Math.PI/2 + phi;
  [0,1,2].forEach(i=>{
    const a = backBase + i*(2*Math.PI/3);
    const sx=cx+R*Math.cos(a), sy=cy+R*Math.sin(a);
    const ex=cx+(R+armLen*0.55)*Math.cos(a), ey=cy+(R+armLen*0.55)*Math.sin(a);

    ctx.save();
    ctx.setLineDash([5,4]);
    ctx.lineWidth=2.2;
    ctx.strokeStyle='#2f85e0';
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.restore();

    const lx=cx+(R+armLen*0.55+20)*Math.cos(a);
    const ly=cy+(R+armLen*0.55+20)*Math.sin(a);
    ctx.font="bold 13px 'Space Mono',monospace";
    ctx.fillStyle='#2f5fa8';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(mol.backGroups[i]||'X', lx, ly);
  });

  // ── big circle ──
  ctx.beginPath();
  ctx.arc(cx,cy,R,0,2*Math.PI);
  ctx.strokeStyle='#b0c4de';
  ctx.lineWidth=2.5;
  ctx.stroke();

  // ── front-carbon solid bonds ──
  const frontBase = -Math.PI/2;
  [0,1,2].forEach(i=>{
    const a = frontBase + i*(2*Math.PI/3);
    const ex=cx+armLen*Math.cos(a), ey=cy+armLen*Math.sin(a);

    ctx.lineWidth=2.8;
    ctx.strokeStyle='#0da86a';
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();

    ctx.beginPath(); ctx.arc(ex,ey,5,0,2*Math.PI);
    ctx.fillStyle='#0da86a'; ctx.fill();

    const lx=cx+(armLen+18)*Math.cos(a);
    const ly=cy+(armLen+18)*Math.sin(a);
    ctx.font="bold 13px 'Space Mono',monospace";
    ctx.fillStyle='#0a7a4e';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(mol.frontGroups[i]||'X', lx, ly);
  });

  // ── front-carbon centre dot ──
  ctx.beginPath(); ctx.arc(cx,cy,11,0,2*Math.PI);
  ctx.fillStyle='#0da86a'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,7,0,2*Math.PI);
  ctx.fillStyle='#eef4fc'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,4,0,2*Math.PI);
  ctx.fillStyle='#0da86a'; ctx.fill();

  // ── dihedral arc indicator ──
  const arcR=36;
  const frontRef=frontBase;
  const backRef =backBase;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,arcR,frontRef,backRef, false);
  ctx.strokeStyle='rgba(233,107,16,0.85)';
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.restore();

  const midA=(frontRef+backRef)/2;
  const lx2=cx+(arcR+24)*Math.cos(midA);
  const ly2=cy+(arcR+24)*Math.sin(midA);
  ctx.font="10px 'Space Mono',monospace";
  ctx.fillStyle='#e96b10';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('φ='+angle+'°', lx2, ly2);

  // ── legend ──
  ctx.font="9px 'DM Sans',sans-serif";
  ctx.textAlign='left';

  ctx.fillStyle='#0da86a';
  ctx.fillRect(8,H-30,18,3);
  ctx.fillStyle='#4a6080';
  ctx.fillText('Front C', 30,H-27);

  ctx.save();
  ctx.setLineDash([4,3]);
  ctx.strokeStyle='#2f85e0'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(8,H-15); ctx.lineTo(26,H-15); ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#4a6080';
  ctx.fillText('Back C', 30,H-13);
}

/* ══════════════════════════════════════════════════════
   3.  ENERGY CHART
   ══════════════════════════════════════════════════════ */
function buildEnergyPoints() {
  const mol=MOLECULES[currentMol];
  const pts=[];
  for(let a=0;a<=360;a+=3) pts.push({x:a, y:+mol.energyFn(a).toFixed(3)});
  return pts;
}

function initChart() {
  const ctx=document.getElementById('energyChart').getContext('2d');

  const grad=ctx.createLinearGradient(0,0,0,230);
  grad.addColorStop(0,'rgba(233,107,16,0.30)');
  grad.addColorStop(0.65,'rgba(233,107,16,0.05)');
  grad.addColorStop(1,'transparent');

  energyChart=new Chart(ctx,{
    type:'scatter',
    data:{
      datasets:[
        {
          label:'Energy',
          data: buildEnergyPoints(),
          borderColor:'#e96b10',
          backgroundColor: grad,
          borderWidth:2.5,
          pointRadius:0,
          tension:0.4,
          showLine:true,
          fill:true,
          order:2
        },
        {
          label:'Current',
          data:[],
          borderColor:'#0da86a',
          backgroundColor:'#0da86a',
          pointRadius:9,
          pointHoverRadius:11,
          pointBorderColor:'#fff',
          pointBorderWidth:2.5,
          showLine:false,
          fill:false,
          order:1
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:0},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#ffffff',
          borderColor:'#d0daea',
          borderWidth:1,
          titleColor:'#1a2540',
          bodyColor:'#4a6080',
          filter: item=>item.datasetIndex===0,
          callbacks:{
            title: items=>`φ = ${items[0].parsed.x}°`,
            label: item=>`Energy: ${item.parsed.y.toFixed(1)} kJ/mol`
          }
        }
      },
      scales:{
        x:{
          type:'linear',
          min:0, max:360,
          title:{display:true, text:'Dihedral Angle φ (degrees)', color:'#4a6080', font:{family:'Space Mono',size:11}},
          ticks:{
            color:'#8aa0be', font:{size:10},
            stepSize:60,
            callback:v=>v+'°'
          },
          grid:{color:'rgba(180,200,220,0.5)'}
        },
        y:{
          title:{display:true, text:'Potential Energy (kJ/mol)', color:'#4a6080', font:{family:'Space Mono',size:11}},
          ticks:{color:'#8aa0be', font:{size:10}, callback:v=>v+' kJ'},
          grid:{color:'rgba(180,200,220,0.5)'},
          beginAtZero:true
        }
      }
    }
  });
}

function refreshChart() {
  energyChart.data.datasets[0].data = buildEnergyPoints();
  updateChartMarker(dihedralAngle);
}

function updateChartMarker(angle) {
  const e=+MOLECULES[currentMol].energyFn(angle).toFixed(2);
  energyChart.data.datasets[1].data=[{x:angle, y:e}];
  energyChart.update('none');
}

/* ══════════════════════════════════════════════════════
   4.  INFO PANEL
   ══════════════════════════════════════════════════════ */
function updateInfo(angle) {
  const mol=MOLECULES[currentMol];
  const e=+mol.energyFn(angle).toFixed(1);
  const ci=getConformationInfo(angle);

  document.getElementById('confName').textContent  = ci.name;
  document.getElementById('confName').style.color  = ci.color;
  document.getElementById('confDesc').textContent  = CONF_DESCS[ci.name]||'';
  document.getElementById('energyVal').textContent = e;
  document.getElementById('dihedralLabel').textContent = angle+'°';

  document.getElementById('erAngle').textContent  = angle+'°';
  document.getElementById('erEnergy').textContent = e;
  document.getElementById('erConf').textContent   = ci.name;
  document.getElementById('erConf').style.color   = ci.color;
}

/* ══════════════════════════════════════════════════════
   5.  SYNC EVERYTHING
   ══════════════════════════════════════════════════════ */
function syncAll(angle) {
  dihedralAngle = ((angle%360)+360)%360;

  document.getElementById('dihedralSlider').value = dihedralAngle;

  // highlight preset button
  document.querySelectorAll('.conf-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.angle)===dihedralAngle);
  });

  drawNewman(dihedralAngle);
  updateChartMarker(dihedralAngle);
  updateInfo(dihedralAngle);
}

/* ══════════════════════════════════════════════════════
   6.  EVENT BINDINGS
   ══════════════════════════════════════════════════════ */
function bindEvents() {
  // slider
  document.getElementById('dihedralSlider').addEventListener('input', e=>{
    syncAll(parseInt(e.target.value));
  });

  // preset buttons
  document.querySelectorAll('.conf-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      syncAll(parseInt(btn.dataset.angle));
    });
  });

  // molecule picker
  document.getElementById('molSelect').addEventListener('change', e=>{
    currentMol=e.target.value;
    buildMolecule();
    refreshChart();
    syncAll(dihedralAngle);
  });

  // 3D controls
  document.getElementById('btnReset3d').addEventListener('click', ()=>{
    molGroup.rotation.set(0.35,0.35,0);
    camera.position.z=8;
  });
  document.getElementById('btnBalls').addEventListener('click', function(){
    setWireframe(false);
    this.classList.add('active');
    document.getElementById('btnWire').classList.remove('active');
  });
  document.getElementById('btnWire').addEventListener('click', function(){
    setWireframe(true);
    this.classList.add('active');
    document.getElementById('btnBalls').classList.remove('active');
  });
  document.getElementById('btnAutoRotate').addEventListener('click', toggleAutoRotate);
}

/* ══════════════════════════════════════════════════════
   7.  BOOT
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', ()=>{
  init3D();
  initChart();
  bindEvents();
  syncAll(0);
  molGroup.rotation.set(0.35,0.35,0);
});
