import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base=process.env.RPG_URL||'http://127.0.0.1:8123/rpggametest/';
const cases=[
 {slot:0,id:'guardBreak',ms:620,mode:'flameBreathSweep',hitTimes:2},
 {slot:1,id:'earthRend',ms:930,mode:'flameBreathRise',hitTimes:2},
 {slot:2,id:'quakeRush',ms:1000,mode:'flameBreathCleave',hitTimes:2},
 {slot:3,id:'ironJudgment',ms:1300,mode:'flameBreathWheel',hitTimes:3},
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
  e.x=p.x+260;e.y=p.y;e.sx=e.x;e.sy=e.y;e.r=25;e.testHitCount=0;e.testDamageTotal=0;e.speed=0;e.damage=0;e.maxHp=e.hp=1e8;e.baseMaxHp=1e8;e.stun=0;
  p.facing=0;p.stun=0;p.attackCd=0;p.cast=0;p.skillCds.fill(0);
  g.skill(c.slot);
  return {name:g.skillInfo(c.slot).name,mode:g.skillInfo(c.slot).cfg.mode,hp:e.hp,skillStarted:!!g.activeSwordSkill};
 },c);
 if(init.mode!==c.mode)throw Error('Wrong form '+c.id+' '+JSON.stringify(init));
 const elapsedTarget=[.54,1.02,1.00,1.31,5.16][c.slot];
 await page.waitForFunction(t=>window.__game?.activeSwordSkill?.elapsed>=t,elapsedTarget,{timeout:180000,polling:60});
 const frame=await page.evaluate(()=>{
  const g=window.__game,e=g.enemies.find(e=>e.type==='dummy'),seq=g.activeSwordSkill;
  return {id:seq?.skillId||'',elapsed:seq?.elapsed||0,
    fx:g.effects.length,types:[...new Set(g.effects.map(f=>f.type))],
    hp:e.hp,hitCount:e.testHitCount||0,damageTotal:e.testDamageTotal||0,hero:{x:g.player.x,y:g.player.y},pageError:g.error};
 });
 await page.screenshot({path:'rpggametest/flame-preview/'+String(c.slot+1)+'-'+c.id+'.png'});
 if(errors.length||frame.pageError)throw Error('Runtime errors '+c.id+': '+errors.join(' | ')+' '+frame.pageError);
 if(frame.hitCount<1||frame.damageTotal<=0)throw Error('No hit registered for '+c.id+' '+JSON.stringify(frame));
 if(!frame.types.some(t=>['flameBreathPlume','crimsonBladeFire','crimsonEdgeFlames','crimsonChargeFlames','crimsonFlameBurst','ember'].includes(t)))throw Error('No real fire graphics '+c.id+' '+JSON.stringify(frame));
 report.push({slot:c.slot,name:init.name,mode:init.mode,hit:true,fx:frame.fx,effects:frame.types,hero:frame.hero});
 console.log(JSON.stringify(report.at(-1)));
 await context.close();
}
await browser.close();
console.log('PASSED: five original forms deal damage and render real fire during gameplay.');