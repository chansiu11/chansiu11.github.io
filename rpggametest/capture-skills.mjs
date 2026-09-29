import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.RPG_TEST_URL || 'http://127.0.0.1:8123/rpggametest/';
const output = 'rpggametest/screenshots';
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
const jobs = [
  {i:0,id:'guardBreak',frames:[['01_잔화_첫베기',360],['01_잔화_재점화',610]],distance:160},
  {i:1,id:'earthRend',frames:[['02_적련_곡선돌진',800],['02_적련_올려베기',1250]],distance:355},
  {i:2,id:'quakeRush',frames:[['03_회신_반격',390],['03_회신_역베기',520]],distance:155,counter:true},
  {i:3,id:'ironJudgment',frames:[['04_염맥_관통돌진',790],['04_염맥_역베기',1800]],distance:365},
  {i:4,id:'meteorBreaker',frames:[['05_종염_기모으기',560],['05_종염_첫돌진',1380],['05_종염_두번째돌진',2370],['05_종염_세번째돌진',3300],['05_종염_마지막일격',5210]],distance:295}
];
const report=[];
for (const job of jobs) {
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,locale:'ko-KR',reducedMotion:'no-preference'});
  await context.addInitScript(()=>{window.__PLAYTEST__=true;});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__game?.mode==='play'&&window.__game?.enemies?.some(e=>e.type==='dummy'),{timeout:30000});
  await page.evaluate(({distance})=>{
    const g=window.__game,e=g.enemies.find(e=>e.type==='dummy'),p=g.player;
    e.x=p.x+distance;e.y=p.y;e.sx=e.x;e.sy=e.y;e.speed=0;e.damage=0;e.maxHp=e.hp=9999999;e.baseMaxHp=e.maxHp;
    p.facing=0;p.stun=0;p.cast=0;p.attackCd=0;p.skillCds.fill(0);
    g.updateHUD();
  },{distance:job.distance});
  await page.evaluate(i=>window.__game.skill(i),job.i);
  if(job.counter){
    await page.waitForFunction(()=>window.__game?.activeSwordSkill?.skillId==='quakeRush',{timeout:10000});
    await page.waitForTimeout(90);
    const result=await page.evaluate(()=>{
      const g=window.__game,e=g.enemies.find(e=>e.type==='dummy');
      return g.hitPlayer(60,e,true);
    });
    if(result!=='dodged')throw Error('Counter did not activate: '+result);
    console.log('Counter activated from actual dummy incoming hit.');
  }
  const started=Date.now();
  for(const [name,when] of job.frames){
    if(job.counter){
      // Counter screenshots are timed from the actual successful counter event.
      const counterTimes={'03_회신_반격':25,'03_회신_역베기':120};
      const delta=counterTimes[name]-(Date.now()-started);
      if(delta>0)await page.waitForTimeout(delta);
    }else{
      const delta=when-(Date.now()-started);
      if(delta>0)await page.waitForTimeout(delta);
    }
    const shot=join(output,name+'.png');
    await page.screenshot({path:shot,animations:'allow'});
    const data=await page.evaluate(()=>{
      const g=window.__game;
      return {skillId:g.activeSwordSkill?.skillId||'',elapsed:g.activeSwordSkill?.elapsed??null,hero:{x:g.player.x,y:g.player.y},fx:g.effects.length,firstEffects:g.effects.slice(0,3).map(e=>e.type)};
    });
    report.push({shot,...data,errors:errors.slice()});
    console.log(JSON.stringify(report.at(-1)));
  }
  if(errors.length)throw Error('Browser runtime errors in '+job.id+': '+errors.join(' | '));
  await context.close();
}
await browser.close();
console.log('CAPTURED '+report.length+' genuine in-game frames');