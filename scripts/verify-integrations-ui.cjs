const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const {sampleScope}=await import('../src/domain.js');
  const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('dialog',dialog=>dialog.accept());
  const projects=new Map();
  const services=[{id:'gemma',name:'Gemma · test model',configured:true},{id:'elevenlabs',name:'ElevenLabs',configured:true}];
  // Provider and DB responses are intercepted: these checks never spend credits or prove live integrations.
  await page.route('**/api/status',route=>route.fulfill({json:{authenticated:true,passwordRequired:false,storage:'mongodb',services}}));
  await page.route('**/api/projects',route=>route.fulfill({json:{projects:[...projects.values()]}}));
  await page.route('**/api/projects/*',async route=>{
    const req=route.request();
    if(req.method()==='PUT'){const project={...req.postDataJSON(),revision:1};projects.set(project.id,project);return route.fulfill({json:{project}});}
    if(req.method()==='DELETE'){projects.delete(req.url().split('/').pop());return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{history:[]}});
  });
  await page.route('**/api/transcribe',route=>route.fulfill({json:{text:'Please design a three page coffee shop website with a menu, location and contact information. No online orders.',model:'test transcription'}}));
  await page.route('**/api/scope',route=>{assert.match(route.request().postDataJSON().brief,/coffee shop/);return route.fulfill({json:{scope:sampleScope,model:'test Gemma response',durationMs:123,inputTokens:123,outputTokens:234}});});
  await page.goto('http://127.0.0.1:5178/');
  await page.getByRole('button',{name:'New project',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Client name').fill('Kopi Ruang');
  await page.getByRole('dialog').getByLabel('Project name').fill('Coffee shop site');
  await page.getByRole('dialog').getByRole('button',{name:'Create project',exact:true}).click();
  await page.getByLabel('Voice brief file').setInputFiles({name:'brief.wav',mimeType:'audio/wav',buffer:Buffer.from('stubbed test audio')});
  await page.getByLabel('What did they have in mind?').filter({hasText:''}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#brief').value.includes('coffee shop'));
  await page.getByRole('button',{name:'Shape this into a scope'}).click();
  await page.getByLabel('Project overview').fill('A reviewed coffee shop website scope.');
  await page.getByLabel('Details for Discovery & visual direction').fill('Client-reviewed kickoff and direction.');
  await page.getByRole('tab',{name:'Questions (3)'}).click();
  await page.getByLabel('Clarification question 1').fill('Who will supply final menu prices?');
  await page.getByLabel('Exclusion 1',{exact:true}).fill('Online ordering and payments');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('MongoDB'));
  const stored=[...projects.values()][0];assert.equal(stored.scope.summary,'A reviewed coffee shop website scope.');assert.equal(stored.scope.questions[0],'Who will supply final menu prices?');assert.equal(stored.scope.exclusions[0],'Online ordering and payments');
  await page.getByRole('button',{name:/Saved drafts/}).click();await page.getByRole('button',{name:'Open draft'}).click();
  assert.equal(await page.getByLabel('Project overview').inputValue(),'A reviewed coffee shop website scope.');
  await browser.close();console.log('PASS: intercepted voice transcription -> real UI generation flow -> full scope edits -> cloud save/reopen contract. Remote services were not contacted.');
})().catch(error=>{console.error(error);process.exit(1);});
