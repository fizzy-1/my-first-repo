/**
 * Generates a small, valid single-page PDF so demo documents can be previewed
 * and downloaded. Text is restricted to Latin-1 for the standard Helvetica font.
 */
function escape(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, width = 88): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += ` ${w}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function makePdf(title: string, subtitle: string, paragraphs: string[]): Buffer {
  const body = paragraphs.flatMap((p) => [...wrap(p), ""]);
  const content = [
    "0.30 0.32 0.75 rg 0 812 595 30 re f",
    "BT /F2 9 Tf 1 1 1 rg 50 822 Td (INTEGRAL ACADEMY - DEMO DOCUMENT) Tj ET",
    `BT /F2 18 Tf 0.1 0.1 0.15 rg 50 770 Td (${escape(title)}) Tj ET`,
    `BT /F1 10 Tf 0.4 0.4 0.45 rg 50 752 Td (${escape(subtitle)}) Tj ET`,
    "BT /F1 11 Tf 0.15 0.15 0.2 rg 50 720 Td 15 TL",
    ...body.slice(0, 40).map((l) => `(${escape(l)}) Tj T*`),
    "ET",
    "BT /F1 8 Tf 0.5 0.5 0.55 rg 50 40 Td (Seeded demo data for the Executive Workspace. Not a real document.) Tj ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
