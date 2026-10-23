// Android build fixes that `expo prebuild` would otherwise drop (android/ is
// generated and gitignored, so these live here instead).
//
// 1. CMake object paths (Windows dev builds). SDK 58's autolinking plugin
//    passes -DCMAKE_OBJECT_PATH_MAX=1024 to every native module, which stops
//    CMake from hashing long object paths. In this monorepo,
//    react-native-safe-area-context's generated codegen sources sit under
//    C:\GolfApp\node_modules\…, and their object path inside
//    android\app\.cxx comes to ~309 characters. The ninja bundled with CMake
//    3.22 can't create a directory past Windows' 260-char limit, so the build
//    fails with "ninja: error: mkdir(…): No such file or directory".
//    expo.android.cmakeObjectPathMax=0 keeps CMake's own default (250 on
//    Windows), which hashes those paths. No effect on Linux/macOS (EAS).
//
// 2 + 3. Stripe push provisioning (release builds). @stripe/stripe-react-native
//    ≥ 0.68 compiles against stripe-android-issuing-push-provisioning
//    (compileOnly — never shipped), which needs Google's
//    play-services-tapandpay, and that isn't on any public Maven repo. We
//    don't issue cards, so:
//    - release lint (lintVitalAnalyzeRelease) is skipped: it is the only task
//      that tries to resolve that artifact, and fails on it;
//    - R8 is told those classes are intentionally absent (-dontwarn), or it
//      fails with "Missing class com.stripe.android.pushProvisioning.…".
const {
  withGradleProperties, withAppBuildGradle, withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CMAKE_KEY = 'expo.android.cmakeObjectPathMax';
const LINT_LINE = '    lint { checkReleaseBuilds false } // see plugins/withAndroidBuildFixes.js';
const R8_MARKER = '# Stripe push provisioning is compileOnly';
const R8_RULES = `
${R8_MARKER} (we don't issue cards) — see plugins/withAndroidBuildFixes.js
-dontwarn com.stripe.android.pushProvisioning.**
`;

function withCmakeObjectPathMax(config) {
  return withGradleProperties(config, cfg => {
    cfg.modResults = cfg.modResults.filter(p => !(p.type === 'property' && p.key === CMAKE_KEY));
    cfg.modResults.push({ type: 'property', key: CMAKE_KEY, value: '0' });
    return cfg;
  });
}

function withoutReleaseLint(config) {
  return withAppBuildGradle(config, cfg => {
    if (!cfg.modResults.contents.includes('checkReleaseBuilds false')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(/^android \{$/m, `android {\n${LINT_LINE}`);
    }
    return cfg;
  });
}

function withStripeR8Rules(config) {
  return withDangerousMod(config, ['android', cfg => {
    const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const rules = fs.readFileSync(file, 'utf8');
    if (!rules.includes(R8_MARKER)) fs.writeFileSync(file, rules + R8_RULES);
    return cfg;
  }]);
}

module.exports = function withAndroidBuildFixes(config) {
  return withStripeR8Rules(withoutReleaseLint(withCmakeObjectPathMax(config)));
};
