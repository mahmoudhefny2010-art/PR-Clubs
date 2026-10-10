const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
const pptxPath = path.join(out, 'MIU_Student_Clubs_Portal.pptx');
const logoPath = path.join(root, 'public/assets/img/pics/logo.svg.png');
const W = 960, H = 540, EMU = 12700;
const C = { red: 'C9222A', ink: '101A2A', text: '142033', muted: '536176', soft: 'F5F7FA', line: 'E0E6EE', blue: '2872D6', green: '18956D', gold: 'C58B17', purple: '7255B8', white: 'FFFFFF', paleRed: 'FFF1F1', pale: 'EAF0F7' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const emu = (n) => Math.round(n * EMU);

function text(slide, value, x, y, w, h, size = 18, color = C.text, bold = false, align = 'l') {
  slide.items.push({ type: 'text', value, x, y, w, h, size, color, bold, align });
}
function box(slide, x, y, w, h, fill, line = '', radius = true) {
  slide.items.push({ type: 'box', x, y, w, h, fill, line, radius });
}
function pic(slide, x, y, w, h) { slide.items.push({ type: 'pic', x, y, w, h }); }
function rule(slide, x1, y1, x2, y2, color = 'C4CFDC', width = 1.5) { slide.items.push({ type: 'line', x1, y1, x2, y2, color, width }); }
function card(slide, title, body, x, y, w, h, accent = C.red, bodySize = 14) {
  box(slide, x, y, w, h, C.white, C.line, true);
  box(slide, x + 2, y + 10, 3, h - 20, accent, '', false);
  text(slide, title, x + 14, y + 12, w - 32, 30, 17, C.text, true);
  text(slide, body, x + 14, y + 46, w - 32, h - 54, bodySize, C.muted);
}
function flow(slide, label, x, y, w, h, accent) {
  box(slide, x, y, w, h, C.white, C.line, true);
  box(slide, x, y + h - 5, w, 5, accent, '', false);
  text(slide, label, x + 7, y + 7, w - 14, h - 13, 14, C.text, true, 'ctr');
}
function base(title, subtitle = '') {
  const s = { bg: C.soft, items: [] };
  box(s, 0, 0, W, 7, C.red, '', false);
  text(s, 'Ø¨ÙˆØ§Ø¨Ø© Ø£Ù†Ø¯ÙŠØ© Ø¬Ø§Ù…Ø¹Ø© Ù…ØµØ± Ø§Ù„Ø¯ÙˆÙ„ÙŠØ©  Â·  Ø¹Ø±Ø¶ ØªØ¹Ø±ÙŠÙÙŠ', 44, 17, 872, 20, 10, C.red, true);
  text(s, title, 44, 43, 872, 42, 27, C.ink, true);
  if (subtitle) text(s, subtitle, 44, 87, 872, 27, 13, '65738A');
  rule(s, 44, 505, 916, 505, 'DEE4EC', 1);
  return s;
}

const slides = require('./miuhub-slides-en.js');

function shapeXml(item, id, hasLogo = false) {
  const xfrm = `<a:xfrm><a:off x="${emu(item.x)}" y="${emu(item.y)}"/><a:ext cx="${emu(item.w)}" cy="${emu(item.h)}"/></a:xfrm>`;
  if (item.type === 'line') {
    const x = Math.min(item.x1, item.x2), y = Math.min(item.y1, item.y2);
    const w = Math.max(1, Math.abs(item.x2 - item.x1)), h = Math.max(1, Math.abs(item.y2 - item.y1));
    const flipV = (item.x2 - item.x1) * (item.y2 - item.y1) < 0 ? ' flipV="1"' : '';
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Connector ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${flipV}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${Math.round(item.width * 12700)}"><a:solidFill><a:srgbClr val="${item.color}"/></a:solidFill></a:ln></p:spPr></p:sp>`;
  }
  if (item.type === 'pic' && hasLogo) {
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="MIU logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  if (item.type === 'box') {
    const geometry = item.radius ? 'roundRect' : 'rect';
    const fill = item.fill ? `<a:solidFill><a:srgbClr val="${item.fill}"/></a:solidFill>` : '<a:noFill/>';
    const ln = item.line ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${item.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}${ln}</p:spPr></p:sp>`;
  }
  const paragraphs = item.value.split('\n').map((line) => {
    const align = item.align === 'ctr' ? 'ctr' : item.align === 'r' ? 'r' : 'l';
    return `<a:p><a:pPr algn="${align}"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round(item.size * 100)}" b="${item.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${item.color}"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t xml:space="preserve">${esc(line)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${Math.round(item.size * 100)}"/></a:p>`;
  }).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(slide) {
  let id = 2;
  const shapes = slide.items.map((item) => shapeXml(item, id++, fs.existsSync(logoPath))).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${slide.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8'), data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(compressed.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, compressed);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(compressed.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf); offset += lh.length + nameBuf.length + compressed.length;
  }
  const centralDir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralDir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralDir, end]);
}

const files = {};
const put = (name, content) => { files[name] = content; };
put('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
put('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
put('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>MIU Student Clubs Portal</dc:title><dc:subject>University presentation and platform mind map</dc:subject><dc:creator>MIU Student Clubs Portal</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-10T00:00:00Z</dcterms:created></cp:coreProperties>`);
put('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft PowerPoint</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slides.length}</Slides></Properties>`);
put('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
put('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
put('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
put('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
put('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
put('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MIU Club Portal"><a:themeElements><a:clrScheme name="MIU"><a:dk1><a:srgbClr val="101A2A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="142033"/></a:dk2><a:lt2><a:srgbClr val="F5F7FA"/></a:lt2><a:accent1><a:srgbClr val="C9222A"/></a:accent1><a:accent2><a:srgbClr val="2872D6"/></a:accent2><a:accent3><a:srgbClr val="18956D"/></a:accent3><a:accent4><a:srgbClr val="C58B17"/></a:accent4><a:accent5><a:srgbClr val="7255B8"/></a:accent5><a:accent6><a:srgbClr val="536176"/></a:accent6><a:hlink><a:srgbClr val="C9222A"/></a:hlink><a:folHlink><a:srgbClr val="7255B8"/></a:folHlink></a:clrScheme><a:fontScheme name="MIU"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="MIU"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="90000"/><a:satMod val="150000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

for (let i = 0; i < slides.length; i++) {
  put(`ppt/slides/slide${i + 1}.xml`, slideXml(slides[i]));
  const hasLogo = slides[i].items.some((item) => item.type === 'pic');
  put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${hasLogo ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/miu-logo.png"/>' : ''}</Relationships>`);
}
if (fs.existsSync(logoPath)) put('ppt/media/miu-logo.png', fs.readFileSync(logoPath));
fs.writeFileSync(pptxPath, zip(files));
console.log(`PowerPoint saved: ${pptxPath}`);
console.log(`Slides: ${slides.length}`);

