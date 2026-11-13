const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withHealthConnectVisibility(config) {
  return withAndroidManifest(config, (result) => {
    const manifest = result.modResults.manifest;
    const queries = manifest.queries || (manifest.queries = []);
    const packageName = 'com.google.android.apps.healthdata';
    const isAlreadyDeclared = queries.some((query) => (
      query.package || []
    ).some((entry) => entry.$['android:name'] === packageName));

    if (!isAlreadyDeclared) {
      queries.push({ package: [{ $: { 'android:name': packageName } }] });
    }

    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000/api';
    const application = manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = apiUrl.startsWith('http://') ? 'true' : 'false';
    }
    return result;
  });
};
