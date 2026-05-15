const fs = require('fs');
const path = require('path');
const https = require('https');

const FONT_DIR = path.join(__dirname, 'assets', 'fonts', 'inter');
fs.mkdirSync(FONT_DIR, { recursive: true });

const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

https.get(cssUrl, { headers: { 'User-Agent': UA } }, (res) => {
  let css = '';
  res.on('data', (d) => css += d);
  res.on('end', () => {
    let localCss = css;
    const matches = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)];
    
    let downloads = matches.map((match, i) => {
      const url = match[1];
      const fontFaceBlock = css.substring(css.lastIndexOf('@font-face', match.index), match.index);
      const weightMatch = fontFaceBlock.match(/font-weight:\s*(\d+)/);
      const weight = weightMatch ? weightMatch[1] : `font-${i}`;
      
      const filename = `inter-${weight}.woff2`;
      localCss = localCss.replace(url, `./inter/${filename}`);
      
      return new Promise((resolve) => {
        const file = fs.createWriteStream(path.join(FONT_DIR, filename));
        https.get(url, (fontRes) => {
          fontRes.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        });
      });
    });

    Promise.all(downloads).then(() => {
      fs.writeFileSync(path.join(__dirname, 'assets', 'fonts', 'inter.css'), localCss);
      console.log('Fonts downloaded and CSS generated!');
    });
  });
});
