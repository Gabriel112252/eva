// EVA: original low-/mid-poly 3D props. No paid assets or other game models.
// Requires Node >= 20. Run: node tools/generate-eva-vehicles.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
function makeEVA3DAssets() {
  const enc = str => {let a=[];for(let c of str){let n=c.codePointAt(0);if(n<128)a.push(n);else if(n<2048)a.push(192|(n>>6),128|(n&63));else if(n<65536)a.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else a.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}return a;};
  const materials=[
    ["weathered_olive",[0.18,0.23,0.19],0.38,.68],["soft_cream",[0.63,.61,.51],.26,.69],
    ["worn_blue",[.21,.36,.47],.32,.62],["rust_copper",[.55,.32,.19],.62,.65],
    ["dark_steel",[.16,.20,.23],.72,.46],["rubber_tire",[.062,.070,.075],.05,.95],
    ["matte_glass",[.14,.23,.28],.3,.25],["amber_lamp",[.95,.53,.12],.25,.3],
    ["tail_red",[.65,.09,.072],.2,.32],["aged_wood",[.42,.29,.18],.03,.88],
    ["tarp_sand",[.53,.44,.28],.02,.94],["brushed_silver",[.63,.69,.68],.7,.33],
    ["solar_blue",[.07,.18,.34],.45,.29],["white_ceramic",[.75,.78,.73],.33,.41],
    ["warning_black",[.08,.09,.09],.1,.7],["pale_gold",[.70,.55,.28],.63,.38]
  ].map(([name,color,metallicFactor,roughnessFactor])=>({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor,roughnessFactor},doubleSided:true}));
  const C={olive:0,cream:1,blue:2,rust:3,steel:4,tire:5,glass:6,amber:7,red:8,wood:9,tarp:10,silver:11,solar:12,ceramic:13,black:14,gold:15};
  class M {
    constructor(name){this.name=name;this.parts=[];this.bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];}
    add(name,p,ind,mat){
      for(let i=0;i<p.length;i+=3){this.bounds[0]=Math.min(this.bounds[0],p[i]);this.bounds[1]=Math.min(this.bounds[1],p[i+1]);this.bounds[2]=Math.min(this.bounds[2],p[i+2]);this.bounds[3]=Math.max(this.bounds[3],p[i]);this.bounds[4]=Math.max(this.bounds[4],p[i+1]);this.bounds[5]=Math.max(this.bounds[5],p[i+2]);}
      let norm=Array(p.length).fill(0);for(let i=0;i<ind.length;i+=3){const a=ind[i]*3,b=ind[i+1]*3,c=ind[i+2]*3;let ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const t of [a,b,c]){norm[t]+=nx;norm[t+1]+=ny;norm[t+2]+=nz;}}
      for(let i=0;i<norm.length;i+=3){let v=Math.hypot(norm[i],norm[i+1],norm[i+2])||1;norm[i]/=v;norm[i+1]/=v;norm[i+2]/=v;}
      this.parts.push({name,p,ind,norm,mat});
    }
    box(name,x,y,z,w,h,d,mat,yaw=0){const pts=[],ind=[0,2,1,0,3,2,4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,3,7,6,3,6,2,0,1,5,0,5,4];for(let i=0;i<8;i++){let a=(i&1)?w/2:-w/2,b=(i&2)?h/2:-h/2,c=(i&4)?d/2:-d/2;pts.push(x+a*Math.cos(yaw)+c*Math.sin(yaw),y+b,z+c*Math.cos(yaw)-a*Math.sin(yaw));}this.add(name,pts,ind,mat);}
    loft(name,slices,mat){ // slice: {y,w,l,cz,b} chamfer-rectangle horizontal rings
      const p=[],idx=[],N=8;
      for(const s of slices){const x=s.w/2,z=s.l/2,b=Math.min(s.b||.15,x*.8,z*.8);const a=[[-x+b,-z],[x-b,-z],[x,-z+b],[x,z-b],[x-b,z],[-x+b,z],[-x,z-b],[-x,-z+b]];for(const t of a)p.push(t[0]+(s.cx||0),s.y,t[1]+(s.cz||0));}
      for(let i=0;i<slices.length-1;i++)for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N,c=(i+1)*N+k,d=(i+1)*N+(k+1)%N;idx.push(a,b,c,b,d,c);}
      for(let k=1;k<N-1;k++){idx.push(0,k+1,k);const t=(slices.length-1)*N;idx.push(t,t+k,t+k+1);}this.add(name,p,idx,mat);
    }
    rod(name,a,b,r,mat,n=12){const p=[],ind=[];let dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1,dir=[dx/len,dy/len,dz/len],ref=Math.abs(dir[1])>.95?[1,0,0]:[0,1,0],u=[dir[1]*ref[2]-dir[2]*ref[1],dir[2]*ref[0]-dir[0]*ref[2],dir[0]*ref[1]-dir[1]*ref[0]],um=Math.hypot(...u);u=u.map(x=>x/um);let v=[dir[1]*u[2]-dir[2]*u[1],dir[2]*u[0]-dir[0]*u[2],dir[0]*u[1]-dir[1]*u[0]];for(let s=0;s<=1;s++)for(let k=0;k<n;k++){let theta=k*2*Math.PI/n;for(let j=0;j<3;j++)p.push((s?b[j]:a[j])+r*(Math.cos(theta)*u[j]+Math.sin(theta)*v[j]));}for(let k=0;k<n;k++){let l=(k+1)%n;ind.push(k,l,n+k,l,n+l,n+k);}for(let k=1;k<n-1;k++){ind.push(0,k+1,k,n,n+k,n+k+1);}this.add(name,p,ind,mat);}
    torus(name,c,major,minor,mat,plane="yz",seg=28,tube=8){let p=[],ind=[];for(let i=0;i<seg;i++){let a=2*Math.PI*i/seg;for(let j=0;j<tube;j++){let b=2*Math.PI*j/tube;let radial=major+minor*Math.cos(b),normal=minor*Math.sin(b);if(plane==="yz")p.push(c[0]+normal,c[1]+radial*Math.sin(a),c[2]+radial*Math.cos(a));else if(plane==="xz")p.push(c[0]+radial*Math.cos(a),c[1]+normal,c[2]+radial*Math.sin(a));else p.push(c[0]+radial*Math.cos(a),c[1]+radial*Math.sin(a),c[2]+normal);}}for(let i=0;i<seg;i++)for(let j=0;j<tube;j++){let a=i*tube+j,b=i*tube+(j+1)%tube,c1=((i+1)%seg)*tube+j,d=((i+1)%seg)*tube+(j+1)%tube;ind.push(a,b,c1,b,d,c1);}this.add(name,p,ind,mat);}
    wheel(name,x,y,z,r=.47,width=.17){this.torus(name+"_pneu",[x,y,z],r-.075,.105,C.tire,"yz",32,10);this.rod(name+"_cubo",[x-width/2,y,z],[x+width/2,y,z],r*.48,C.steel,20);this.rod(name+"_eixo",[x-width/2-.05,y,z],[x+width/2+.05,y,z],r*.19,C.silver,20);for(let i=0;i<8;i++){let a=2*Math.PI*i/8;this.rod(name+"_raio_"+i,[x+(x<0?-.13:.13),y,z],[x+(x<0?-.13:.13),y+(r*.73)*Math.sin(a),z+(r*.73)*Math.cos(a)],.019,C.silver,6);}}
    quad(name,a,b,c,d,mat){this.add(name,[...a,...b,...c,...d],[0,1,2,0,2,3],mat);}
    produce(){
      let bin=[],bv=[],ac=[],meshes=[],nodes=[],nfaces=0;
      const append=(bytes)=>{while(bin.length%4)bin.push(0);const off=bin.length;for(const b of bytes)bin.push(b);return bv.push({buffer:0,byteOffset:off,byteLength:bytes.length})-1;};
      function pack(data,asInt=false){let buf=new ArrayBuffer(data.length*4),v=new DataView(buf);data.forEach((x,i)=>asInt?v.setUint32(i*4,x,true):v.setFloat32(i*4,x,true));return new Uint8Array(buf);}
      for(const part of this.parts){let attrs={};for(const [key,dat] of [["POSITION",part.p],["NORMAL",part.norm]]){let o={bufferView:append(pack(dat)),componentType:5126,count:dat.length/3,type:"VEC3"};if(key==="POSITION"){let mini=[Infinity,Infinity,Infinity],maxi=[-Infinity,-Infinity,-Infinity];for(let k=0;k<dat.length;k+=3)for(let j=0;j<3;j++){mini[j]=Math.min(mini[j],dat[k+j]);maxi[j]=Math.max(maxi[j],dat[k+j]);}o.min=mini;o.max=maxi;}attrs[key]=ac.push(o)-1;}const idx=ac.push({bufferView:append(pack(part.ind,true)),componentType:5125,count:part.ind.length,type:"SCALAR"})-1;const m=meshes.push({name:part.name,primitives:[{attributes:attrs,indices:idx,material:part.mat,mode:4}]})-1;nodes.push({name:part.name,mesh:m});nfaces+=part.ind.length/3;}
      while(bin.length%4)bin.push(0);
      const obj={asset:{version:"2.0",generator:"EVA original modular concept asset pack (WebGL glTF2)"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i),name:this.name}],nodes,meshes,materials,accessors:ac,bufferViews:bv,buffers:[{byteLength:bin.length}],extras:{assetName:this.name,artStage:"Modular 3D proof-of-concept, NOT final high-fidelity game art",units:"meters",forward:"+Z",up:"+Y",bounds:this.bounds,triangles:nfaces,staticProp:true}};
      const jb=enc(JSON.stringify(obj));while(jb.length%4)jb.push(32);
      const size=12+8+jb.length+8+bin.length,glb=new Uint8Array(size),dv=new DataView(glb.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,size,true);dv.setUint32(12,jb.length,true);dv.setUint32(16,0x4e4f534a,true);glb.set(jb,20);dv.setUint32(20+jb.length,bin.length,true);dv.setUint32(24+jb.length,0x004e4942,true);glb.set(bin,28+jb.length);return {glb,partCount:this.parts.length,triangles:nfaces,bounds:this.bounds};
    }
  }
  const J=new M("Javali VB-4 - Viatura de Custodios");
  J.loft("carroceria_blindada",[{y:.53,w:1.71,l:4.20,b:.20},{y:.72,w:2.03,l:4.64,b:.34},{y:1.14,w:2.05,l:4.61,b:.35},{y:1.22,w:2.00,l:4.55,b:.33}],C.olive);
  J.loft("capo_angulado",[{y:1.18,w:1.98,l:1.28,cz:1.63,b:.21},{y:1.42,w:1.88,l:1.24,cz:1.57,b:.29}],C.olive);
  J.loft("cabine_protegida",[{y:1.13,w:1.89,l:2.65,cz:-.51,b:.26},{y:1.63,w:1.79,l:2.34,cz:-.51,b:.30},{y:1.96,w:1.67,l:2.17,cz:-.55,b:.33},{y:2.02,w:1.55,l:2.13,cz:-.54,b:.28}],C.olive);
  J.quad("para_brisa",[ -.73,1.70,.68],[.73,1.70,.68],[.69,1.93,.52],[-.69,1.93,.52],C.glass);
  J.quad("vidro_lateral_esq",[-.95,1.60,.22],[-.89,1.86,.16],[-.87,1.84,-.50],[-.95,1.59,-.59],C.glass);
  J.quad("vidro_lateral_dir",[.95,1.60,-.59],[.87,1.84,-.50],[.89,1.86,.16],[.95,1.60,.22],C.glass);
  for(const s of [-1,1]) {for(const z of [-1.45,1.54]) J.wheel("roda_"+(s<0?"esq":"dir")+"_"+(z>0?"d":"t"),s*1.02,.52,z,.49,.23);
    J.box("porta_"+s,s*1.012,1.13,-.52,.065,.55,1.06,C.olive);J.rod("dobradica_"+s,[s*1.07,1.20,-.18],[s*1.07,1.56,-.18],.035,C.silver);J.box("maçaneta_"+s,s*1.055,1.35,-.20,.09,.07,.21,C.steel);
    J.box("espelho_"+s,s*1.18,1.59,.65,.22,.13,.32,C.steel);
    J.rod("barra_estribo_"+s,[s*1.11,.55,-1.15],[s*1.11,.55,.72],.052,C.black);
  }
  J.box("frente_grade",0,.89,2.31,1.04,.38,.055,C.steel);
  for(let k=-3;k<=3;k++)J.box("grade_frontal_"+k,k*.12,.9,2.37,.045,.26,.04,C.silver);
  for(const s of [-1,1]){J.box("farol_"+s,s*.74,1.0,2.335,.33,.15,.05,C.amber);J.box("lanterna_"+s,s*.79,.95,-2.36,.25,.16,.05,C.red);}
  J.rod("para_choque_d",[ -1.03,.68,2.40],[1.03,.68,2.40],.10,C.steel);
  J.rod("para_choque_t",[ -1.00,.67,-2.41],[1.00,.67,-2.41],.09,C.steel);
  for(const x of [-.66,.66])J.rod("teto_longarina_"+x,[x,2.12,-1.45],[x,2.12,.34],.032,C.steel);
  for(const z of [-1.33,-.35,.28])J.rod("teto_travessa_"+z,[-.76,2.10,z],[.76,2.10,z],.030,C.steel);
  J.box("identificação_custodia",0,1.98,-1.12,.45,.018,.34,C.gold);
  const A=new M("Atlas T-3 - Triciclo comunitario de carga");
  A.rod("espinha_chassi",[0,.48,1.02],[0,.52,-.83],.065,C.steel);
  for(const s of [-1,1]){A.rod("braço_chassi_"+s,[0,.53,.4],[s*.47,.50,-.83],.048,C.steel);A.rod("traseira_estrutura_"+s,[s*.47,.5,-.83],[s*.47,1.08,-.83],.035,C.steel);A.wheel("traseira_"+s,s*.56,.37,-.82,.33,.14);}
  A.wheel("dianteira",0,.39,1.00,.37,.12);
  A.rod("forquilha_esq",[-.14,.42,1.0],[-.095,1.15,.84],.045,C.silver);A.rod("forquilha_dir",[.14,.42,1.0],[.095,1.15,.84],.045,C.silver);
  A.rod("guidão",[ -.40,1.25,.83],[.40,1.25,.83],.035,C.steel);
  A.rod("coluna", [0,.93,.86],[0,1.25,.83],.055,C.silver);
  A.box("assento",0,1.0,.16,.42,.11,.46,C.black);
  A.rod("suporte_assento",[0,.55,.13],[0,.97,.16],.045,C.steel);
  A.rod("pedal_eixo",[-.2,.52,.25],[.2,.52,.25],.042,C.silver);
  A.box("pedal_esq",-.23,.5,.38,.17,.04,.14,C.black);A.box("pedal_dir",.23,.5,.13,.17,.04,.14,C.black);
  A.loft("plataforma",[{y:.54,w:1.08,l:1.12,cz:-.72,b:.08},{y:.64,w:1.10,l:1.12,cz:-.72,b:.07}],C.blue);
  for(const s of [-1,1])for(let k=0;k<4;k++)A.box("ripa_lateral_"+s+"_"+k,s*.54,.72+k*.105,-.76,.042,.080,1.17,C.wood);
  for(const z of [-1.23,-.22])for(let k=0;k<4;k++)A.box("ripa_frente_"+z+"_"+k,0,.72+k*.104,z,1.08,.07,.042,C.wood);
  A.box("fundo_caixa",0,.77,-.77,.98,.09,1.07,C.wood);
  for(const s of [-1,1])for(const z of [-1.18,-.26])A.rod("caixa_cantoneira_"+s+"_"+z,[s*.52,.66,z],[s*.52,1.21,z],.022,C.rust,8);
  A.box("farol_atlas",0,1.10,1.14,.18,.12,.08,C.amber);
  A.rod("cobertura_estrutura_esq",[-.55,1.18,-1.26],[-.55,1.6,-1.26],.029,C.steel);
  A.rod("cobertura_estrutura_dir",[.55,1.18,-1.26],[.55,1.6,-1.26],.029,C.steel);
  A.box("lona_carga",0,1.61,-.76,1.15,.05,1.15,C.tarp);
  const V=new M("Modulo V-7 - Van de suprimentos");
  V.loft("chassi_comprido",[{y:.50,w:1.58,l:4.93,b:.20},{y:.68,w:1.88,l:5.16,b:.32},{y:.81,w:1.91,l:5.13,b:.33}],C.steel);
  V.loft("painel_externo",[{y:.78,w:1.87,l:5.14,b:.32},{y:1.92,w:1.95,l:5.20,b:.36},{y:2.18,w:1.88,l:5.08,b:.38},{y:2.32,w:1.66,l:4.92,b:.48}],C.cream);
  V.quad("parabrisa_modulo",[-.76,1.62,2.62],[.76,1.62,2.62],[.73,2.13,2.40],[-.73,2.13,2.40],C.glass);
  V.quad("vidro_cabine_l",[ -.98,1.64,1.77],[-.95,2.12,1.77],[-.94,2.10,1.00],[-.98,1.64,1.00],C.glass);
  V.quad("vidro_cabine_r",[ .98,1.64,1.00],[.94,2.10,1.00],[.95,2.12,1.77],[.98,1.64,1.77],C.glass);
  for(const s of [-1,1]){for(const z of [-1.65,1.52]) V.wheel("roda_"+s+"_"+z,s*.96,.49,z,.45,.18);
    V.box("faixa_recuperada_"+s,s*.979,1.17,-.67,.028,.22,2.12,C.olive);
    V.box("porta_cabine_"+s,s*.992,1.41,1.30,.037,.95,.78,C.cream);
    V.box("trilho_porta_carga_"+s,s*.992,1.55,-.83,.06,.045,1.85,C.steel);
    V.box("painel_porta_deslizante_"+s,s*.99,1.39,-.82,.058,1.21,1.76,C.cream);
    V.box("puxador_"+s,s*1.032,1.44,-.04,.09,.07,.24,C.steel);
    V.rod("soleira_"+s,[s*1.0,.75,-2.0],[s*1.0,.75,1.90],.025,C.steel);
  }
  V.box("grade_dianteira",0,.99,2.622,1.04,.36,.04,C.steel);
  for(let i=-3;i<=3;i++)V.box("lamina_entrada_"+i,i*.14,1.0,2.66,.06,.20,.02,C.silver);
  for(const s of [-1,1]){V.box("farol_"+s,s*.73,1.13,2.62,.33,.15,.05,C.amber);V.box("traseira_luz_"+s,s*.73,1.15,-2.62,.28,.25,.05,C.red);}
  for(const s of [-1,1]) V.rod("rack_longo_"+s,[s*.70,2.41,-2.12],[s*.70,2.41,2.05],.034,C.steel);
  for(const z of [-1.79,-.94,.04,.93,1.84])V.rod("rack_cruzado_"+z,[-.76,2.41,z],[.76,2.41,z],.022,C.steel);
  V.box("bagageiro_tarp",0,2.48,-.79,1.37,.13,1.56,C.tarp);
  const R=new M("Rastro AV-4 - Aeromoto de patrulha");
  R.loft("fuselagem",[{y:.30,w:.48,l:2.30,b:.14},{y:.50,w:.76,l:2.62,b:.17},{y:.78,w:.80,l:2.35,b:.22},{y:1.05,w:.55,l:1.32,b:.22},{y:1.14,w:.37,l:1.08,b:.14}],C.olive);
  R.loft("carenagem_nariz",[{y:.56,w:.54,l:.92,cz:.86,b:.16},{y:.86,w:.57,l:.90,cz:.87,b:.19}],C.silver);
  for(const s of [-1,1]){R.rod("braço_duct_"+s,[s*.29,.61,.05],[s*.88,.54,-.10],.095,C.steel);R.rod("contraventamento_"+s,[s*.38,.68,-.33],[s*.92,.48,-.09],.047,C.rust);
    R.torus("anel_rotor_"+s,[s*.97,.58,-.12],.57,.11,C.steel,"xz",36,10);
    R.torus("grelha_interna_"+s,[s*.97,.58,-.12],.39,.023,C.silver,"xz",32,6);
    R.rod("eixo_rotor_"+s,[s*.97,.48,-.12],[s*.97,.71,-.12],.09,C.silver);
    for(let k=0;k<6;k++){let a=k*Math.PI/3,x=s*.97,z=-.12;
      R.quad("helice_"+s+"_"+k,[x+.10*Math.cos(a),.59,z+.10*Math.sin(a)],[x+.46*Math.cos(a+.09),.59,z+.46*Math.sin(a+.09)],[x+.46*Math.cos(a+.33),.59,z+.46*Math.sin(a+.33)],[x+.10*Math.cos(a+.36),.59,z+.10*Math.sin(a+.36)],C.steel);}
    R.rod("protecao_turbina_"+s,[s*.97,.78,-.63],[s*.97,.78,.39],.022,C.steel);
    R.rod("patim_"+s,[s*.52,.13,-.89],[s*.52,.13,.91],.042,C.steel);
    for(const z of [-.60,.70])R.rod("amortecedor_"+s,[s*.41,.48,z],[s*.52,.13,z],.046,C.silver);
  }
  R.box("assento_piloto",0,1.18,-.39,.48,.14,.73,C.black);
  R.box("encosto_piloto",0,1.35,-.74,.50,.43,.12,C.black);
  R.rod("guidão_rastro",[-.42,1.21,.69],[.42,1.21,.69],.04,C.steel);
  R.box("painel_navegacao",0,1.16,.93,.33,.14,.17,C.solar);
  R.box("luz_nariz",0,.75,1.34,.21,.12,.08,C.amber);
  R.box("carga_bateria",0,.42,-.69,.39,.32,.65,C.rust);
  const S=new M("Janus - Plataforma orbital automatica");
  S.rod("nucleo_pressurizado",[0,0,-3.4],[0,0,3.4],.74,C.silver,24);
  for(const z of [-3.2,-2.35,-1.05,.4,1.56,2.82]){
    S.torus("aneis_estruturais_"+z,[0,0,z],.82,.08,C.gold,"xy",32,8);
  }
  S.rod("arquivo_blindado",[0,0,-1.0],[0,0,1.1],.89,C.ceramic,24);
  S.torus("porta_docking",[0,0,3.44],.68,.12,C.steel,"xy",32,9);
  S.torus("amarra_docking",[0,0,3.51],.45,.06,C.gold,"xy",24,7);
  for(const s of [-1,1]){
    S.rod("trelica_lateral_"+s,[s*.76,0,0],[s*4.0,0,0],.063,C.silver);
    for(let i=0;i<5;i++){let x=s*(1.05+i*.64);
      S.rod("triangulacao_"+s+"_"+i,[x,-.27,-.52],[x+s*.56,.27,.52],.022,C.steel,8);
      S.rod("trave_"+s+"_"+i,[x,-.31,0],[x,.31,0],.032,C.silver,8);
    }
    for(let j=0;j<2;j++){
      S.quad("solar_painel_"+s+"_"+j,[s*(4.05+j*1.95),-.06,-2.10],[s*(4.05+j*1.95),-.06,2.10],[s*(4.05+(j+1)*1.95),-.06,2.10],[s*(4.05+(j+1)*1.95),-.06,-2.10],C.solar);
      for(let k=-2;k<=2;k++)S.rod("solar_barra_"+s+"_"+j+"_"+k,[s*(4.05+j*1.95),-.03,k*.92],[s*(4.05+(j+1)*1.95),-.03,k*.92],.017,C.silver,8);
      S.rod("solar_perimetro_"+s+"_"+j,[s*(4.05+j*1.95),-.03,-2.12],[s*(4.05+j*1.95),-.03,2.12],.025,C.silver,8);
    }
  }
  for(const y of [-1,1]){S.box("radiador_"+y,0,y*1.4,-.5,2.3,.06,1.8,C.ceramic);for(let i=-4;i<=4;i++)S.rod("radiador_aleta_"+y+"_"+i,[i*.24,y*1.39,-1.42],[i*.24,y*1.39,.43],.012,C.gold,8);}
  S.rod("braço_antena",[0,.75,-2.45],[0,2.1,-2.75],.048,C.silver);
  S.torus("antena_circular",[0,2.13,-2.78],.55,.033,C.silver,"xz",32,8);
  for(let k=0;k<8;k++){let a=2*Math.PI*k/8;S.rod("antena_radio_"+k,[0,2.09,-2.78],[.48*Math.cos(a),2.10,-2.78+.48*Math.sin(a)],.016,C.silver,7);}
  S.rod("ponteiro_antena",[0,2.13,-2.78],[0,2.52,-2.78],.04,C.gold);
  const arr=[["javali_vb4.glb",J],["atlas_t3.glb",A],["modulo_v7.glb",V],["rastro_av4.glb",R],["janus_station.glb",S]];
  return arr.map(([name,model])=>({filename:name,...model.produce()}));
}
const results=makeEVA3DAssets();
const folder="assets-src/vehicles";
mkdirSync(folder,{recursive:true});
for(const r of results){const dest=join(folder,r.filename);writeFileSync(dest,r.glb);console.log(dest, r.glb.length+" bytes",r.triangles+" tris",r.partCount+" parts");}
