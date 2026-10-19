import { genFont, setGeneratePaths } from '@lightningjs/msdf-generator';
import { adjustFont } from '@lightningjs/msdf-generator/adjustFont';
setGeneratePaths('font-src', 'font-dst2', 'font-src/charset.config.json');
for (const f of ['PlusJakartaSans-Regular.ttf','PlusJakartaSans-SemiBold.ttf','PlusJakartaSans-Bold.ttf','PlusJakartaSans-ExtraBold.ttf']) {
  const info = await genFont(f, 'msdf');
  if (info) await adjustFont(info);
}
