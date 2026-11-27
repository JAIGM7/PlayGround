import * as THREE from 'three';

const app=document.getElementById('app');
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x050817); scene.fog=new THREE.FogExp2(0x050817,.035);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,100);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; app.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0x8ecfff,0x07101c,1.8));
const sun=new THREE.DirectionalLight(0xbfeeff,2.4); sun.position.set(-8,14,8); sun.castShadow=true; scene.add(sun);

const gridSize=17, cell=1.12, wallH=1.55;
let maze, player, goal, shards=[], portals=[], movingWalls=[], enemies=[], particles;
let px=1,pz=1, collected=0, stability=100, started=false, level=1, moveCooldown=0, shake=0;
const wallMat=new THREE.MeshStandardMaterial({color:0x14294a,roughness:.35,metalness:.62,emissive:0x07172d,emissiveIntensity:.7});
const wallSide=new THREE.MeshStandardMaterial({color:0x274a75,roughness:.25,metalness:.75,emissive:0x102b50,emissiveIntensity:.5});

function seededMaze(){
  const m=Array.from({length:gridSize},()=>Array(gridSize).fill(1));
  function carve(x,y){m[y][x]=0; const dirs=[[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-.5); for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<gridSize-1&&ny<gridSize-1&&m[ny][nx]===1){m[y+dy/2][x+dx/2]=0;carve(nx,ny)}}}
  carve(1,1);
  // Open a few loops and scattered chambers
  for(let i=0;i<22;i++){const x=1+Math.floor(Math.random()*15),y=1+Math.floor(Math.random()*15);if(m[y]&&m[x])m[y][x]=0}
  m[1][1]=0; m[gridSize-2][gridSize-2]=0;
  return m;
}
function clearGroup(g){while(g.children.length){const o=g.children.pop();o.geometry?.dispose?.();g.remove(o)}}

function buildLevel(){
  if(maze)clearGroup(maze);
  maze=new THREE.Group(); scene.add(maze);
  if(particles)clearGroup(particles);
  particles=new THREE.Group();scene.add(particles);
  movingWalls=[];shards=[];portals=[];enemies=[];
  const layout=seededMaze();
  const floorGeo=new THREE.BoxGeometry(gridSize*cell,.12,gridSize*cell);
  const floor=new THREE.Mesh(floorGeo,new THREE.MeshStandardMaterial({color:0x091326,roughness:.7,metalness:.3})); floor.position.y=-.08;floor.receiveShadow=true;maze.add(floor);
  for(let y=0;y<gridSize;y++)for(let x=0;x<gridSize;x++)if(layout[y][x]){
    const g=new THREE.BoxGeometry(cell,.15*0+wallH,cell); const wall=new THREE.Mesh(g,wallMat);wall.position.set((x-(gridSize-1)/2)*cell,wallH/2,(y-(gridSize-1)/2)*cell);wall.castShadow=true;wall.receiveShadow=true;wall.userData.base=wall.position.y;maze.add(wall);
  }
  // floor grid
  const grid=new THREE.GridHelper(gridSize*cell,gridSize,0x1c5574,0x102840);grid.position.y=.01;maze.add(grid);
  // shards
  const open=[];for(let y=2;y<gridSize-2;y++)for(let x=2;x<gridSize-2;x++)if(!layout[y][x])open.push([x,y]); open.sort(()=>Math.random-.5);
  for(let i=0;i<3;i++){const [x,y]=open[i*37%open.length];const orb=new THREE.Mesh(new THREE.OctahedronGeometry(.27,0),new THREE.MeshStandardMaterial({color:i===0?0x67e8f9:i===1?0xff4fd8:0xffd84d,emissive:i===0?0x24a8c8:i===1?0xc828a8:0xaa7810,emissiveIntensity:2,metalness:.5,roughness:.15}));orb.position.set((x-8)*cell,.55,(y-8)*cell);orb.userData={collected:false,base:.55,phase:i*2};maze.add(orb);shards.push(orb);
    const light=new THREE.PointLight(orb.material.color,.8,3);orb.add(light);
  }
  // exit
  const ex=open[open.length-4],ey=open[open.length-3];
  goal=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.07,12,32),new THREE.MeshBasicMaterial({color:0x82ffca}));ring.rotation.x=Math.PI/2;goal.add(ring);goal.position.set((ex[0]-8)*cell,.16,(ex[1]-8)*cell);goal.userData={x:ex[0],z:ex[1]};maze.add(goal);
  // invisible portals as paired subtle glyphs only visible on approach
  const pcoords=[[5,3],[11,13],[13,5],[3,12]];
  for(let i=0;i<2;i++){const a=pcoords[i*2],b=pcoords[i*2+1];const pa=new THREE.Group(),pb=new THREE.Group();for(const g of [pa,pb]){const disc=new THREE.Mesh(new THREE.CircleGeometry(.38,24),new THREE.MeshBasicMaterial({color:0xff4fd8,transparent:true,opacity:.12,side:THREE.DoubleSide}));disc.rotation.x=-Math.PI/2;g.add(disc);g.position.y=.05}pa.position.set((a[0]-8)*cell,.05,(a[1]-8)*cell);pb.position.set((b[0]-8)*cell,.05,(b[1]-8)*cell);maze.add(pa,pb);portals.push({a,b,pa,pb,cooldown:0});}
  // moving walls
  for(let i=0;i<5;i++){const [x,y]=open[(i*53+20)%open.length];if(layout[y]&&layout[y][x]===0){const w=new THREE.Mesh(new THREE.BoxGeometry(cell*.94,wallH,cell*.94),wallSide);w.position.set((x-8)*cell,-wallH,(y-8)*cell);w.userData={gx:x,gy:y,axis:i%2?'x':'z',phase:i*1.7,active:false};maze.add(w);movingWalls.push(w)}}
  // player
  if(player)scene.remove(player); player=new THREE.Group();
  const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.28,1),new THREE.MeshStandardMaterial({color:0xdffeff,emissive:0x4de5ff,emissiveIntensity:1.4,metalness:.7,roughness:.18}));body.castShadow=true;player.add(body);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.7,8),new THREE.MeshBasicMaterial({color:0x8cecff,transparent:true,opacity:.5}));beam.position.y=.35;player.add(beam);player.position.set(-7.84,.38,-7.84);scene.add(player);
  px=1;pz=1;collected=0;stability=100;updateUI();
}

