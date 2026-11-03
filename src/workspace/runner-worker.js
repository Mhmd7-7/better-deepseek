import * as XLSX from 'xlsx';
import * as DOCX from 'docx';
import PptxGenJS from 'pptxgenjs';
import { unzipSync, zipSync } from 'fflate';

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
function validateOffice(bytes, format) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Generated file exceeds 20 MB');
  const entries = unpackBounded(bytes);
  const required = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' };
  if (!entries['[Content_Types].xml'] || !entries[required[format]]) throw new Error(`Invalid ${format} document`);
}

function unpackBounded(bytes) {
  let expanded = 0;
  return unzipSync(bytes, { filter: file => {
    expanded += file.originalSize;
    if (expanded > 100 * 1024 * 1024 || file.originalSize > 40 * 1024 * 1024) throw new Error('Expanded document exceeds the supported size');
    return true;
  } });
}
function xmlText(value) {
  return value.replace(/<\/(?:w:p|a:p)>/g,'\n').replace(/<[^>]+>/g,'')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();
}

async function documentBytes(job) {
  const { format, title, paragraphs = [], rows = [], slides = [], code } = job;
  let bytes;
  if (code) {
    // Compatibility with existing Office BDS tags. Executed in this disposable
    // worker, never in the content script or on the page's main thread.
    let captured;
    const pptx = class extends PptxGenJS { writeFile() { return captured = this.write({ outputType: 'uint8array' }); } };
    const excel = { ...XLSX, writeFile: workbook => { captured = Promise.resolve(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })); } };
    const packer = { ...DOCX.Packer,
      toBlob: document => { captured = DOCX.Packer.toBlob(document).then(blob => blob.arrayBuffer()); return captured; },
      toBase64String: document => { captured = DOCX.Packer.toBlob(document).then(blob => blob.arrayBuffer()); return captured; },
    };
    const word = { ...DOCX, Packer: packer, save: document => { captured = DOCX.Packer.toBlob(document).then(blob => blob.arrayBuffer()); return captured; } };
    const names = ['XLSX','PptxGenJS','pptxgen','DOCX','docx', ...Object.keys(DOCX).filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && !['default','DOCX','docx'].includes(k))];
    const values = [excel, pptx, pptx, word, word, ...names.slice(5).map(k => k === 'Packer' ? packer : DOCX[k])];
    await new AsyncFunction(...names, code)(...values);
    if (!captured) throw new Error('Document code did not produce a file');
    bytes = new Uint8Array(await captured);
  } else if (format === 'xlsx') {
    if (!Array.isArray(rows) || !rows.every(Array.isArray)) throw new Error('Spreadsheet rows must be arrays');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Results');
    bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  } else if (format === 'docx') {
    const lines = [title, ...paragraphs];
    if (!lines.every(line => typeof line === 'string')) throw new Error('Document paragraphs must be text');
    const document = new DOCX.Document({ sections: [{ children: lines.map((text, i) => new DOCX.Paragraph({ text, ...(i === 0 ? { heading: DOCX.HeadingLevel.TITLE } : {}), bidirectional: /[\u0600-\u06ff]/.test(text) })) }] });
    bytes = new Uint8Array(await (await DOCX.Packer.toBlob(document)).arrayBuffer());
  } else if (format === 'pptx') {
    const presentation = new PptxGenJS();
    for (const item of slides.length ? slides : [{ title, text: paragraphs.join('\n') }]) {
      const slide = presentation.addSlide();
      slide.addText(String(item.title || title), { x: .5, y: .4, w: 9, h: .8, fontSize: 28, rtlMode: /[\u0600-\u06ff]/.test(item.title || title) });
      slide.addText(String(item.text || ''), { x: .5, y: 1.5, w: 9, h: 3.5, fontSize: 18, rtlMode: /[\u0600-\u06ff]/.test(item.text || '') });
    }
    bytes = new Uint8Array(await presentation.write({ outputType: 'uint8array' }));
  } else throw new Error('Unsupported document type');
  validateOffice(bytes, format);
  return { bytes, type: MIME[format] };
}

self.onmessage = async event => {
  const { id, job } = event.data;
  try {
    let result;
    if (job.kind === 'code') {
      const logs = [];
      const logger = Object.fromEntries(['log','warn','error','info'].map(key => [key, (...args) => {
        if (logs.length < 200) logs.push(args.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ').slice(0,2000));
      }]));
      const value = await new AsyncFunction('console', 'files', 'XLSX', job.code)(logger, job.files || {}, XLSX);
      const serialized = JSON.stringify({ value: value ?? null, logs });
      if (serialized.length > 100000) throw new Error('Code result exceeds 100 KB');
      result = JSON.parse(serialized);
    } else if (job.kind === 'import') {
      const bytes = new Uint8Array(job.bytes);
      if (/\.(docx|pptx)$/i.test(job.name)) {
        const entries = unpackBounded(bytes);
        const names = Object.keys(entries).filter(name => name === 'word/document.xml' || /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        if (!names.length) throw new Error('Document content was not found');
        const text = names.map(name => xmlText(new TextDecoder().decode(entries[name]))).join('\n\n');
        result = {text:text.slice(0,100000),truncated:text.length>100000};
      } else if (job.name.toLowerCase().endsWith('.xlsx') || job.name.toLowerCase().endsWith('.csv')) {
        if (job.name.toLowerCase().endsWith('.xlsx')) {
          let expanded = 0;
          unzipSync(bytes, { filter: file => {
            expanded += file.originalSize;
            if (expanded > 100 * 1024 * 1024) throw new Error('Expanded spreadsheet exceeds 100 MB');
            if (file.originalSize > 40 * 1024 * 1024) throw new Error('Spreadsheet entry exceeds 40 MB');
            return false;
          } });
        }
        const workbook = XLSX.read(bytes, { type: 'array', sheetRows: 1001, raw: true });
        const sheets = workbook.SheetNames.slice(0,10).map(name => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }).slice(0,1000) }));
        result = { text: JSON.stringify(sheets).slice(0,100000), truncated: true, preview: true };
      } else result = { text: new TextDecoder('utf-8').decode(bytes).slice(0,100000), truncated: bytes.length > 100000 };
    } else if (job.kind === 'document') result = await documentBytes(job);
    else if (job.kind === 'zip') {
      const total = Object.values(job.entries || {}).reduce((sum,value)=>sum+value.length,0);
      if (total > 100 * 1024 * 1024) throw new Error('ZIP inputs exceed 100 MB');
      result = {bytes:zipSync(job.entries,{level:3})};
    } else throw new Error('Unknown worker job');
    self.postMessage({ type: 'task-result', id, result });
  } catch (error) { self.postMessage({ type: 'task-result', id, error: String(error.message || error) }); }
};
