const fs = require('fs');
const path = require('path');
const os = require('os');

(async function(){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-tele-'));
  const bufferPath = path.join(tmp, 'buf.jsonl');
  console.log('bufferPath', bufferPath);
  {
    const { initTelemetry } = require('../lib/telemetry');
    const pjson = require('../package.json');
    const t = initTelemetry({ analytics: { enabled: true, endpoint: 'http://127.0.0.1:1/v1/event', bufferPath, flushIntervalMs: 999999999, batchSize: 2 } }, pjson, false);
    console.log('created t unreachable');
    await t.send('t1', { n: 1 });
    await t.send('t2', { n: 2 });
    console.log('sent t1,t2');
  }
  await new Promise(r => setTimeout(r, 100));
  console.log('file exists?', fs.existsSync(bufferPath));
  console.log('file content:', fs.existsSync(bufferPath) ? fs.readFileSync(bufferPath,'utf8') : '(missing)');

  const http = require('http');
  let count = 0;
  let server;
  await new Promise((resolve) => {
    server = http.createServer((req,res)=>{
      if (req.method !== 'POST' || !req.url.startsWith('/v1/event')) { res.writeHead(404).end(); return; }
      req.on('data', ()=>{});
      req.on('end', ()=>{ count++; console.log('server got post', count); res.writeHead(204).end(); if(count>=2){ server.close(()=>{ console.log('server closed'); resolve(); })}});
    });
    server.listen(0,'127.0.0.1', async ()=>{
      const { port } = server.address();
      const endpoint = `http://127.0.0.1:${port}/v1/event`;
      console.log('server listening', endpoint);
      const { initTelemetry } = require('../lib/telemetry');
      const pjson = require('../package.json');
      const t2 = initTelemetry({ analytics: { enabled: true, endpoint, bufferPath, flushIntervalMs: 999999999, batchSize: 5 } }, pjson, false);
      console.log('created t2');
      await t2.flushNow();
      console.log('flushNow done');
    });
  });
  console.log('count', count);
  // final check
  await new Promise(r=>setTimeout(r,50));
  const after = fs.existsSync(bufferPath) ? fs.readFileSync(bufferPath,'utf8') : '';
  console.log('after file:', JSON.stringify(after));
})();
