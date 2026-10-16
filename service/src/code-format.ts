import * as prettier from 'prettier/standalone';
import babelPlugin from 'prettier/plugins/babel';
import estreePlugin from 'prettier/plugins/estree';
import htmlPlugin from 'prettier/plugins/html';
import markdownPlugin from 'prettier/plugins/markdown';
import postcssPlugin from 'prettier/plugins/postcss';
import typescriptPlugin from 'prettier/plugins/typescript';
import yamlPlugin from 'prettier/plugins/yaml';

const plugins = [babelPlugin, estreePlugin, htmlPlugin, markdownPlugin, postcssPlugin, typescriptPlugin, yamlPlugin];
const byExtension: Record<string, string> = {
  '.cjs': 'babel', '.css': 'css', '.html': 'html', '.js': 'babel', '.jsx': 'babel',
  '.json': 'json', '.jsonc': 'jsonc', '.json5': 'json5', '.md': 'markdown', '.mdx': 'mdx',
  '.mjs': 'babel', '.scss': 'scss', '.ts': 'typescript', '.tsx': 'typescript',
  '.yaml': 'yaml', '.yml': 'yaml', '.vue': 'vue',
};
const byMediaType: Record<string, string> = {
  'application/json': 'json', 'application/ld+json': 'json',
  'application/javascript': 'babel', 'application/typescript': 'typescript',
  'text/css': 'css', 'text/html': 'html', 'text/javascript': 'babel',
  'text/markdown': 'markdown', 'text/typescript': 'typescript', 'text/x-yaml': 'yaml',
  'application/yaml': 'yaml', 'application/x-yaml': 'yaml',
};
const displayLimit = 100_000;

/** Format recognizable source for display only. The stored artifact remains the download source. */
export async function formatCodeForDisplay(title: string, mediaType: string, source: string): Promise<string> {
  if (source.length > displayLimit) return source;
  const extension = /\.[a-z0-9]+$/i.exec(title)?.[0]?.toLowerCase();
  const parser = (extension && byExtension[extension]) || byMediaType[mediaType.toLowerCase()];
  if (!parser) return source;
  // Text artifacts share a Markdown media type. Only run Markdown formatting when
  // there is embedded code to format; ordinary notes and prose stay byte-for-byte.
  if (parser === 'markdown' && !/```[^\n]*\n[\s\S]*?```/.test(source)) return source;
  try {
    return await prettier.format(source, {
      parser,
      plugins,
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      proseWrap: 'preserve',
    });
  } catch {
    // Invalid/incomplete snippets remain readable and are never blocked by display formatting.
    return source;
  }
}
