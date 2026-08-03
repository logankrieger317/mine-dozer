import Phaser from 'phaser';
import './style.css';

type Upgrade='power'|'speed'|'value'|'scoop';
type Save={coins:number;earned:number;power:number;speed:number;value:number;scoop:number;unlocked:number;current:number;cleared:number[]};
type Level={name:string;count:number;unlock:number;rockValue:number;goldChance:number;color:number};
const LEVELS:Level[]=[
  {name:'Gravel Pit',count:10,unlock:0,rockValue:5,goldChance:0,color:0x2c3729},
  {name:'Granite Cut',count:14,unlock:50,rockValue:11,goldChance:.12,color:0x3c4145},
  {name:'Gold Ridge',count:18,unlock:400,rockValue:22,goldChance:.28,color:0x4b3d29},
  {name:'Crystal Basin',count:22,unlock:1100,rockValue:45,goldChance:.42,color:0x263f46}
];
const KEY='mine-dozer-save-v2';
const defaults:Save={coins:0,earned:0,power:1,speed:1,value:1,scoop:1,unlocked:0,current:0,cleared:[]};
const load=():Save=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}};
const state=load();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`<div class="shell"><div class="game-frame"><div class="hud"><div><div class="brand">MINE DOZER</div><small id="levelName"></small></div><div class="coins"><span class="coin">●</span> <span id="coins">0</span></div></div><div class="toast" id="toast">Clear the quarry</div><div class="level-bar" id="levelBar"></div><div class="garage"><button class="upgrade" data-u="power"><b>⚙ Engine <span id="powerLevel"></span></b><span id="powerCost"></span></button><button class="upgrade" data-u="speed"><b>➤ Speed <span id="speedLevel"></span></b><span id="speedCost"></span></button><button class="upgrade" data-u="value"><b>✦ Crusher <span id="valueLevel"></span></b><span id="valueCost"></span></button><button class="upgrade" data-u="scoop"><b>▰ Scoop <span id="scoopLevel"></span></b><span id="scoopCost"></span></button></div><div class="controls"><div class="joystick" id="joystick"><div class="stick" id="stick"></div></div><button class="boost" id="boost">BOOST</button></div><div class="footer">WASD / arrows on desktop</div><div id="game"></div></div></div>`;

const $=<T extends HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const toast=$<HTMLDivElement>('#toast');
let scene:Quarry|undefined;
const baseCosts:Record<Upgrade,number>={power:25,speed:30,value:40,scoop:55};
const cost=(k:Upgrade)=>Math.floor(baseCosts[k]*Math.pow(1.65,state[k]-1));
function say(t:string){toast.textContent=t;toast.animate([{opacity:.2},{opacity:1}],{duration:200})}
function syncUI(){
  $('#coins').textContent=Math.floor(state.coins).toString();
  $('#levelName').textContent=`${LEVELS[state.current].name} • ${scene?.remaining() ?? LEVELS[state.current].count} left`;
  (['power','speed','value','scoop'] as Upgrade[]).forEach(k=>{ $(`#${k}Level`).textContent=`Lv.${state[k]}`;$(`#${k}Cost`).textContent=`${cost(k)} coins`;});
  const bar=$('#levelBar');bar.innerHTML='';
  LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.className='level-btn'+(i===state.current?' active':'');b.textContent=i<=state.unlocked?`${i+1} ${l.name}`:`🔒 ${l.unlock}`;b.onclick=()=>selectLevel(i);bar.appendChild(b)});save();
}
function selectLevel(i:number){
  if(i>state.unlocked){const price=LEVELS[i].unlock;if(i!==state.unlocked+1){say('Unlock levels in order');return}if(state.coins<price){say(`Need ${price-Math.floor(state.coins)} more coins`);return}state.coins-=price;state.unlocked=i;say(`${LEVELS[i].name} unlocked for ${price} coins`)}
  state.current=i;save();scene?.scene.restart();syncUI();
}
document.querySelectorAll<HTMLButtonElement>('.upgrade').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.u as Upgrade;const price=cost(k);if(state.coins<price){say(`Need ${price-Math.floor(state.coins)} more coins`);return}state.coins-=price;state[k]++;syncUI();scene?.applyScoop();say(`${k[0].toUpperCase()+k.slice(1)} upgraded`)});

const input={x:0,y:0,boost:false};const joy=$<HTMLDivElement>('#joystick'),stick=$<HTMLDivElement>('#stick');let joyId:number|null=null;
function moveJoy(e:PointerEvent){const r=joy.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const m=Math.hypot(x,y),lim=36;if(m>lim){x=x/m*lim;y=y/m*lim}input.x=x/lim;input.y=y/lim;stick.style.transform=`translate(${x}px,${y}px)`}
joy.onpointerdown=e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e)};joy.onpointermove=e=>{if(e.pointerId===joyId)moveJoy(e)};const stop=(e:PointerEvent)=>{if(e.pointerId!==joyId)return;joyId=null;input.x=input.y=0;stick.style.transform='translate(0,0)'};joy.onpointerup=stop;joy.onpointercancel=stop;const boost=$<HTMLButtonElement>('#boost');boost.onpointerdown=()=>input.boost=true;boost.onpointerup=boost.onpointercancel=()=>input.boost=false;

