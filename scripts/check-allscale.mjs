import 'dotenv/config';
import {createAllscaleProbe} from '../server/allscale.js';

const probe=createAllscaleProbe({apiKey:process.env.ALLSCALE_API_KEY,apiSecret:process.env.ALLSCALE_API_SECRET});
try{
  const ping=await probe('/v1/test/ping');
  if(ping.code!==0||ping.payload?.pong!=='ok')throw new Error(`AllScale authentication failed (HTTP ${ping.httpStatus}, code ${ping.code}).`);
  console.log('AllScale signed GET: passed.');
  const failed=await probe('/v1/test/fail');
  if(failed.code===0)throw new Error('AllScale error probe unexpectedly succeeded.');
  console.log('AllScale expected error response: passed.');
  const posted=await probe('/v1/test/post',{method:'POST',data:{probe:'scopenote-connectivity'}});
  if(posted.code!==0)throw new Error(`AllScale signed POST failed (code ${posted.code}).`);
  console.log('AllScale signed POST: passed. No checkout or transfer was created.');
}catch(error){console.error(error.name==='TimeoutError'?'AllScale connectivity timed out.':error.message);process.exitCode=1;}
