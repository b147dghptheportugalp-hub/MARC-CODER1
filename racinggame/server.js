const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const PORT = Number(process.env.PORT || 3003);
const players = new Map();
let nextId = 1;
function send(ws,message){if(ws.readyState===ws.OPEN)ws.send(JSON.stringify(message));}
function publicPlayer(p){return {id:p.id,name:p.name,x:p.x,y:p.y,angle:p.angle,speed:p.speed,modelType:p.modelType,lap:p.lap,color:p.color};}
function list(){return [...players.values()].map(publicPlayer);}
function broadcast(message,except=null){for(const p of players.values())if(p.id!==except)send(p.ws,message);}
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer((req,res)=>{if(req.url==='/health')return json(res,200,{ok:true,players:players.size});const pathname=decodeURIComponent((req.url||'/').split('?')[0]);const file=path.resolve(__dirname,pathname==='/'?'./index.html':`.${pathname}`);if(!file.startsWith(path.resolve(__dirname)))return json(res,403,{error:'Forbidden'});fs.readFile(file,(error,data)=>{if(error)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':path.extname(file)==='.html'?'text/html; charset=utf-8':'application/octet-stream','Cache-Control':'no-store'});res.end(data);});});
const wss=new WebSocketServer({server});
wss.on('connection',ws=>{const p={id:`p${nextId++}`,ws,name:'Racer',x:0,y:0,angle:0,speed:0,modelType:'red_supercar',lap:1,color:`hsl(${Math.floor(Math.random()*360)} 80% 60%)`};players.set(p.id,p);send(ws,{type:'welcome',id:p.id,players:list()});broadcast({type:'playerJoined',player:publicPlayer(p)},p.id);ws.on('message',raw=>{try{const m=JSON.parse(raw);if(m.type==='join'){p.name=String(m.name||'Racer').slice(0,20);p.modelType=String(m.modelType||p.modelType).slice(0,40);broadcast({type:'playerUpdated',player:publicPlayer(p)});}if(m.type==='state'){for(const key of ['x','y','angle','speed','lap'])if(Number.isFinite(Number(m[key])))p[key]=Number(m[key]);}}catch(_){}});ws.on('close',()=>{players.delete(p.id);broadcast({type:'playerLeft',id:p.id});});});
setInterval(()=>{if(players.size)broadcast({type:'snapshot',players:list()});},100);
server.listen(PORT,'0.0.0.0',()=>console.log(`Race.io server running on ${PORT}`));
