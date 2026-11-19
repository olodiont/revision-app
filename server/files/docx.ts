import mammoth from 'mammoth';

/** Extracts the raw text of a .docx, or null if the file cannot be read. */
export async function docxToText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = value.trim();
    return text === '' ? null : text;
  } catch {
    return null;
  }
}
