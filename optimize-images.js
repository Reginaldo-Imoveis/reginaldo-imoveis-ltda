const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const UPLOADS = path.join(__dirname, 'uploads');
const WIDTHS = [400, 800, 1200];

async function optimize() {
    if (!fs.existsSync(UPLOADS)) {
        console.log('Pasta uploads/ não encontrada.');
        return;
    }

    const files = fs.readdirSync(UPLOADS).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    console.log(`Encontrados ${files.length} arquivos para otimizar.\n`);

    let totalSaved = 0;

    for (const file of files) {
        const src = path.join(UPLOADS, file);
        const ext = path.extname(file);
        const name = path.basename(file, ext);

        // WebP versão original
        const webpPath = path.join(UPLOADS, `${name}.webp`);
        if (!fs.existsSync(webpPath)) {
            await sharp(src).webp({ quality: 80 }).toFile(webpPath);
            const origSize = fs.statSync(src).size;
            const webpSize = fs.statSync(webpPath).size;
            const saved = origSize - webpSize;
            totalSaved += saved;
            console.log(`  ${file} → ${name}.webp (${(origSize / 1024).toFixed(0)}KB → ${(webpSize / 1024).toFixed(0)}KB, -${((saved / origSize) * 100).toFixed(0)}%)`);
        }

        // Responsive sizes
        for (const w of WIDTHS) {
            const resizedPath = path.join(UPLOADS, `${name}-${w}w.webp`);
            if (!fs.existsSync(resizedPath)) {
                try {
                    const meta = await sharp(src).metadata();
                    if (meta.width > w) {
                        await sharp(src).resize(w).webp({ quality: 78 }).toFile(resizedPath);
                        console.log(`    → ${name}-${w}w.webp (${(fs.statSync(resizedPath).size / 1024).toFixed(0)}KB)`);
                    }
                } catch (e) {
                    console.log(`    ⚠ Erro ao redimensionar ${file} para ${w}px: ${e.message}`);
                }
            }
        }
    }

    console.log(`\nTotal economizado: ${(totalSaved / 1024).toFixed(0)}KB`);
}

optimize().catch(console.error);
