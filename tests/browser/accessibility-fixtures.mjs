// Synthetic PDF: selectable text, external/internal/unsafe links, landscape and empty pages.
export function accessibilityPdf() {
  const stream=text=>`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /Annots [10 0 R 11 0 R 12 0 R] >>',
    stream('BT /F1 22 Tf 60 700 Td (Accessible PDF text) Tj 0 -60 Td (External link) Tj 0 -60 Td (Next chapter) Tj ET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    stream('BT /F1 22 Tf 60 500 Td (Landscape second page) Tj ET'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 8 0 R >>',stream(''),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 630 250 660] /Border [0 0 0] /A << /S /URI /URI (https://example.test/reading) >> >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 570 250 600] /Border [0 0 0] /Dest [5 0 R /Fit] >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 510 250 540] /Border [0 0 0] /A << /S /URI /URI (javascript:alert\(1\)) >> >>',
  ];
  let text='%PDF-1.7\n';const offsets=[0];
  for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))text+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  return Buffer.from(text+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
