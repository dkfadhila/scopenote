import 'dotenv/config';
import { readConfig } from './config.js';
import { createTelemetry } from './telemetry.js';
import { createStorage } from './storage.js';
import { createScopeAgent } from './agent.js';
import { createApp } from './app.js';
const config=readConfig(),telemetry=createTelemetry(config),storage=createStorage(config);
const generate=createScopeAgent(config,telemetry);
const server=createApp(config,{storage,generate,telemetry}).listen(config.port,config.host,()=>console.log(`ScopeNote backend ready on port ${config.port}. Secrets are never printed.`));
server.requestTimeout=180000;
async function shutdown(){server.close();await Promise.allSettled([storage.close(),telemetry.close()]);process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
