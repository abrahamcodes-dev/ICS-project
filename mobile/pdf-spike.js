// Standalone Metro entry: never imports App, Firebase, or the administrator UI.
if (!__DEV__) throw new Error('PDF spike must not run in a production bundle.');
const {registerRootComponent} = require('expo');
const PdfSpike = require('./src/development/PdfSpike').default;
registerRootComponent(PdfSpike);
