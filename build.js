const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const DIST_JS = path.join(__dirname, 'frontend/dist/js');
const DIST_CSS = path.join(__dirname, 'frontend/dist/css');

fs.mkdirSync(DIST_JS, { recursive: true });
fs.mkdirSync(DIST_CSS, { recursive: true });

async function build() {
    const start = Date.now();

    // Minify JS files
    const jsFiles = ['main.js', 'admin.js', 'tracker.js'];
    for (const file of jsFiles) {
        const src = path.join(__dirname, 'frontend/js', file);
        const out = path.join(DIST_JS, file);
        await esbuild.build({
            entryPoints: [src],
            outfile: out,
            minify: true,
            sourcemap: true,
            target: ['es2020'],
            charset: 'utf8'
        });
        const srcSize = fs.statSync(src).size;
        const outSize = fs.statSync(out).size;
        const pct = ((1 - outSize / srcSize) * 100).toFixed(1);
        console.log(`  JS  ${file}: ${(srcSize / 1024).toFixed(1)}KB → ${(outSize / 1024).toFixed(1)}KB (-${pct}%)`);
    }

    // Minify CSS
    const cssSrc = path.join(__dirname, 'frontend/css/style.css');
    const cssOut = path.join(DIST_CSS, 'style.css');
    await esbuild.build({
        entryPoints: [cssSrc],
        outfile: cssOut,
        minify: true,
        sourcemap: true,
        charset: 'utf8',
        loader: { '.css': 'css' }
    });
    const cssSrcSize = fs.statSync(cssSrc).size;
    const cssOutSize = fs.statSync(cssOut).size;
    const cssPct = ((1 - cssOutSize / cssSrcSize) * 100).toFixed(1);
    console.log(`  CSS style.css: ${(cssSrcSize / 1024).toFixed(1)}KB → ${(cssOutSize / 1024).toFixed(1)}KB (-${cssPct}%)`);

    console.log(`\n  Build completed in ${Date.now() - start}ms`);
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
