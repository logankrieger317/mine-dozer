import Phaser from 'phaser';
import './style.css';

type Save = { coins:number; earned:number; power:number; speed:number; value:number };
const KEY='mine-dozer-save-v1';
const load=():Save=>{try{return {...{coins:0,earned:0,power:1,speed:1,value:1},...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {coins:0,earned:0,power:1,speed:1,value:1}}};
const save=(s:Save)=>localStorage.setItem(KEY,JSON.stringify(s));
const state=load();

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`<div class="shell"><div class="game-frame" id="frame"><div class="hud"><div class="brand">MINE DOZER</div><div class="coins"><span class="coin">●</span> <span id="coins">0</span></div></div><div class="toast" id="toast">Push rocks into the crusher</div><div class="garage"><button class="upgrade" data-u="power"><b>⚙ Engine <span id="powerLevel"></span></b><span id="powerCost"></span></button><button class="upgrade" data-u="speed"><b>➤ Speed <span id="speedLevel"></span></b><span id="speedCost"></span></button><button class="upgrade" data-u="value"><b>✦ Crusher <span id="valueLevel"></span></b><span id="valueCost"></span></button></div><div class="controls"><div class="joystick" id="joystick"><div class="stick" id="stick"></div></div><button class="boost" id="boost">BOOST</button></div><div class="footer">WASD / arrows on desktop</div><div id="game"></div></div></div>`;

const $=<T extends HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const coinEl=$<HTMLSpanElement>('#coins');
const toast=$<HTMLDivElement>('#toast');
const costs=(k:keyof Pick<Save,'power'|'speed'|'value'>)=>Math.floor(({power:25,speed:30,value:40}[k])*Math.pow(1.65,state[k]-1));
function syncUI(){coinEl.textContent=Math.floor(state.coins).toString();(['power','speed','value'] as const).forEach(k=>{ $<HTMLSpanElement>(`#${k}Level`).textContent=`Lv.${state[k]}`;$<HTMLSpanElement>(`#${k}Cost`).textContent=`${costs(k)} coins`;});save(state)}
function say(text:string){toast.textContent=text;toast.animate([{opacity:.2,transform:'translate(-50%,-6px)'},{opacity:1,transform:'translate(-50%,0)'}],{duration:220})}
syncUI();

document.querySelectorAll<HTMLButtonElement>('.upgrade').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.u as 'power'|'speed'|'value';const cost=costs(k);if(state.coins<cost){say(`Need ${cost-state.coins|0} more coins`);return}state.coins-=cost;state[k]++;syncUI();say(`${k[0].toUpperCase()+k.slice(1)} upgraded!`)});

const input={x:0,y:0,boost:false};
const joy=$<HTMLDivElement>('#joystick'),stick=$<HTMLDivElement>('#stick');
let joyId:number|null=null;
function moveJoy(e:PointerEvent){const r=joy.getBoundingClientRect();let x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2);const m=Math.hypot(x,y),lim=36;if(m>lim){x=x/m*lim;y=y/m*lim}input.x=x/lim;input.y=y/lim;stick.style.transform=`translate(${x}px,${y}px)`}
joy.onpointerdown=e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e)};
joy.onpointermove=e=>{if(e.pointerId===joyId)moveJoy(e)};
const stopJoy=(e:PointerEvent)=>{if(e.pointerId!==joyId)return;joyId=null;input.x=input.y=0;stick.style.transform='translate(0,0)'};
joy.onpointerup=stopJoy;joy.onpointercancel=stopJoy;
const boost=$<HTMLButtonElement>('#boost');boost.onpointerdown=()=>input.boost=true;boost.onpointerup=boost.onpointercancel=()=>input.boost=false;

