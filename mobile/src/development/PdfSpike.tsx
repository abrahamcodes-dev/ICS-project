import React, {useEffect, useState} from 'react';
import {AppState, Button, StyleSheet, Text, View} from 'react-native';
import Pdf from 'react-native-pdf';
import {createPdfSpikeFile} from './pdfSpikeFile';

export default function PdfSpike() {
  const [uri, setUri] = useState<string | null>(null);
  const [status, setStatus] = useState('Preparing synthetic PDF…');
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!__DEV__ || closed) return;
    let active = true;
    const file = createPdfSpikeFile();
    void file.prepare().then(value => {
      if (active && value) setUri(value);
    }).catch(() => { if (active) setStatus('Cannot prepare test file.'); });
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') { setUri(null); setClosed(true); }
    });
    return () => { active = false; listener.remove(); void file.dispose(); };
  }, [closed]);
  if (!__DEV__) return null;
  return <View style={styles.screen}>
    <Text accessibilityRole="header">Development-only synthetic PDF spike</Text>
    <Text>{status}</Text>
    {closed && <Text>Viewer closed. Reload to repeat.</Text>}
    {!closed && uri && <Pdf style={styles.pdf} source={{uri, cache: false}}
      trustAllCerts={false} enableAnnotationRendering={false}
      onLoadComplete={pages => setStatus(`Rendered ${pages} synthetic page(s).`)}
      onError={() => { setStatus('Native PDF rendering failed.'); setUri(null); setClosed(true); }} />}
    <Button title="Close and clean up" onPress={() => { setUri(null); setClosed(true); }} disabled={closed} />
  </View>;
}
const styles = StyleSheet.create({screen: {flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#fff'}, pdf: {flex: 1, width: '100%'}});
