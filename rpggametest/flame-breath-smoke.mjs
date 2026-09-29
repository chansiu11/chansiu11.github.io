import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base=process.env.RPG_URL||'http://127.0.0.1:8123/rpggametest/';
const cases=[
 {slot:0,id:'guardBreak',ms:620,mode:'flameBreathSweep',hitTimes:2},
 {slot:1,id:'earthRend',ms:930,mode:'flameBreathRise',hitTimes:2},
 {slot:2,id:'quakeRush',ms:1000,mode:'flameBreathCleave',hitTimes:2},
 {slot:3,id:'ironJudgment',ms:720,mode:'flameBreathWheel',hitTimes:3},
 {slot:4,id:'meteorBreaker',ms:4940,mode:'flameBreathFinale',hitTimes:5}
];
await mkdir('rpggametest/flame-preview',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report=[];
for(const c of cases){
 const context=await browser.newContext({viewport:{width:1280,height:760},deviceScaleFactor:1,locale:'ko-KR'});
 await context.addInitScript(()=>{window.__PLAYTEST__=true;});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(String(err)));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__game?.mode==='play'&&!!window.__game?.enemies?.find(e=>e.type==='dummy'));
 const init=await page.evaluate((c)=>{
  const g=window.__game,p=g.player,e=g.enemies.find(e=>e.type==='dummy');
  e.x=p.x+(c.slot===2?140:260);e.y=p.y;e.sx=e.x;e.sy=e.y;e.r=25;e.testHitCount=0;e.testDamageTotal=0;e.speed=0;e.damage=0;e.maxHp=e.hp=1e8;e.baseMaxHp=1e8;e.stun=0;
  g.admin.god=true;p.facing=0;p.stun=0;p.attackCd=0;p.cast=0;p.skillCds.fill(0);
  if(c.slot===3){
   window.__wheelTrace=[];
   const observeWheel=()=>{
    const seq=g.activeSwordSkill;
    if(seq?.skillId==='ironJudgment'&&window.__wheelTrace.length<300)
     window.__wheelTrace.push({t:seq.elapsed,x:p.x,y:p.y});
    if(!window.__wheelTraceStop)requestAnimationFrame(observeWheel);
   };
   requestAnimationFrame(observeWheel);
  }
  g.skill(c.slot);
  return {name:g.skillInfo(c.slot).name,mode:g.skillInfo(c.slot).cfg.mode,hp:e.hp,skillStarted:!!g.activeSwordSkill};
 },c);
 if(init.mode!==c.mode)throw Error('Wrong form '+c.id+' '+JSON.stringify(init));
 if(c.slot===2){
  // Capture after the ring and jump. A separate .06s browser read can overshoot
  // the .10s ring in slow CI and falsely report a failure.
  await page.waitForFunction(()=>window.__game?.activeSwordSkill?.elapsed>=.34,{timeout:30000,polling:35});
  const jumping=await page.evaluate(()=>{const g=window.__game,e=g.enemies.find(v=>v.type==='dummy');return {elapsed:g.activeSwordSkill?.elapsed,moved:g.player.x-3000,lift:g.player.skillLift,hits:e.testHitCount||0,flames:g.effects.filter(v=>['crimsonBladeFire','crimsonEdgeFlames','flameBreathPlume'].includes(v.type)).length};});
  if(jumping.moved<40||jumping.hits<1||jumping.flames<1)throw Error('Third form did not hit with its opening ring and jump without a pause: '+JSON.stringify(jumping));
  console.log('Third form opening ring -> uninterrupted jump:',JSON.stringify(jumping));
 }
 const elapsedTarget=[.42,.68,.73,.45,4.66][c.slot];
 const check=await page.waitForFunction(t=>{const g=window.__game;return g?.activeSwordSkill?.elapsed>=t?'reached':(!g?.activeSwordSkill&&g?.player?.skillPose===-1?'ended':false);},elapsedTarget,{timeout:180000,polling:60});
 if(await check.jsonValue()!=='reached')throw Error('Skill ended before capture: '+c.id);
 const frame=await page.evaluate(()=>{
  const g=window.__game,e=g.enemies.find(e=>e.type==='dummy'),seq=g.activeSwordSkill;
  return {id:seq?.skillId||'',elapsed:seq?.elapsed||0,
    fx:g.effects.length,types:[...new Set(g.effects.map(f=>f.type))],
    hp:e.hp,hitCount:e.testHitCount||0,damageTotal:e.testDamageTotal||0,hero:{x:g.player.x,y:g.player.y},pageError:g.error};
 });
 if(c.slot===3){
  // Check trace before screenshot rendering might advance the game past skill end.
  await page.waitForFunction(()=>window.__wheelTrace?.some(p=>p.t>=.66),{timeout:30000,polling:35});
  const trace=await page.evaluate(()=>{window.__wheelTraceStop=true;return window.__wheelTrace||[];});
  if(trace.length<8)throw Error('Missing continuous fourth-form movement trace: '+JSON.stringify(trace));
  const at=t=>trace.reduce((best,p)=>Math.abs(p.t-t)<Math.abs(best.t-t)?p:best,trace[0]);
  const second=at(.38),last=at(.63),travel=Math.hypot(last.x-second.x,last.y-second.y);
  const ys=trace.map(p=>p.y-trace[0].y),minSide=Math.min(...ys),maxSide=Math.max(...ys);
  if(travel<250||minSide> -55||maxSide<55||minSide< -120)
   throw Error('Fourth form must move through hit three along both sides of an S curve: '+JSON.stringify({travel,minSide,maxSide,second,last}));
  console.log('Fourth form continuous S-shaped movement verified:',JSON.stringify({travel,minSide,maxSide}));
 }
 await page.screenshot({path:'rpggametest/flame-preview/'+String(c.slot+1)+'-'+c.id+'.png'});
 if(errors.length||frame.pageError)throw Error('Runtime errors '+c.id+': '+errors.join(' | ')+' '+frame.pageError);
 if(frame.hitCount<1||frame.damageTotal<=0)throw Error('No hit registered for '+c.id+' '+JSON.stringify(frame));
 if(c.slot===2&&frame.hitCount<2)throw Error('Opening fire ring or landing attack did not register: '+JSON.stringify(frame));
 if(!frame.types.some(t=>['flameBreathPlume','crimsonBladeFire','crimsonEdgeFlames','crimsonChargeFlames','crimsonFlameBurst','ember'].includes(t)))throw Error('No real fire graphics '+c.id+' '+JSON.stringify(frame));
 report.push({slot:c.slot,name:init.name,mode:init.mode,hit:true,fx:frame.fx,effects:frame.types,hero:frame.hero});
 console.log(JSON.stringify(report.at(-1)));
 await context.close();
}
await browser.close();
console.log('PASSED: five original forms deal damage and render real fire during gameplay.');