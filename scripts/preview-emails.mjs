import {mkdir,writeFile} from 'node:fs/promises';
import {accountEmail,receiptEmail} from '../server/emails.js';
const config={origin:'http://127.0.0.1:5180'};
await mkdir('artifacts/email',{recursive:true});
const samples={verify:accountEmail(config,'verify',{name:'Alexander',url:'https://scopenote.dktirta.tech/#verify=preview-only'}),reset:accountEmail(config,'reset',{name:'Alexander',url:'https://scopenote.dktirta.tech/#reset=preview-only'}),receipt:receiptEmail(config,{_id:'PREVIEW-2026-001',priceCents:100,currency:'USD',paidAt:'2026-10-16T06:00:00Z',premiumUntil:'2026-11-15T06:00:00Z',paymentCoin:'USDT',paymentAmount:'1.00'},{name:'Alexander'})};
for(const [name,email]of Object.entries(samples))await writeFile(`artifacts/email/${name}.html`,email.html);
console.log('Synthetic email previews written to artifacts/email. No email sent.');