class Quarry extends Phaser.Scene{
  player!:Phaser.Physics.Arcade.Image;rocks!:Phaser.Physics.Arcade.Group;crusher!:Phaser.GameObjects.Zone;cursors!:Phaser.Types.Input.Keyboard.CursorKeys;keys!:Record<string,Phaser.Input.Keyboard.Key>;quota=0;
  create(){scene=this;const w=520,h=940,l=LEVELS[state.current];this.cameras.main.setBackgroundColor(l.color);const g=this.add.graphics();g.fillStyle(l.color).fillRect(0,0,w,h);for(let i=0;i<42;i++)g.fillStyle(0xffffff,Phaser.Math.FloatBetween(.03,.12)).fillCircle(Phaser.Math.Between(0,w),Phaser.Math.Between(100,h),Phaser.Math.Between(2,7));this.makeTextures();this.add.rectangle(w/2,150,w-56,74,0x171421,.94).setStrokeStyle(3,0xf0a82e);this.add.text(w/2,150,'CRUSHER',{fontSize:'25px',fontStyle:'bold',color:'#ffcf45'}).setOrigin(.5);this.crusher=this.add.zone(w/2,150,w-70,65);this.physics.add.existing(this.crusher,true);this.player=this.physics.add.image(w/2,790,'dozer').setCollideWorldBounds(true).setDrag(900).setDepth(3);this.applyScoop();this.rocks=this.physics.add.group({collideWorldBounds:true});this.physics.add.collider(this.rocks,this.rocks);this.physics.add.collider(this.player,this.rocks,(_,o)=>{const r=o as Phaser.Physics.Arcade.Image;if(r.getData('crushing'))return;const b=r.body as Phaser.Physics.Arcade.Body,p=this.player.body.velocity,f=.36+state.power*.13+state.scoop*.04;b.velocity.x+=p.x*f;b.velocity.y+=p.y*f});this.physics.add.overlap(this.rocks,this.crusher,(_,o)=>this.crush(o as Phaser.Physics.Arcade.Image));this.cursors=this.input.keyboard!.createCursorKeys();this.keys=this.input.keyboard!.addKeys('W,A,S,D') as Record<string,Phaser.Input.Keyboard.Key>;this.quota=l.count;for(let i=0;i<l.count;i++)this.spawnRock(i);syncUI();say(`Clear ${l.count} loads from ${l.name}`)}
  applyScoop(){if(!this.player?.body)return;const width=Math.min(110,48+state.scoop*8);this.player.setScale(1+Math.min(.35,(state.scoop-1)*.05));this.player.body.setSize(width,76,true)}
  remaining(){return this.rocks?.countActive(true)??this.quota}
  makeTextures(){const d=this.add.graphics();d.fillStyle(0xf1b52f).fillRoundedRect(4,12,56,56,10).fillStyle(0x272431).fillRect(10,4,38,24).fillStyle(0x171421).fillRect(0,18,8,46).fillRect(56,18,8,46).fillStyle(0xffd45a).fillRect(18,0,22,10);d.generateTexture('dozer',64,72);d.destroy();const r=this.add.graphics();r.fillStyle(0x8b8d92).fillCircle(22,22,21).fillStyle(0xa8abb0,.7).fillCircle(15,14,8);r.generateTexture('rock',44,44);r.clear().fillStyle(0xc79a35).fillCircle(27,27,26).fillStyle(0xffd35b,.75).fillCircle(18,16,9);r.generateTexture('gold',54,54);r.destroy()}
  spawnRock(i:number){const l=LEVELS[state.current],rare=Math.random()<l.goldChance,key=rare?'gold':'rock';const cols=4,x=65+(i%cols)*130,y=280+Math.floor(i/cols)*95;const r=this.rocks.create(x+Phaser.Math.Between(-20,20),y+Phaser.Math.Between(-16,16),key) as Phaser.Physics.Arcade.Image;r.setCircle(rare?26:21).setDrag(320).setBounce(.08).setData('value',rare?Math.round(l.rockValue*2.4):l.rockValue).setData('crushing',false)}
  crush(r:Phaser.Physics.Arcade.Image){if(!r.active||r.getData('crushing'))return;r.setData('crushing',true);(r.body as Phaser.Physics.Arcade.Body).enable=false;const payout=Math.round((r.getData('value') as number)*(1+(state.value-1)*.28));state.coins+=payout;state.earned+=payout;syncUI();this.tweens.add({targets:r,scale:0,angle:180,duration:180,onComplete:()=>{r.destroy();syncUI();if(this.remaining()===0)this.completeLevel()}});const t=this.add.text(r.x,r.y,`+${payout}`,{fontSize:'24px',fontStyle:'bold',color:'#ffdc63'}).setOrigin(.5).setDepth(9);this.tweens.add({targets:t,y:r.y-55,alpha:0,duration:700,onComplete:()=>t.destroy()});this.cameras.main.shake(80,.004)}
  completeLevel(){if(!state.cleared.includes(state.current))state.cleared.push(state.current);save();const next=state.current+1;if(next<LEVELS.length&&next>state.unlocked)say(`Quarry cleared! Unlock ${LEVELS[next].name} for ${LEVELS[next].unlock} coins`);else say('Quarry cleared — revisit or drive to another level')}
  update(){let x=input.x,y=input.y;if(this.cursors.left.isDown||this.keys.A.isDown)x=-1;if(this.cursors.right.isDown||this.keys.D.isDown)x=1;if(this.cursors.up.isDown||this.keys.W.isDown)y=-1;if(this.cursors.down.isDown||this.keys.S.isDown)y=1;const len=Math.hypot(x,y)||1,speed=(125+state.speed*18)*(input.boost?1.65:1);this.player.setVelocity(x/len*speed,y/len*speed);if(Math.abs(x)+Math.abs(y)>.1)this.player.setRotation(Math.atan2(y,x)+Math.PI/2)}
}
new Phaser.Game({type:Phaser.AUTO,parent:'game',width:520,height:940,physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},scene:[Quarry],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
