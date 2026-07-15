import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = import.meta.dirname;
const db = new DatabaseSync(resolve(root, 'data/karaoke.sqlite'));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
const rows = () => db.prepare(`SELECT analysis_id analysisId, played_at playedAt, title, artist, mode, score,
  pitch, stability, long_tone longTone, intonation, technique, ai_bonus aiBonus,
  kobushi, shakuri, vibrato, vibrato_type vibratoType FROM scores ORDER BY played_at DESC`).all().map(x=>({
    ...x, metrics:{'音程':x.pitch,'安定感':x.stability,'ロングトーン':x.longTone,'抑揚':x.intonation,'テクニック':x.technique},
    techniques:{'こぶし':x.kobushi,'しゃくり':x.shakuri,'ビブラート':x.vibrato}
  }));
const send=(res,status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data)};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/scores'&&req.method==='GET')return send(res,200,{scores:rows()});
  if(url.pathname==='/api/health')return send(res,200,{ok:true,count:db.prepare('SELECT count(*) count FROM scores').get().count});
  if(url.pathname==='/api/export')return send(res,200,{exportedAt:new Date().toISOString(),scores:rows()});
  if(url.pathname==='/api/import'&&req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;
    try{const body=JSON.parse(raw),list=body.scores||body;if(!Array.isArray(list))throw Error('scores must be an array');
      const stmt=db.prepare(`INSERT INTO scores(analysis_id,played_at,title,artist,mode,score,pitch,stability,long_tone,intonation,technique,ai_bonus,kobushi,shakuri,vibrato,vibrato_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(analysis_id) DO UPDATE SET played_at=excluded.played_at,title=excluded.title,artist=excluded.artist,mode=excluded.mode,score=excluded.score,pitch=excluded.pitch,stability=excluded.stability,long_tone=excluded.long_tone,intonation=excluded.intonation,technique=excluded.technique,ai_bonus=excluded.ai_bonus,kobushi=excluded.kobushi,shakuri=excluded.shakuri,vibrato=excluded.vibrato,vibrato_type=excluded.vibrato_type,imported_at=CURRENT_TIMESTAMP`);
      db.exec('BEGIN');for(const x of list)stmt.run(x.analysisId,x.playedAt,x.title,x.artist,x.mode,x.score,x.metrics?.['音程'],x.metrics?.['安定感'],x.metrics?.['ロングトーン'],x.metrics?.['抑揚'],x.metrics?.['テクニック'],x.aiBonus||0,x.techniques?.['こぶし']||0,x.techniques?.['しゃくり']||0,x.techniques?.['ビブラート']||0,x.vibratoType||0);db.exec('COMMIT');return send(res,200,{ok:true,imported:list.length,total:rows().length});
    }catch(e){try{db.exec('ROLLBACK')}catch{}return send(res,400,{ok:false,error:e.message})}
  }
  let file=join(root,'dist',url.pathname==='/'?'index.html':url.pathname);if(!existsSync(file)||statSync(file).isDirectory())file=join(root,'dist','index.html');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res);
});
server.listen(4173,'127.0.0.1',()=>console.log('KARAOKE LOG → http://127.0.0.1:4173'));
