import { strToU8, zipSync } from 'fflate';

/** Builds a minimal valid .docx containing one paragraph per line of text. */
export function makeDocx(text: string): Uint8Array {
  const paras = text.split('\n').map((l) => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>'),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>'),
    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + `<w:body>${paras}</w:body></w:document>`),
  });
}

export function fileForm(fields: Record<string, string>, files: { name: string; type: string; bytes: Uint8Array }[]): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('files', new File([f.bytes as Uint8Array<ArrayBuffer>], f.name, { type: f.type }));
  return fd;
}
