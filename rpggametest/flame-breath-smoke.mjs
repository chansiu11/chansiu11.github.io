import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base=process.env.RPG_URL||'http://127.0.0.1:8123/rpggametest/';
const cases=[
 {slot:0,id:'guardBreak',ms:620,mode:'flameBreathSweep',hitTimes:2},
 {slot:1,id:'earthRend',ms:700,mode:'flameBreathRise',hitTimes:1},
 {slot:2,id:'quakeRush',ms:1000,mode:'flameBreathCleave',hitTimes:2},
 {slot:3,id:'ironJudgment',ms:720,mode:'flameBreathWheel',hitTimes:3},
 {slot:4,id:'meteorBreaker',ms:4220,mode:'flameBreathFinale',hitTimes:9}
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
  e.x=p.x+(c.slot===1?32:c.slot===2?140:260);e.y=p.y;e.sx=e.x;e.sy=e.y;e.r=25;e.testHitCount=0;e.testDamageTotal=0;e.speed=0;e.damage=0;e.maxHp=e.hp=1e8;e.baseMaxHp=1e8;e.stun=0;
  g.admin.god=true;p.facing=0;p.stun=0;p.attackCd=0;p.cast=0;p.skillCds.fill(0);
  if(c.slot===1){
   window.__riseTrace=[];
   const observeRise=()=>{
    const seq=g.activeSwordSkill;
    if(seq?.skillId==='earthRend'&&window.__riseTrace.length<100)
     window.__riseTrace.push({t:seq.elapsed,x:p.x,y:p.y,fx:g.effects.some(q=>q.type==='crimsonBladeFire'||q.type==='crimsonFlameBurst')});
    if(!window.__riseTraceStop)requestAnimationFrame(observeRise);
   };
   requestAnimationFrame(observeRise);
  }
  if(c.slot===4){
   window.__finaleTrace=[];
   const observeFinale=()=>{
    const seq=g.activeSwordSkill;
    if(seq?.skillId==='meteorBreaker'&&seq.flameCaught&&window.__finaleTrace.length<250)
     window.__finaleTrace.push({since:seq.elapsed-seq.flameCaughtAt,stage:seq.flameStage,hits:e.testHitCount||0,x:p.x,y:p.y,teleports:seq.flameTeleports||0,vortexFrames:seq.flameVortexFrames||0,vortexX:seq.flameVortexCenterX,vortexY:seq.flameVortexCenterY,vortexR:seq.flameVortexRadius,attackerR:seq.flameVortexAttackerDistance,sprays:seq.flameVortexSprays,fireTongues:seq.flameVortexParticleCount,solidFill:seq.flameVortexSolidFill,playerClear:seq.flameVortexPlayerClear,enemyX:e.x,enemyY:e.y});
    if(!window.__finaleTraceStop)requestAnimationFrame(observeFinale);
   };
   requestAnimationFrame(observeFinale);
  }
  if(c.slot===3){
   window.__wheelTrace=[];
   const observeWheel=()=>{
    const seq=g.activeSwordSkill;
    if(seq?.skillId==='ironJudgment'&&window.__wheelTrace.length<300)
     window.__wheelTrace.push({t:seq.elapsed,x:p.x,y:p.y,enemyX:e.x,enemyY:e.y,hits:e.testHitCount||0});
    if(!window.__wheelTraceStop)requestAnimationFrame(observeWheel);
   };
   requestAnimationFrame(observeWheel);
  }
  g.skill(c.slot);
  return {name:g.skillInfo(c.slot).name,mode:g.skillInfo(c.slot).cfg.mode,hp:e.hp,skillStarted:!!g.activeSwordSkill,pvpBot:e.pvpTrainingBot===true,botName:e.name,botDamage:e.damage};
 },c);
 if(init.mode!==c.mode)throw Error('Wrong form '+c.id+' '+JSON.stringify(init));
 if(!init.pvpBot||init.botName!=='PVP 연습 봇'||init.botDamage!==0)throw Error('Inert PVP training bot was not imported: '+JSON.stringify(init));
 if([1,2,3].includes(c.slot)){
  // Character animations must move the actual sword arm AND both legs, not just fire particles.
  const poses=await page.evaluate(({id,slot})=>{
   const g=window.__game,a=0,sy=-42,hy=-56;
   const ready=g.hongryeonLimbPose(id,true,.95,1,1,a,sy,hy);
   const readyOpposite=g.hongryeonLimbPose(id,true,.95,-1,1,a,sy,hy);
   const elapsed=slot===1?.45:slot===2?.51:.44;
   const strike=g.hongryeonLimbPose(id,false,elapsed,1,1,a,sy,hy);
   const strikeOpposite=g.hongryeonLimbPose(id,false,elapsed,-1,1,a,sy,hy);
   return {ready,readyOpposite,strike,strikeOpposite};
  },{id:c.id,slot:c.slot});
  const moved=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)>4;
  if(!moved(poses.ready.hand,poses.strike.hand)||
     !moved(poses.ready.leg,poses.strike.leg)||
     !moved(poses.readyOpposite.hand,poses.strikeOpposite.hand)||
     !moved(poses.readyOpposite.leg,poses.strikeOpposite.leg)||
     !Number.isFinite(poses.ready.swordA)||!Number.isFinite(poses.strike.swordA))
   throw Error('Hongryeon limb pose not animated for '+c.id+': '+JSON.stringify(poses));
  console.log('Ready + active sword, both arms and both legs verified:',c.id);
 }

 if(c.slot===4){
  // Only the ultimate gets the requested .50s animation charge; no early dash.
  await page.waitForFunction(()=>window.__game?.player?.skillKind?.startsWith('prepare:')&&window.__game.player.attackAnim<.28,{timeout:30000,polling:25});
  const charge=await page.evaluate(()=>{const g=window.__game;return {remaining:g.player.attackAnim,total:g.player.attackDuration,active:!!g.activeSwordSkill};});
  if(Math.abs(charge.total-.5)>.001||charge.active||charge.remaining<=0)
   throw Error('Ultimate did not use its full half-second charge: '+JSON.stringify(charge));
  console.log('Fifth form .5 second preparation verified:',JSON.stringify(charge));
 }
 if(c.slot===2){
  // Capture after the ring and jump. A separate .06s browser read can overshoot
  // the .10s ring in slow CI and falsely report a failure.
  await page.waitForFunction(()=>window.__game?.activeSwordSkill?.elapsed>=.34,{timeout:30000,polling:35});
  const jumping=await page.evaluate(()=>{const g=window.__game,e=g.enemies.find(v=>v.type==='dummy');return {elapsed:g.activeSwordSkill?.elapsed,moved:g.player.x-3000,lift:g.player.skillLift,hits:e.testHitCount||0,flames:g.effects.filter(v=>['crimsonBladeFire','crimsonEdgeFlames','flameBreathPlume'].includes(v.type)).length};});
  if(jumping.moved<40||jumping.hits<1||jumping.flames<1)throw Error('Third form did not hit with its opening ring and jump without a pause: '+JSON.stringify(jumping));
  console.log('Third form opening ring -> uninterrupted jump:',JSON.stringify(jumping));
 }
 const elapsedTarget=[.42,.56,.65,.45,.41][c.slot];
 // For the short third form, accept confirmed second-hit telemetry even when
 // software-rendered CI misses the final 0.2-second animation window.
 const check=await page.waitForFunction(({t,slot})=>{
  const g=window.__game,e=g?.enemies?.find(v=>v.type==='dummy');
  if(slot===2&&e?.testHitCount>=2)return 'reached';
  return g?.activeSwordSkill?.elapsed>=t?'reached':(!g?.activeSwordSkill&&g?.player?.skillPose===-1?'ended':false);
 },{t:elapsedTarget,slot:c.slot},{timeout:180000,polling:35});
 if(await check.jsonValue()!=='reached'&&!([1,2].includes(c.slot)))
  throw Error('Skill ended before capture: '+c.id);
 const frame=await page.evaluate(()=>{
  const g=window.__game,e=g.enemies.find(e=>e.type==='dummy'),seq=g.activeSwordSkill;
  return {id:seq?.skillId||'',elapsed:seq?.elapsed||0,
    fx:g.effects.length,types:[...new Set(g.effects.map(f=>f.type))],
    hp:e.hp,maxHp:e.maxHp,hitCount:e.testHitCount||0,damageTotal:e.testDamageTotal||0,hero:{x:g.player.x,y:g.player.y},pageError:g.error};
 });
 if(c.slot===1){
  const trace=await page.evaluate(()=>{window.__riseTraceStop=true;return window.__riseTrace||[];});
  if(trace.length<8)throw Error('Missing second-form straight dash trace: '+JSON.stringify(trace));
  const at=t=>trace.reduce((best,p)=>Math.abs(p.t-t)<Math.abs(best.t-t)?p:best,trace[0]);
  const a=at(.08),b=at(.20),c1=at(.36),d=at(.50),firstSpeed=(b.x-a.x)/(b.t-a.t),lastSpeed=(d.x-c1.x)/(d.t-c1.t);
  const drift=Math.max(...trace.map(p=>Math.abs(p.y-trace[0].y)));
  // Bot starts just 32 units down the path, over 250+its radius outside the
  // finish ring. A registered hit here proves the full dash path deals damage.
  const pathOnlyOutsideCircle=Math.abs(d.x-(3000+32))>250+25;
  if(firstSpeed<lastSpeed*1.8||Math.abs(d.x-3000-328)>18||drift>4||
     !pathOnlyOutsideCircle||frame.hitCount!==1||!trace.some(p=>p.fx))
   throw Error('Second form must damage the dash path and end ring simultaneously at .50s: '+
    JSON.stringify({firstSpeed,lastSpeed,final:d,drift,pathOnlyOutsideCircle,hitCount:frame.hitCount,types:frame.types}));
  console.log('Second form straight decelerating dash PATH hit outside end ring:',JSON.stringify({firstSpeed,lastSpeed,travel:d.x-trace[0].x,drift}));
 }
 if(c.slot===4){
  // Confirm first collision arrests the dash, then crossing cuts and the final seal land.
  const state=await page.evaluate(()=>{const g=window.__game;return {caught:!!g.activeSwordSkill?.flameCaught,target:g.activeSwordSkill?.flameTargetId,heroX:g.player.x,hits:g.enemies.find(e=>e.type==='dummy')?.testHitCount||0};});
  if(!state.caught||state.hits<2||Math.abs(state.heroX-3000)>350)
   throw Error('Fifth form did not stop on contact and follow up: '+JSON.stringify(state));
  console.log('Fifth form collision -> authored sword combo:',JSON.stringify(state));
  // Physical sword and both legs must visibly form DIFFERENT poses for the
  // irregularly timed horizontal, reverse, thrust, overhead and rising cuts.
  const swordMoves=await page.evaluate(()=>{
   const g=window.__game,at=[.20,.55,.73,1.21,1.55,2.11,2.43,3.25];
   return at.map(t=>{
    const right=g.hongryeonLimbPose('meteorBreaker',false,t,1,1,0,-42,-56),
     left=g.hongryeonLimbPose('meteorBreaker',false,t,-1,1,0,-42,-56);
    return {t,hand:right.hand,otherHand:left.hand,blade:right.swordA,
     frontFoot:right.leg,backFoot:left.leg};
   });
  });
  const unique=(v)=>new Set(v.map(x=>JSON.stringify(x))).size;
  const gaps=swordMoves.slice(1).map((v,i)=>Number((v.t-swordMoves[i].t).toFixed(2)));
  if(unique(swordMoves.map(v=>v.hand))<5||unique(swordMoves.map(v=>v.blade.toFixed(2)))<5||
     unique(swordMoves.map(v=>v.frontFoot))<4||new Set(gaps).size<5)
   throw Error('Ultimate needs distinct physical sword methods and irregular timing: '+
    JSON.stringify({swordMoves,gaps}));
  console.log('Irregular physical sword slashes and both feet verified:',JSON.stringify({gaps,poses:swordMoves.length}));
 }
 if(c.slot===3){
  // Check trace before screenshot rendering might advance the game past skill end.
  await page.waitForFunction(()=>window.__wheelTrace?.some(p=>p.t>=.66),{timeout:30000,polling:35});
  const trace=await page.evaluate(()=>{window.__wheelTraceStop=true;return window.__wheelTrace||[];});
  if(trace.length<8)throw Error('Missing continuous fourth-form movement trace: '+JSON.stringify(trace));
  const at=t=>trace.reduce((best,p)=>Math.abs(p.t-t)<Math.abs(best.t-t)?p:best,trace[0]);
  const second=at(.38),last=at(.63),travel=Math.hypot(last.x-second.x,last.y-second.y);
  const ys=trace.map(p=>p.y-trace[0].y),minSide=Math.min(...ys),maxSide=Math.max(...ys);
  const beforeCarry=at(.23),duringCarry=at(.53),victimTravel=Math.hypot(
   duringCarry.enemyX-beforeCarry.enemyX,duringCarry.enemyY-beforeCarry.enemyY);
  if(travel<250||minSide> -55||maxSide<55||minSide< -120||
     victimTravel<220||duringCarry.hits<2||last.hits<3)
   throw Error('Fourth form must carry the first hit into two followups while moving in an S curve: '+
    JSON.stringify({travel,minSide,maxSide,victimTravel,beforeCarry,duringCarry,last}));
  console.log('Fourth form 3-hit S-dash and target carry verified:',JSON.stringify({travel,minSide,maxSide,victimTravel,hits:last.hits}));
 }
 await page.screenshot({path:'rpggametest/flame-preview/'+String(c.slot+1)+'-'+c.id+'.png'});
 if(c.slot===4){
  await page.waitForFunction(()=>window.__game?.enemies?.find(e=>e.type==='dummy')?.testHitCount>=9,{timeout:30000,polling:35});
  const end=await page.evaluate(()=>{const g=window.__game,e=g.enemies.find(v=>v.type==='dummy');return {hits:e.testHitCount,damage:e.testDamageTotal,x:g.player.x};});
  const trace=await page.evaluate(()=>{window.__finaleTraceStop=true;return window.__finaleTrace||[];});
  const sawOriginalCrosscuts=trace.some(p=>p.since>=1.21&&p.stage>=4);
  const sawExtraCrescents=trace.some(p=>p.since>=2.11&&p.stage>=6);
  const sawRisingCut=trace.some(p=>p.since>=2.43&&p.stage>=7);
  const sawLateFinale=trace.some(p=>p.since>=3.25&&p.stage===8);
  // The hit-confirmed follow-up stands still between the eight original cuts,
  // blinking between fixed sword stances under the foreground flame vortex.
  const teleportCount=Math.max(...trace.map(p=>p.teleports||0),0);
  const vortexFrames=Math.max(...trace.map(p=>p.vortexFrames||0),0);
  const slideBetweenCuts=trace.slice(1).filter((p,i)=>p.stage===trace[i].stage&&
    Math.hypot(p.x-trace[i].x,p.y-trace[i].y)>7);
  if(teleportCount<6||vortexFrames<15||slideBetweenCuts.length)
   throw Error('Fifth form must blink between stationary sword strikes inside a persistent vortex: '+
    JSON.stringify({teleportCount,vortexFrames,slideBetweenCuts:slideBetweenCuts.slice(0,3)}));
  const centered=trace.filter(p=>p.vortexFrames>=3&&Number.isFinite(p.vortexX)&&Number.isFinite(p.vortexR));
  if(centered.length<10||centered.some(p=>
   Math.abs(p.vortexX-p.enemyX)>4||Math.abs(p.vortexY-p.enemyY)>4||
   p.vortexR<p.attackerR+100||p.sprays<44||p.fireTongues<176||p.solidFill!==false||p.playerClear!==true))
   throw Error('Fifth form vortex must surround the victim, keep the player clear, and add irregular outer flames: '+
    JSON.stringify({samples:centered.length,first:centered[0],last:centered.at(-1)}));
  console.log('Victim-centered dense outer fire, player exclusion, no filled sheet verified:',
   JSON.stringify({samples:centered.length,radius:centered.at(-1).vortexR,sparks:centered.at(-1).sprays}));
  if(end.hits<9||end.damage<=0||!sawOriginalCrosscuts||!sawExtraCrescents||!sawRisingCut||!sawLateFinale)
   throw Error('Extended ultimate must land all eight follow-up hits and its delayed fire seal: '+
    JSON.stringify({end,sawOriginalCrosscuts,sawExtraCrescents,sawRisingCut,sawLateFinale,traceEnd:trace.slice(-5)}));
  console.log('Fifth form seven uniquely animated slashes and delayed finishing strike verified:',JSON.stringify({end,latest:trace.slice(-3)}));
 }
 if(errors.length||frame.pageError)throw Error('Runtime errors '+c.id+': '+errors.join(' | ')+' '+frame.pageError);
 if(frame.hitCount<1||frame.damageTotal<=0)throw Error('No hit registered for '+c.id+' '+JSON.stringify(frame));
 if(frame.hp!==frame.maxHp)throw Error('PVP practice bot must never lose health: '+JSON.stringify(frame));
 if(c.slot===2&&frame.hitCount<2)throw Error('Opening fire ring or landing attack did not register: '+JSON.stringify(frame));
 if(![1,2].includes(c.slot)&&!frame.types.some(t=>['flameBreathPlume','crimsonBladeFire','crimsonEdgeFlames','crimsonChargeFlames','crimsonFlameBurst','ember'].includes(t)))throw Error('No real fire graphics '+c.id+' '+JSON.stringify(frame));
 report.push({slot:c.slot,name:init.name,mode:init.mode,hit:true,fx:frame.fx,effects:frame.types,hero:frame.hero});
 console.log(JSON.stringify(report.at(-1)));
 await context.close();
}
// Separately verify that a dash which strikes absolutely nothing ends WITHOUT cross-slashes.
{
 const context=await browser.newContext({viewport:{width:1280,height:760},locale:'ko-KR'});
 await context.addInitScript(()=>{window.__PLAYTEST__=true;});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__game?.mode==='play'&&!!window.__game?.enemies?.find(e=>e.type==='dummy'));
 await page.evaluate(()=>{
  const g=window.__game,p=g.player,e=g.enemies.find(v=>v.type==='dummy');
  e.x=p.x+3200;e.y=p.y+3000;e.sx=e.x;e.sy=e.y;e.speed=0;e.damage=0;
  e.testHitCount=0;e.testDamageTotal=0;g.admin.god=true;
  p.stun=0;p.attackCd=0;p.cast=0;p.skillCds.fill(0);p.facing=0;
  g.skill(4);
 });
 await page.waitForFunction(()=>!!window.__game?.activeSwordSkill,{timeout:30000,polling:35});
 await page.waitForFunction(()=>!window.__game?.activeSwordSkill&&window.__game?.player?.cast===0,{timeout:30000,polling:35});
 const miss=await page.evaluate(()=>{const g=window.__game,e=g.enemies.find(v=>v.type==='dummy');return {hits:e.testHitCount||0,damage:e.testDamageTotal||0,pose:g.player.skillPose,moved:Math.hypot(g.player.x-3000,g.player.y-3000),pageError:g.error};});
 if(miss.hits!==0||miss.damage!==0||miss.pose!==-1||miss.moved<350||errors.length||miss.pageError)
  throw Error('Missed fifth form must rush then exit with no follow-up: '+JSON.stringify({miss,errors}));
 console.log('Fifth form miss -> full dash and instant exit:',JSON.stringify(miss));
 await context.close();
}
await browser.close();
console.log('PASSED: all five forms, ultimate hit-confirm finisher and miss exit.');