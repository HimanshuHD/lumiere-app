import { Buffer } from 'node:buffer';
function zip(files) {
  const chunks=[], central=[]; let offset=0;
  for (const [name, content] of Object.entries(files)) {
    const filename=Buffer.from(name),data=Buffer.from(content);
    let crc=0xffffffff;
    for(const byte of data) {crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    chunks.push(local,filename,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=local.length+filename.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
export const epub=zip({
  mimetype:'application/epub+zip',
  'META-INF/container.xml':'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'book.opf':'<?xml version="1.0"?><package version="2.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">architecture-qa</dc:identifier><dc:title>QA EPUB</dc:title><dc:language>en</dc:language></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc"><itemref idref="one"/><itemref idref="two"/></spine></package>',
  'toc.ncx':'<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>QA EPUB</text></docTitle><navMap><navPoint id="one" playOrder="1"><navLabel><text>One</text></navLabel><content src="one.xhtml"/></navPoint></navMap></ncx>',
  'one.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><h1>First chapter</h1><p>Architecture reader regression.</p></body></html>',
  'two.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Two</title></head><body><h1>Second chapter</h1><p>Next chapter regression.</p></body></html>',
});
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>'];
let source='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(source.length);source+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=source.length;source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
export const pdf=Buffer.from(source);
