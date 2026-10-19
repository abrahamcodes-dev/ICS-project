const {withAndroidManifest} = require('expo/config-plugins');

// Blob-util's external-file sharing provider is unnecessary for private PDF reads.
module.exports = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const application = manifest.application[0];
  application.provider = (application.provider || []).filter(provider =>
    provider.$['android:name'] !== 'com.ReactNativeBlobUtil.Utils.FileProvider');
  application.provider.push({$: {
    'android:name': 'com.ReactNativeBlobUtil.Utils.FileProvider',
    'tools:node': 'remove',
  }});
  return config;
});
