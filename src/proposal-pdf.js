import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {estimate} from './domain.js';

const PAGE=[595.28,841.89],MARGIN=48,WIDTH=PAGE[0]-MARGIN*2,BOTTOM=78;
const navy=rgb(.075,.14,.22),muted=rgb(.32,.38,.43),orange=rgb(.80,.30,.12),rule=rgb(.82,.85,.86);
async function asset(path){const response=await fetch(path);if(!response.ok)throw new Error(`Could not load the proposal PDF asset: ${path}. Please reload and try again.`);return new Uint8Array(await response.arrayBuffer());}
const clean=value=>String(value??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').normalize('NFC');

/** Creates a downloadable PDF entirely in the browser; injected bytes allow Node QA. */
export async function createProposalPdf(work,{regularFontBytes,boldFontBytes,backgroundBytes}={}){
  if(!work?.scope?.deliverables?.length)throw new Error('Create a scope with at least one deliverable before exporting a PDF.');
  const [regularBytes,boldBytes,background]=await Promise.all([
    regularFontBytes??asset('/fonts/Lato-Regular.ttf'),boldFontBytes??asset('/fonts/Lato-Bold.ttf'),backgroundBytes??asset('/pdf/scopenote-background.png')
  ]);
  const supported=fontkit.create(regularBytes).characterSet,boldSupported=fontkit.create(boldBytes).characterSet;
  const regularSet=new Set(supported),boldSet=new Set(boldSupported);
  const content=[work.project,work.client,work.currency,work.scope.summary,...work.scope.deliverables.flatMap(d=>[d.title,d.detail]),...(work.scope.questions||[]),...(work.scope.exclusions||[])].map(clean).join('\n');
  const unsupported=[...new Set([...content].filter(char=>char!=='\n'&&(!regularSet.has(char.codePointAt(0))||!boldSet.has(char.codePointAt(0)))))];
  if(unsupported.length)throw new Error(`The PDF font cannot render ${unsupported.slice(0,5).map(char=>`“${char}” (U+${char.codePointAt(0).toString(16).toUpperCase()})`).join(', ')}. Edit these characters before exporting; your text has not been changed.`);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true});
  const image=await pdf.embedPng(background);
  const now=new Date();pdf.setTitle(clean(work.project)||'Project proposal');pdf.setAuthor('ScopeNote');pdf.setSubject('Freelance project scope and working estimate');pdf.setCreator('ScopeNote');pdf.setCreationDate(now);
  const date=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(now);
  let page,y;
  function addPage(){
    page=pdf.addPage(PAGE);page.drawRectangle({x:0,y:0,width:PAGE[0],height:PAGE[1],color:rgb(1,1,1)});
    page.drawImage(image,{x:0,y:0,width:PAGE[0],height:PAGE[1],opacity:.40});
    page.drawRectangle({x:MARGIN,y:PAGE[1]-58,width:5,height:16,color:orange});
    page.drawText('scopenote',{x:MARGIN+13,y:PAGE[1]-57,font:bold,size:17,color:navy});
    page.drawText('PROJECT PROPOSAL',{x:MARGIN,y:PAGE[1]-82,font:bold,size:8,color:muted});
    page.drawText(date,{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(date,9),y:PAGE[1]-57,font:regular,size:9,color:muted});
    page.drawLine({start:{x:MARGIN,y:PAGE[1]-96},end:{x:PAGE[0]-MARGIN,y:PAGE[1]-96},color:rule,thickness:.6});
    y=PAGE[1]-121;
  }
  function ensure(height){if(y-height<BOTTOM)addPage();}
  function wrap(text,font,size,width){
    const lines=[];
    for(const paragraph of clean(text).split('\n')){
      if(!paragraph.trim()){lines.push('');continue;}
      let line='';
      for(const word of paragraph.trim().split(/\s+/)){
        if(font.widthOfTextAtSize(line?`${line} ${word}`:word,size)<=width){line=line?`${line} ${word}`:word;continue;}
        if(line){lines.push(line);line='';}
        let piece='';
        for(const char of [...word]){if(piece&&font.widthOfTextAtSize(piece+char,size)>width){lines.push(piece);piece=char;}else piece+=char;}
        line=piece;
      }
      if(line)lines.push(line);
    }
    return lines;
  }
  function line(text,{font=regular,size=10.5,color=navy,x=MARGIN,leading=15}={}){ensure(leading);if(text)page.drawText(text,{x,y,font,size,color});y-=leading;}
  function paragraph(text,{font=regular,size=10.5,color=navy,x=MARGIN,width=WIDTH,leading=15,gap=9}={}){
    const lines=wrap(text,font,size,width);ensure(Math.min(lines.length,2)*leading);
    for(const textLine of lines)line(textLine,{font,size,color,x,leading});y-=gap;
  }
  function heading(text){ensure(70);y-=7;line(text,{font:bold,size:13,leading:22});}
  function listSection(title,items){
    const groups=items.map(item=>wrap(item,regular,10.5,WIDTH-17));
    const height=29+groups.reduce((sum,lines)=>sum+lines.length*15+6,0);
    // Keep compact question/exclusion sections together instead of leaving a
    // final bullet alone on the next page.
    if(height<=320)ensure(height+12);
    heading(title);
    for(const lines of groups){
      const previous=page;ensure(Math.min(2,lines.length)*15+6);
      if(page!==previous)heading(`${title} (continued)`);
      page.drawText('-',{x:MARGIN,y,font:bold,size:11,color:orange});
      for(const textLine of lines){
        if(y-15<BOTTOM){addPage();heading(`${title} (continued)`);}
        line(textLine,{x:MARGIN+17});
      }
      y-=6;
    }
  }
  addPage();
  paragraph(clean(work.project)||'Project proposal',{font:bold,size:28,leading:34,gap:11});
  if(clean(work.client).trim())paragraph(`Prepared for ${clean(work.client)}`,{size:11,color:muted,gap:15});
  heading('Overview');paragraph(work.scope.summary);
  heading('Scope of work');
  work.scope.deliverables.forEach((item,index)=>{
    const titleLines=wrap(item.title,bold,11.2,WIDTH-87),detailLines=wrap(item.detail,regular,10.5,WIDTH-20);
    ensure(titleLines.length*16+Math.min(detailLines.length,2)*15+10);
    page.drawText(String(index+1).padStart(2,'0'),{x:MARGIN,y,font:bold,size:10,color:orange});
    const hours=`${Number(item.hours)} h`;
    page.drawText(hours,{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(hours,10),y,font:regular,size:10,color:muted});
    for(const titleLine of titleLines)line(titleLine,{x:MARGIN+23,font:bold,size:11.2,leading:16});
    for(const detailLine of detailLines)line(detailLine,{x:MARGIN+20});y-=12;
  });
  const {hours,total}=estimate(work.scope.deliverables,Number(work.rate)||0,Number(work.buffer)||0);
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:work.currency||'USD',maximumFractionDigits:2}).format(value);
  ensure(145);heading('Working estimate');
  paragraph(`${hours} hours at ${money(Number(work.rate)||0)} / hour`,{gap:3});
  paragraph(`Contingency: ${Number(work.buffer)||0}%`,{color:muted,gap:6});
  const fee=money(total),feeSize=Math.min(24,WIDTH/bold.widthOfTextAtSize(fee,1));
  line(fee,{font:bold,size:feeSize,leading:32,color:orange});
  paragraph('This is a working estimate, subject to confirmation.',{size:9,color:muted,leading:13,gap:12});
  if(work.scope.questions?.length)listSection('Questions before we start',work.scope.questions);
  if(work.scope.exclusions?.length)listSection('Outside this scope',work.scope.exclusions);
  heading('Next steps');
  paragraph('Confirm the open questions, scope, schedule and payment terms together before work begins. Additional deliverables require a separate estimate.');
  const pages=pdf.getPages();pages.forEach((page,index)=>{
    page.drawLine({start:{x:MARGIN,y:54},end:{x:PAGE[0]-MARGIN,y:54},color:rule,thickness:.6});
    page.drawText('Made with ScopeNote',{x:MARGIN,y:37,font:regular,size:8,color:muted});
    const label=`${index+1} / ${pages.length}`;page.drawText(label,{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(label,8),y:37,font:regular,size:8,color:muted});
  });
  return pdf.save();
}
