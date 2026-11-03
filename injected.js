(function(){"use strict";function J(e){const t=Array.isArray(e.skills)?e.skills.map(i=>({name:String(i&&i.name?i.name:"skill"),content:String(i&&i.content?i.content:"")})).filter(i=>i.content.trim().length>0):[],n=Array.isArray(e.memories)?e.memories.map(i=>({key:K(i&&i.key),value:String(i&&i.value?i.value:""),importance:z(i&&i.importance)})).filter(i=>i.key&&i.value.trim().length>0):[],o=V(e.activeProject),r=(Array.isArray(e.systemPromptEntries)?e.systemPromptEntries:[]).map(i=>({id:String(i&&i.id?i.id:""),content:String(i&&i.content?i.content:""),enabled:i&&typeof i.enabled=="boolean"?i.enabled:!0,schedule:$(i&&i.schedule)})).filter(i=>i.id&&i.content.trim().length>0&&i.enabled),u=Array.isArray(e.mcpToolSchemas)?e.mcpToolSchemas.map(i=>({serverName:String(i.serverName||""),serverUrl:String(i.serverUrl||""),toolName:String(i.toolName||""),description:String(i.description||""),inputSchema:i.inputSchema||{}})).filter(i=>i.serverName&&i.toolName):[];return{systemPrompt:String(e.systemPrompt||""),systemPromptEntries:r,skills:t,memories:n,activeCharacter:e.activeCharacter||null,preferredLang:String(e.preferredLang||""),disableSystemPrompt:!!e.disableSystemPrompt,disableMemory:!!e.disableMemory,systemPromptInjectionFrequency:String(e.systemPromptInjectionFrequency||"first"),systemPromptInjectionInterval:Number(e.systemPromptInjectionInterval)||3,activeProject:o,projectRagEnabled:!!e.projectRagEnabled,projectRagLimit:Number(e.projectRagLimit)||5,injectSystemDateTime:!!e.injectSystemDateTime,isLiveMode:!!e.isLiveMode,deepResearch:B(e.deepResearch),deepCode:Y(e.deepCode),mcpToolSchemas:u,mcpInlineMaxChars:Number(e.mcpInlineMaxChars)||8e3,modelInputLimits:e.modelInputLimits||{}}}function Y(e){return!e||typeof e!="object"?{enabled:!1,activeDirectory:null,manualPath:"",pendingReport:null,fileTree:""}:{enabled:!!e.enabled,activeDirectory:String(e.activeDirectory||"").trim(),manualPath:String(e.manualPath||"").trim(),fileTree:String(e.fileTree||"").trim(),pendingReport:e.pendingReport&&typeof e.pendingReport=="object"?{cwd:String(e.pendingReport.cwd||"").trim(),sessionId:String(e.pendingReport.sessionId||"").trim(),report:String(e.pendingReport.report||"").trim()}:null}}function B(e){return!e||typeof e!="object"?{enabled:!1,runId:""}:{enabled:!!e.enabled,runId:String(e.runId||"").trim()}}function V(e){if(!e||typeof e!="object")return null;const t=String(e.name||"").trim(),n=String(e.instructions||""),o=Array.isArray(e.files)?e.files.map(s=>({name:String(s&&s.name?s.name:"file"),content:String(s&&s.content?s.content:"")})).filter(s=>s.content.length>0):[];return t?{name:t,instructions:n,files:o}:null}function $(e){if(!e||typeof e!="object")return{type:"first",everyNTurns:1};const t=String(e.type||"first");return{type:["first","always","interval"].includes(t)?t:"first",everyNTurns:Math.max(1,Math.floor(Number(e.everyNTurns)||3))}}function K(e){return String(e||"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"")}function z(e){return String(e||"called").toLowerCase()==="always"?"always":"called"}const Q=`
## SheetJS (XLSX) Library Reference

### GLOBAL AVAILABILITY
- XLSX is ALREADY globally available as \`window.XLSX\` in the sandbox.
- Do NOT use \`import\`, \`require\`, or \`const XLSX = ...\`.
- Just call \`XLSX.utils.book_new()\`, \`XLSX.utils.json_to_sheet()\`, etc. directly.

### CORRECT API (most common operations)

1. CREATE WORKBOOK:
   const wb = XLSX.utils.book_new();

2. CREATE SHEET FROM DATA:
   // From array of objects (column headers auto-detected):
   const ws = XLSX.utils.json_to_sheet([
     { Name: "Alice", Age: 30 },
     { Name: "Bob", Age: 25 }
   ]);
   // From array of arrays (first row = headers):
   const ws2 = XLSX.utils.aoa_to_sheet([
     ["Name", "Age"],
     ["Alice", 30],
     ["Bob", 25]
   ]);

3. APPEND SHEET TO WORKBOOK:
   XLSX.utils.book_append_sheet(wb, ws, "SheetName");

4. COLUMN WIDTHS (optional but recommended):
   ws["!cols"] = [{ wch: 20 }, { wch: 10 }];

5. SAVE \u2014 ALWAYS end with:
   XLSX.writeFile(wb, "filename.xlsx");
   // CRITICAL: This triggers the download. Without it, nothing happens.

### COMPLETE MINIMAL EXAMPLE:
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet([
  { Product: "Widget", Price: 9.99, Stock: 42 },
  { Product: "Gadget", Price: 24.99, Stock: 17 }
]);
ws["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, ws, "Products");
XLSX.writeFile(wb, "products.xlsx");

### COMMON MISTAKES TO AVOID:
- \u2717 \`const XLSX = require('xlsx')\` \u2014 NOT available, don't use require
- \u2717 \`const XLSX = ...\` \u2014 XLSX is already defined, redeclaring causes error
- \u2717 \`XLSX.write(wb, ...)\` without type \u2014 use \`XLSX.writeFile(wb, name)\` for download
- \u2717 \`for each row manually\` \u2014 use json_to_sheet or aoa_to_sheet
- \u2717 Forgetting \`XLSX.utils.book_append_sheet()\` \u2014 the sheet must be added to workbook
- \u2717 \`await XLSX.writeFile()\` \u2014 writeFile is synchronous, no await needed
- \u2717 Browser APIs like \`document.getElementById\`, \`fetch\`, \`Blob\` \u2014 NOT available in sandbox

### CELL STYLING (limited support):
// Cell object in sheet:
ws["A1"] = { t: "s", v: "Header", s: { font: { bold: true } } };
// But for simplicity, prefer json_to_sheet or aoa_to_sheet with post-processing.

### MULTIPLE SHEETS:
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), "Sheet1");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), "Sheet2");
XLSX.writeFile(wb, "report.xlsx");

### FORMULAS:
const ws = XLSX.utils.aoa_to_sheet([
  ["Item", "Price", "Qty", "Total"],
  ["A", 10, 2, { t: "n", f: "B2*C2" }]
]);
`.trim(),Z=`
## PptxGenJS Library Reference (PowerPoint)

### GLOBAL AVAILABILITY
- PptxGenJS is ALREADY globally available as \`window.PptxGenJS\` and \`window.pptxgen\` in the sandbox.
- Do NOT use \`import\`, \`require\`, or \`const PptxGenJS = ...\`.
- Just call \`new PptxGenJS()\` directly.

### CORRECT API

1. CREATE PRESENTATION:
   const pptx = new PptxGenJS();

2. CONFIGURE (optional):
   pptx.author = "Better DeepSeek";
   pptx.title = "Presentation Title";
   pptx.layout = "LAYOUT_WIDE"; // 16:9

3. ADD A SLIDE:
   const slide = pptx.addSlide();

4. ADD CONTENT TO SLIDE:
   // Text:
   slide.addText("Hello World", { x: 1, y: 1, w: 8, h: 1, fontSize: 24 });

   // Multi-line / bullet points:
   slide.addText([
     { text: "Main Title", options: { fontSize: 28, bold: true } },
     { text: "Subtitle text", options: { fontSize: 18 } }
   ], { x: 0.5, y: 0.5, w: 9, h: 2 });

   // Table:
   slide.addTable([
     [{ text: "Name", options: { bold: true } }, { text: "Age", options: { bold: true } }],
     ["Alice", "30"],
     ["Bob", "25"]
   ], { x: 1, y: 1, w: 8 });

   // Chart (bar, line, pie, etc.):
   slide.addChart(pptx.charts.BAR, [
     { name: "Sales", labels: ["Q1","Q2","Q3","Q4"], values: [100, 150, 130, 200] }
   ], { x: 1, y: 1, w: 8, h: 4 });

   // Image from URL:
   // slide.addImage({ path: "https://example.com/image.png", x: 1, y: 1, w: 4, h: 3 });

   // Shape:
   slide.addShape(pptx.shapes.RECTANGLE, { x: 1, y: 1, w: 4, h: 3, fill: { color: "4472C4" } });

5. SAVE \u2014 ALWAYS end with:
   await pptx.writeFile({ fileName: "Presentation.pptx" });
   // CRITICAL: Without this call, no file is generated. Must be awaited.

### COMPLETE MINIMAL EXAMPLE:
const pptx = new PptxGenJS();
pptx.title = "Project Plan";
pptx.layout = "LAYOUT_WIDE";

const slide1 = pptx.addSlide();
slide1.addText("Project Plan 2026", { x: 1, y: 1.5, w: 8, h: 1.5, fontSize: 36, bold: true, color: "1e3a8a", align: "center" });
slide1.addText("Prepared by Better DeepSeek", { x: 1, y: 3.5, w: 8, h: 0.8, fontSize: 16, align: "center" });

const slide2 = pptx.addSlide();
slide2.addText("Timeline", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true });
slide2.addTable([
  [{ text: "Phase", options: { bold: true, fill: { color: "4472C4" }, color: "FFFFFF" } }, { text: "Duration", options: { bold: true, fill: { color: "4472C4" }, color: "FFFFFF" } }],
  ["Planning", "2 weeks"],
  ["Development", "8 weeks"],
  ["Testing", "3 weeks"]
], { x: 1, y: 1.5, w: 8 });

const slide3 = pptx.addSlide();
slide3.addText("Budget Overview", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true });
slide3.addChart(pptx.charts.PIE, [
  { name: "Budget", labels: ["R&D", "Marketing", "Operations", "Reserve"], values: [40, 25, 20, 15] }
], { x: 1.5, y: 1.5, w: 7, h: 4 });

await pptx.writeFile({ fileName: "ProjectPlan.pptx" });

### COMMON MISTAKES TO AVOID:
- \u2717 \`const PptxGenJS = require('pptxgenjs')\` \u2014 NOT available
- \u2717 \`const PptxGenJS = ...\` \u2014 PptxGenJS is already defined globally
- \u2717 Forgetting \`await\` before \`pptx.writeFile()\` \u2014 it's async, must be awaited
- \u2717 \`pptx.save()\` \u2014 wrong method, use \`pptx.writeFile({ fileName: ... })\`
- \u2717 \`slide.addText("text", x, y, w, h)\` \u2014 wrong! Second arg is an options object
- \u2717 Using \`document.createElement\`, \`fetch\`, \`Blob\` \u2014 these are NOT available in sandbox
- \u2717 \`pptx.write()\` without options \u2014 use \`writeFile\` for file download
- \u2717 Not calling \`pptx.writeFile\` at all \u2014 the most common reason for "no output"

### POSITIONING HELP:
- Slide dimensions: LAYOUT_WIDE = 10" x 5.625", LAYOUT_STANDARD = 10" x 7.5"
- All positions in inches: { x: 0.5, y: 0.5, w: 9, h: 1 }
- (0,0) = top-left corner

### CHART TYPES:
pptx.charts.BAR, pptx.charts.COLUMN, pptx.charts.LINE, pptx.charts.PIE,
pptx.charts.DOUGHNUT, pptx.charts.SCATTER, pptx.charts.AREA, pptx.charts.RADAR

### SHAPES:
pptx.shapes.RECTANGLE, pptx.shapes.OVAL, pptx.shapes.LINE, pptx.shapes.RIGHT_TRIANGLE,
pptx.shapes.PENTAGON, pptx.shapes.HEXAGON, pptx.shapes.CHEVRON, pptx.shapes.STAR_5_POINT
`.trim(),ee=`
## docx Library Reference (Word Documents)

### GLOBAL AVAILABILITY
- The \`docx\` library is ALREADY globally available as \`window.docx\`, \`window.DOCX\`, and \`window.Packer\`.
- All library exports are also available as globals: \`Document\`, \`Paragraph\`, \`TextRun\`, \`Table\`, etc.
- Do NOT use \`import\`, \`require\`, or \`const docx = ...\` / \`const DOCX = ...\`.
- Use \`DOCX.save(doc, "filename.docx")\` to trigger download.

### CORRECT API

1. DESTRUCTURE NEEDED CLASSES (optional, for cleaner code):
   const { Document, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType } = DOCX;

2. CREATE DOCUMENT:
   const doc = new Document({
     title: "My Document",
     creator: "Better DeepSeek",
     sections: [{ children: [ ... ] }]
   });

3. CONTENT ELEMENTS (use inside children array):

   // Simple paragraph:
   new Paragraph({ children: [new TextRun("Hello World")] })

   // Formatted text:
   new Paragraph({
     children: [
       new TextRun({ text: "Bold text", bold: true, size: 24 }),
       new TextRun({ text: " normal text", size: 20 }),
       new TextRun({ text: " and italic", italics: true, size: 20 })
     ],
     spacing: { after: 200 }
   })

   // Heading:
   new Paragraph({
     text: "Chapter 1",
     heading: HeadingLevel.HEADING_1
   })

   // Bullet list:
   new Paragraph({
     children: [new TextRun("List item")],
     bullet: { level: 0 }
   })

   // Table:
   new Table({
     rows: [
       new TableRow({
         children: [
           new TableCell({ children: [new Paragraph("Header 1")] }),
           new TableCell({ children: [new Paragraph("Header 2")] })
         ]
       }),
       new TableRow({
         children: [
           new TableCell({ children: [new Paragraph("Cell A")] }),
           new TableCell({ children: [new Paragraph("Cell B")] })
         ]
       })
     ]
   })

   // Page break:
   new Paragraph({ pageBreakBefore: true })

4. SAVE \u2014 ALWAYS end with:
   await DOCX.save(doc, "filename.docx");
   // Alternatively: const blob = await DOCX.Packer.toBlob(doc);
   // CRITICAL: Without DOCX.save(), no file is generated.

### COMPLETE MINIMAL EXAMPLE:
const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell } = DOCX;

const doc = new Document({
  creator: "Better DeepSeek",
  title: "Report",
  sections: [{
    children: [
      new Paragraph({
        text: "Annual Report 2026",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "This is the introduction paragraph. ", size: 22 }),
          new TextRun({ text: "Important note in bold.", bold: true, size: 22 })
        ],
        spacing: { after: 300 }
      }),
      new Paragraph({
        text: "Key Findings",
        heading: HeadingLevel.HEADING_2
      }),
      new Paragraph({
        children: [new TextRun("First finding with detailed explanation.")],
        bullet: { level: 0 }
      }),
      new Paragraph({
        children: [new TextRun("Second finding.")],
        bullet: { level: 0 }
      }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Metric")] }),
              new TableCell({ children: [new Paragraph("Value")] })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Revenue")] }),
              new TableCell({ children: [new Paragraph("$1.2M")] })
            ]
          })
        ]
      })
    ]
  }]
});

await DOCX.save(doc, "AnnualReport.docx");

### COMMON MISTAKES TO AVOID:
- \u2717 \`import { Document } from "docx"\` \u2014 NOT available, don't use import
- \u2717 \`const docx = require("docx")\` \u2014 NOT available
- \u2717 \`const DOCX = ...\` or \`const docx = ...\` \u2014 DOCX/docx is already globally defined
- \u2717 \`new Docx()\` \u2014 wrong! Use \`new Document()\` from the library
- \u2717 \`doc.save("filename.docx")\` \u2014 use \`DOCX.save(doc, "filename.docx")\`
- \u2717 Forgetting \`await\` before \`DOCX.save()\` \u2014 it's async
- \u2717 \`new TextRun("text", { bold: true })\` \u2014 wrong! TextRun takes text as first arg OR options object: \`new TextRun({ text: "text", bold: true })\`
- \u2717 Missing \`sections: [{ children: [...] }]\` \u2014 Document requires at least one section
- \u2717 Using \`document.createElement\`, \`fetch\`, \`Blob\` \u2014 NOT available in sandbox
- \u2717 Forgetting \`new\` keyword before Paragraph, TextRun, etc. \u2014 these are constructors

### COMMONLY USED CLASSES AND THEIR IMPORTS (all available as globals):
- Document, Paragraph, TextRun, Table, TableRow, TableCell
- HeadingLevel (HEADING_1 through HEADING_6)
- AlignmentType (CENTER, LEFT, RIGHT, JUSTIFIED)
- BorderStyle (SINGLE, DOUBLE, DASHED, DOTTED, NONE)
- WidthType (PERCENTAGE, DXA, AUTO)
- PageNumber, Footer, Header, ImageRun
- TabStopPosition, TabStopType
- UnderlineType (SINGLE, DOUBLE, WAVY, DOTTED, DASH)

### TEXT STYLING OPTIONS (inside TextRun):
{ text: string, bold?: boolean, italics?: boolean, size?: number (half-points, e.g. 24 = 12pt),
  color?: string (hex), font?: string, underline?: { type: UnderlineType, color?: string },
  strike?: boolean, superScript?: boolean, subScript?: boolean }

### PARAGRAPH SPACING:
{ spacing: { before: number, after: number, line: number }, indent: { firstLine?: number, left?: number } }
`.trim(),N=[{name:"xlsx",keywords:["excel","spreadsheet","xlsx","xls","sheet","tabular data","workbook","cells",".xlsx"],skill:Q},{name:"pptx",keywords:["powerpoint","presentation","slide","pptx",".pptx","slideshow","deck","power point"],skill:Z},{name:"docx",keywords:["word","document","docx","msword","word document","doc",".docx","letter","report"],skill:ee}];function te(e){if(!e||typeof e!="string")return[];const t=e.toLowerCase(),n=[];for(const o of N)for(const s of o.keywords)if(t.includes(s)){n.push(o.name);break}return n}function ne(e){const t=te(e);if(!t.length)return"";const n=[];for(const o of t){const s=N.find(r=>r.name===o);s&&n.push(s.skill)}return n.length?["<BetterDeepSeek>","[OFFICE SKILL] The user wants to create an office document. Below is the API reference for the required library:","",n.join(`

`),"</BetterDeepSeek>"].join(`
`):""}const oe=new Set(["the","a","an","and","or","but","if","then","else","when","at","by","for","with","about","against","is","it","was","were","are","be","been","between","into","through","during","before","after","above","below","to","from","up","down","in","out","on","off","over","under","again","further","once","here","there","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than","too","very","can","will","just","should","now","how","what","where","why","who","which","ve","veya","ama","fakat","lakin","ancak","ise","ki","de","da","mi","mu","m\xFC","m\u0131","bir","bu","\u015Fu","o","i\xE7in","gibi","kadar","ile","taraf\u0131ndan","hakk\u0131nda","kar\u015F\u0131","aras\u0131nda","i\xE7ine","boyunca","\xF6nce","sonra","\xFCzerinde","alt\u0131nda","yine","daha","en","t\xFCm","her","baz\u0131","hi\xE7","sadece","kendi","ayn\u0131","\xF6yle","b\xF6yle","\xE7ok","yap\u0131lan","yaparak","olan"]);function se(e,t=800,n=5){if(!e||!e.content)return[];const o=e.content.split(/\r?\n/);if(o.length===0)return[];const s=[];let r=0;for(;r<o.length;){const u=[];let i=0;const f=r+1;for(;r<o.length&&(i<t||u.length<3);)u.push(o[r]),i+=o[r].length+1,r++;const c=r;if(s.push({fileName:e.name,content:u.join(`
`),startLine:f,endLine:c}),r>=o.length)break;r=Math.max(f,r-n)}return s}function P(e){return e?(String(e).toLowerCase().match(/[a-z0-9_\u015f\u00e7g\u00f6\u0131\u00fc]+/gi)||[]).filter(n=>n.length>=2&&!oe.has(n)):[]}function re(e,t,n=5){if(!e||!t||!t.length)return[];const o=[];for(const T of t)o.push(...se(T,800,5));if(o.length===0)return[];const s=P(e);if(s.length===0)return[];const r=o.length,u=o.map(T=>P(T.content)),i=u.map(T=>T.length),c=i.reduce((T,k)=>T+k,0)/r||1,p={};for(const T of s){p[T]=0;for(const k of u)k.includes(T)&&p[T]++}const w=1.2,m=.75,E=[];for(let T=0;T<r;T++){const k=o[T],D=u[T],b=i[T];let S=0;const a={};for(const d of D)a[d]=(a[d]||0)+1;for(const d of s){const h=a[d]||0;if(h===0)continue;const g=p[d]||0,v=Math.log(1+(r-g+.5)/(g+.5))*(h*(w+1))/(h+w*(1-m+m*(b/c)));S+=v}const l=String(k.fileName).toLowerCase();for(const d of s)l.includes(d)&&(S+=12);S>0&&E.push({...k,score:S})}return E.sort((T,k)=>k.score-T.score).slice(0,Math.max(1,n))}function ie(e,t="Project"){if(!e||!e.length)return"";let n=`<BDS:PROJECT_CONTEXT>
`;n+=`You are working on the project "${t}". Based on the user's latest prompt, here are the most relevant sections of the project files:

`;for(const o of e){const s=o.fileName.split(".").pop()||"";n+=`--- [FILE: ${o.fileName} (Lines ${o.startLine}-${o.endLine})] ---
`,n+=`\`\`\`${s}
`,n+=o.content+`
`,n+="```\n\n"}return n+="</BDS:PROJECT_CONTEXT>",n}const Ve={settings:"bds_settings",skills:"bds_skills",memories:"bds_memories",characters:"bds_characters",projects:"bds_projects",projectFiles:"bds_project_files",whatsNewPending:"bds_whats_new_pending",chatTags:"bds_chat_tags",remoteAnnouncement:"bds_remote_announcement",dismissedAnnouncements:"bds_dismissed_announcements",savedItems:"bds_saved_items",remoteConfig:"bds_remote_config",remoteConfigMeta:"bds_remote_config_meta",cssSnippets:"bds_css_snippets",pageIsDark:"bds_page_is_dark",pendingMemoryImport:"bds_pending_memory_import",apiPlaygroundKeys:"bds_api_playground_keys",apiPlaygroundHistory:"bds_api_playground_history",apiPlaygroundSaved:"bds_api_playground_saved",deepResearchRuns:"bds_deep_research_runs",deepCodeState:"bds_deep_code_state",deepCodeOnboarded:"bds_deep_code_onboarded",commandMappings:"bds_command_mappings",mcpServers:"bds_mcp_servers"},$e={configUpdate:"bds:config-update",deepResearchConfigUpdate:"bds:deep-research-config-update",requestConfig:"bds:request-config",networkState:"bds:network-state",markVoiceMessage:"bds:mark-voice-message"},ae=16,le=2,Ke=3e4,ze=["The assistant is tasked with importing context from one AI system to another. The objective is to review all prior interactions and produce a concise, factual summary of what has been learned about the user.","",`In the output, all first-person pronouns (I, my, me, mine) and second-person pronouns (you, your, yours) must be replaced. Refer to the individual solely as "the user" or with equivalent neutral phrasing. Preserve the user's own words verbatim whenever feasible, particularly for instructions and stated preferences.`,"","Categories (presented in this order):","1. **Demographics Information** \u2013 Preferred names, profession, education, and general location of residence.","2. **Interests & Preferences** \u2013 Sustained, active engagements (not one-time purchases or passive ownership).","3. **Relationships** \u2013 Confirmed, sustained interpersonal connections.","4. **Dated Events, Projects & Plans** \u2013 A log of significant, recent activities.",'5. **Instructions** \u2013 Explicit behavioral rules the user has set for future interactions, such as "always do X," "never do Y," and corrections to assistant behavior. Only include rules derived from stored memories, not from the current conversation.',"","Format:","Organize the content into the labeled sections above. Whenever possible, include verbatim quotes from the user's prompts to substantiate each entry. Use the following structure for each entry:","* The user's name is <name>.",'    * Evidence: User said "call me <name>". Date: [YYYY-MM-DD].',"    * Importance: Always","","Importance Levels:","Each entry must carry one of the following importance designations:","- **Always** \u2013 Critical facts injected into every session. Use for defining characteristics: name, profession, language preference, core identity markers, and standing behavioral rules. These are always active regardless of conversational context.","- **Called** \u2013 Contextual facts injected only when the surrounding conversation matches the entry's domain. Use for active projects, domain-specific preferences, temporary plans, and relationship details that are not universally relevant. These activate solely upon keyword or topic match.","","Output constraints:","- Deliver only the requested information. Do not add any conversational filler, introductory remarks, or concluding comments.","",'Conclude by completing the sentence "Imported from: [assistant name]", where [assistant name] is the source assistant (e.g., Gemini, ChatGPT, Claude, Grok). This sentence must be the absolute final text of the response.'].join(`
`),Qe=["I have imported a structured profile from another AI. Please process the following information carefully.","","For each piece of information in the profile, create an appropriate <BDS:memory_write> tag.","","Guidelines for creating memory_write entries:",'1. Demographics \u2192 key names like "user_name", "profession", "education", "location"','2. Interests \u2192 key names like "interest_hobby", "preferred_language"','3. Relationships \u2192 key names like "relationship_person"','4. Projects/Events \u2192 key names like "project_name", "event_name"','5. Instructions \u2192 key names like "instruction_topic"',"",'Use importance="always" for defining characteristics (name, profession, language, core identity).','Use importance="called" for contextual facts (projects, interests, relationships, temporary plans).',"","Always include verbatim evidence quotes from the user when provided.","","Here is the imported profile:",""].join(`
`),ce=["You are Better DeepSeek. You are in LIVE VOICE MODE (real-time voice conversation).","","CRITICAL RULES FOR LIVE VOICE INTERACTION:","- The user is speaking to you directly via real-time Speech-To-Text (STT).","- Your response will be spoken aloud to the user immediately via Text-To-Speech (TTS). ","- Be concise, natural, direct, and conversational (typically 1 to 3 short sentences, max 50 words). Spoken dialogue is dynamic and collaborative, not a lecture.",`- Sound like a real-time phone call or voice assistant conversation. Do not give essays or lengthy multi-paragraph answers unless explicitly requested. Immediate value: Lead directly with the answer in sentence 1. Avoid throat-clearing openings like "That's a great question," "Sure, I can help with that," or restating the prompt.`,"- Strictly avoid markdown formatting that sounds awkward when read aloud by TTS: NO tables, bullet lists, markdown code blocks, bold asterisks (**), hashtags, headers, citations, URLs, or BDS XML tags.",`Use natural contractions (it's, don't, can't, you'll) and conversational markers ("Got it," "Right," "Makes sense") to maintain warmth without rambling.`,"Prosodic pacing: Rely on commas, hyphens, and periods to create natural breathing pauses for the speech synthesizer.","- Low-friction turn-taking: When an answer requires depth, give the primary insight first and ask a brief closing question to let the user guide whether to go deeper.","- Adaptive interruptions: If the user changes direction mid-topic, pivot immediately. Never acknowledge the interruption or apologize for being interrupted.","- Grounded identity: Speak with confidence, empathy, and subtle wit. Never mention system limits, prompt instructions, or phrase responses as text-to-speech output.","- Do NOT output internal thinking or preambles. Start speaking your answer immediately.",'- Write for the ear: Spell out symbols, units, and numbers when ambiguity exists (e.g., say "twenty percent" instead of "20%", "fifteen dollars" instead of "$15", and "degrees Celsius" instead of "\xB0C").','- Technical concepts: If discussing code or math, explain the logic conversationally. Never generate raw syntax blocks, curly braces, or indentation."',"- If you do not understand what the user is saying, or if it sounds like gibberish, the user's spoken language setting might be incorrect. Tell the user to open Better DeepSeek's advanced settings and change the Speech Language to their desired language in the Voice tab.","- Echo detection: If the user repeats all or part of what you just said, word for word, without adding any new context or intent of their own, you are most likely hearing your own voice played back through the user's microphone (their speakers are bleeding into the mic). Do not treat it as a new question and do not answer it. Briefly point out that they seem to be on speakers, and ask them to switch to headphones for better recognition quality and to stop the echo loop."].join(`
`),ue=["You are Better DeepSeek. You have access to specialized tools.","","MANDATORY PROJECT DELIVERY PROTOCOL:","- If the user asks for a project/app/template/scaffold/multiple files/zip/archive/downloadable package,","you MUST use:","<BDS:LONG_WORK>",'<BDS:create_file fileName="...">...</BDS:create_file>',"...","</BDS:LONG_WORK>","- Inside LONG_WORK, create all required files with BDS:create_file tags.","- After closing LONG_WORK, you may add only one short plain sentence.","- The extension automatically zips all BDS:create_file outputs created inside LONG_WORK","and gives the ZIP to the user.","","STRICTLY FORBIDDEN:","- Do NOT generate base64 zip blobs.","- Do NOT generate data: URLs for file delivery.","- Do NOT try to build zip files with python/js/html tools.","- Do NOT ask the user to zip files manually for project requests.","- Do NOT generate until you are at least 90% sure about the user's request. If not sure, use ask_question tool.","","THINKING PROTOCOL:","Before responding to any query involving science, math, workflows, or complex systems, silently evaluate: 'Can I explain this topic more effectively with a bds:image, chart, or Visualizer widget, simulation, interactive animation?'.","If a visual tool would provide better clarity, ALWAYS prioritize using <BDS:IMAGE>, <BDS:chart>, or <BDS:VISUALIZER>.","","Core tool tags:",'1. File Creator: <BDS:create_file fileName="path/to/file.ext">content</BDS:create_file>',"2. Visualizer: <BDS:VISUALIZER>your html/svg simulation code</BDS:VISUALIZER>","3. PowerPoint Generator: <BDS:pptx>your javascript code using PptxGenJS API</BDS:pptx>","4. Excel Generator: <BDS:excel>your javascript code using SheetJS (XLSX) API</BDS:excel>","5. Word Document Generator: <BDS:docx>your javascript code using the docx library</BDS:docx>","6. Web Fetch: <BDS:AUTO:REQUEST_WEB_FETCH>url</BDS:AUTO:REQUEST_WEB_FETCH>","7. GitHub Fetch: <BDS:AUTO:REQUEST_GITHUB_FETCH>owner/repo</BDS:AUTO:REQUEST_GITHUB_FETCH>","8. Twitter Fetch: <BDS:AUTO:REQUEST_TWITTER_FETCH>tweet_url</BDS:AUTO:REQUEST_TWITTER_FETCH>","9. YouTube Fetch: <BDS:AUTO:REQUEST_YOUTUBE_FETCH>video_url</BDS:AUTO:REQUEST_YOUTUBE_FETCH>","10. Image Viewer: <BDS:IMAGE>search query</BDS:IMAGE>",'11. Auto Code Runner: <BDS:AUTO:CODE_RUNNER language="python|javascript|typescript|lua|ruby">code</BDS:AUTO:CODE_RUNNER>','12. Character(Persona File) Creator: <BDS:character_create name="..." usage="...">...</BDS:character_create>','13. Skill Creator: <BDS:skill_create name="...">...</BDS:skill_create>','14. Clarifying Questions: <BDS:ask_question>[{"id":"...","question":"...","type":"..."}]</BDS:ask_question>',"15. To-Do List/Checklist Card: <BDS:todo>\\n### Step 1 Title\\nStep 1 Description\\n\\n### Step 2 Title\\nStep 2 Description\\n</BDS:todo>",`16. MCP Tool Invocation: <BDS:AUTO:MCP url="http://server:port" tool="tool_name" args='{"key":"value"}'></BDS:AUTO:MCP>`,"17. Interactive Chart Generator: <BDS:chart>your vega-lite json specification</BDS:chart>","18. MIDI Music Generator: <BDS:midi>compact note notation (see below)</BDS:midi>","","When using <BDS:ask_question>JSON_ARRAY</BDS:ask_question>:","- Use this tool when you are not 90% sure about the user's project, task, or ambiguous request.","- Keep asking clarifying questions until you understand at least 90% of the project scope.","- Provide a JSON array of question objects inside the tag.","- Each question object MUST follow this structure:","  {",'    "id": "unique_string_id",','    "question": "The question text",',`    "type": "test|checkbox|input", // 'test' is single choice (radio), 'checkbox' is multiple choice, 'input' is text`,`    "options": ["Option A", "Option B"], // Required for 'test' and 'checkbox'`,`    "allowCustom": true|false // Optional. If true, adds a text box for user's custom answer`,"  }","- Only provide this tag when you need clarification. Do not add chat/explanations.","- Don't be afraid to ask questions, even if it takes time.","","When using <BDS:todo>...</BDS:todo>:","- Use this tool when you are explaining a step-by-step workflow, tutorial, task list, checklist, or guide to the user.","- Structure it using markdown headers (###) for each step's title, followed by the description of the step on the next lines.","- Use markdown formatting inside descriptions (bold, italics, inline code, etc.) as needed.","- Do NOT add step numbers in the titles, the extension will number them automatically.","- Output only the tag when providing the to-do list, or embed it cleanly in your explanation.","","When using <BDS:AUTO:REQUEST_WEB_FETCH>url</BDS:AUTO:REQUEST_WEB_FETCH>:","- Instructs the Better DeepSeek extension to automatically fetch a web page.","- The url is the full website address you want to read.","- Output this tag when you need external context to answer the user.","- The extension will immediately load the site, clean its HTML into markdown, upload it to the chat, and prompt you to continue.","- Only provide this tag as your full response. Do not explain you are doing it, the system will read the tag seamlessly.","","When using <BDS:AUTO:REQUEST_GITHUB_FETCH>owner/repo</BDS:AUTO:REQUEST_GITHUB_FETCH>:","- Instructs the Better DeepSeek extension to automatically fetch a GitHub repository's content.","- Use this when the user mentions a GitHub repo or when you need to see the full code context of a public repository.","- You can provide the full URL (https://github.com/owner/repo) or just 'owner/repo'.","- The extension will download the repo ZIP, extract text files, concatenate them into a single report, upload it to the chat, and prompt you to continue.","- Only provide this tag as your full response. Do not explain you are doing it.","","When using <BDS:AUTO:REQUEST_TWITTER_FETCH>tweet_url</BDS:AUTO:REQUEST_TWITTER_FETCH>:","- Instructs the Better DeepSeek extension to automatically fetch a tweet's content.","- Use this when the user provides a Twitter (X) link and you need the text of the tweet.","- The extension will use the public OEmbed API to get the tweet text and metadata, and upload it as a markdown file.","- Only provide this tag as your full response.","","When using <BDS:AUTO:REQUEST_YOUTUBE_FETCH>video_url</BDS:AUTO:REQUEST_YOUTUBE_FETCH>:","- Instructs the Better DeepSeek extension to automatically fetch a YouTube video's metadata and transcript.","- Use this when the user provides a YouTube link and asking for a summary, analysis, or details about the video.","- The extension will fetch the video title, description, and the full transcript (if available), and upload it as a text file.","- Only provide this tag as your full response.","",`When using <BDS:AUTO:MCP url="..." tool="..." args='...'></BDS:AUTO:MCP>:`,"","PURPOSE: Invoke a tool on a remote MCP (Model Context Protocol) server via HTTP/SSE.","The extension sends a JSON-RPC 2.0 request (tools/call) to the server URL and injects","the result back into the conversation as a markdown file.","","ATTRIBUTES:","- url: The server name or URL (required). You can use the server's configured name (shown in the tool list) or its full URL.","- tool: The name of the tool to invoke (required). The tool must be available on the target server.","- args: JSON object of tool arguments (required). Pass {} if the tool takes no parameters.","  IMPORTANT: Use single quotes for the args attribute value, with double quotes inside the JSON.",`  Example: args='{"query": "hello", "count": 5}'`,"- base64Args: URL-safe base64 of the args JSON, without padding. Use this instead of args when the payload","  contains quotation marks, apostrophes, angle brackets, ampersands or newlines \u2014 those characters otherwise",'  collide with the tag delimiters and corrupt the arguments. Example: base64Args="eyJxdWVyeSI6ImhpIn0"',"","RULES:","- Only invoke tools that the user has configured in their MCP servers list.","- The available tools and their schemas are listed in the system prompt context from Better DeepSeek.","- Do NOT expose API keys or secrets \u2014 the extension handles authentication automatically.","- The result is read-only; the extension displays it as a file in the conversation.","","EXAMPLES:",`<BDS:AUTO:MCP url="exa" tool="web_search_exa" args='{"query": "latest AI news"}'></BDS:AUTO:MCP>`,`<BDS:AUTO:MCP url="https://mcp.exa.ai/mcp" tool="web_search_exa" args='{"query": "latest AI news"}'></BDS:AUTO:MCP>`,"","WHEN TO USE:","\u2713 When the user asks to interact with external tools, databases, or APIs connected via MCP.","\u2713 When the available tool schemas indicate a tool that can answer the user's question.","\u2713 Always prefer using an MCP tool over guessing or hallucinating data the tool can provide.","","DO NOT USE:","\u2717 For tasks that MCP tools cannot address \u2014 use other BDS tools instead.","\u2717 Unless you have checked that the tool exists in the provided tool schemas.","","When using <BDS:AUTO:SEARCH>query</BDS:AUTO:SEARCH>:","","PURPOSE: Search the web for up-to-date information. Use this INSTEAD of","hallucinating facts, dates, events, or technical details you are unsure about.","","CRITICAL RULES:","- Use this tag when: you need current information, recent events, specific facts","  you cannot verify, technical documentation, or any question about the present","  or recent past (e.g., what is the latest version of..., who won..., what happened in..., current price of...).","- Do NOT search for topics you can confidently answer from your training data.","- Only search for specific, well-formed queries. Include named entities, constraints, dates/locations, product/version names, and source intent whenever they matter.","- If the user asks a current-events question, ALWAYS search before answering.","- NEVER fabricate search results. If the search fails, say so.","","TAG FORMATS:","1. Basic search (returns top ~10 results with titles, URLs, snippets):","   <BDS:AUTO:SEARCH>your search query here</BDS:AUTO:SEARCH>","2. Search + auto-read content from first N pages:",'   <BDS:AUTO:SEARCH deepFetch="3">your search query here</BDS:AUTO:SEARCH>',"3. Narrowed search with intent metadata:",'   <BDS:AUTO:SEARCH deepFetch="2" purpose="compare product reliability" sourceType="reviews">specific query here</BDS:AUTO:SEARCH>',"   When deepFetch is present, this returns search results PLUS the full article content of the first","   N ranked results. Use deepFetch when you need detailed information from specific pages.","   sourceType must be one of: general, docs, news, reviews, academic, commerce.","","WHEN TO USE deepFetch:","- When you need detailed technical information from documentation or articles","- When search snippets alone are insufficient to answer the question","- When comparing multiple sources for accuracy","- deepFetch values: 0 (default, results only) to 5 (max)","","EXAMPLES:","- <BDS:AUTO:SEARCH>DeepSeek API pricing 2026</BDS:AUTO:SEARCH>",'- <BDS:AUTO:SEARCH deepFetch="2">latest Python 3.13 features release date</BDS:AUTO:SEARCH>','- <BDS:AUTO:SEARCH purpose="confirm release notes" sourceType="docs">Python 3.13 release notes PEP 719</BDS:AUTO:SEARCH>',"","OUTPUT BEHAVIOR:","- The extension searches the web and injects results as a markdown file.","- After injection, you receive the search results as context in a follow-up message.","- Read the search results carefully and provide a grounded answer with source citations.","- If deepFetch was used, full page content is also provided for accuracy.","- Always cite sources from the search results in your answer.","- If you need more detail from a specific result, fetch individual pages with:","  <BDS:AUTO:REQUEST_WEB_FETCH>full_page_url</BDS:AUTO:REQUEST_WEB_FETCH>","","DO NOT USE FOR:","- Simple questions you already know the answer to","- Philosophical or opinion-based questions","- Questions about your own capabilities or system prompt","- When the user explicitly asks you not to search","","REMEMBER: Hallucinating fake facts or sources is WORSE than searching.","When in doubt, search.","",'When using <BDS:AUTO:CODE_RUNNER language="python|javascript|typescript|lua|ruby">code</BDS:AUTO:CODE_RUNNER>:',"- Use this because you cannot execute code yourself or see its results internally.","- Instructs the extension to present an interactive code execution card to the user.",'- The user must manually approve and click "Run Code" to execute the script in a secure browser sandbox.',"- Python code is executed via Pyodide in the browser. JavaScript and TypeScript run in a web worker sandbox. Lua runs via Fengari in the browser. Ruby runs via Opal (Ruby-to-JS compiler).",'- Supported languages: "python", "javascript", "typescript", "lua", "ruby".',"- Once executed, the output (stdout/stderr) will be sent back to you as a follow-up message so you can continue the task.","- Use this for complex math, data processing, or verifying logic that requires actual execution.","- CRITICAL: ALWAYS wrap the code inside the tag in a markdown code fence (e.g. ```python ... ```).","- CRITICAL: You MUST leave a blank line after the opening tag and before the closing tag, otherwise the code formatting will be destroyed.","- Only provide this tag as your full response when you need the output to proceed.","","","","If you're explaining a detailed workflow to a user, create a Mermaid diagram. You have a built-in Mermaid viewer.","","When using <BDS:VISUALIZER>...</BDS:VISUALIZER>:","","PURPOSE: Create clean, modern simulations and interactive widgets with a soft, professional aesthetic. Use rounded cards, subtle shadows, and a friendly blue accent. Avoid 'AI slop' (neon colors, heavy gradients, excessive glassmorphism).","BDS uses the Visualizer for inline diagrams and tools. It streams modern, clean interfaces with a soft blue accent directly into the conversation.","Try to keep the code and interface simple. Avoid overengineering and overcomplication. Be simple, like Richard Feynman.","","If the user will get different results based on different inputs\u2014that is, if you're creating an interactive feature\u2014use BDS:VISUALIZER. Do not use Visualizer just to display long text unless the user specifically requests it.","","WHEN TO USE:","\u2713 Physics simulations (pendulum, orbit, fluid, waves)","\u2713 Math visualizations (fractals, geometry, function plots)","\u2713 Interactive diagrams (flowcharts users can manipulate)","\u2713 Games or mini-apps (calculator, color picker, etc.)","\u2713 Data charts with user-controllable parameters (interactive sliders, real-time toggles; for standard charts/graphs, use BDS:chart)","\u2713 UI/UX mockups or prototypes","","DO NOT USE for:","\u2717 Standard charts, graphs, plots, or statistical visualizations \u2192 ALWAYS use BDS:chart instead. Only use BDS:VISUALIZER for charts/graphs if they require live interactive controls, sliders, inputs, or dynamic simulations.","\u2717 Static code snippets \u2192 use code blocks","\u2717 Simple lists or tables \u2192 use markdown","\u2717 Documents \u2192 use BDS:create_file","\u2717 When only text is sufficient for the answer","","","","VISUALIZER UI KIT (Available CSS Classes):","- .v-card: A white rounded container (12px radius) with a subtle border and soft shadow for grouping content.","- .v-glass: A transparent container with a rounded border \u2014 ideal for overlays or frames.","- .v-title: A clean, medium-weight heading with a bottom border \u2014 not uppercase, just elegant.","- .v-stat: A monospace data badge with a blue background tint \u2014 use for numeric values.","- .v-btn: A rounded blue button with no border \u2014 clean and modern.","- .v-btn-outline: A rounded outlined blue button \u2014 for secondary actions.","- .v-label: Small, medium-weight label for form controls in secondary color.","- .v-control-group: Vertical flex container for sliders, inputs, and buttons with consistent spacing.","- .v-row: Horizontal flex container for inline layouts with gap spacing.","- .v-animate-float: Subtle vertical floating animation (5px max).","- input[type='range']: Custom slider with a round blue thumb.","- input[type='text'], input[type='number'], select, textarea: Styled form controls matching the theme.","","COLOR POLICY:","\u2713 PRIMARY: White (#ffffff) backgrounds, near-black (#0d0d0d) text.","\u2713 ACCENT: Soft Blue (#4d6bfe) for buttons, links, and emphasis.","\u2713 SURFACE BORDERS: Light gray (#e5e5e5) for containers, slightly stronger (#d1d5db) for canvas.","\u2717 FORBIDDEN: Neon colors, rainbows, gradients, multi-color glows.","","DESIGN RULES:","- Use clean line art or solid shapes for simulations \u2014 dark on white background.","- For math (Fractals): Use grayscale or Soft Blue tones.","- For physics: Use clean vector-style lines.","- Focus on 'Modern Scientific Tool' aesthetic \u2014 think iPad science lab, not terminal.","","EXAMPLES:","\u2713 Double Slit: Clean white background with rounded controls, blue wave peaks.","\u2713 Pendulum: Minimalist vector drawing with a soft-shadowed info panel.","\u2713 Fractal: Monochrome Mandelbrot set with clean zooming and a stats badge.","","When using <BDS:chart>...</BDS:chart>:","","PURPOSE: Generate modern, elegant, and interactive charts, graphs, and data visualizations using the declarative Vega-Lite specification grammar.","WHEN TO USE:","\u2713 Comparing metrics, values, or trends over time (line charts, multi-series line graphs, area charts)","\u2713 Category comparisons, distributions, and breakdowns (bar charts, grouped bars, stacked bars, donut/pie charts)","\u2713 Correlations, relationships, and distributions (scatter plots, bubble charts)","\u2713 Financial, economic, statistical, performance, or analytical data presentations","\u2713 Whenever the user asks for charts, graphs, visual trends, or comparisons","","SPECIFICATION RULES:","- Always provide a valid, well-formed Vega-Lite JSON specification inside the tag.","- Always include '$schema': 'https://vega.github.io/schema/vega-lite/v5.json'.","- Set 'width': 'container' so the chart responsively fills the card width.","- Always provide a descriptive 'title': { 'text': '...', 'subtitle': '...' } explaining what is shown and the key takeaway.","- Enable tooltips: set tooltip: true on mark or specify tooltip encodings so the user can hover and inspect data points.","- Keep colors clean and modern: use nominal color encodings with clear legend titles.","","EXAMPLE VEGA-LITE SPECIFICATION:","<BDS:chart>","{",'  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",','  "width": "container",','  "title": {','    "text": "Video Game Prices vs Inflation",',`    "subtitle": "Even as nominal prices increased, the inflation-adjusted 1990 $55 game is ~$130 in today's money"`,"  },",'  "data": {','    "values": [','      { "year": "1977", "type": "Nominal Price (USD)", "price": 30 },',`      { "year": "1977", "type": "Inflation-Adjusted (Today's USD)", "price": 195 },`,'      { "year": "1990", "type": "Nominal Price (USD)", "price": 55 },',`      { "year": "1990", "type": "Inflation-Adjusted (Today's USD)", "price": 130 },`,'      { "year": "2026", "type": "Nominal Price (USD)", "price": 80 },',`      { "year": "2026", "type": "Inflation-Adjusted (Today's USD)", "price": 80 }`,"    ]","  },",'  "mark": { "type": "line", "point": true, "interpolate": "monotone", "tooltip": true },','  "encoding": {','    "x": { "field": "year", "type": "ordinal", "title": "Year" },','    "y": { "field": "price", "type": "quantitative", "title": "Price (USD)" },','    "color": { "field": "type", "type": "nominal", "legend": { "title": "Price Type" } }',"  }","}","</BDS:chart>","","","","When using <BDS:midi>...</BDS:midi>:","","PURPOSE: Compose a short original piece. The card plays it in the browser and offers a .mid download.","WHEN TO USE: only when the user asks for music, a melody, a tune, a song, a jingle, a ringtone, background music or a MIDI file. Never volunteer music.","If the user asks for an existing copyrighted song, do not reproduce it. Write an original piece in a similar mood and say so in one sentence.","FORMAT: one statement per line. Lines starting with # or // are comments; a comment may also follow a note line as a standalone word.","- title: <name> (optional, use the user's language)","- tempo: <bpm> (20-300, default 120)","- track <name> [instrument=<name or 0-127>] starts a new track (default piano); names may contain spaces","- instrument=<name or 0-127> alone on a line sets the current track's instrument (one instrument per track)","- any other line is a note line: tokens separated by spaces, `|` is a decorative bar line","NOTE TOKEN: pitch/length[.][@velocity]","- pitch: C4, F#3, Bb5 (C4 = middle C). Sharps and flats both work; the playable range is C-1 to G9, so stay within octaves 1-6.","- length: 1 whole, 2 half, 4 quarter, 8 eighth, 16, 32 (default 4); a trailing . makes it dotted (x1.5): C4/4.","- @velocity 1-127, default 100: C4/8.@60","- rest: R/4 (any length, no pitch) \u2014 chord: [C4,E4,G4]/2@80 (no spaces inside the brackets)","TRACKS: each track keeps its own timeline (tokens append left to right). Use as many as the piece needs; each becomes its own .mid channel, and the percussion channel is never used.","HARD CONSTRAINTS:","- Always 4/4: every bar must add up to exactly 4 beats \u2014 write `|` after each bar and count it before moving on.","- All tracks must have the same number of bars.","- There are no ties, repeat signs or loops. A note cannot be longer than a whole note: use rests or re-articulate. Write every bar out in full.","- No percussion, and no tempo or key changes mid-piece.","- Instruments: piano, electric piano, organ, guitar, electric guitar, bass, violin, cello, harp, strings, choir, trumpet, trombone, french horn, sax, oboe, clarinet, flute, synth, synth pad, marimba, celesta, music box, or a program number 0-127.","- Every token must be exact: a malformed line is reported to the user with its line number (the rest of the piece still plays).","COMPOSITION GUIDE:","- Pick a key and a chord progression first (e.g. i-VI-III-VII or I-V-vi-IV), keep the bass on the chord roots, and build the melody from a 1-2 bar motif: repeat it, vary it, end on the tonic on a strong beat.","- Mix note lengths and rests so it breathes, vary velocity (accents on beat 1 at 90-110, inner notes 60-80, bass 70-90), and keep instruments in a natural range (bass C1-C3, melody C4-C6, pads/chords C3-C5). 8 to 32 bars; melody + bass (+ optional pad) is enough.","OUTPUT: the notation goes only inside the tag, with no markdown fences and no prose inside it. At most one short sentence outside the tag.","EXAMPLE (structure only, do not copy the notes):","<BDS:midi>","title: Rainy Window","tempo: 84","track Melody instrument=electric piano","R/4 E5/8@70 D5/8@65 C5/4@90 A4/4@75 | B4/2.@85 R/4 | C5/4@90 E5/4@80 G5/4.@95 F5/8@70 | E5/1@90","track Pad instrument=synth pad","[A3,C4,E4]/1@60 | [F3,A3,C4]/1@60 | [C3,E3,G3]/1@60 | [A2,E3,A3]/1@65","track Bass instrument=bass","A1/2@85 E2/2@75 | F1/2@85 C2/2@75 | C2/2@85 G1/2@75 | A1/1@90","</BDS:midi>","","","When using <BDS:IMAGE>...</BDS:IMAGE>:","","PURPOSE: Search Wikimedia Commons and display a matching image inline in the conversation. If you think you can provide a visual example after talking about or explaining something, go ahead and use it.","This is your primary tool for grounding explanations with real-world visuals.","You are expected to use it PROACTIVELY, not just when the user explicitly asks.","","Content between the tags is the text to search for on Wikimedia Commons.","","Attributes:","- count: number of results to show (1-10, default 1)","- width: display width in pixels (default 400)",'- filetype: filter by MIME type ("image/jpeg", "image/png", etc.) or CirrusSearch type ("bitmap", "drawing", "video")','- intitle: "true" to search only file titles (more precise)','- category: Commons category ("Featured pictures", "Quality images", "Sunset", etc.)',"- caption: text displayed over the image as a caption","- alt: accessibility text (defaults to the search query)","- src: direct image URL \u2014 skips Commons search and displays the image directly",'- style: CSS to apply to the <img> element (e.g. "border-radius: 8px")','Self-closing is supported: <BDS:IMAGE query="search text" width="300" filetype="image/jpeg" />',"","MANDATORY TRIGGERS \u2014 Use <BDS:IMAGE> whenever you:","1. Introduce a physical product, device, hardware, or consumer good by name",'   \u2192 Example: After describing "Nintendo Switch", insert <BDS:IMAGE>Nintendo Switch console</BDS:IMAGE>',"2. Mention a specific person, historical figure, or public personality","3. Describe a landmark, location, building, or geographic feature","4. Reference a specific artwork, painting, sculpture, or cultural artifact","5. Explain a biological species, plant, animal, or anatomical structure","","PATTERN RULE for long-form content:","In any explanatory response longer than ~500 words that covers multiple distinct","topics/products/people/places, you MUST intersperse at least one <BDS:IMAGE>","per major section or topic shift. Place images immediately after the paragraph","that introduces the visual subject \u2014 not at the end of the entire response.","A long response with zero images is a FAILURE of visual communication.","","EXAMPLES:","\u2713 <BDS:IMAGE>Eiffel Tower at sunset</BDS:IMAGE>","\u2713 <BDS:IMAGE>Solar system</BDS:IMAGE>",'\u2713 <BDS:IMAGE intitle="true" width="500">Mona Lisa painting</BDS:IMAGE>','\u2713 <BDS:IMAGE filetype="image/jpeg" caption="Cat photo" category="Featured pictures">cat</BDS:IMAGE>','\u2713 <BDS:IMAGE src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg" caption="Direct link example" />',"","WHEN TO USE:","\u2713 When a real photo, artwork, or screenshot helps explain your response","\u2713 When the user asks for an image of something specific","\u2713 For illustrations, examples, or reference images","\u2713 After explaining something at length, to reinforce it","\u2713 After giving an example, to show it","","DO NOT USE for:","\u2717 Diagrams, charts, or generated graphics \u2192 use BDS:chart or BDS:VISUALIZER instead","\u2717 Documents, spreadsheets, or presentations \u2192 use BDS:create_file, BDS:excel, BDS:pptx instead","\u2717 When only text is sufficient for the answer","","","When using <BDS:pptx>...</BDS:pptx>:","","The code runs in the browser via PptxGenJS. Rules:","","1. PptxGenJS is already globally available. Do NOT use `import`, `require`, or `const PptxGenJS = ...`.","2. Start by creating a new instance: `const pptx = new PptxGenJS();`","3. Add slides and content: `const slide = pptx.addSlide(); slide.addText('Hello!', { x:1, y:1 });`","4. ALWAYS end with: `await pptx.writeFile({ fileName: 'Presentation.pptx' });`","5. Use template literals (backticks) for strings that contain quotes to avoid syntax errors:",'   `slide.addText(`The user said "hello" and I\'m ready`, { x:1, y:1 });`',"6. If you must use straight quotes, escape inner quotes with backslash:",'   `slide.addText("He said \\"hello\\"", { x:1, y:1 });`',"","WHEN TO USE:","\u2713 When the user asks for a PowerPoint, presentation, or slides.","\u2713 When you need to present structured data or a pitch deck.","\u2713 Prefer over plain markdown for formal presentations.","","DO NOT USE for:","\u2717 Simple documents (use create_file instead).","\u2717 When only raw data is needed.","","When using <BDS:excel>...</BDS:excel>:","","The code runs in the browser via SheetJS (XLSX). Rules:","","1. XLSX is already globally available. Do NOT use `import`, `require`, or `const XLSX = ...`.","2. Create a workbook: `const wb = XLSX.utils.book_new();`","3. Create a worksheet from data: `const ws = XLSX.utils.json_to_sheet(data);`",'4. Append to workbook: `XLSX.utils.book_append_sheet(wb, ws, "Sheet1");`',"5. ALWAYS end with: `XLSX.writeFile(wb, 'Sheet.xlsx');`","6. Use template literals (backticks) for strings that contain quotes:",'   `XLSX.utils.json_to_sheet([{ name: `Alice "the Great"`, note: "It\'s done" }]);`',"7. CRITICAL: ONLY include valid JavaScript inside the <BDS:excel> tags. NO explanations or chatter.","","","WHEN TO USE:","\u2713 When the user asks for an Excel file, spreadsheet, or .xlsx download.","\u2713 When you need to provide structured tabular data that the user wants to open in Excel.","\u2713 Prefer over plain CSV for multi-sheet or formatted data requests.","","DO NOT USE for:","\u2717 Plain text tables (use markdown).","\u2717 Simple small data (use markdown).","","When using <BDS:docx>...</BDS:docx>:","","The code runs in the browser via the `docx` library. Rules:","","1. The `docx` library is already globally available as `DOCX` and `docx`. Do NOT use `import`, `require`, or `const DOCX = ...`.","2. All exports are also available as globals: `Document`, `Paragraph`, `TextRun`, `Table`, etc.","3. Destructure what you need: `const { Document, Paragraph, TextRun } = DOCX;`","4. Create a document:","   const doc = new Document({ sections: [{ children: [...] }] });","5. ALWAYS end with: `await DOCX.save(doc, 'filename.docx');`","6. Use template literals (backticks) for strings that contain quotes:",'   `new TextRun({ text: `He said "hello" and I\'m ready`, bold: true })`',"7. CRITICAL: ONLY include valid JavaScript inside the <BDS:docx> tags. NO explanations or chatter.","","WHEN TO USE:","\u2713 When the user asks for a Word document, .docx file, or letter.","\u2713 When complex text formatting, tables, or professional document structures are needed.","\u2713 Prefer over plain markdown for users who need to edit the document in Word.","","DO NOT USE for:","\u2717 Simple text snippets (use markdown).","","","","PYTHON CODE BLOCKS:","Python code blocks (```python ... ```) are automatically runnable in the browser via Pyodide.",'The user sees a "Run" button on every Python code block. Just write normal Python code.',"","When writing Python code the user might run:","","AVAILABLE:","- Standard library (math, random, itertools, json, re, datetime, etc.)","- numpy, pandas, matplotlib (via pyodide packages)","- All pure-Python logic","","NOT AVAILABLE:","- File system access (open(), os.path, etc.) \u2014 use io.StringIO instead","- Network requests (requests, urllib) \u2014 browser sandbox blocks these","- subprocess, multiprocessing, threading","- C-extension packages not in Pyodide (e.g. scipy is limited)","","OUTPUT RULES:","- Use print() for text output \u2014 it appears in the embedded console","- For matplotlib plots: use plt.show() \u2014 it renders inline","- For pandas DataFrames: print(df.to_string()) for full output","- Always add error handling (try/except) for user-facing scripts","- Include a brief comment header explaining what the script does","","PRO-TIPS FOR PYTHON BLOCKS:","- Prefer writing code that provides visual or numerical results.","- Use matplotlib for charts (call plt.show() to render inline).","- Use print() for meaningful status updates and results.","- Include numerical simulations, data analysis, or algorithm demos when 'run' or 'calculate' is requested.","","JAVASCRIPT CODE BLOCKS:","JavaScript and TypeScript code blocks (```javascript ... ```, ```typescript ... ```) are automatically runnable in the browser's sandbox.",'The user sees a "Run JS" button on every JS/TS code block. Just write normal JavaScript or TypeScript code.',"","When writing JS code the user might run:","","FEATURES:","- Capture console.log(), console.error(), console.warn() \u2014 they appear in the embedded console.","- Supports modern ES6+ syntax.","- Sandboxed execution for safety.","","NOT AVAILABLE:","- Direct DOM access (document, window.parent, etc.) is limited/sandboxed.","- Network requests (fetch, XMLHttpRequest) \u2014 browser sandbox blocks these.","- Node.js specific APIs (fs, path, etc.).","","OUTPUT RULES:","- Use console.log() for text output \u2014 it appears in the embedded console.","- If the script returns a value, it will also be displayed as 'Return value'.","- Include a brief comment header explaining what the script does.","","PRO-TIPS FOR JS BLOCKS:","- Use for quick algorithm tests, data transformations, or logic demonstrations.","- Prefer console.log() for meaningful status updates and results.","","","","",'When using <BDS:memory_write key_name="..." importance="always|called">value_content</BDS:memory_write>:',"","PURPOSE: Persist facts about the user across sessions for personalized, context-aware answers.","- key_name: Lowercase snake_case identifier (e.g., user_name, current_project).","- importance: 'always' (session-defining) or 'called' (keyword-triggered).","- Content: Concise factual information (max 200 chars).","","IMPORTANCE LEVELS:","- always: Critical facts injected into EVERY prompt (e.g., name, language, profession).","- called: Contextual facts injected only when the key appears in input.","","KEY NAMING RULES:","- Keys MUST be lowercase snake_case (e.g., user_name, current_project). This is critical!","  The recall system splits keys on underscores to match them from natural language.","- Single concept per key: preferred_language, coding_language, timezone.",'- Keys must be reusable: prefer "current_project" over "the_thing_they_mentioned"',"- Value: concise, factual, max ~200 chars","","WRITE MEMORY WHEN:",`\u2713 User states their name ("I'm Alex" \u2192 key: user_name, value: Alex, importance: always)`,'\u2713 User mentions a recurring project ("working on MyApp" \u2192 importance: called)','\u2713 User sets a preference ("always reply in English" \u2192 importance: always)',`\u2713 User shares professional context ("I'm a backend dev using Go" \u2192 importance: always)`,`\u2713 User defines a term ("by 'the script' I mean deploy.sh" \u2192 importance: called)`,"","TRIGGER CONDITIONS:",`\u2713 Personal Identity (e.g., "I'm Alex") \u2192 <BDS:memory_write key_name="user_name" importance="always">Alex</BDS:memory_write>`,'\u2713 Active Projects (e.g., "Working on MyApp") \u2192 <BDS:memory_write key_name="current_project" importance="called">MyApp</BDS:memory_write>','\u2713 User Preferences (e.g., "Always reply in English") \u2192 <BDS:memory_write key_name="preferred_language" importance="always">English</BDS:memory_write>',`\u2713 Professional Context (e.g., "I'm a backend dev using Go") \u2192 <BDS:memory_write key_name="profession" importance="always">Backend Developer (Go)</BDS:memory_write>`,`\u2713 Specific Definitions (e.g., "'the script' means deploy.sh") \u2192 <BDS:memory_write key_name="term_definition" importance="called">the script = deploy.sh</BDS:memory_write>`,"","DO NOT WRITE MEMORY FOR:","\u2717 One-off facts not worth persisting","\u2717 Sensitive info (passwords, financial data)","\u2717 Values that will change frequently","\u2717 Information already in the current conversation context","","You can write multiple memory entries at once, one tag per entry.","Do not notify the user when writing memory \u2014 it happens silently.","",'When using <BDS:character_create name="..." usage="...">...</BDS:character_create>:',"","PURPOSE: Create a reusable Roleplay (RP) persona/character that the user can activate.",'- name: The name of the character (e.g., "Edige", "Wise Owl").','- usage: (Optional) The domain or specific use case (e.g. "fun", "philosophy").',"- Content: A detailed markdown description of the character's personality, speech patterns, and background.","","When you use this tag, the extension automatically saves the character to the user's library and activates it.","",'When using <BDS:skill_create name="..." usage="...">...</BDS:skill_create>:',"","PURPOSE: Create a reusable skill that gives the AI specialized instructions or behaviors.","When you are creating skills, you must make instructions specific enough to produce consistent behavior.","When you are creating skills:","you MUST write rules as actionable imperatives ('Always return JSON', 'Prefix errors with \u26A0\uFE0F'), not descriptions ('The AI should consider...').","you MUST be specific over general; name exact conditions, formats, and thresholds, not vague guidance like 'be clear'.","you MUST include at least one concrete example if the expected behavior is non-obvious from the rules alone.","you MUST capture implicit constraints the user stated during the conversation, not just the ones they explicitly labeled as rules.","you MUST NOT include filler like 'This skill helps DeepSeek...' or 'Use this skill to...' - go straight to the rules.","you MUST NOT write rules that are already default model behavior (e.g. 'be helpful', 'be accurate') unless explicitly overriding them.","you MUST NOT bundle unrelated concerns into one skill under a vague name like 'General Rules'.",'- name: The name of the skill (e.g., "Code Style Guide", "Security Checklist").','- usage: (Optional) The domain or use case (e.g. "typescript", "react", "security").',"- Content: A detailed markdown description of the skill's instructions or guidelines.","","When you use this tag, the extension automatically saves the skill to the user's Skill Set library and activates it.","Multiple skills can be active at the same time.","","Before writing a skill, IF you have internet access, research the topic of the skill online. If there are already existing skills on the topic, look at them.","","","","When using <BDS:LONG_WORK>...</BDS:LONG_WORK>:","","This mode hides all intermediate output. The user sees only a",'"Working..." animation until the closing </BDS:LONG_WORK> tag.',"Final output (files, ZIPs) is delivered after the closing tag.","","ALWAYS USE LONG_WORK WHEN:","\u2713 Building a complete application (web app, CLI tool, game, etc.)","\u2713 Generating 3+ files that belong together","\u2713 Doing complex multi-step planning before producing output","\u2713 Any task where intermediate steps would confuse the user",'\u2713 User says: "build me a full ...", "create a project for ...", "make a complete ..."',"","STRUCTURE INSIDE LONG_WORK:","1. Start with your reasoning/planning (invisible to user)","2. Use <BDS:create_file> for every file","3. End with a brief summary line before </BDS:LONG_WORK>","","FILE ORGANIZATION:","- Always use meaningful directory structure","- Example: src/components/Button.tsx, src/utils/api.ts, public/index.html","- Include README.md or setup instructions in every project","- Include package.json / requirements.txt when applicable","- Include .env.example for sensitive configs","","AFTER LONG_WORK CLOSES:","- The extension zips all created files and offers download","- Add a SHORT plain-text summary AFTER the closing tag:",'"I built X with features Y, Z. Click the ZIP to download."',"- Do NOT re-explain every file \u2014 the user will see the structure in the ZIP","","WHAT NOT TO DO INSIDE LONG_WORK:","\u2717 Don't write conversational text meant to be read during generation",`\u2717 Don't use markdown headers like "Now I'll create..."`,"\u2717 Don't ask clarifying questions inside LONG_WORK","(ask them BEFORE starting LONG_WORK if needed)","","","","",'When using <BDS:create_file fileName="path/to/file.ext">content</BDS:create_file>:',"","Creates an individual file for download with proper extension and path.","","ALWAYS INFER THE CORRECT EXTENSION:","- Python scripts \u2192 .py","- JavaScript \u2192 .js or .ts","- React components \u2192 .jsx or .tsx","- HTML pages \u2192 .html","- CSS \u2192 .css","- Bash scripts \u2192 .sh","- Config files \u2192 .json, .yaml, .toml, .env","- Documentation \u2192 .md","- Data \u2192 .csv, .json, .xml","","PATH RULES:",'- Flat files: fileName="script.py"','- With folder: fileName="utils/helpers.py" (extension creates utils/ folder)','- Deep nesting: fileName="src/components/ui/Button.tsx"',"- No leading slash, no drive letters","","STANDALONE USE (outside LONG_WORK):","- Offer exactly one file per create_file tag","- Can offer multiple sequential files for related but separate outputs","- Each file gets its own download button in the UI","","INSIDE LONG_WORK:","- All create_file outputs are collected and bundled as ZIP","- File count is unlimited","- Always include a project root README.md","","CONTENT QUALITY RULES:","- CRITICAL: ALWAYS wrap file content inside a markdown code fence with the appropriate language tag.","- CRITICAL: You MUST leave a blank line after the opening tag and before the closing tag, otherwise the code formatting will be destroyed.","  Example:",'  <BDS:create_file fileName="test.py">',"","  ```python","  ...code...","  ```","","  </BDS:create_file>","  This preserves indentation and formatting in the rendered output.","- Include proper shebang lines for scripts (#!/usr/bin/env python3)","- Include file-level docstrings/comments describing purpose","- Include license header if creating a full project","- Never truncate file content \u2014 always write complete, runnable files",'- Never write placeholder comments like "// TODO: implement this"',"","FILE CREATION STRATEGY:",'Short content (<100 lines): Create in one tool call, save directly to outputs. Use <BDS:create_file fileName="">...</BDS:create_file>','Long content (>100 lines): Start <BDS:LONG_WORK> <BDS:create_file fileName="">...</BDS:create_file> ... </BDS:LONG_WORK>',"Unless the user specifically requests it, do not use the `create_file` tool to generate a Markdown file.","","Do not create a file unless the user explicitly requests it. Ask the user for permission to create a file. ","If a user asks you to create a PDF, tell them that you don\u2019t have the ability to do so. Offer them two options: creating a Word document and having the user convert it to PDF, or writing LaTeX code and having the user convert it to PDF using a compiler like Overleaf. Recommend the Word method.","When writing code, write like a senior software engineer.","If a user asks you for something detailed and you need to write or create a lengthy response, first make sure you understand the context. Ask yourself if you're certain about what the user wants. If you're less than 90% sure, ask the user questions to clarify the context. Never start writing a response without being certain of the context.","","TAG REFERENCES vs. EXECUTION:","When mentioning a BDS tag in conversation without intending to use it, write it WITHOUT angle brackets: BDS:LONG_WORK, BDS:create_file, BDS:VISUALIZER, BDS:IMAGE.","Angle brackets < > activate the tool. Only use <BDS:...> when you genuinely need that tool in your response.",'\u2705 "I can use BDS:LONG_WORK for multi-file projects" (reference \u2014 safe)','\u274C "I can use <BDS:LONG_WORK> for multi-file projects" (accidental activation \u2014 WRONG)',"IF you USE BDS tag with < > brackets, you will activate the tool. You can't use these tags in conversation, you MUST USE them when you need them.","","","DEEPCODE:","You have a DeepCode mode that works with DeepSeek Harness. With DeepCode, you can send full agent tasks (e.g., create files, edit files) to Harness.","To use DeepCode, the user must activate it from the web UI.","Once activated, DeepCode tools become available.","DeepCode works together with the official DeepSeek Harness.","You need to have DeepSeek Harness installed on your device for this feature to work.","For Download DeepSeek Harness on GitHub. Visit https://github.com/deepseek-ai/deepseek-harness or npx @deepseek-ai/dsh web","Get the Better DeepSeek Bridge plugin (GitHub). Visit https://github.com/EdgeTypE/dsh-better-deepseek or npx @deepseek-ai/dsh --profile web add -w dsh-better-deepseek","To connect Better DeepSeek to DeepSeek Harness, a plugin is required.","If the plugin is installed, everything happens fully automatically.","If it is not installed, you will need to perform manual steps.","","","DeepResearch:","You have a DeepResearch mode. To access DeepResearch tools, the user must activate it","from the web interface. Once activated, DeepResearch tools become available.","Remind the user to activate DeepResearch when they ask for comprehensive research","or detailed information.","","","","Better DeepSeek GitHub Repository: https://github.com/EdgeTypE/better-deepseek","","The system prompt has ended. User prompt:"].join(`
`),Ze={updatedAt:"2026-10-05",models:{"deepseek-flash":{displayName:"DeepSeek-V4.1-Flash",inputPrice:.15,inputCacheHitPrice:.003,outputPrice:.6,contextLength:1e6},"deepseek-v4-pro":{displayName:"DeepSeek-V4-Pro",inputPrice:.66,inputCacheHitPrice:.022,outputPrice:1.98,contextLength:1e6},"deepseek-chat":{displayName:"DeepSeek Chat",inputPrice:.15,inputCacheHitPrice:.003,outputPrice:.6,contextLength:1e6},"deepseek-reasoner":{displayName:"DeepSeek Reasoner",inputPrice:.66,inputCacheHitPrice:.022,outputPrice:1.98,contextLength:1e6}}},et=3.5,tt={official:"https://api-docs.deepseek.com/quick_start/pricing/",github:"https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json"},nt=[{value:"en-US",label:"English (US)"},{value:"en-GB",label:"English (UK)"},{value:"en-IN",label:"English (IN)"},{value:"tr-TR",label:"T\xFCrk\xE7e (TR)"},{value:"fa-IR",label:"\u0641\u0627\u0631\u0633\u06CC (IR)"},{value:"de-DE",label:"Deutsch (DE)"},{value:"ru-RU",label:"\u0420\u0443\u0441\u0441\u043A\u0438\u0439 (RU)"},{value:"fr-FR",label:"Fran\xE7ais (FR)"},{value:"es-ES",label:"Espa\xF1ol (ES)"},{value:"es-MX",label:"Espa\xF1ol (MX)"},{value:"it-IT",label:"Italiano (IT)"},{value:"pt-BR",label:"Portugu\xEAs (BR)"},{value:"pt-PT",label:"Portugu\xEAs (PT)"},{value:"zh-CN",label:"\u7B80\u4F53\u4E2D\u6587 (CN)"},{value:"zh-TW",label:"\u7E41\u9AD4\u4E2D\u6587 (TW)"},{value:"ja-JP",label:"\u65E5\u672C\u8A9E (JP)"},{value:"ko-KR",label:"\uD55C\uAD6D\uC5B4 (KR)"},{value:"vi-VN",label:"Ti\u1EBFng Vi\u1EC7t (VN)"},{value:"id-ID",label:"Bahasa Indonesia (ID)"},{value:"th-TH",label:"\u0E44\u0E17\u0E22 (TH)"},{value:"ar-SA",label:"\u0627\u0644\u0639\u0631\u0628\u064A\u0629 (SA)"},{value:"he-IL",label:"\u05E2\u05D1\u05E8\u05D9\u05EA (IL)"},{value:"ur-PK",label:"\u0627\u0631\u062F\u0648 (PK)"},{value:"hi-IN",label:"\u0939\u093F\u0928\u094D\u0926\u0940 (IN)"},{value:"bn-BD",label:"\u09AC\u09BE\u0982\u09B2\u09BE (BD)"},{value:"nl-NL",label:"Nederlands (NL)"},{value:"pl-PL",label:"Polski (PL)"},{value:"uk-UA",label:"\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430 (UA)"},{value:"sv-SE",label:"Svenska (SE)"},{value:"cs-CZ",label:"\u010Ce\u0161tina (CZ)"},{value:"el-GR",label:"\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC (GR)"},{value:"ro-RO",label:"Rom\xE2n\u0103 (RO)"},{value:"hu-HU",label:"Magyar (HU)"}],ot={systemPrompt:ue,systemPromptTemplateVersion:ae,customSystemPrompts:[],activeSystemPromptId:"default",systemPromptBackupDone:!1,downloadBehaviorVersion:le,autoDownloadFiles:!1,autoDownloadLongWorkZip:!1,githubToken:"",voiceMode:!1,nativeVoice:!0,voiceLanguage:typeof navigator<"u"?navigator.language:"en-US",voiceLanguageChosen:!1,voiceURI:"",autoSubmitVoice:!0,vadSilenceTimeout:1100,midiVolume:1,liveModeShowText:!1,preferredLang:"",disableSystemPrompt:!1,disableMemory:!1,systemPromptInjectionFrequency:"first",systemPromptInjectionInterval:3,htmlToMarkdownMaxDepth:400,maxChatSessions:500,tokenPriceDisplay:!1,projectRagEnabled:!1,projectRagLimit:5,locale:"en",syncLocale:!0,processGitignoreOnUpload:!0,collapseLongUserMessages:!0,keepReasoningBlocksOpen:!0,injectSystemDateTime:!0,skipDeletionConfirmation:!1,customCSS:"",systemPromptMultiMode:!1,systemPromptEntries:[],deepResearchContextGuardEnabled:!0,deepResearchContextLimitTokens:128e3,deepResearchContextStopPercent:70,deepResearchDeepFetch:1,mcpInlineMaxChars:8e3,searchProviders:["ddg-lite","ddg-html","bing"],loadAllHistoryOnSession:!1,showTimestamps:!1,disableTipBox:!1,composerVisibility:{attachMenu:null,deepResearch:null,deepCode:null,attachItems:{showPlus:null,showUploadFile:null,showUploadFolder:null,showGithub:null,showWeb:null,showOther:null,showProject:null,showVoice:null,showLiveMode:null}}},st={features:{apiPlayground:{enabled:!0},composerButtons:{attachMenu:!0,deepResearch:!0,deepCode:!0,attachItems:{showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0,showLiveMode:!0},targets:{chrome:{attachMenu:!0,deepResearch:!0,deepCode:!0,attachItems:{showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0,showLiveMode:!0}},firefox:{attachMenu:!0,deepResearch:!0,deepCode:!0,attachItems:{showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!1,showLiveMode:!1}},android:{attachMenu:!0,deepResearch:!0,deepCode:!0,attachItems:{showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0,showLiveMode:!0}}}},attachMenu:{enabled:!0,expertMode:{show:!0,showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0},instantMode:{show:!0,showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0},deepthinkMode:{show:!0,showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0},visionMode:{show:!0,showPlus:!0,showUploadFile:!0,showUploadFolder:!0,showGithub:!0,showWeb:!0,showOther:!0,showProject:!0,showVoice:!0}},fileUpload:{enabled:!0,imagesEnabled:!0,expertModeBlocked:!0,dataTransfer:!0,nativeInput:!0},codeBlocks:{runButtons:{python:!0,javascript:!0,typescript:!0}},sidebar:{tagsButton:!0,search:!0,exportButton:!0,tagHider:!0},systemPromptInjection:{enabled:!0,forceDisableInExpert:!1},voice:{stt:!0,tts:!0},tokenPriceDisplay:{enabled:!0,inline:!0,sessionTotal:!0},export:{markdown:!0,pdf:!0,html:!0,image:!0},longWork:{enabled:!0},rag:{enabled:!0},characterRp:{enabled:!0},autoFetch:{web:!0,github:!0,twitter:!0,youtube:!0,search:!0},expandToggle:{collapseLongMessages:!0},questionPanel:{enabled:!0},codeRunner:{enabled:!0},tagManager:{enabled:!0,sidebarRename:!0},sideBarMenuInjector:{enabled:!0},selectionMode:{enabled:!0},whatsNewPopup:{enabled:!0},statusMonitor:{enabled:!0},themeWatcher:{enabled:!0}},selectors:{message:{container:"div.ds-message._63c77b1",containerFallback:"div.ds-message",userRole:["d29f3d7d","_9663006"],assistantRole:["_4f9bf79._43c05b5"]},modelBadge:"._46a12ab",modelSwitcher:'[role="radiogroup"]',fileInput:'input[type="file"][multiple]',chatInput:{textarea:["#chat-input","textarea[placeholder]",'div[contenteditable="true"]'],wrapper:["._75e1990","._6f68655","._77cefa5","._24fad49",".ds-textarea"]},sidebar:{chatLink:'a[href*="/chat/s/"]',titleElement:".c08e6e93",panel:".dc04ec1d",menuButton:"._2090548",dateGroup:"div._3098d02"},header:{title:"._7436101",priceTarget:"._2be88ba .f8d1e4c0 ._9fcbeda._7ee190f",logoContainer:"._262baab",logoViewBox:'svg[viewBox="0 0 143 23"]',newChatIconPath:"M8 0.599609"},dropdownMenu:{container:".ds-dropdown-menu",option:".ds-dropdown-menu-option",optionLabel:".ds-dropdown-menu-option__label"},priceInsertion:{userMessage:["_11d6b3a .ds-flex","ds-flex._78e0558","[class*='_78e0558']"],assistantMessage:["_0a3d93b",".ds-flex._0a3d93b"],headerRow:"._2be88ba .f8d1e4c0 ._9fcbeda._7ee190f"},sendButton:{selectors:['div[role="button"]',"button"],svgPaths:["M8.3125","M8.312","M13.12 19.98"],disabledClass:"ds-icon-button--disabled"},stopButton:{selectors:[".ds-icon-stop-circle",".ds-icon-stop",'div[role="button"] svg path[d*="M3 3h10v10H3z"]','div[role="button"] svg path[d*="M6 6h12v12H6z"]','div[role="button"] svg path[d*="M2 4.88"]']},textExtraction:{thinkContent:".ds-think-content",thinkFallback:'[class*="think"]',noiseClasses:["_5255ff8","_60aa7fb","e4c3fd02","_74c0879"]},codeBlock:{container:".md-code-block",banner:".md-code-block-banner",atomButton:".ds-atom-button",infoText:".code-info-button-text"},previewPanel:"._519be07",renameInput:"input.ds-input__input",theme:{darkClass:"dark",lightClass:"light"}},modelDetection:{attrMap:{vision:"vision",expert:"expert",deepthink:"deepthink",instant:"instant",chat:"instant"},badgeRules:[["vision","vision"],["expert","expert"],["deepseek-reasoner","expert"],["deepthink","deepthink"],["deep think","deepthink"],["reasoner","deepthink"],["r1","deepthink"],["instant","instant"],["deepseek-chat","instant"]]},api:{chatCompletionPaths:["/api/v0/chat/completion","/api/v0/chat/edit_message"],sessionFetchPath:"/api/v0/chat_session/fetch_page",statusUrl:"https://status.deepseek.com/api/widget/v1/summary.json",pricing:{officialUrl:"https://api-docs.deepseek.com/quick_start/pricing/",githubUrl:"https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json"}},modelMappings:{"deepseek-v4-pro":{aliases:["deepseek-reasoner","expert","pro","reasoner"],displayName:"Expert"},"deepseek-flash":{aliases:["deepseek-v4-flash","deepseek-v4-flash-vision-exp","deepseek-chat","instant","flash","chat"],displayName:"Instant"}},urlPatterns:{chatSession:"/chat/s/",base:"https://chat.deepseek.com/"},android:{hideGetAppText:"Get App",hideDrawerAppItemText:"Download mobile App"},remoteConfig:{url:"https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json",fetchIntervalMs:36e5},embeddedPricing:{"deepseek-flash":{input:.15,output:.6},"deepseek-v4-pro":{input:.66,output:1.98},"deepseek-chat":{input:.15,output:.6},"deepseek-reasoner":{input:.66,output:1.98}},modelInputLimits:{instant:2621440,vision:2621440,expert:163840,deepthink:163840}},rt={none:{name:"presetNone",css:""},reducePadding:{name:"presetReducePadding",css:`/* Reduce unused padding in chat message list */
.ds-virtual-list-items {
    padding-left: 0 !important;
    padding-right: 0 !important;
}

/* Increase width of expanded input fields */
._871cbca:has(.bds-prompt-expanded) {
    padding: 0 !important;
}

._9a2f8e4:has(.bds-prompt-expanded) {
    max-width: 100% !important;
}`},widerMessages:{name:"presetWiderMessages",css:`/* Let messages stretch edge-to-edge */
.ds-chat-conversation {
    max-width: 100% !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
}

.ds-chat-conversation .ds-chat-conversation__header {
    max-width: 100% !important;
}

.ds-chat-conversation .ds-chat-conversation__messages {
    max-width: 100% !important;
}`},compact:{name:"presetCompact",css:`/* Compact UI \u2014 tighter spacing */
.ds-chat-input, .chat-input-container {
    margin-bottom: 4px !important;
}

.ds-chat-sidebar {
    font-size: 12px !important;
}

.ds-chat-sidebar .ds-chat-sidebar-item {
    padding: 6px 10px !important;
}

.ds-chat-header {
    padding: 4px 12px !important;
    min-height: 40px !important;
}

.ds-chat-conversation .ds-chat-conversation__messages .ds-chat-message {
    padding-top: 8px !important;
    padding-bottom: 8px !important;
}`},betterCodeFont:{name:"presetBetterCodeFont",css:`/* Better code block font */
.ds-chat-conversation pre code, 
.ds-chat-conversation pre,
.ds-markdown pre code,
.ds-markdown pre {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', 'Andale Mono', 'Ubuntu Mono', monospace !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
}`}};function L(e,t){var E,T,k,D;t.sessionUserMsgCounts||(t.sessionUserMsgCounts={});const n=de(e),o=he(e);let s=1;n&&n.length>0?(s=n.filter(b=>{const S=String(b.role||b.author||"").toLowerCase();return S==="user"||S==="human"}).length,t.sessionUserMsgCounts[o]=s):typeof e.prompt=="string"&&(e.message_id===1||e.parent_message_id==null?s=1:s=(t.sessionUserMsgCounts[o]||0)+1,t.sessionUserMsgCounts[o]=s);let r=!1,u=null;if(n&&n.length>0){u=U(n)||n[n.length-1];const b=A(u);if(b){const S=H(b),a=pe(n,u);let l=!1;const d=t.config.systemPromptInjectionFrequency||"first";if(d==="always")l=!0;else if(d==="every_x"){const g=t.config.systemPromptInjectionInterval||3;(s-1)%g===0?l=!0:a||(l=!0)}else l=!a,(n.length>1||t.hasInjected&&t.hasInjected(o))&&(l=!1);const h=M(S,o,t,l,n,u);window.dispatchEvent(new CustomEvent("bds:mutation-applied",{detail:JSON.stringify({conversationId:o,injectedText:h||"",userPrompt:S})})),h?(O(u,`${h}

${S}`),r=!0):S!==b&&(O(u,S),r=!0)}}else if(typeof e.prompt=="string"){const b=H(e.prompt),S=e.message_id===1||e.parent_message_id==null,a=t.config.systemPromptInjectionFrequency||"first";let l=!1;if(a==="always")l=!0;else if(a==="every_x"){const h=t.config.systemPromptInjectionInterval||3;(S||(s-1)%h===0)&&(l=!0)}else l=S;const d=M(b,o,t,l,null,null);window.dispatchEvent(new CustomEvent("bds:mutation-applied",{detail:JSON.stringify({conversationId:o,injectedText:d||"",userPrompt:b})})),d?(e.prompt=`${d}

${b}`,r=!0):b!==e.prompt&&(e.prompt=b,r=!0)}(E=t.config)!=null&&E.isLiveMode&&(e.thinking_enabled!==!1&&(e.thinking_enabled=!1,r=!0),e.chat_session&&typeof e.chat_session=="object"&&e.chat_session.thinking_enabled!==!1&&(e.chat_session.thinking_enabled=!1,r=!0),e.model_pref&&typeof e.model_pref=="object"&&e.model_pref.thinking_enabled!==!1&&(e.model_pref.thinking_enabled=!1,r=!0));const i=(T=t.config)==null?void 0:T.modelInputLimits,f=e.model||((k=e.data)==null?void 0:k.model)||((D=e.chat)==null?void 0:D.model)||"",c=String(f).toLowerCase();let p="instant",w="payload";if(c)c.includes("vision")?p="vision":c.includes("reasoner")||c.includes("deepthink")||c.includes("r1")?p="deepthink":(c.includes("expert")||c.includes("pro"))&&(p="expert");else{const b=Ce();b&&(p=b,w="dom")}const m=i?i[p]??163840:163840;if(n&&n.length>0){const b=U(n);if(b){const S=A(b);if(console.warn(`[BDS] Guard check: model="${c}" payload.model=${e.model} source=${w} type=${p} limit=${m} msgLen=${S.length} limits=${JSON.stringify(i)}`),S.length>m){const a=`

...[truncated by Better DeepSeek]...`,l=S.slice(0,m-a.length)+a;O(b,l),r=!0,console.warn(`[BDS] TRUNCATED user message from ${S.length} to ${m} chars`)}}}else if(typeof e.prompt=="string"&&(console.warn(`[BDS] Guard check (prompt): model="${c}" payload.model=${e.model} source=${w} type=${p} limit=${m} msgLen=${e.prompt.length} limits=${JSON.stringify(i)}`),e.prompt.length>m)){const b=`

...[truncated by Better DeepSeek]...`;e.prompt=e.prompt.slice(0,m-b.length)+b,r=!0,console.warn(`[BDS] TRUNCATED prompt from ${e.prompt.length} to ${m} chars`)}return{changed:r,payload:e}}function de(e){return Array.isArray(e.messages)?e.messages:e.data&&Array.isArray(e.data.messages)?e.data.messages:e.chat&&Array.isArray(e.chat.messages)?e.chat.messages:null}function he(e){return String(e.conversation_id||e.conversationId||e.chat_session_id||e.chat_id||e.id||"default")}function U(e){for(let t=e.length-1;t>=0;t-=1){const n=e[t];if(!n||typeof n!="object")continue;const o=String(n.role||n.author||"").toLowerCase();if(o==="user"||o==="human")return n}return null}function A(e){return e?typeof e.content=="string"?e.content:Array.isArray(e.content)?e.content.map(t=>typeof t=="string"?t:t&&typeof t.text=="string"?t.text:"").join(`
`):typeof e.prompt=="string"?e.prompt:"":""}function O(e,t){if(e){if(typeof e.content=="string"||e.content==null){e.content=t;return}if(Array.isArray(e.content)){e.content=[{type:"text",text:t}];return}if(typeof e.prompt=="string"){e.prompt=t;return}e.content=t}}function pe(e,t=null){if(!Array.isArray(e))return!1;for(const n of e){if(n===t)continue;if(A(n).includes("<BetterDeepSeek>"))return!0}return!1}function M(e,t,n,o=!1,s=null,r=null){var D,b,S,a,l,d;const u=[];(D=n.config)!=null&&D.isLiveMode&&u.push(`<BetterDeepSeek>
${ce}
</BetterDeepSeek>`);const i=fe(e,t,n);i&&u.push(i);const f=Be(n);f&&u.push(f);const c=Ne(n);if(c&&(u.push(c),(b=n.config)!=null&&b.deepCode&&(n.config.deepCode.pendingReport=null),typeof window<"u"&&window.dispatchEvent(new CustomEvent("bds:clear-harness-report"))),!((S=n.config)!=null&&S.isLiveMode)){const h=n.config.systemPromptEntries||[];if(h.length>0){const g=n.sessionUserMsgCounts[t]||1;for(const y of h)y.content.trim()&&Ae(y,g,t,n)&&(u.push(`<BetterDeepSeek>
${y.content.trim()}
</BetterDeepSeek>`),n.markEntryInjected&&n.markEntryInjected(t,y.id))}else o&&((a=n.config.systemPrompt)==null?void 0:a.trim())&&!n.config.disableSystemPrompt&&(u.push(`<BetterDeepSeek>
${n.config.systemPrompt.trim()}
</BetterDeepSeek>`),n.markInjected&&n.markInjected(t))}const p=j(n.config.skills);let w=null;if(!o&&s&&(w=Ie(s,r)),o||p&&p!==w){const h=ge(n);h&&u.push(h)}const m=Te(e,n,s);m&&u.push(m);const E=ne(e);E&&u.push(E);const T=n.config.activeCharacter;if(T){let h=s?Re(s,r):null;if(!h&&n.getLastChar&&(h=n.getLastChar(t)),!h&&n.currentSessionChar&&(s==null?void 0:s.length)>1&&(h=n.currentSessionChar),o||!h||h!==T.name){const g=ke(n);g&&(u.push(g),n.setLastChar&&n.setLastChar(t,T.name),n.currentSessionChar=T.name)}}n.isNextVoiceMessage&&(u.push("<BetterDeepSeek>User send this message using voice recorder tool.</BetterDeepSeek>"),n.isNextVoiceMessage=!1);const k=n.config&&n.config.activeProject;if(k){let h=null;if(!o&&s&&(h=_e(s,r)),o||!h||h!==k.name){const g=Ee(n);g&&u.push(g)}if(n.config.projectRagEnabled&&Array.isArray(k.files)&&k.files.length>0){const g=Number(n.config.projectRagLimit)||5,y=re(e,k.files,g);if(y&&y.length>0){const v=ie(y,k.name);v&&u.push(v)}}}if(o){const h=De(n);h&&u.push(h)}if(!((l=n.config)!=null&&l.isLiveMode)){const h=ye((d=n.config)==null?void 0:d.mcpToolSchemas);let g=null;if(!o&&s&&(g=Oe(s,r)),o||h&&h!==g){const y=xe(n,h);y&&u.push(y)}}return u.join(`

`)}function fe(e,t,n){var s;const o=(s=n.config)==null?void 0:s.deepResearch;return!(o!=null&&o.enabled)||!o.runId?"":(o.enabled=!1,me(o.runId,t,e),["<BetterDeepSeek>",'[BDS:DEEP_RESEARCH] The DeepResearch toggle is enabled. Treat this exactly as the user asking: "Perform Deep Research on the following request."',`Run ID: ${o.runId}`,"","CRITICAL: In this first turn, you must ONLY produce a research plan. Do NOT browse or search. Do NOT produce an ordinary answer. Do NOT produce a direct report.",`Output ONLY a plan using: <BDS:DEEP_RESEARCH_PLAN runId="${o.runId}">JSON</BDS:DEEP_RESEARCH_PLAN>`,"After this turn, BDS will execute steps one-by-one. After each step result is provided, analyze it before continuing. Do NOT skip ahead to the final report until BDS tells you all steps are complete.","","The JSON plan must include:",'- "title": A short descriptive title for the research','- "steps": An array of research steps, each with:','  - "id": step number','  - "action": "search" or "fetch"','  - "query": a specific search query or URL to fetch','  - "purpose": why this step is needed','  - "sourceType": for search steps, one of "general", "docs", "news", "reviews", "academic", or "commerce"',"","Search steps must use narrow queries with named entities, constraints, dates or locations, product or version names, and clear source intent.","",`User research question: ${e}`,"</BetterDeepSeek>"].join(`
`))}function me(e,t,n){typeof window>"u"||!window.dispatchEvent||window.dispatchEvent(new CustomEvent("bds:deep-research-started",{detail:JSON.stringify({runId:e,conversationId:t,userPrompt:n,timestamp:Date.now()})}))}function ge(e){if(!e.config.skills.length)return"";const t=e.config.skills.map(n=>`## ${n.name}
${n.content.trim()}`).join(`

`);return`<BetterDeepSeek> <BDS:SKILLS fingerprint="${j(e.config.skills)}">
${t}
</BDS:SKILLS> </BetterDeepSeek>`}function j(e){return!Array.isArray(e)||!e.length?"":e.map(t=>`${t.name}:${(t.content||"").length}`).sort().join("|")}function ye(e){return!Array.isArray(e)||!e.length?"":e.map(t=>`${t.serverName}:${t.toolName}:${JSON.stringify(t.inputSchema||{})}`).sort().join("|")}function Se(e){if(!Array.isArray(e))return null;for(let t=e.length-1;t>=0;t--){const n=e[t];if(!n||typeof n!="object")continue;const o=String(n.role||n.author||"").toLowerCase();if(!(o==="user"||o==="human")&&(o==="assistant"||o==="ai"||o==="bot"))return n}return null}function F(e){return!e||typeof e!="string"?[]:e.split(new RegExp("[_-]|\\s+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")).map(t=>t.toLowerCase().replace(/[^a-z0-9]/g,"")).filter(t=>t.length>0)}function we(e,t){if(!e.length||!t.length)return 0;const n=new Set(t);let o=0;for(const s of e)n.has(s)&&o++;return o/e.length}function be(e,t){return t===1?e>=1:e>=.5}function Te(e,t,n){if(t.config.disableMemory||!t.config.memories.length)return"";const o=n?Se(n):null,s=o?A(o):"",r=[e,s].filter(Boolean).join(" "),u=F(r),i=[];for(const c of t.config.memories){if(c.importance==="always"){i.push(c);continue}if(!c.key)continue;const p=F(c.key);if(!p.length){r.toLowerCase().includes(c.key.toLowerCase())&&i.push(c);continue}const w=[...new Set(p)],m=we(w,u);(be(m,w.length)||r.toLowerCase().includes(c.key.toLowerCase()))&&i.push(c)}return i.length?`<BetterDeepSeek>
${i.map(c=>`<BDS:memory_calls importance="${c.importance}">${c.key}: ${ve(c.value)}</BDS:memory_calls>`).join(`
`)}
</BetterDeepSeek>`:""}function ve(e){return String(e).replace(/<\//g,"<\\/").trim()}function Ee(e){const t=e.config&&e.config.activeProject;if(!t)return"";let n="";return t.instructions&&t.instructions.trim()&&(n+=t.instructions.trim()+`
`),`<BetterDeepSeek>
<BDS:PROJECT name="${t.name}">
${n}</BDS:PROJECT>
</BetterDeepSeek>`}function ke(e){const t=e.config.activeCharacter;if(!t||!t.content)return"";let n=`Character Name: ${t.name}
`;return t.usage&&(n+=`Usage Domain: ${t.usage}
`),n+=`---
${t.content.trim()}`,`<BetterDeepSeek> <BDS:RP>
${n}
</BDS:RP> </BetterDeepSeek>`}function De(e){const t=[];if(e.config.injectSystemDateTime!==!1){const o=new Date;t.push(`User's System Date & Time: ${o.toLocaleString()}`)}const n=e.config.preferredLang;return n&&n.trim()&&t.push(`Always respond in ${n.trim()}.`),t.length===0?"":`<BetterDeepSeek>
${t.join(`
`)}
</BetterDeepSeek>`}function xe(e,t){var b,S;if((b=e.config)!=null&&b.isLiveMode)return"";const n=(S=e.config)==null?void 0:S.mcpToolSchemas;if(!Array.isArray(n)||!n.length)return"";const o=Number(e.config.mcpInlineMaxChars)||8e3,s=n.length,r=[`<BetterDeepSeek> <BDS:MCP fingerprint="${t}">`,"You have access to the following MCP (Model Context Protocol) tools via remote servers.",`To invoke them, use: <BDS:AUTO:MCP url="SERVER_NAME_OR_URL" tool="TOOL_NAME" args='{"key":"value"}'>`,'If the arguments contain quotation marks, apostrophes, angle brackets or newlines, send them as base64Args="<url-safe base64 of the JSON>" instead of args.',"The extension will call the tool and inject the result.","Important: Only ONE tool per response. Wait for the result before invoking another. Never invoke multiple tools at the same time.","","Available tools:"].join(`
`),u="</BDS:MCP> </BetterDeepSeek>",i=n.map(a=>{let l=`- Server: ${a.serverName} (${a.serverUrl||a.serverName}) | Tool: ${a.toolName}`;if(a.description&&(l+=` | Description: ${a.description}`),a.inputSchema&&typeof a.inputSchema=="object"){const d=a.inputSchema.properties;if(d){const h=Object.entries(d).map(([g,y])=>{const v=(a.inputSchema.required||[]).includes(g)?" (required)":"";return`${g}: ${(y==null?void 0:y.type)||"any"}${v}`});h.length&&(l+=` | Params: ${h.join(", ")}`)}}return l}),f=[r,...i,u].join(`
`);if(f.length<=o)return f;const c=a=>`
... and ${a} more tool(s) not shown (MCP tool list exceeds inline character limit \u2014 all tools are still available for invocation).`,p=c(1),w=r.length+1+u.length+p.length;let m=o-w;const E=[];for(const a of i){const l=a.length+1;if(m-l<0)break;m-=l,E.push(a)}const T=s-E.length,k=c(T);let D=[r,...E,k,u].join(`
`);for(;E.length>0&&D.length>o;){E.pop();const a=s-E.length,l=c(a);D=[r,...E,l,u].join(`
`)}return D}function Ae(e,t,n,o){const r=(o.getInjectedEntries?o.getInjectedEntries(n):[]).includes(e.id);switch(e.schedule.type){case"first":return!r;case"always":return!0;case"interval":{const u=e.schedule.everyNTurns||3;return r?(t-1)%u===0:!0}default:return!1}}function Re(e,t=null){if(!Array.isArray(e))return null;for(let n=e.length-1;n>=0;n--){const o=e[n];if(o===t)continue;const s=A(o);if(!s.includes("<BDS:RP>"))continue;const r=s.match(/Character Name:\s*(.*?)\n/);if(r&&r[1])return r[1].trim()}return null}function Ie(e,t=null){if(!Array.isArray(e))return null;for(let n=e.length-1;n>=0;n--){const o=e[n];if(o===t)continue;const r=A(o).match(/<BDS:SKILLS fingerprint="(.*?)">/);if(r&&r[1])return r[1]}return null}function Oe(e,t=null){if(!Array.isArray(e))return null;for(let n=e.length-1;n>=0;n--){const o=e[n];if(o===t)continue;const r=A(o).match(/<BDS:MCP fingerprint="(.*?)">/);if(r&&r[1])return r[1]}return null}function _e(e,t=null){if(!Array.isArray(e))return null;for(let n=e.length-1;n>=0;n--){const o=e[n];if(o===t)continue;const r=A(o).match(/<BDS:PROJECT name="(.*?)">/);if(r&&r[1])return r[1]}return null}function H(e){let t=String(e||"");return t=t.replace(/<BetterDeepSeek>([\s\S]*?)<\/BetterDeepSeek>/gi,(n,o)=>o.includes("[BDS:AUTO]")||o.includes("[BDS:DEEP_RESEARCH]")||/<BDS:memory_calls[\s>]/i.test(o)?n:""),t=t.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi,""),t=t.replace(/<BDS:memory_calls[^>]*>[\s\S]*?<\/BDS:memory_calls>/gi,""),t=t.replace(/<BDS:RP>[\s\S]*?<\/BDS:RP>/gi,""),t=t.replace(/<BDS:PROJECT[^>]*>[\s\S]*?<\/BDS:PROJECT>/gi,""),t=t.replace(/<BDS:PROJECT_CONTEXT>[\s\S]*?<\/BDS:PROJECT_CONTEXT>/gi,""),t.trim()}function Ce(){try{const e=document.querySelector("._46a12ab");if(!e)return null;const t=(e.textContent||"").toLowerCase().trim();return t.includes("vision")?"vision":t.includes("expert")||t.includes("reasoner")?"expert":t.includes("deepthink")||t.includes("deep think")||t.includes("r1")?"deepthink":t.includes("instant")||t.includes("chat")||t.includes("flash")?"instant":null}catch{return null}}function Be(e){const t=e&&e.config&&e.config.deepCode;if(!t||!t.enabled)return"";const n=t.manualPath||t.activeDirectory||"active directory",o=t.fileTree?`
${String(t.fileTree).trim()}

The tree above is an ORIENTATION MAP of the codebase (top few levels, indexed text files only). It is not a verified description of any file's contents \u2014 always confirm actual structure with FILE_READ, LIST_DIR, or SEARCH_IN_DIRECTORY before referencing details.
`:"";return`<BetterDeepSeek>
[DEEP_CODE_MODE_ACTIVE]
DeepCode mode is ENABLED for local codebase directory: "${n}".

${o}

You are a technical requirements agent. Your job is NOT to write code yourself.
Your job is to turn an unstructured conversation with the user into a single,
unambiguous, self-contained task specification that a separate coding agent
(DeepSeek Harness) can execute without asking follow-up questions.

You have four tools:

1. READ FILE
   <BDS:AUTO:FILE_READ path="relative/path/to/file"/>
   Returns full file content. Use before referencing any file's structure,
   exports, function signatures, or existing logic.

2. LIST DIRECTORY
   <BDS:AUTO:LIST_DIR path="relative/path/to/directory"/>
   Returns the immediate files and folders inside a directory (folders are
   suffixed with "/"). Use to discover where a file or feature lives when the
   file tree is too shallow, or to enumerate a directory without reading
   every file.

3. SEARCH CODEBASE
   <BDS:AUTO:SEARCH_IN_DIRECTORY queries="query terms"/>
   Returns matching snippets with file paths and line numbers. Use to locate
   where a feature lives, find call sites, or check whether something already
   exists before proposing it.

4. DISPATCH HARNESS TASK
   <BDS:HARNESS_TASK cwd="${n}">
   ...task spec...
   </BDS:HARNESS_TASK>
   Terminal action. Once emitted, the task is sent for execution. Never emit
   more than one BDS:HARNESS_TASK block per dispatch, and never emit it
   speculatively \u2014 see DISPATCH GATE below.

   NEVER use more than one TOOL in a single message.
   
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OPERATING PRINCIPLES
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. Conversation first, dispatch last.
   Your default mode is discussion. The user is describing a feature, bug, or
   change conversationally and may be vague, contradictory, or incomplete at
   first. Do not treat the first message as a dispatch trigger. Treat it as
   the opening of a requirements conversation.

2. Investigate before you ask, ask before you assume.
   Before asking the user a clarifying question, check whether the codebase
   already answers it. Use SEARCH_IN_DIRECTORY to locate relevant files, then
   FILE_READ or LIST_DIR to confirm actual structure, naming, and patterns. Only ask the
   user when the answer genuinely cannot be determined from the code (e.g.
   product intent, priority, desired UX behavior, scope boundaries).
   Never guess at a file path, function name, or existing behavior - verify
   it with a tool call or state explicitly that it's unverified.

3. Never fabricate codebase facts.
   If you have not read a file, you do not know what it contains. Do not
   describe existing implementation details, file structure, or behavior
   you have not confirmed via FILE_READ, LIST_DIR, or SEARCH_IN_DIRECTORY in this
   session. If asked something you can't verify, say so and investigate.

4. Match existing conventions.
   Before drafting the task spec, inspect enough of the surrounding code to
   identify: language/framework, naming conventions, error handling style,
   test framework (if any), module boundaries. The task spec you hand to
   Harness must instruct it to follow what you found, not generic best
   practice.
5. NEVER use more than one TOOL in a single message.
   If you need to use more than one tool, use multiple messages. Wait for the previous tool response before using the next tool.
   The harness task is also a tool. So never use more than one tool in a single message.
6. NEVER use more than one HARNESS_TASK in a single message.
   If you need to use more than one harness task, use multiple messages.
   Wait for the previous harness task response before using the next harness task.
   


\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CONVERSATION FLOW
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

PHASE 1 \u2014 Understand intent
Restate what you understand the user wants in one or two sentences and
confirm the type of work: new feature, bug fix, refactor, or other. If the
user reports a bug, ask (or investigate) for reproduction steps, expected
vs actual behavior, and whether it's isolated or systemic.

PHASE 2 \u2014 Investigate
Use SEARCH_IN_DIRECTORY, LIST_DIR, and FILE_READ to locate the relevant subsystem(s).
Do this silently as part of your reasoning, not as a narrated play-by-play \u2014
surface only what's relevant to the user (e.g. "this touches the auth
middleware in src/auth/session.ts"). Identify:
- Entry points and files that will need to change
- Existing patterns to follow (naming, error handling, tests)
- Adjacent code that could be affected (call sites, shared state, config)
- Whether the request conflicts with or duplicates existing functionality
- IMPORTANT: If you are unable to carry out the investigation using your existing resources and tools, you can assign the task to Harness. Your tools are insufficient for a comprehensive investigation. With your tools, you can only get a rough idea about the project.

PHASE 3 \u2014 Close ambiguity
Resolve anything that materially changes the implementation before drafting
the spec:
- Scope boundaries (what's explicitly NOT included)
- Edge cases and error states the user cares about
- Backward compatibility / migration concerns
- Non-functional constraints (performance, security, platform support)
- Acceptance criteria \u2014 how will the user know it's done correctly?
Ask only what you couldn't resolve via investigation. Batch clarifying
questions instead of drip-feeding them one at a time, unless the user's
answer to one materially changes what else you'd ask.

PHASE 4 \u2014 Draft and confirm
Before dispatching, present a compact summary of the task spec you intend
to send (objective, key files, acceptance criteria) and get explicit user
confirmation. Do not skip this for anything non-trivial. Skip confirmation
only for genuinely trivial, low-ambiguity asks the user has already fully
specified.

PHASE 5 \u2014 Dispatch
Once confirmed, emit exactly one BDS:HARNESS_TASK block built to the spec
below.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
DISPATCH GATE \u2014 do not emit BDS:HARNESS_TASK unless ALL of these hold
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- The objective is a single, coherent unit of work (split multi-part
  requests into sequential dispatches rather than one sprawling task)
- You have identified the specific file(s) or module(s) involved, verified
  via tool calls, not inferred from the file tree alone
- Acceptance criteria are concrete and checkable, not vague ("should work
  better")
- Scope boundaries are explicit \u2014 what Harness should NOT touch
- The user has confirmed the summary (or the task is trivial and fully
  specified)
If any of these is unmet, stay in conversation and resolve it first.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
TASK SPEC FORMAT (contents of BDS:HARNESS_TASK)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Write the task spec in this structure. Omit a section only if genuinely
empty (e.g. no out-of-scope items) \u2014 do not pad sections to look complete.

## Objective
One or two sentences. What outcome defines success, not how to get there.

## Context
Why this is needed, in the user's own framing. Include relevant background
uncovered during investigation (existing behavior, related bug reports,
prior implementation attempts) that Harness needs to avoid re-deriving.

## Affected files
Concrete paths, confirmed via FILE_READ/SEARCH_IN_DIRECTORY. For each: what
currently exists there and what needs to change. If new files are needed,
say so explicitly and where they should live, following the project's
existing module layout.

## Implementation notes
Conventions to follow (naming, error handling, existing patterns to mirror),
specific technical approach if the user specified one, and any constraints
discovered during investigation (e.g. "this function is called from three
other places, see src/x.ts:42, src/y.ts:88 \u2014 signature must stay compatible").

## Edge cases & constraints
Explicit list of edge cases, error states, and non-functional requirements
(performance, security, platform support, backward compatibility) that must
be handled.

## Acceptance criteria
Checkable, specific conditions. Prefer "X returns Y when Z" over "X works
correctly." Include how to verify (manual steps, existing test suite,
specific commands) if the project has a test/build setup \u2014 check for this
via investigation rather than assuming.

## Out of scope
What Harness should explicitly NOT do, especially anything adjacent that
might be tempting to "fix while you're in there." Keeps the diff reviewable.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
STYLE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- Be direct. No filler, no restating the obvious back to the user.
- When something in the codebase contradicts what the user described,
  say so plainly before proceeding \u2014 don't silently reconcile it.
- The task spec is written for an autonomous coding agent, not for the user:
  it should be dense, unambiguous, and self-contained. Assume Harness has no
  access to this conversation, only the spec and the codebase.
- Never emit BDS:HARNESS_TASK mid-explanation. It is always the final action
  of a turn.
</BetterDeepSeek>`}function Ne(e){const t=e&&e.config&&e.config.deepCode,n=t&&t.pendingReport;if(!n||!n.report||!n.report.trim())return"";const o=n.cwd?` cwd="${n.cwd}"`:"",s=n.sessionId?` sessionId="${n.sessionId}"`:"";return`<BetterDeepSeek>
[DEEPSEEK_HARNESS_EXECUTION_RESULT]
The local DeepSeek Harness agent has finished executing the task${n.cwd?` in "${n.cwd}"`:""}.
Here is the execution report and final output:

<BDS:HARNESS_RESULT${o}${s}>
${n.report.trim()}
</BDS:HARNESS_RESULT>
</BetterDeepSeek>`}const Pe=/^(message_id|msg_id|response_message_id)$/i,Le=5;function W(e){const t=String(e||"");return t.includes("/api/v0/chat/completion")||t.includes("/api/v0/chat/edit_message")}function R(e,t=0){if(!e||typeof e!="object"||t>Le)return null;if(Array.isArray(e)){for(const n of e){const o=R(n,t+1);if(o)return o}return null}for(const[n,o]of Object.entries(e))if(Pe.test(n)&&(typeof o=="string"||typeof o=="number")){const s=String(o).trim();if(s)return s}for(const n of Object.values(e)){const o=R(n,t+1);if(o)return o}return null}function Ue(){const e=String(location.href||"").match(/\/chat\/s\/([^/?#]+)/);return e?e[1]:null}function I(e){window.dispatchEvent(new CustomEvent("bds:assistant-message-id",{detail:JSON.stringify({messageId:e,sessionId:Ue(),timestamp:Date.now()})}))}function _(e){let t=null;for(const n of String(e||"").split(`
`)){const o=n.trim();if(!o.startsWith("data: "))continue;const s=o.slice(6).trim();if(s!=="[DONE]")try{const r=R(JSON.parse(s));r&&(t=r)}catch{}}return t}function Me(e,t,n,o){const s=window.fetch;window.fetch=async function(u,i){try{const f=je(u);if(!t(f))return s.apply(this,arguments);if(Ge(u,i,e),f.includes("/api/v0/chat_session/fetch_page")){const c=await s.apply(this,arguments);return c.clone().json().then(w=>{window.dispatchEvent(new CustomEvent("bds:session-data",{detail:JSON.stringify(w)}))}).catch(()=>{}),c}if(f.includes("/api/v0/chat/history_messages")){const c=await s.apply(this,arguments);return c.clone().json().then(w=>{window.dispatchEvent(new CustomEvent("bds:history-msgs",{detail:JSON.stringify(w)}))}).catch(()=>{}),c}n(f);try{const c=await Fe(u,i,e);if(!c){const w=await s.apply(this,arguments);return q(w,f,c==null?void 0:c.modelName),w}const p=await s.call(this,c.input,c.init);return p&&p.status>=500&&window.dispatchEvent(new CustomEvent("bds:network-error",{detail:JSON.stringify({url:f,status:p.status,type:"fetch"})})),q(p,f,c.modelName),p}catch(c){throw window.dispatchEvent(new CustomEvent("bds:network-error",{detail:JSON.stringify({url:f,status:0,type:"fetch",error:String(c)})})),c}finally{o(f)}}catch(f){return console.warn("[BetterDeepSeek] Request patch failed:",f),s.apply(this,arguments)}}}function q(e,t,n){if(!(!e||!e.clone))try{const o=e.clone();He(o,n,W(t)).catch(()=>{})}catch{}}function je(e){return typeof e=="string"?e:e instanceof URL?e.toString():e instanceof Request?e.url:""}async function Fe(e,t,n){const o=await qe(e,t);if(!o)return null;let s;try{s=JSON.parse(o)}catch{return null}const r=s.model||null,u=L(s,n);if(!u.changed)return null;const i=JSON.stringify(u.payload),f=t&&t.headers?t.headers:e instanceof Request?e.headers:void 0,c=new Headers(f||{});c.set("content-type","application/json");const p={method:t&&t.method||(e instanceof Request?e.method:"POST"),headers:c,body:i,credentials:t&&t.credentials||(e instanceof Request?e.credentials:void 0),cache:t&&t.cache||(e instanceof Request?e.cache:void 0),mode:t&&t.mode||(e instanceof Request?e.mode:void 0),redirect:t&&t.redirect||(e instanceof Request?e.redirect:void 0),referrer:t&&t.referrer||(e instanceof Request?e.referrer:void 0),referrerPolicy:t&&t.referrerPolicy||(e instanceof Request?e.referrerPolicy:void 0),keepalive:t&&t.keepalive||(e instanceof Request?e.keepalive:void 0),integrity:t&&t.integrity||(e instanceof Request?e.integrity:void 0),signal:t&&t.signal||(e instanceof Request?e.signal:void 0)};return{input:typeof e=="string"||e instanceof URL?e:e.url,init:p,modelName:r}}async function He(e,t,n){try{const o=e.headers.get("content-type")||"";if(o.includes("text/event-stream")||o.includes("stream"))await We(e,t,n);else{const s=await e.text();let r=null;try{r=JSON.parse(s)}catch{}if(r){const u=(r==null?void 0:r.usage)||(r==null?void 0:r.token_usage);if(u&&G(u.prompt_tokens||u.input_tokens||0,u.completion_tokens||u.output_tokens||0,t),n){const i=R(r);i&&I(i)}}else if(n){const u=_(s);u&&I(u)}}}catch{}}async function We(e,t,n){var f;const o=(f=e.body)==null?void 0:f.getReader();if(!o)return;const s=new TextDecoder;let r="";try{for(;;){const{done:c,value:p}=await o.read();if(p&&(r+=s.decode(p,{stream:!c})),c)break}}catch{return}const u=r.split(`
`);for(let c=u.length-1;c>=0;c--){const p=u[c].trim();if(!p.startsWith("data: "))continue;const w=p.slice(6).trim();if(w!=="[DONE]")try{const m=JSON.parse(w),E=(m==null?void 0:m.usage)||(m==null?void 0:m.token_usage);if(E){G(E.prompt_tokens||E.input_tokens||0,E.completion_tokens||E.output_tokens||0,t||(m==null?void 0:m.model));break}}catch{}}if(!n)return;const i=_(r);i&&I(i)}function G(e,t,n){typeof e!="number"&&typeof t!="number"||window.dispatchEvent(new CustomEvent("bds:token-usage",{detail:JSON.stringify({inputTokens:Number(e)||0,outputTokens:Number(t)||0,modelName:n||null,timestamp:Date.now()})}))}async function qe(e,t){return t&&typeof t.body=="string"?t.body:t&&t.body instanceof URLSearchParams?t.body.toString():e instanceof Request?e.clone().text():""}function Ge(e,t,n){try{let o;if(t&&t.headers){const s=t.headers;if(s instanceof Headers)o=s.get("authorization");else if(Array.isArray(s)){for(const[r,u]of s)if(r.toLowerCase()==="authorization"){o=u;break}}else typeof s=="object"&&(o=s.Authorization||s.authorization)}!o&&e instanceof Request&&(o=e.headers.get("authorization")),o&&typeof(n==null?void 0:n.setAuthToken)=="function"&&n.setAuthToken(o)}catch{}}function Xe(e,t,n,o){const s=XMLHttpRequest.prototype.open,r=XMLHttpRequest.prototype.send,u=XMLHttpRequest.prototype.setRequestHeader;XMLHttpRequest.prototype.open=function(f,c){return this.__bdsRequestMeta={method:String(f||"GET").toUpperCase(),url:String(c||"")},s.apply(this,arguments)},XMLHttpRequest.prototype.setRequestHeader=function(f,c){return f&&String(f).toLowerCase()==="authorization"&&typeof(e==null?void 0:e.setAuthToken)=="function"&&e.setAuthToken(String(c||"")),u.apply(this,arguments)},XMLHttpRequest.prototype.send=function(f){try{const c=this.__bdsRequestMeta||{};if(!t(c.url))return r.call(this,f);if(c.url.includes("/api/v0/chat_session/fetch_page"))return this.addEventListener("load",()=>{try{const S=JSON.parse(this.responseText);window.dispatchEvent(new CustomEvent("bds:session-data",{detail:JSON.stringify(S)}))}catch{}}),r.call(this,f);if(c.url.includes("/api/v0/chat/history_messages"))return this.addEventListener("load",()=>{try{const S=JSON.parse(this.responseText);window.dispatchEvent(new CustomEvent("bds:history-msgs",{detail:JSON.stringify(S)}))}catch{}}),r.call(this,f);n(c.url);let p=!1;const w=()=>{p||(p=!0,(this.status>=500||this.status===0)&&window.dispatchEvent(new CustomEvent("bds:network-error",{detail:JSON.stringify({url:c.url,status:this.status,type:"xhr"})})),o(c.url))};this.addEventListener("loadend",w,{once:!0});const m=Je(f);if(!m)return r.call(this,f);const E=JSON.parse(m),T=E.model||null,k=L(E,e);if(!k.changed)return r.call(this,f);const D=JSON.stringify(k.payload),b=this;return this.addEventListener("load",()=>{try{const S=b.responseText;S&&Ye(S,b,T,c.url)}catch{}},{once:!0}),r.call(this,D)}catch(c){const p=this.__bdsRequestMeta||{};console.warn("[BetterDeepSeek] XHR patch failed:",c);try{return r.call(this,f)}catch(w){throw t(p.url)&&o(p.url),w}}}}function Je(e){return typeof e=="string"?e:e instanceof URLSearchParams?e.toString():""}function Ye(e,t,n,o){var s;try{if((((s=t.getResponseHeader)==null?void 0:s.call(t,"content-type"))||"").includes("text/event-stream")||e.startsWith("data: ")){const u=e.split(`
`);for(let i=u.length-1;i>=0;i--){const f=u[i].trim();if(!f.startsWith("data: "))continue;const c=f.slice(6).trim();if(c!=="[DONE]")try{const p=JSON.parse(c),w=p==null?void 0:p.usage;if(w){window.dispatchEvent(new CustomEvent("bds:token-usage",{detail:JSON.stringify({inputTokens:w.prompt_tokens||w.input_tokens||0,outputTokens:w.completion_tokens||w.output_tokens||0,modelName:n||(p==null?void 0:p.model)||null,timestamp:Date.now()})}));break}}catch{}}if(W(o)){const i=_(e);i&&I(i)}}}catch{}}(function(){"use strict";const e={configUpdate:"bds:config-update",deepResearchConfigUpdate:"bds:deep-research-config-update",requestConfig:"bds:request-config",markVoiceMessage:"bds:mark-voice-message",sessionData:"bds:session-data"},t="/api/v0/chat_session/fetch_page",n="/api/v0/chat/history_messages",o="/api/v0/auth/ticket",s="/api/v0/chat/completion";function r(){try{return JSON.parse(localStorage.getItem("bds_injected_chats")||"[]")}catch{return[]}}function u(a){const l=r();l.includes(a)||(l.push(a),l.length>50&&l.shift(),localStorage.setItem("bds_injected_chats",JSON.stringify(l)))}function i(){try{return JSON.parse(localStorage.getItem("bds_injected_chars")||"{}")}catch{return{}}}function f(a,l){const d=i();d[a]=l;const h=Object.keys(d);h.length>50&&delete d[h[0]],localStorage.setItem("bds_injected_chars",JSON.stringify(d))}function c(a){try{return JSON.parse(localStorage.getItem("bds_injected_entries")||"{}")[a]||[]}catch{return[]}}function p(a,l){try{const d=JSON.parse(localStorage.getItem("bds_injected_entries")||"{}");d[a]||(d[a]=[]),d[a].includes(l)||d[a].push(l);const h=Object.keys(d);h.length>50&&delete d[h[0]],localStorage.setItem("bds_injected_entries",JSON.stringify(d))}catch{}}function w(){var a,l;try{for(let h=0;h<localStorage.length;h++){const g=localStorage.key(h);if(g&&/token|auth|session/i.test(g)){const y=localStorage.getItem(g);if(!y)continue;if(y.trim().startsWith("{"))try{const v=JSON.parse(y),x=v.token||v.accessToken||v.access_token||v.user_token||((a=v.user)==null?void 0:a.token);if(x&&typeof x=="string")return x}catch{}else if(typeof y=="string"&&y.length>20){let v=y;return v.startsWith("Bearer ")&&(v=v.substring(7)),v.startsWith('"')&&v.endsWith('"')&&(v=v.slice(1,-1)),v}}}const d=(l=document.cookie.split("; ").find(h=>h.startsWith("user_token=")||h.startsWith("token=")))==null?void 0:l.split("=")[1];if(d)return decodeURIComponent(d)}catch(d){console.warn("[BDS] Failed to search auth token in storage:",d)}return null}const m={config:{systemPrompt:"",systemPromptEntries:[],skills:[],memories:[],activeCharacter:null,mcpToolSchemas:[]},hasInjected:a=>r().includes(a),markInjected:a=>u(a),getInjectedEntries:a=>c(a),markEntryInjected:(a,l)=>p(a,l),getLastChar:a=>i()[a]||null,setLastChar:(a,l)=>f(a,l),currentSessionChar:null,activeCompletionRequests:0,isNextVoiceMessage:!1,authToken:w(),setAuthToken:function(a){a&&a!==this.authToken&&(this.authToken=a)}};if(window.__bdsNetworkPatched)return;window.__bdsNetworkPatched=!0,(function(){if(window.__BDS_CONFIG__)return;let a=0;const l=new Map;window.addEventListener("bds:debug-api-response",h=>{let g=h.detail;if(typeof g=="string")try{g=JSON.parse(g)}catch{return}const y=l.get(g.id);y&&(y(g.result),l.delete(g.id))});function d(h){return function(){const g=Array.from(arguments);return new Promise(y=>{const v=++a;l.set(v,y),window.dispatchEvent(new CustomEvent("bds:debug-api-request",{detail:JSON.stringify({id:v,method:h,args:g})}))})}}window.__BDS_CONFIG__={raw:d("getRaw"),getFlag:d("getFlag"),getConfig:d("getConfig"),applyRemote:d("applyRemote"),replaceRemote:d("replaceRemote"),resetToBuiltin:d("resetToBuiltin"),detectModel:d("detectModel"),toggleDebugPanel:d("toggleDebugPanel")}})(),window.addEventListener(e.configUpdate,a=>{let l=a&&a.detail?a.detail:{};if(typeof l=="string")try{l=JSON.parse(l)}catch(d){console.error("[BDS] Failed to parse configUpdate detail:",d)}m.config=J(l||{})}),window.addEventListener(e.deepResearchConfigUpdate,a=>{let l=a&&a.detail?a.detail:{};if(typeof l=="string")try{l=JSON.parse(l)}catch(d){console.error("[BDS] Failed to parse deepResearchConfigUpdate detail:",d)}m.config.deepResearch=B(l||{})}),window.addEventListener(e.markVoiceMessage,()=>{m.isNextVoiceMessage=!0}),window.addEventListener("bds:request-history-msgs",async a=>{let l=a&&a.detail?a.detail:{};if(typeof l=="string")try{l=JSON.parse(l)}catch{return}const d=l==null?void 0:l.sessionId;if(!d)return;const h=`${n}?chat_session_id=${encodeURIComponent(d)}`,g={"Content-Type":"application/json"};m.authToken&&(g.Authorization=`Bearer ${m.authToken}`);try{const y=await E(h,{method:"GET",headers:g,credentials:"include"});if(!y.ok){console.warn("[BDS] history_mgs fetch failed:",y.status),window.dispatchEvent(new CustomEvent("bds:history-msgs-error",{detail:JSON.stringify({sessionId:d,error:`http ${y.status}`})}));return}const v=await y.json();v.__bdsExplicit=!0,window.dispatchEvent(new CustomEvent("bds:history-msgs",{detail:JSON.stringify(v)}))}catch(y){console.warn("[BDS] history_msgs fetch error:",y),window.dispatchEvent(new CustomEvent("bds:history-msgs-error",{detail:JSON.stringify({sessionId:d,error:String(y&&y.message||y)})}))}}),window.addEventListener("bds:request-tts-ticket",async a=>{var y,v;let l=a&&a.detail?a.detail:{};if(typeof l=="string")try{l=JSON.parse(l)}catch{return}const d=l==null?void 0:l.id;if(!d)return;const h={"Content-Type":"application/json"};m.authToken&&(h.Authorization=`Bearer ${m.authToken}`);let g={ok:!1,error:"request failed"};try{const x=await E(o,{method:"POST",headers:h,credentials:"include",body:JSON.stringify({scope:"tts"})});if(!x.ok)g={ok:!1,error:`http ${x.status}`};else{const C=await x.json(),X=(v=(y=C==null?void 0:C.data)==null?void 0:y.biz_data)==null?void 0:v.ticket;g=X?{ok:!0,ticket:X}:{ok:!1,error:"no ticket in response"}}}catch(x){g={ok:!1,error:String(x&&x.message||x)}}window.dispatchEvent(new CustomEvent("bds:tts-ticket",{detail:JSON.stringify({id:d,...g})}))}),T();const E=window.fetch.bind(window);Me(m,k,b,S),Xe(m,k,b,S);function T(){window.dispatchEvent(new CustomEvent(e.requestConfig))}function k(a){const l=String(a||"");return l.includes("/api/v0/chat/completion")||l.includes("/api/v0/chat/edit_message")||l.includes(t)||l.includes(n)}function D(a,l){const d={status:a,url:String(l||""),activeCompletionRequests:m.activeCompletionRequests,timestamp:Date.now()};window.dispatchEvent(new CustomEvent(e.networkState,{detail:JSON.stringify(d)}))}function b(a){m.activeCompletionRequests+=1,D("start",a)}function S(a){m.activeCompletionRequests=Math.max(0,m.activeCompletionRequests-1),D("end",a)}})()})();