function updateUI(){document.getElementById('level').textContent=String(level).padStart(2,'0');document.getElementById('shards').textContent=`${collected}/3`;document.getElementById('stability').textContent=`${Math.ceil(stability)}%`;document.getElementById('progress').style.width=`${collected/3*100}%`}
function toast(title,sub){const t=document.getElementById('toast');document.getElementById('toastTitle').textContent=title;document.getElementById('toastSub').textContent=sub;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),1800)}

function cellAt(px,pz){return {gx:Math.round(px/cell+8),gz:Math.round(pz/cell+8)}}
function blocked(gx,gz){if(gx<0||gz<0||gx>=gridSize||gz>=gridSize)return true;
  // Maze base wall collision can be approximated from a fresh layout unavailable here; use vertical moving walls plus world boundary
  // collision uses scene walls by nearest position
  for(const c of maze.children){if(c.geometry?.type==='BoxGeometry'&&c.position.y>0.5){if(Math.abs(c.position.x-px)<.82&&Math.abs(c.position.z-pz)<.82)return true}}
  return false;
}

function move(dx,dz){if(!started||moveCooldown>0)return;moveCooldown=.13;const nx=player.position.x+dx*cell,nz=player.position.z+dz*cell;let hit=false;
  for(const c of maze.children){if(c.geometry?.type==='BoxGeometry'&&c.position.y>0.5){if(Math.abs(c.position.x-nx)<.85&&Math.abs(c.position.z-nz)<.85)hit=true}}
  if(hit){stability=Math.max(0,stability-4);shake=.12;updateUI();return}
  player.position.x=nx;player.position.z=nz;
}

window.addEventListener('keydown',e=>{const k=e.key.toLower; if(['arrowup','w'].includes(k))move(0,-1);if(['arrowdown','s'].includes(k))move(0,1);if(['arrowleft','a'].includes(k))move(-1,0);if(['arrowright','d'].includes(k))move(1,0)});
document.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('pointerdown',()=>{const d=b.dataset.dir;move(d==='left'?-1:d==='right'?1:0,d==='up'?-1:d==='down'?1:0)}));

document.getElementById('play').onclick=()=>{document.getElementById('start').style.display='none';started=true};
document.getElementById('again').onclick=()=>{level=1;document.getElementById('complete').style.display='none';buildLevel();document.getElementById('start').style.display='flex';started=false};

buildLevel();
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const t=clock.getElapsedTime(),dt=Math.min(clock.getDelta(),.033);moveCooldown=Math.max(0,moveCooldown-dt);
  if(started){
    for(const s of shards){if(!s.userData.collected){s.rotation.y+=dt*1.8;s.position.y=s.userData.base+Math.sin(t*2+s.userData.phase)*.12;if(s.position.distanceTo(player.position)<.58){s.userData.collected=true;s.visible=false;collected++;updateUI();toast('SHARD ACQUIRED',`SIGNAL 0${collected}`)}}}
    goal.rotation.z=t*.3;goal.children[0].material.opacity=.8+Math.sin(t*3)*.2;if(goal.position.distanceTo(player.position)<.62&&collected===3){started=false;if(level<3){toast('SECTOR STABLE','EXPANDING GRID');setTimeout(()=>{level++;buildLevel();started=true},1300)}else{document.getElementById('complete').style.display='flex';}}
    for(const p of portals){for(const item of [p.pa,p.pb]){item.children[0].material.opacity=.12+Math.max(0,.5-item.position.distanceTo(player.position))*1.1}if(p.cooldown>0)p.cooldown-=dt;const nearA=p.pa.position.distanceTo(player.position)<.55,nearB=p.pb.position.distanceTo(player.position)<.55;if(p.cooldown<=0&&(nearA||nearB)){const dest=nearA?p.pb:p.pa;player.position.copy(dest.position);player.position.y=.38;p.cooldown=2;toast('PHASE JUMP','PORTAL TRACE LOST');shake=.2}}
    movingWalls.forEach((w,i)=>{const cycle=(Math.sin(t*.45+w.userData.phase)+1)/2;w.position.y=cycle*wallH-wallH*.5;w.position[userData(w,'axis')]=(w.userData.gx-8)*cell+(Math.sin(t*.7+w.userData.phase)*.35)});
  }
  camera.position.lerp(new THREE.Vector3(player.position.x*.25,12.5,player.position.z*.25+12),.035);camera.lookAt(player.position.x*.15,-.2,player.position.z*.15);
  if(shake>0){camera.position.x+=(Math.random-.5)*shake;camera.position.z+=(Math.random-.5)*shake;shake*=.8}
  renderer.render(scene,camera);
}
function userData(w,a){return w.userData.axis==='x'?'x':'z'}
animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
