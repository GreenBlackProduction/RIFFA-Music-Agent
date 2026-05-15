/**
 * Browser audio helpers — convert a MediaRecorder blob (webm/opus on Chrome,
 * mp4/aac on Safari) into a WAV blob that the SunoAPI /generate/upload-cover
 * endpoint accepts (mp3 / wav / m4a / ogg).
 *
 * MediaRecorder cannot emit WAV directly, so we decode the recording with
 * OfflineAudioContext (no user-gesture requirement, no output stream) and
 * write a 16-bit PCM RIFF/WAV container ourselves.
 */

export async function blobToWav(blob: Blob, fileName: string): Promise<File> {
  const arrayBuffer = await blob.arrayBuffer();

  // OfflineAudioContext – no autoplay-policy lock, no output audio device,
  // never suspended. Perfect for offline blob → buffer decoding.
  // We create a temporary 1-channel context just for decodeAudioData.
  // OfflineAudioContext rejects on decode failure — no null return path.
  const offlineCtx = new OfflineAudioContext(1, 1, 48000);
  const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
  const wavBlob = encodeWav(audioBuffer);
  return new File([wavBlob], fileName, { type: "audio/wav" });
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const numFrames = buffer.length;
  const dataLength = numFrames * numChannels * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true);             // block align
  view.setUint16(34, bytesPerSample * 8, true);                       // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Interleave channels into 16-bit PCM samples.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }
  let offset = headerLength;
  for (let i = 0; i < numFrames; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
