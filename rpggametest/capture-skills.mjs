import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base=process.env.RPG_TEST_URL||'http://127.0.0.1:8123/rpggametest/';
const output='rpggametest/screenshots';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox','--disable-background-timer-throttling']});
const jobs=[
 {i:0,id:'guardBreak',frames:[['01_잔화_첫베기',.19],['01_잔화_재점화',.43]],distance:160},
 {i:1,id:'earthRend',frames:[['02_적련_곡선돌진',.68],['02_적련_올려베기',1.12]],distance:355},
 {i:2,id:'quakeRush',frames:[['03_회신_반격',.54],['03_회신_역베기',.64]],distance:155,counter:true},
 {i:3,id:'ironJudgment',frames:[['04_염맥_관통돌진',.67],['04_염맥_역베기',1.65]],distance:365},
 {i:4,id:'meteorBreaker',frames:[['05_종염_기모으기',.60],['05_종염_첫돌진',1.18],['05_종염_두번째돌진',2.20],['05_종염_세번째돌진',3.15],['05_종염_마지막일격',5.05]],distance:295}
];
const report=[];
try{
 for(const job of jobs)for(const [name,at] of job.frames){
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,locale:'ko-KR',reducedMotion:'no-preference'});
  await context.addInitScript(()=>{
   window.__PLAYTEST__=true;
   const original=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=cb=>window.__FREEZE_RENDER__?0:original(cb);
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__game?.mode==='play'&&window.__game?.enemies?.some(e=>e.type==='dummy'));
  await page.evaluate(({distance})=>{
   const g=window.__game,e=g.enemies.find(e=>e.type==='dummy'),p=g.player;
   e.x=p.x+distance;e.y=p.y;e.sx=e.x;e.sy=e.y;e.speed=0;e.damage=0;e.maxHp=e.hp=9999999;e.baseMaxHp=e.maxHp;
   p.facing=0;p.stun=0;p.cast=0;p.attackCd=0;p.skillCds.fill(0);
   g.updateHUD();
  },{distance:job.distance});
  await page.evaluate(i=>window.__game.skill(i),job.i);
  if(job.counter){
   await page.waitForFunction(()=>window.__game?.activeSwordSkill?.skillId==='quakeRush'&&window.__game.activeSwordSkill.elapsed>.07);
   const result=await page.evaluate(()=>{
    const g=window.__game,e=g.enemies.find(e=>e.type==='dummy');
    return g.hitPlayer(60,e,true);
   });
   if(result!=='dodged')throw Error('Counter did not activate: '+result);
  }
  await page.waitForFunction(({id,at})=>{
   const q=window.__game?.activeSwordSkill;
   return q?.skillId===id&&q.elapsed>=at;
  },{id:job.id,at},{timeout:12000});
  const meta=await page.evaluate(()=>{
   const g=window.__game,q=g.activeSwordSkill;
   window.__FREEZE_RENDER__=true;
   return {skillId:q?.skillId||'',elapsed:q?.elapsed??null,hero:{x:g.player.x,y:g.player.y},fx:g.effects.length,firstEffects:g.effects.slice(0,6).map(e=>e.type)};
  });
  if(meta.skillId!==job.id||meta.fx<1||errors.length)throw Error('Invalid captured frame '+name+': '+JSON.stringify({meta,errors}));
  const shot=join(output,name+'.png');
  await page.screenshot({path:shot,animations:'disabled'});
  report.push({shot,at,...meta,errors:[]});
  console.log(JSON.stringify(report.at(-1)));
  await context.close();
 }
 await writeFile(join(output,'capture-manifest.json'),JSON.stringify(report,null,2));
 console.log('CAPTURED '+report.length+' real game render frames at frozen engine timestamps');
}finally{await browser.close();}
