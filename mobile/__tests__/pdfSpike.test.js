jest.mock('react-native-blob-util', () => ({__esModule: true, default: {fs: {
  dirs: {CacheDir: '/private/cache'}, writeFile: jest.fn(), exists: jest.fn(), unlink: jest.fn(),
}}}));
jest.mock('react-native-pdf', () => 'Pdf');
const React = require('react');
const {act, create} = require('react-test-renderer');
const {AppState, Button} = require('react-native');
const {fs} = require('react-native-blob-util').default;
const {createPdfSpikeFile, syntheticPdf} = require('../src/development/pdfSpikeFile');
const PdfSpike = require('../src/development/PdfSpike').default;
let background, remove;
beforeEach(() => {
  jest.clearAllMocks(); global.__DEV__ = true;
  fs.writeFile.mockResolvedValue(undefined); fs.exists.mockResolvedValue(true); fs.unlink.mockResolvedValue(undefined);
  remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { background = callback; return {remove}; });
});
afterEach(() => { global.__DEV__ = true; jest.restoreAllMocks(); });
test('fixture is a valid ASCII PDF with exact xref offsets and no active content', () => {
  const pdf = syntheticPdf();
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  expect(pdf.slice(xref, xref + 4)).toBe('xref');
  const offsets = [...pdf.matchAll(/(\d{10}) 00000 n/g)];
  expect(offsets).toHaveLength(5);
  offsets.forEach((match, i) => expect(pdf.slice(Number(match[1]))).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  expect(pdf).not.toMatch(/https?:|\/JavaScript|\/OpenAction|\/URI|\/AcroForm/);
});
test('writes only a synthetic private-cache file, once per session', async () => {
  const file = createPdfSpikeFile(); const uri = await file.prepare();
  expect(uri).toMatch(/^file:\/\/\/private\/cache\/calladoc-pdf-spike-.*\.pdf$/);
  expect(await file.prepare()).toBe(uri);
  expect(fs.writeFile).toHaveBeenCalledTimes(1);
  expect(fs.writeFile).toHaveBeenCalledWith(uri.slice(7), syntheticPdf(), 'utf8');
  await file.dispose(); expect(fs.unlink).toHaveBeenCalledWith(uri.slice(7));
  expect(await file.prepare()).toBeNull();
});
test('disposal during a write waits and deletes the late result', async () => {
  let finish; fs.writeFile.mockReturnValue(new Promise(resolve => {finish = resolve;}));
  const file = createPdfSpikeFile(); const ready = file.prepare(); const disposed = file.dispose();
  expect(fs.unlink).not.toHaveBeenCalled(); finish();
  expect(await ready).toBeNull(); await disposed; expect(fs.unlink).toHaveBeenCalled();
});
test('write failure cleans partial data and exposes only a generic error', async () => {
  fs.writeFile.mockRejectedValue(new Error('private path detail'));
  const file = createPdfSpikeFile();
  await expect(file.prepare()).rejects.toThrow('Unable to prepare the private synthetic PDF.');
  expect(fs.unlink).toHaveBeenCalled(); await file.dispose();
});
test('cleanup failure is safely best effort', async () => {
  fs.unlink.mockRejectedValue(new Error('already removed'));
  const file = createPdfSpikeFile(); await file.prepare(); await expect(file.dispose()).resolves.toBeUndefined();
});
test('production cannot create a spike file', () => {
  global.__DEV__ = false; expect(createPdfSpikeFile).toThrow('development-only'); expect(fs.writeFile).not.toHaveBeenCalled();
});
test('viewer uses local source, disables TLS bypass, and closes on background', async () => {
  let tree; await act(async () => {tree = create(React.createElement(PdfSpike));});
  const pdf = tree.root.findByType('Pdf');
  expect(pdf.props.source.uri).toMatch(/^file:/); expect(pdf.props.source.cache).toBe(false);
  expect(pdf.props.trustAllCerts).toBe(false);
  await act(async () => {background('background');});
  expect(tree.root.findAllByType('Pdf')).toHaveLength(0); expect(fs.unlink).toHaveBeenCalled(); expect(remove).toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('explicit close removes viewer and temporary file', async () => {
  let tree; await act(async () => {tree = create(React.createElement(PdfSpike));});
  await act(async () => tree.root.findByType(Button).props.onPress());
  expect(tree.root.findAllByType('Pdf')).toHaveLength(0); expect(fs.unlink).toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('unmount releases listener and file', async () => {
  let tree; await act(async () => {tree = create(React.createElement(PdfSpike));});
  await act(async () => tree.unmount()); expect(remove).toHaveBeenCalledTimes(1); expect(fs.unlink).toHaveBeenCalled();
});
test('native failure removes the viewer, cleans up and remains visible', async () => {
  let tree; await act(async () => {tree = create(React.createElement(PdfSpike));});
  await act(async () => tree.root.findByType('Pdf').props.onError(new Error('native detail')));
  expect(tree.root.findAllByType('Pdf')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Native PDF rendering failed.');
  expect(JSON.stringify(tree.toJSON())).not.toContain('native detail');
  expect(fs.unlink).toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('private PDF plugin removes only blob-util sharing provider', () => {
  let transform;
  jest.isolateModules(() => {
    jest.doMock('expo/config-plugins', () => ({withAndroidManifest: (_, fn) => {transform = fn;}}));
    require('../plugins/withPrivatePdfSpike.cjs')({});
  });
  const config = {modResults: {manifest: {$: {}, application: [{provider: [{$: {'android:name': 'existing.Provider'}}]}]}}};
  transform(config); transform(config);
  expect(config.modResults.manifest.application[0].provider).toEqual([
    {$: {'android:name': 'existing.Provider'}},
    {$: {'android:name': 'com.ReactNativeBlobUtil.Utils.FileProvider', 'tools:node': 'remove'}},
  ]);
});
