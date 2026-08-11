const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

type ParsedWav = {
  format: Uint8Array;
  data: Uint8Array;
};

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function parseWav(audio: Uint8Array): ParsedWav {
  if (audio.byteLength < RIFF_HEADER_BYTES || ascii(audio, 0, 4) !== 'RIFF' || ascii(audio, 8, 4) !== 'WAVE') {
    throw new Error('RunPod voice worker returned invalid WAV audio.');
  }
  let format: Uint8Array | null = null;
  const dataParts: Uint8Array[] = [];
  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= audio.byteLength) {
    const chunkId = ascii(audio, offset, 4);
    const chunkSize = uint32(audio, offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    const end = start + chunkSize;
    if (end > audio.byteLength) throw new Error('RunPod voice worker returned a truncated WAV chunk.');
    if (chunkId === 'fmt ' && !format) format = audio.slice(start, end);
    if (chunkId === 'data') dataParts.push(audio.slice(start, end));
    offset = end + (chunkSize % 2);
  }
  if (!format || dataParts.length === 0) throw new Error('RunPod WAV is missing format or audio data.');
  const dataLength = dataParts.reduce((sum, part) => sum + part.byteLength, 0);
  const data = new Uint8Array(dataLength);
  let dataOffset = 0;
  for (const part of dataParts) {
    data.set(part, dataOffset);
    dataOffset += part.byteLength;
  }
  return { format, data };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) target[offset + index] = value.charCodeAt(index);
}

/** Concatenate compatible PCM/float WAV files into one playable WAV. */
export function concatenateWavAudio(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 0) throw new Error('No WAV audio was generated.');
  if (parts.length === 1) return parts[0];
  const parsed = parts.map(parseWav);
  const format = parsed[0].format;
  if (parsed.some((part) => !equalBytes(part.format, format))) {
    throw new Error('RunPod returned incompatible WAV formats for a long reply.');
  }

  const formatPadding = format.byteLength % 2;
  const dataLength = parsed.reduce((sum, part) => sum + part.data.byteLength, 0);
  const dataPadding = dataLength % 2;
  const totalLength = RIFF_HEADER_BYTES
    + CHUNK_HEADER_BYTES + format.byteLength + formatPadding
    + CHUNK_HEADER_BYTES + dataLength + dataPadding;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  writeAscii(output, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeAscii(output, 8, 'WAVE');
  writeAscii(output, 12, 'fmt ');
  view.setUint32(16, format.byteLength, true);
  output.set(format, 20);
  const dataHeaderOffset = 20 + format.byteLength + formatPadding;
  writeAscii(output, dataHeaderOffset, 'data');
  view.setUint32(dataHeaderOffset + 4, dataLength, true);
  let outputOffset = dataHeaderOffset + CHUNK_HEADER_BYTES;
  for (const part of parsed) {
    output.set(part.data, outputOffset);
    outputOffset += part.data.byteLength;
  }
  return output;
}
