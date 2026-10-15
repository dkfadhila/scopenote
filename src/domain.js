import { z } from 'zod';

export const scopeSchema = z.object({
  summary: z.string().min(1).max(3000),
  deliverables: z.array(z.object({ title: z.string().min(1).max(200), detail: z.string().max(1200), hours: z.number().min(0.25).max(500) })).min(1).max(20),
  questions: z.array(z.string().min(1).max(800)).max(12),
  exclusions: z.array(z.string().min(1).max(800)).max(12)
});
export const outputJsonSchema = {
  type: 'object', additionalProperties: false, required: ['summary','deliverables','questions','exclusions'],
  properties: {
    summary: {type:'string'},
    deliverables: {type:'array', minItems:1, maxItems:20, items:{type:'object', additionalProperties:false, required:['title','detail','hours'], properties:{title:{type:'string'},detail:{type:'string'},hours:{type:'number',minimum:0.25,maximum:500}}}},
    questions:{type:'array',items:{type:'string'}}, exclusions:{type:'array',items:{type:'string'}}
  }
};
export const sampleBrief = `Hey! We're opening a small ceramics studio called Tanah in November. We need a website — home, our story, a workshop page and a contact page. Something calm and a little earthy. We have a logo, but the photos are still being shot.\n\nWould be great if people could book a workshop too, maybe through a link for now? It should work on phones. We can send the text next week. Ideally live in three weeks. Could you send a proposal?`;
export const sampleScope = {
  summary: 'A four-page website for Tanah ceramics studio, with a calm visual direction and a clear path to workshop bookings.',
  deliverables: [
    {title:'Discovery & visual direction',detail:'A focused kickoff, sitemap and one visual direction based on the existing identity.',hours:5},
    {title:'Website design',detail:'Responsive designs for Home, Our story, Workshops and Contact. Two rounds of revisions.',hours:14},
    {title:'Development & booking link',detail:'Build the four pages and connect an external workshop booking service.',hours:18},
    {title:'Testing & handover',detail:'Mobile and desktop checks, basic metadata, launch and a short handover guide.',hours:5}
  ],
  questions:['Which booking service will the studio use, and is an external link enough for launch?','When will final photography and copy be ready?','Who supplies hosting and the domain, and who approves the final design?'],
  exclusions:['Custom booking or payment system','Copywriting and photography','Hosting, domain and third-party subscription fees']
};
export function estimate(items, rate, buffer) {
  const hours = items.reduce((sum,item)=>sum+Number(item.hours),0);
  return { hours, total: Math.round(hours * rate * (1 + buffer / 100) * 100) / 100 };
}
export function proposalText({client,project,scope,rate,buffer,currency}) {
  const {hours,total}=estimate(scope.deliverables,rate,buffer);
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(total);
  return `# ${project}\nPrepared for ${client}\n\n## Overview\n${scope.summary}\n\n## Scope of work\n${scope.deliverables.map((d,i)=>`${i+1}. ${d.title} (${d.hours} hours)\n   ${d.detail}`).join('\n\n')}\n\n## Estimate\n${hours} hours at ${currency} ${rate}/hour, plus ${buffer}% contingency.\nEstimated project fee: ${money}. This is a working estimate, subject to confirmation.\n\n## Questions before we start\n${scope.questions.map(q=>`- ${q}`).join('\n')}\n\n## Outside this scope\n${scope.exclusions.map(q=>`- ${q}`).join('\n')}\n\n## Next step\nConfirm the open questions, scope, schedule and payment terms together before work begins. Any additional deliverables require a separate estimate.\n`;
}
