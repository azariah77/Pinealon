const esbuild = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');

esbuild.build({
    entryPoints: ['node_modules/youtube-ext/dist/index.js'],
    bundle: true,
    outfile: 'public/youtube-ext-bundle.js',
    platform: 'browser',
    format: 'iife',
    globalName: 'YouTubeExt',
    plugins: [
        polyfillNode({
            polyfills: {
                crypto: true,
                buffer: true,
                stream: true,
                util: true,
                assert: true,
                url: true
            }
        })
    ]
}).then(() => console.log('Build complete'))
.catch((err) => {
    console.error(err);
    process.exit(1);
});
