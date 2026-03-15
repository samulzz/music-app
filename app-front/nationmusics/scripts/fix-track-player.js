const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const moduleFile = path.join(
  root,
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'module',
  'MusicModule.kt'
);

const serviceFile = path.join(
  root,
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'service',
  'MusicService.kt'
);

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) {
    console.log(`[fix-track-player] Skipped (not found): ${filePath}`);
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = transform(original);

  if (updated === original) {
    console.log(`[fix-track-player] No changes needed: ${path.basename(filePath)}`);
    return false;
  }

  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`[fix-track-player] Patched: ${path.basename(filePath)}`);
  return true;
}

function patchMusicModule(content) {
  let next = content;

  next = next.replace(
    'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
    'val originalItem: Bundle = musicService.tracks[index].originalItem ?: Bundle()\n            callback.resolve(Arguments.fromBundle(originalItem))'
  );

  next = next.replace(
    'Arguments.fromBundle(musicService.tracks[musicService.getCurrentTrackIndex()].originalItem)',
    'val originalItem: Bundle = musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle()\n                Arguments.fromBundle(originalItem)'
  );

  return next;
}

function patchMusicService(content) {
  let next = content;

  next = next.replace(
    'override fun onBind(intent: Intent?): IBinder',
    'override fun onBind(intent: Intent): IBinder?'
  );

  next = next.replace(
    'MediaSessionCallback.PLAY -> emit(MusicEvents.BUTTON_PLAY)\n                    MediaSessionCallback.PAUSE -> emit(MusicEvents.BUTTON_PAUSE)\n                    MediaSessionCallback.NEXT -> emit(MusicEvents.BUTTON_SKIP_NEXT)\n                    MediaSessionCallback.PREVIOUS -> emit(MusicEvents.BUTTON_SKIP_PREVIOUS)\n                    MediaSessionCallback.STOP -> emit(MusicEvents.BUTTON_STOP)',
    'MediaSessionCallback.PLAY -> {\n                        play()\n                        emit(MusicEvents.BUTTON_PLAY)\n                    }\n                    MediaSessionCallback.PAUSE -> {\n                        pause()\n                        emit(MusicEvents.BUTTON_PAUSE)\n                    }\n                    MediaSessionCallback.NEXT -> {\n                        skipToNext()\n                        emit(MusicEvents.BUTTON_SKIP_NEXT)\n                    }\n                    MediaSessionCallback.PREVIOUS -> {\n                        skipToPrevious()\n                        emit(MusicEvents.BUTTON_SKIP_PREVIOUS)\n                    }\n                    MediaSessionCallback.STOP -> {\n                        stop()\n                        emit(MusicEvents.BUTTON_STOP)\n                    }'
  );

  return next;
}

const patchedModule = patchFile(moduleFile, patchMusicModule);
const patchedService = patchFile(serviceFile, patchMusicService);

if (!patchedModule && !patchedService) {
  console.log('[fix-track-player] Done (already patched).');
} else {
  console.log('[fix-track-player] Done.');
}