class Quarry extends Phaser.Scene{
  player!:Phaser.Physics.Arcade.Image; rocks!:Phaser.Physics.Arcade.Group; cursors!:Phaser.Types.Input.Keyboard.CursorKeys; keys!:Record<string,Phaser.Input.Keyboard.Key>; crusher!:Phaser.GameObjects.Zone; spawnTimer=0;
  create(){
    const w=520,h=940;
    this.cameras.main.setBackgroundColor('#374634');
    const g=this.add.graphics();g.fillStyle(0x2c3729).fillRect(0,0,w,h);g.lineStyle(2,0x485944,.5);for(let y=110;y<h;y+=70)g.lineBetween(0,y,w,y);for(let i=0;i<36;i++)g.fillStyle(0x5b6650,Phaser.Math.FloatBetween(.15,.4)).fillCircle(Phaser.Math.Between(0,w),Phaser.Math.Between(90,h),Phaser.Math.Between(2,7));
    this.makeTextures();
    this.add.rectangle(w/2,54,w,108,0x1b1824,.96);
    this.add.rectangle(w/2,150,w-56,74,0x171421,.9).setStrokeStyle(3,0xf0a82e);
    this.add.text(w/2,150,'CRUSHER',{fontSize:'25px',fontStyle:'bold',color:'#ffcf45'}).setOrigin(.5);
    this.crusher=this.add.zone(w/2,150,w-70,65);this.physics.add.existing(this.crusher,true);
    this.player=this.physics.add.image(w/2,760,'dozer').setCollideWorldBounds(true).setDrag(900).setMaxVelocity(260).setDepth(3);
    this.player.body.setSize(54,72);
    this.rocks=this.physics.add.group({collideWorldBounds:true});
    this.physics.add.collider(this.rocks,this.rocks);
    this.physics.add.collider(this.player,this.rocks,(_,obj)=>{const rock=obj as Phaser.Physics.Arcade.Image;const body=rock.body as Phaser.Physics.Arcade.Body;const pv=this.player.body.velocity;const factor=.38+state.power*.12;body.velocity.x+=pv.x*factor;body.velocity.y+=pv.y*factor;});
    this.physics.add.overlap(this.rocks,this.crusher,(_,obj)=>this.crush(obj as Phaser.Physics.Arcade.Image));
    this.cursors=this.input.keyboard!.createCursorKeys();this.keys=this.input.keyboard!.addKeys('W,A,S,D') as Record<string,Phaser.Input.Keyboard.Key>;
    for(let i=0;i<10;i++)this.spawnRock();
  }
  makeTextures(){const d=this.add.graphics();d.fillStyle(0xf1b52f).fillRoundedRect(4,12,56,56,10).fillStyle(0x272431).fillRect(10,4,38,24).fillStyle(0x171421).fillRect(0,18,8,46).fillRect(56,18,8,46).fillStyle(0xffd45a).fillRect(18,0,22,10);d.generateTexture('dozer',64,72);d.destroy();
    const r=this.add.graphics();r.fillStyle(0x8b8d92).fillCircle(22,22,21).fillStyle(0xa8abb0,.7).fillCircle(15,14,8);r.generateTexture('rock',44,44);r.clear().fillStyle(0xc79a35).fillCircle(27,27,26).fillStyle(0xffd35b,.75).fillCircle(18,16,9);r.generateTexture('gold',54,54);r.destroy();}
  spawnRock(){const rare=state.earned>250&&Math.random()<.16;const key=rare?'gold':'rock';const rock=this.rocks.create(Phaser.Math.Between(45,475),Phaser.Math.Between(240,610),key) as Phaser.Physics.Arcade.Image;rock.setCircle(rare?26:21).setDrag(190).setBounce(.22).setData('value',rare?18:5).setData('heavy',rare?2:1);}
  crush(rock:Phaser.Physics.Arcade.Image){if(!rock.active)return;const base=rock.getData('value') as number;const payout=Math.round(base*(1+(state.value-1)*.28));state.coins+=payout;state.earned+=payout;syncUI();this.tweens.add({targets:rock,scale:0,angle:180,duration:180,onComplete:()=>rock.destroy()});const txt=this.add.text(rock.x,rock.y,`+${payout}`,{fontSize:'24px',fontStyle:'bold',color:'#ffdc63'}).setOrigin(.5).setDepth(9);this.tweens.add({targets:txt,y:rock.y-55,alpha:0,duration:700,onComplete:()=>txt.destroy()});this.cameras.main.shake(80,.004);this.time.delayedCall(450,()=>this.spawnRock());}
  update(_:number,delta:number){let x=input.x,y=input.y;if(this.cursors.left.isDown||this.keys.A.isDown)x=-1;if(this.cursors.right.isDown||this.keys.D.isDown)x=1;if(this.cursors.up.isDown||this.keys.W.isDown)y=-1;if(this.cursors.down.isDown||this.keys.S.isDown)y=1;const len=Math.hypot(x,y)||1;const boostMul=input.boost?1.65:1;const speed=(125+state.speed*18)*boostMul;this.player.setVelocity(x/len*speed,y/len*speed);if(Math.abs(x)+Math.abs(y)>.1)this.player.setRotation(Math.atan2(y,x)+Math.PI/2);this.spawnTimer+=delta;if(this.spawnTimer>5000&&this.rocks.countActive(true)<12){this.spawnTimer=0;this.spawnRock()}}
}

new Phaser.Game({type:Phaser.AUTO,parent:'game',width:520,height:940,backgroundColor:'#374634',physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},scene:[Quarry],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
