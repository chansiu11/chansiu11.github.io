const WebSocket = require("ws");
const http = require("http");

const server = http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/plain"});
  res.end("Mobile FPS server is running.");
});
const wss = new WebSocket.Server({server});
const players = new Map();
let nextId=1;

function broadcast(obj){
  const data=JSON.stringify(obj);
  for(const p of players.values()) if(p.ws.readyState===WebSocket.OPEN)p.ws.send(data);
}
function state(){
  return {type:"state",players:Object.fromEntries(
    [...players].map(([id,p])=>[id,{id,x:p.x,y:p.y,a:p.a}])
  )};
}
wss.on("connection",ws=>{
  const id=String(nextId++);
  players.set(id,{ws,x:Math.random()*400-200,y:Math.random()*400-200,a:0,hp:100});
  ws.send(JSON.stringify({type:"welcome",id}));
  ws.on("message",raw=>{
    try{
      const m=JSON.parse(raw);
      const p=players.get(id); if(!p)return;
      if(m.type==="move"){p.x=Number(m.x)||0;p.y=Number(m.y)||0;p.a=Number(m.a)||0}
      if(m.type==="shoot"){
        // 간단한 서버 판정: 발사자 전방의 가장 가까운 플레이어에게 피해
        let target=null,best=Infinity;
        for(const [oid,q] of players){
          if(oid===id)continue;
          const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
          const dir=Math.atan2(dy,dx)-p.a;
          const diff=Math.atan2(Math.sin(dir),Math.cos(dir));
          if(d<500 && Math.abs(diff)<0.12 && d<best){best=d;target=q}
        }
        if(target){
          target.hp-=25;
          if(target.hp<=0){target.hp=100;target.x=Math.random()*400-200;target.y=Math.random()*400-200}
          target.ws.send(JSON.stringify({type:"hit",hp:target.hp}));
        }
      }
      broadcast(state());
    }catch{}
  });
  ws.on("close",()=>{players.delete(id);broadcast(state())});
  broadcast(state());
});
server.listen(8080,()=>console.log("FPS server: http://localhost:8080"));
