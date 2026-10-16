const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value));
const originFor=config=>new URL(config.origin||'https://scopenote.dktirta.tech').origin;
const paragraph=text=>`<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#526171">${text}</p>`;

function layout(config,{preview,eyebrow,title,content,button,url,footnote}){
  const origin=originFor(config);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;padding:0;background:#f3f4f5;font-family:Arial,Helvetica,sans-serif;color:#132438"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f5"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e7eb;border-radius:12px;overflow:hidden"><tr><td style="padding:28px 32px"><img src="${origin}/brand/scopenote-logo.png" width="192" height="48" alt="ScopeNote" style="display:block;width:192px;height:48px;border:0"></td></tr><tr><td><img src="${origin}/email/scopenote-stationery.png" width="600" alt="A clear plan, neatly put together" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr><tr><td style="padding:32px"><p style="margin:0 0 12px;color:#b74623;font-size:11px;line-height:1.5;font-weight:bold;letter-spacing:1.7px;text-transform:uppercase">${escape(eyebrow)}</p><h1 style="margin:0 0 20px;color:#132438;font-size:28px;line-height:1.25;letter-spacing:-.6px">${escape(title)}</h1>${content}<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0"><tr><td bgcolor="#cf4f2d" style="border-radius:5px"><a href="${escape(url)}" style="display:inline-block;padding:15px 23px;color:#ffffff;font-size:15px;line-height:1.4;font-weight:bold;text-decoration:none">${escape(button)} &rarr;</a></td></tr></table>${paragraph(escape(footnote))}</td></tr><tr><td style="padding:22px 32px;border-top:1px solid #e4e7eb;font-size:12px;line-height:1.7;color:#647181">ScopeNote · A clearer start.<br><a href="${origin}" style="color:#647181">scopenote.dktirta.tech</a> &nbsp;·&nbsp; <a href="https://x.com/tirtavex" style="color:#647181">@tirtavex</a></td></tr></table></td></tr></table></body></html>`;
}

export function accountEmail(config,kind,{name,url}){
  const verify=kind==='verify';
  const title=verify?'A clearer start. One quick step.':'Let’s get you back in.';
  const subject=verify?'Verify your ScopeNote email':'Reset your ScopeNote password';
  const greeting=name?`Hi ${name},`:'Hello,';
  const instruction=verify?'Confirm your email address to create AI scopes and import voice notes. Your projects will be right where you left them.':'Use the button below to choose a new password for your ScopeNote account.';
  const expiry=verify?'This link expires in 24 hours.':'This link expires in 15 minutes and can only be used once.';
  const footnote=verify?'If you didn’t create a ScopeNote account, you can safely ignore this email.':'If you didn’t request a password reset, ignore this email. Your password will stay the same.';
  return {subject,text:`${greeting}\n\n${instruction}\n\n${url}\n\n${expiry}\n\n${footnote}`,html:layout(config,{preview:verify?'Confirm your email and start shaping your next project.':'Your secure ScopeNote password reset link.',eyebrow:verify?'Verify your email':'Account security',title,content:paragraph(escape(greeting))+paragraph(escape(instruction))+paragraph(`<strong>${escape(expiry)}</strong>`),button:verify?'Verify email address':'Choose a new password',url,footnote})};
}

export function receiptEmail(config,order,user){
  const paidDate=date(order.paidAt),until=date(order.premiumUntil);
  const price=new Intl.NumberFormat('en-US',{style:'currency',currency:order.currency||'USD'}).format(order.priceCents/100);
  const rows=[['Receipt / order',order._id],['Paid on (UTC)',paidDate],['Payment provider','AllScale'],['Item','ScopeNote Premium · 30 days'],['Total paid',`${price} USD`],...(order.paymentCoin&&order.paymentAmount?[['Settled payment',`${order.paymentAmount} ${order.paymentCoin}`]]:[]),['Premium access until (UTC)',until]];
  const table=`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border-top:2px solid #132438">${rows.map(([key,value])=>`<tr><td valign="top" style="padding:13px 12px 13px 0;border-bottom:1px solid #e4e7eb;font-size:13px;line-height:1.6;color:#647181;width:40%">${escape(key)}</td><td valign="top" style="padding:13px 0;border-bottom:1px solid #e4e7eb;font-size:14px;line-height:1.6;color:#132438;font-weight:bold;overflow-wrap:anywhere;word-break:break-word">${escape(value)}</td></tr>`).join('')}</table>`;
  const text=`Hi ${user.name||'there'},\n\nThank you — your payment is confirmed.\n\n${rows.map(([key,value])=>`${key}: ${value}`).join('\n')}\n\nThis is a one-time payment. No subscription or automatic renewal. Your saved private drafts stay private after Premium expires.\n\nOpen ScopeNote: ${originFor(config)}\n\nThis receipt records your payment; it is not a tax invoice.`;
  return {subject:'Your ScopeNote payment receipt — Premium 30 days',text,html:layout(config,{preview:`Payment confirmed: ${price} USD for 30 days of ScopeNote Premium.`,eyebrow:'Payment receipt · Paid',title:'All set. Your Premium is ready.',content:paragraph(`Hi ${escape(user.name||'there')},`)+paragraph('Thank you for supporting independent work. Your payment is confirmed and your Premium access has been added.')+table+paragraph('Your plan includes private drafts and scopes, 10 voice imports per 30-day period (up to 12 MB each), and PDF and Markdown exports.')+paragraph('<strong>One-time payment. No subscription. No automatic renewal.</strong> Your saved private drafts stay private after access expires.'),button:'Open your workspace',url:originFor(config),footnote:'Keep this receipt for your records. It confirms payment and is not a tax invoice.'})};
}

export async function deliverEmail(config,message,{sendMail,fetchImpl=fetch}={}){
  if(sendMail)return sendMail(message);
  if(!config.resendKey||!config.emailFrom)throw Object.assign(new Error('Email delivery is not configured.'),{status:503});
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.resendKey}`,'Content-Type':'application/json','Idempotency-Key':message.idempotencyKey},body:JSON.stringify({from:config.emailFrom,to:[message.to],subject:message.subject,text:message.text,html:message.html}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(new Error('Email delivery is temporarily unavailable. Please try again later.'),{status:503});
  const data=await response.json();return {id:data.id};
}
