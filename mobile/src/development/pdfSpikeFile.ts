import BlobUtil from 'react-native-blob-util';

// ASCII-only, synthetic one-page PDF. No URLs, forms, JavaScript or personal data.
export function syntheticPdf(): string {
  const content = 'BT /F1 20 Tf 40 140 Td (CallADoc synthetic PDF test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return `${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

let sequence = 0;
export function createPdfSpikeFile() {
  if (!__DEV__) throw new Error('PDF spike is development-only.');
  const path = `${BlobUtil.fs.dirs.CacheDir}/calladoc-pdf-spike-${Date.now()}-${++sequence}.pdf`;
  let disposed = false;
  let write: Promise<string | null> | undefined;
  const remove = async () => {
    try {
      if (await BlobUtil.fs.exists(path)) await BlobUtil.fs.unlink(path);
    } catch {
      // Best effort: cache may already have been removed by Android/the renderer.
      // Do not log file contents or paths.
    }
  };
  return {
    prepare(): Promise<string | null> {
      if (disposed) return Promise.resolve(null);
      if (!write) write = (async () => {
        try {
          await BlobUtil.fs.writeFile(path, syntheticPdf(), 'utf8');
          if (disposed) { await remove(); return null; }
          return `file://${path}`;
        } catch {
          await remove();
          throw new Error('Unable to prepare the private synthetic PDF.');
        }
      })();
      return write;
    },
    async dispose() {
      disposed = true;
      // Wait for an in-flight write before deleting; late completion cannot leak it.
      if (write) await write.catch(() => undefined);
      await remove();
    },
  };
}
