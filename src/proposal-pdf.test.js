import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument,PDFName,decodePDFRawStream} from 'pdf-lib';
import {createProposalPdf} from './proposal-pdf.js';
import {sampleScope,estimate} from './domain.js';

const options={
  regularFontBytes:await readFile(new URL('../public/fonts/Lato-Regular.ttf',import.meta.url)),
  boldFontBytes:await readFile(new URL('../public/fonts/Lato-Bold.ttf',import.meta.url)),
  backgroundBytes:await readFile(new URL('../public/pdf/scopenote-background.png',import.meta.url))
};
const work={project:'Café website proposal',client:'José Álvarez',scope:sampleScope,rate:65,buffer:15,currency:'EUR'};
const decode=stream=>new TextDecoder().decode(decodePDFRawStream(stream).decode());
function pageData(pdf,page){
  const fonts=page.node.Resources().lookup(PDFName.of('Font')),maps=new Map();
  for(const [key,ref]of fonts.entries()){
    const cmap=decode(pdf.context.lookup(ref).lookup(PDFName.of('ToUnicode'))),map=new Map();
    for(const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const pair of section[1].matchAll(/<([A-Fa-f0-9]+)>\s*<([A-Fa-f0-9]+)>/g)){
      const values=pair[2].match(/.{4}/g).map(hex=>parseInt(hex,16));map.set(pair[1].toUpperCase(),String.fromCharCode(...values));
    }
    maps.set(key.asString().slice(1),map);
  }
  const contents=page.node.Contents(),streams=[];
  for(let i=0;i<contents.size();i++)streams.push(decode(pdf.context.lookup(contents.get(i))));
  const source=streams.join('\n');let font,text='';
  for(const item of source.matchAll(/\/([A-Za-z0-9-]+)\s+[\d.]+\s+Tf|<([A-Fa-f0-9]+)>\s*Tj/g)){
    if(item[1])font=item[1];else{text+=[...item[2].matchAll(/.{4}/g)].map(value=>maps.get(font)?.get(value[0].toUpperCase())??'?').join('')+'\n';}
  }
  return {source,text};
}

test('proposal PDF preserves accented text, EUR amounts, sections and every page background',async()=>{
  const bytes=await createProposalPdf(work,options);assert(bytes instanceof Uint8Array);
  const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getTitle(),work.project);assert.equal(pdf.getAuthor(),'ScopeNote');
  assert.equal(pdf.getPageCount(),2);
  const texts=pdf.getPages().map((page,index)=>{
    assert.equal(Math.round(page.getWidth()),595);assert.equal(Math.round(page.getHeight()),842);
    const data=pageData(pdf,page);
    assert.match(data.source,/\/Image-[\w-]+ Do/,'background image is drawn on each page');
    assert(data.text.includes('Made with ScopeNote'));
    assert(data.text.includes(`${index+1} / ${pdf.getPageCount()}`));
    for(const position of data.source.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)){
      assert(Number(position[1])>=48&&Number(position[1])<=548,'text remains within horizontal page margins');
      assert(Number(position[2])>=37&&Number(position[2])<=785,'text stays inside page and footer bounds');
    }
    return data.text;
  }).join('\n');
  for(const required of ['Café website proposal','Prepared for José Álvarez','Overview','Scope of work','Working estimate','Questions before we start','Outside this scope','Next steps',sampleScope.summary])assert(texts.replace(/\s+/g,' ').includes(required),`PDF includes ${required}`);
  const total=estimate(sampleScope.deliverables,65,15).total;
  assert(texts.includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(total)));
  for(const item of sampleScope.deliverables)assert(texts.includes(item.title));
  const exclusionPage=pdf.getPages().map(page=>pageData(pdf,page).text).find(text=>text.includes('Outside this scope'));
  assert(exclusionPage,'exclusions section has a heading');
  for(const exclusion of sampleScope.exclusions)assert(exclusionPage.includes(exclusion),'compact exclusions stay together with their heading');
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(new URL('../artifacts/proposal-sample.pdf',import.meta.url),bytes);
});

test('long scopes paginate and preserve long unbroken words without dropping characters',async()=>{
  const longWord='Qz'.repeat(240);
  const long={...work,project:'Comprehensive café project',scope:{summary:'A longer scope to verify pagination.',deliverables:Array.from({length:20},(_,index)=>({title:`Deliverable ${index+1}`,detail:index===0?longWord:`Detailed requirement ${index+1}. `.repeat(42),hours:index+1})),questions:['Confirm all deliverables and approvals.'],exclusions:['Third-party subscriptions.']}};
  const bytes=await createProposalPdf(long,options),pdf=await PDFDocument.load(bytes);
  assert(pdf.getPageCount()>=6&&pdf.getPageCount()<20,'long content should paginate into a reasonable number of A4 pages');
  const texts=pdf.getPages().map(page=>pageData(pdf,page).text).join('\n');
  for(let index=1;index<=20;index++)assert(texts.includes(`Deliverable ${index}`),`deliverable ${index} survives pagination`);
  assert(texts.replace(/\s/g,'').includes(longWord),'long words wrap without truncation');
  assert(texts.includes('Next steps'),'last section is preserved');
  for(const page of pdf.getPages()){
    const data=pageData(pdf,page);assert.match(data.source,/\/Image-[\w-]+ Do/);
    for(const position of data.source.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g))assert(Number(position[2])>=37&&Number(position[2])<=785);
  }
  await writeFile(new URL('../artifacts/proposal-long.pdf',import.meta.url),bytes);
});

test('unsupported glyphs fail clearly rather than silently losing user text',async()=>{
  await assert.rejects(createProposalPdf({...work,project:'Launch 🚀'},options),/cannot render.*U\+1F680/);
  await assert.rejects(createProposalPdf({...work,scope:null},options),/at least one deliverable/);
});

test('long bullet sections repeat their heading when they continue onto another page',async()=>{
  const long={...work,scope:{...sampleScope,questions:Array.from({length:12},(_,index)=>`Question ${index+1}: ${'Please confirm the requirements and responsible reviewer. '.repeat(12)}`)}};
  const pdf=await PDFDocument.load(await createProposalPdf(long,options));
  const texts=pdf.getPages().map(page=>pageData(pdf,page).text);
  assert(texts.some(text=>text.includes('Questions before we start (continued)')));
  for(let index=1;index<=12;index++)assert(texts.join('\n').includes(`Question ${index}:`));
});
