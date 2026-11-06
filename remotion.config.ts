// Studio / CLI defaults only. The programmatic render in src/render passes its own settings.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(6);
Config.setCrf(17);
Config.setPublicDir('./public');
// The headless shell hangs loading fonts on this macOS release; Studio renders use Chrome for Testing too.
Config.setChromeMode('chrome-for-testing');
