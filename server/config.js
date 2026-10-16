export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const config = {
    production, accounts:env.ACCOUNT_MODE==='true'||(production&&env.ACCOUNT_MODE!=='false'), resendKey:env.RESEND_API_KEY||'',emailFrom:env.EMAIL_FROM||'', dailyAiLimit:Math.min(500,Math.max(1,Number(env.AI_DAILY_LIMIT)||50)), port: Number(env.PORT || 3001), host: production ? '0.0.0.0' : '127.0.0.1', origin: env.APP_ORIGIN || '',
    password: env.WORKSPACE_PASSWORD || '', sessionSecret: env.SESSION_SECRET || '',
    googleKey: env.GOOGLE_GENERATIVE_AI_API_KEY || '', model: env.GEMMA_MODEL || 'gemma-4-26b-a4b-it',
    mongoUri: env.MONGODB_URI || '', mongoDb: env.MONGODB_DATABASE || 'scopenote',
    allscaleKey:env.ALLSCALE_API_KEY||'',allscaleSecret:env.ALLSCALE_API_SECRET||'',allscaleEnabled:env.ALLSCALE_CHECKOUT_ENABLED==='true',
    sentryDsn: env.SENTRY_DSN || '', elevenKey: env.ELEVENLABS_API_KEY || '', elevenModel: env.ELEVENLABS_STT_MODEL || 'scribe_v2'
  };
  if (!/^gemma[-a-zA-Z0-9.:]+$/.test(config.model)) throw new Error('GEMMA_MODEL must identify an actual Gemma model, not Gemini or another family.');
  if (config.password && config.sessionSecret.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters when using a workspace password.');
  if (production && ((!config.accounts&&!config.password)||!config.origin||config.sessionSecret.length<32)) throw new Error('Production requires APP_ORIGIN and a SESSION_SECRET of at least 32 characters, plus WORKSPACE_PASSWORD in legacy mode.');
  if(config.accounts&&!config.mongoUri)throw new Error('Account mode requires MONGODB_URI.');
  if (config.origin && new URL(config.origin).origin !== config.origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
  return config;
}
