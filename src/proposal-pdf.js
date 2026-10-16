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
    // Reserve room for the next line's ascenders below the header rule.
    y=PAGE[1]-136;
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
  function line(text,{font=regular,size=10,color=navy,x=MARGIN,leading=14}={}){ensure(leading);if(text)page.drawText(text,{x,y,font,size,color});y-=leading;}
  function paragraph(text,{font=regular,size=10,color=navy,x=MARGIN,width=WIDTH,leading=14,gap=7}={}){
    const lines=wrap(text,font,size,width);ensure(Math.min(lines.length,2)*leading);
    for(const textLine of lines)line(textLine,{font,size,color,x,leading});y-=gap;
  }
  function heading(text){ensure(62);y-=9;line(text,{font:bold,size:12,leading:22});}
  function listSection(title,items){
    const groups=items.map(item=>wrap(item,regular,10,WIDTH-17));
    const height=31+groups.reduce((sum,lines)=>sum+lines.length*14+6,0);
    // Keep compact question/exclusion sections together instead of leaving a
    // final bullet alone on the next page.
    if(height<=320)ensure(height+12);
    heading(title);
    for(const lines of groups){
      const previous=page;ensure(Math.min(2,lines.length)*14+6);
      if(page!==previous)heading(`${title} (continued)`);
      page.drawText('-',{x:MARGIN,y,font:bold,size:11,color:orange});
      for(const textLine of lines){
        if(y-14<BOTTOM){addPage();heading(`${title} (continued)`);}
        line(textLine,{x:MARGIN+17});
      }
      y-=6;
    }
  }
  function notes(){
    const sections=[['Questions before we start',work.scope.questions],['Outside this scope',work.scope.exclusions]].filter(([,items])=>items?.length);
    const columnWidth=(WIDTH-28)/2;
    const columns=sections.map(([title,items])=>({title,groups:items.map(item=>wrap(item,regular,9.5,columnWidth-13))}));
    const heights=columns.map(({groups})=>31+groups.reduce((sum,lines)=>sum+lines.length*13+6,0));
    // Use parallel columns only for short notes. Longer content retains the
    // full-width, paginated flow with continuation headings.
    if(columns.length===2&&Math.max(...heights)<=180){
      ensure(Math.max(...heights)+14);
      const top=y-9;
      columns.forEach(({title,groups},index)=>{
        const x=MARGIN+index*(columnWidth+28);let baseline=top;
        page.drawText(title,{x,y:baseline,font:bold,size:11,color:navy});baseline-=22;
        for(const lines of groups){
          page.drawText('-',{x,y:baseline,font:bold,size:10,color:orange});
          for(const text of lines){page.drawText(text,{x:x+13,y:baseline,font:regular,size:9.5,color:navy});baseline-=13;}
          baseline-=6;
        }
      });
      y=top-Math.max(...heights)+9;
    }else for(const [title,items]of sections)listSection(title,items);
  }
  addPage();
  paragraph(clean(work.project)||'Project proposal',{font:bold,size:24,leading:28,gap:4});
  if(clean(work.client).trim())paragraph(`Prepared for ${clean(work.client)}`,{size:10,color:muted,gap:6});
  heading('Overview');paragraph(work.scope.summary);
  heading('Scope of work');
  work.scope.deliverables.forEach((item,index)=>{
    const titleLines=wrap(item.title,bold,10.5,WIDTH-87),detailLines=wrap(item.detail,regular,10,WIDTH-23);
    ensure(titleLines.length*15+Math.min(detailLines.length,2)*14+10);
    page.drawText(String(index+1).padStart(2,'0'),{x:MARGIN,y,font:bold,size:10,color:orange});
    const hours=`${Number(item.hours)} h`;
    page.drawText(hours,{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(hours,10),y,font:regular,size:10,color:muted});
    for(const titleLine of titleLines)line(titleLine,{x:MARGIN+23,font:bold,size:10.5,leading:15});
    for(const detailLine of detailLines)line(detailLine,{x:MARGIN+23});y-=8;
  });
  const {hours,total}=estimate(work.scope.deliverables,Number(work.rate)||0,Number(work.buffer)||0);
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:work.currency||'USD',maximumFractionDigits:2}).format(value);
  ensure(150);heading('Working estimate');
  const subtotal=hours*(Number(work.rate)||0),contingency=total-subtotal;
  const amountRow=(label,value)=>{
    line(label,{size:9.5,color:muted,leading:18});
    page.drawText(money(value),{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(money(value),10),y:y+18,font:regular,size:10,color:navy});
  };
  amountRow(`${hours} hours × ${money(Number(work.rate)||0)} / hour`,subtotal);
  amountRow(`Contingency (${Number(work.buffer)||0}%)`,contingency);
  page.drawLine({start:{x:MARGIN,y:y+4},end:{x:PAGE[0]-MARGIN,y:y+4},color:rule,thickness:.6});
  y-=20;
  page.drawText('Estimated project fee',{x:MARGIN,y,font:bold,size:10,color:navy});
  const fee=money(total),feeSize=Math.min(22,(WIDTH*.55)/bold.widthOfTextAtSize(fee,1));
  page.drawText(fee,{x:PAGE[0]-MARGIN-bold.widthOfTextAtSize(fee,feeSize),y:y-2,font:bold,size:feeSize,color:orange});y-=26;
  paragraph('This is a working estimate, subject to confirmation.',{size:8.5,color:muted,leading:12,gap:7});
  notes();
  heading('Next steps');
  paragraph('Confirm the open questions, scope, schedule and payment terms together before work begins. Additional deliverables require a separate estimate.');
  const pages=pdf.getPages();pages.forEach((page,index)=>{
    page.drawLine({start:{x:MARGIN,y:54},end:{x:PAGE[0]-MARGIN,y:54},color:rule,thickness:.6});
    page.drawText('Made with ScopeNote',{x:MARGIN,y:37,font:regular,size:8,color:muted});
    const label=`${index+1} / ${pages.length}`;page.drawText(label,{x:PAGE[0]-MARGIN-regular.widthOfTextAtSize(label,8),y:37,font:regular,size:8,color:muted});
  });
  return pdf.save();
}
