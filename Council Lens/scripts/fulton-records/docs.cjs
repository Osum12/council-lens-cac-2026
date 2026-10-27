// Downloads the attachments of the notable items and extracts their text (pdftotext / docx XML).
// Files land in docs/<file>/<attachmentId>.<ext> with a .txt beside each. Cached; rerun-safe.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAW = path.join(__dirname, 'raw');
const DOCS = path.join(__dirname, 'docs');
const notable = new Set(require('./notable.json'));

const atts = new Map();
for (const f of fs.readdirSync(path.join(RAW, 'items')))
  for (const it of JSON.parse(fs.readFileSync(path.join(RAW, 'items', f), 'utf8')))
    if (it.EventItemMatterFile && notable.has(it.EventItemMatterFile) && it.EventItemMatterAttachments?.length)
      atts.set(it.EventItemMatterFile, it.EventItemMatterAttachments.filter((a) => a.MatterAttachmentShowOnInternetPage));

function docxText(file) {
  // A .docx is a zip; word/document.xml holds the text. Use PowerShell's zip support via python if present.
  const py = `import zipfile,re,sys\nz=zipfile.ZipFile(sys.argv[1])\nx=z.read('word/document.xml').decode('utf8','ignore')\nx=re.sub(r'</w:p>','\\n',x)\nprint(re.sub(r'<[^>]+>','',x))`;
  return execFileSync('python', ['-I', '-c', py, file], { encoding: 'utf8', maxBuffer: 1 << 26 });
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) await fn(list[i++]); }));
}
(async () => {
  const jobs = [];
  for (const [file, list] of atts) for (const a of list.slice(0, 8)) jobs.push({ file, a });
  console.log('items', atts.size, 'attachments', jobs.length);
  let ok = 0, failed = 0;
  await pool(jobs, 6, async ({ file, a }) => {
    const ext = (a.MatterAttachmentFileName.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) return;
    const dir = path.join(DOCS, file);
    fs.mkdirSync(dir, { recursive: true });
    const bin = path.join(dir, `${a.MatterAttachmentId}.${ext}`);
    const txt = path.join(dir, `${a.MatterAttachmentId}.txt`);
    try {
      if (!fs.existsSync(bin)) {
        const r = await fetch(a.MatterAttachmentHyperlink);
        if (!r.ok) throw new Error(r.status);
        fs.writeFileSync(bin, Buffer.from(await r.arrayBuffer()));
      }
      if (!fs.existsSync(txt)) {
        const text = ext === 'pdf' ? execFileSync('pdftotext', ['-layout', '-l', '40', bin, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }) : docxText(bin);
        fs.writeFileSync(txt, `NAME: ${a.MatterAttachmentName}\nURL: ${a.MatterAttachmentHyperlink}\n\n${text}`);
      }
      ok++;
    } catch (e) {
      failed++;
      console.log('fail', file, a.MatterAttachmentName, e.message.slice(0, 80));
    }
  });
  console.log('ok', ok, 'failed', failed);
})();
