import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, proposalText, sampleScope, scopeSchema } from './domain.js';
test('estimate applies hours, rate and contingency exactly once',()=>{
  assert.deepEqual(estimate([{hours:1.5},{hours:2.25}],80,20),{hours:3.75,total:360});
});
test('invalid model output cannot become a working scope',()=>{
  assert.equal(scopeSchema.safeParse({...sampleScope,deliverables:[{title:'Work',detail:'',hours:-3}]}).success,false);
  assert.equal(scopeSchema.safeParse({...sampleScope,deliverables:[]}).success,false);
  assert.equal(scopeSchema.safeParse(sampleScope).success,true);
});
test('export includes exclusions, assumptions and review language',()=>{
  const output=proposalText({project:'Tanah',client:'Tanah Studio',scope:sampleScope,rate:65,buffer:15,currency:'USD'});
  assert.match(output,/42 hours/);assert.match(output,/15% contingency/);assert.match(output,/## Outside this scope/);assert.match(output,/subject to confirmation/);
});
