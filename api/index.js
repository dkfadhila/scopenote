import 'dotenv/config';
import {readConfig} from '../server/config.js';
import {createTelemetry} from '../server/telemetry.js';
import {createStorage} from '../server/storage.js';
import {createScopeAgent} from '../server/agent.js';
import {createApp} from '../server/app.js';

// Reuse warm clients; serverless invocations must not create listeners or timers.
const config=readConfig(),telemetry=createTelemetry(config),storage=createStorage(config);
export default createApp(config,{storage,telemetry,generate:createScopeAgent(config,telemetry)});
