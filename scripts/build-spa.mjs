import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const sourceHtmlPath = path.join(distDir, 'index.html');
const outputHtmlPath = path.join(distDir, 'spa.html');
const docsDir = path.resolve(__dirname, '../docs');
const docsOutputPath = path.join(docsDir, 'index.html');
const publicDir = path.resolve(__dirname, '../public');

const stylesheetRegex =
  /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
const moduleScriptRegex =
  /<script\s+[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;

async function loadAssetContent(href) {
  const cleanedHref = href.replace(/^\//, '');
  const assetPath = path.resolve(distDir, cleanedHref);
  return readFile(assetPath, 'utf8');
}

async function replaceAsync(source, regex, replacer) {
  const pattern = new RegExp(regex.source, regex.flags);
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) return source;

  const replacements = await Promise.all(matches.map(replacer));
  let result = '';
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const start = match.index;
    const end = start + match[0].length;
    result += source.slice(lastIndex, start) + replacements[index];
    lastIndex = end;
  });

  result += source.slice(lastIndex);
  return result;
}

async function inlineAssets(html) {
  const inlinedCss = await replaceAsync(html, stylesheetRegex, async (match) => {
    const href = match[1];
    const cssContent = await loadAssetContent(href);
    return `<style>${cssContent}</style>`;
  });

  const inlinedJs = await replaceAsync(
    inlinedCss,
    moduleScriptRegex,
    async (match) => {
      const href = match[1];
      const jsContent = await loadAssetContent(href);
      return `<script type="module">${jsContent}</script>`;
    },
  );

  return inlinedJs;
}

async function inlineFavicon(html) {
  const faviconRegex =
    /<link\s+[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  const match = faviconRegex.exec(html);

  if (!match) {
    return html;
  }

  const [, href] = match;

  if (href.startsWith('data:')) {
    return html;
  }

  const cleanedHref = href.replace(/^\//, '');
  const candidatePaths = [
    path.resolve(distDir, cleanedHref),
    path.resolve(publicDir, cleanedHref),
  ];

  for (const candidate of candidatePaths) {
    try {
      const fileContent = await readFile(candidate);
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(
        fileContent,
      ).toString('base64')}`;
      const updatedTag = match[0].replace(href, dataUri);
      return html.replace(match[0], updatedTag);
    } catch {
      // continue trying other locations
    }
  }

  return html;
}

async function buildSpa() {
  const originalHtml = await readFile(sourceHtmlPath, 'utf8');
  const htmlWithInlinedAssets = await inlineAssets(originalHtml);
  const htmlWithFavicon = await inlineFavicon(htmlWithInlinedAssets);
  const minifiedHtml = await minify(htmlWithFavicon, {
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
  });

  await writeFile(outputHtmlPath, minifiedHtml, 'utf8');
  await mkdir(docsDir, { recursive: true });
  await writeFile(docsOutputPath, minifiedHtml, 'utf8');

  console.log(
    `SPA bundle written to ${path.relative(
      process.cwd(),
      outputHtmlPath,
    )} and ${path.relative(process.cwd(), docsOutputPath)}`,
  );
}

buildSpa().catch((error) => {
  console.error('Failed to build SPA bundle:', error);
  process.exitCode = 1;
});
