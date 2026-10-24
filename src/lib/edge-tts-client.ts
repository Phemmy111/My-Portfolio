// @ts-ignore
import WebSocket from "ws";
import crypto from "crypto";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

const _SHA256_INITIAL = [
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];

const _SHA256_STATE = [
  0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A,
  0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];

const _SHA256_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA,
  0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
  0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
  0xD258B060, 0x72766564,
];

const _SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
  0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
  0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
  0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
  0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
  0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
  0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
  0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
  0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];

const _SHA256_ADJUSTMENT = 0xC9DC06A7;
const _SHA256_BLOCK_CONSTANTS = [
  ..._SHA256_ROUND_CONSTANTS.slice(0, 14),
  _SHA256_ADJUSTMENT,
  ..._SHA256_ROUND_CONSTANTS.slice(15),
];

const _SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;

const _CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0],
  [0x44DE24C6, 0x88DFF51D],
  [0x3BEB65BC, 0x29514038],
  [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5],
  [0x314EF5D5, 0x26E55F3C],
  [0xE92491B1, 0x607801C6],
  [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA],
  [0xDA79FA60, 0x207CC464],
  [0xBED20560, 0x3C3C74F3],
  [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1],
  [0xCB49E3C6, 0xC5626167],
];

const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xF2F90B1A;
const _CS64_ADJUSTMENT1 = 0x0B1A0000;

function _rol16(value: number): number {
  const v = value >>> 0;
  return (((v << 16) | (v >>> 16)) >>> 0);
}

function _words_le4_even(data: Buffer): number[] {
  const words: number[] = [];
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = padLen > 0 ? Buffer.concat([data, Buffer.alloc(padLen)]) : data;
  for (let i = 0; i < padded.length; i += 4) {
    words.push(padded.readUInt32LE(i));
  }
  if (words.length % 2 !== 0) {
    words.push(0);
  }
  return words;
}

function _sigma0(v: number): number {
  return (((v >>> 7) | (v << 25)) ^ ((v >>> 18) | (v << 14)) ^ (v >>> 3)) >>> 0;
}

function _sigma1(v: number): number {
  return (((v >>> 17) | (v << 15)) ^ ((v >>> 19) | (v << 13)) ^ (v >>> 10)) >>> 0;
}

function _sha256_rounds(state: number[], words: number[], first_round: number = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = first_round === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS;

  for (let i = 0; i < words.length; i++) {
    const k = constants[first_round + i];
    const w = words[i];

    const s1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
    const ch = ((e & f) ^ (~e & g)) >>> 0;
    const temp1 = (h + s1 + ch + k + w) >>> 0;

    const s0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
    const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
    const temp2 = (s0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }

  return [a, b, c, d, e, f, g, h];
}

function _sha256_schedule(schedule: number[], words: number[], is_adjusted: boolean = false): number[] {
  const w = [...words];
  let s0_adj = is_adjusted ? _SHA256_SIGMA0_ADJUSTMENT : 0;
  let s1_adj = is_adjusted ? _SHA256_SIGMA1_ADJUSTMENT : 0;

  for (let i = 0; i < schedule.length; i++) {
    const s0 = (_sigma0(w[i + 1]) + s0_adj) >>> 0;
    const s1 = (_sigma1(schedule[i]) + s1_adj) >>> 0;
    s0_adj = 0;
    s1_adj = 0;

    const new_w = (w[i] + s0 + w[i + 9] + s1) >>> 0;
    w.push(new_w);
  }

  return w;
}

function _sha256_block(state: number[], words: number[], is_adjusted: boolean = false): number[] {
  const schedule = words.slice(0, 14);
  const w = _sha256_schedule(schedule, words, is_adjusted);
  const words_b = schedule.slice(0, 2);

  const state1 = _sha256_rounds(state, w.slice(0, 14), is_adjusted ? 14 : 0);
  const state2 = _sha256_rounds(state1, schedule.slice(2), 0);
  const state3 = _sha256_rounds(state2, words_b, 12);
  const state4 = _sha256_rounds(state3, w.slice(14), 14);

  return [
    (state[0] + state4[0]) >>> 0,
    (state[1] + state4[1]) >>> 0,
    (state[2] + state4[2]) >>> 0,
    (state[3] + state4[3]) >>> 0,
    (state[4] + state4[4]) >>> 0,
    (state[5] + state4[5]) >>> 0,
    (state[6] + state4[6]) >>> 0,
    (state[7] + state4[7]) >>> 0,
  ];
}

function _sha256_digest(data: Buffer): Buffer {
  let state = _sha256_block(_SHA256_INITIAL, _SHA256_SCHEDULE, true);
  const words = _words_le4_even(data);

  let current_block: number[] = [];
  for (let i = 0; i < words.length; i += 2) {
    current_block.push(words[i], words[i + 1]);
    if (current_block.length === 14) {
      state = _sha256_block(state, current_block, false);
      current_block = [];
    }
  }

  current_block.push(0x80);
  while (current_block.length < 14) {
    current_block.push(0);
  }
  state = _sha256_block(state, current_block, false);

  const len_block = new Array(14).fill(0);
  len_block[13] = (data.length * 8) >>> 0;
  state = _sha256_block(state, len_block, false);

  state = [
    (state[0] + _SHA256_STATE[0]) >>> 0,
    (state[1] + _SHA256_STATE[1]) >>> 0,
    (state[2] + _SHA256_STATE[2]) >>> 0,
    (state[3] + _SHA256_STATE[3]) >>> 0,
    (state[4] + _SHA256_STATE[4]) >>> 0,
    (state[5] + _SHA256_STATE[5]) >>> 0,
    (state[6] + _SHA256_STATE[6]) >>> 0,
    (state[7] + _SHA256_STATE[7]) >>> 0,
  ];

  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(state[i], i * 4);
  }
  return out;
}

function _cs64_digest(data: Buffer, digest: Buffer): [number, number] {
  const digestWords: number[] = [];
  for (let i = 0; i < 32; i += 4) {
    digestWords.push(digest.readUInt32LE(i));
  }

  let state = 0;
  let acc = 0;

  for (let i = 0; i < 7; i++) {
    const key_a = digestWords[i];
    const key_b = digestWords[i + 1];

    let t = (state ^ key_a) >>> 0;
    t = Math.imul(t, _CS64_COEFFICIENTS[i][0]) >>> 0;
    t = (t + acc) >>> 0;
    t = _rol16(t);
    t = (Math.imul(t, _CS64_COEFFICIENTS[i][1]) + _CS64_FACTOR) >>> 0;
    acc = (acc + t) >>> 0;

    state = (t + key_b) >>> 0;
    state = Math.imul(_rol16(state), _CS64_COEFFICIENTS[i][0]) >>> 0;
    state = (state + acc) >>> 0;
    state = _rol16(state);
    state = Math.imul(state, _CS64_COEFFICIENTS[i][1]) >>> 0;
    acc = (acc + state) >>> 0;
  }

  const swap_last = state;
  const swap_acc = acc;
  const words = _words_le4_even(data);

  let c_idx = 0;
  for (let i = 0; i < words.length; i += 2) {
    const [coeff_a, coeff_b] = _CS64_COEFFICIENTS[c_idx];
    c_idx = (c_idx + 1) % _CS64_COEFFICIENTS.length;

    const x = words[i];
    const y = words[i + 1];

    let t = (state ^ x) >>> 0;
    t = Math.imul(t, coeff_a) >>> 0;
    t = (t + acc) >>> 0;
    t = _rol16(t);
    t = (Math.imul(t, coeff_b) + _CS64_FACTOR) >>> 0;
    acc = (acc + t) >>> 0;

    state = (t + y) >>> 0;
    state = Math.imul(_rol16(state), coeff_a) >>> 0;
    state = (state + acc) >>> 0;
    state = _rol16(state);
    state = Math.imul(state, coeff_b) >>> 0;
    acc = (acc + state) >>> 0;
  }

  for (let i = 7; i < 14; i++) {
    const key_a = digestWords[i - 7];
    const key_b = digestWords[i - 6];
    let [coeff_a, coeff_b] = _CS64_COEFFICIENTS[i];

    let adj0 = 0;
    let adj1 = 0;
    if (i === 13) {
      adj0 = _CS64_ADJUSTMENT0;
      adj1 = _CS64_ADJUSTMENT1;
    }

    const x = ((key_a ^ adj0) + adj1) >>> 0;
    const y = key_b;

    let t = (state ^ x) >>> 0;
    t = Math.imul(t, coeff_a) >>> 0;
    t = (t + acc) >>> 0;
    t = _rol16(t);
    t = (Math.imul(t, coeff_b) + _CS64_FACTOR) >>> 0;
    acc = (acc + t) >>> 0;

    state = (t + y) >>> 0;
    state = Math.imul(_rol16(state), coeff_a) >>> 0;
    state = (state + acc) >>> 0;
    state = _rol16(state);
    state = Math.imul(state, coeff_b) >>> 0;
    acc = (acc + state) >>> 0;
  }

  for (let i = 0; i < 7; i++) {
    const key_a = digestWords[i];
    const key_b = digestWords[i + 1];
    const x = key_a;
    const y = key_b;

    let t = (state ^ x) >>> 0;
    t = Math.imul(_rol16(t), 0x7E2596CD) >>> 0;
    t = (t + acc) >>> 0;
    t = Math.imul(_rol16(t), 0x96CDF7F5) >>> 0;
    state = Math.imul(_rol16(state), 0x87085B9F) >>> 0;
    state = Math.imul(_rol16(state), 0x12CEB96D) >>> 0;
    state = Math.imul(_rol16(state), 0x257E1D83) >>> 0;
    acc = (acc + state) >>> 0;

    t = (Math.imul(state, key_b) + y) >>> 0;
    t = Math.imul(_rol16(t), 0xA27416F5) >>> 0;
    t = Math.imul(_rol16(t), 0xD38396FF) >>> 0;
    state = Math.imul(_rol16(Math.imul(_rol16(t), 0x7C932B89) >>> 0), 0xBFA49F69) >>> 0;
    acc = (acc + state) >>> 0;
  }

  return [(swap_last ^ state) >>> 0, (swap_acc ^ acc) >>> 0];
}

export function generateSecMsGecV2(unixTimestamp?: number): string {
  let ticks = unixTimestamp !== undefined ? unixTimestamp : (Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;

  const strToHash = Buffer.from(`${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`, "ascii");
  const digest = _sha256_digest(strToHash);
  const [cs0, cs1] = _cs64_digest(strToHash, digest);

  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(cs0, 0);
  csBuf.writeUInt32LE(cs1, 4);

  const cs64 = csBuf.toString("hex").toUpperCase();
  const sha256 = digest.toString("hex").toUpperCase();

  return `${cs64}-${sha256}`;
}

function connectId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function dateToString(): string {
  return new Date().toISOString();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * High-performance, zero-config native Edge TTS Synthesizer using official Microsoft Sec-MS-GEC v2.
 * Supports Nigerian English (en-NG-AbeoNeural, en-NG-EzinneNeural) and global voices.
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string = "en-NG-AbeoNeural",
  timeoutMs: number = 15000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectionId = connectId();
    const requestId = connectId();
    const secMsGec = generateSecMsGecV2();

    const url = `${WSS_URL}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const headers = {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const ws = new WebSocket(url, { headers });
    const audioChunks: Buffer[] = [];
    let isFinished = false;

    const timeout = setTimeout(() => {
      if (!isFinished) {
        ws.terminate();
        reject(new Error("Edge TTS synthesis timed out"));
      }
    }, timeoutMs);

    ws.on("open", () => {
      const configMsg =
        `X-Timestamp:${dateToString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;

      ws.send(configMsg, (err: any) => {
        if (err) {
          clearTimeout(timeout);
          ws.terminate();
          return reject(err);
        }

        const escaped = escapeXml(text);
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${voice}'>` +
          `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escaped}</prosody>` +
          `</voice>` +
          `</speak>`;

        const ssmlMsg =
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${dateToString()}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          `${ssml}`;

        ws.send(ssmlMsg, (err2: any) => {
          if (err2) {
            clearTimeout(timeout);
            ws.terminate();
            return reject(err2);
          }
        });
      });
    });

    ws.on("message", (data: any, isBinary: boolean) => {
      if (!isBinary) {
        const textData = data.toString("utf-8");
        if (textData.includes("Path:turn.end")) {
          isFinished = true;
          clearTimeout(timeout);
          ws.close();
          const finalBuffer = Buffer.concat(audioChunks);
          if (finalBuffer.length === 0) {
            return reject(new Error("No audio chunks received from Edge TTS"));
          }
          resolve(finalBuffer);
        }
      } else {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          if (buf.length > 2 + headerLen) {
            const headerStr = buf.slice(2, 2 + headerLen).toString("utf-8");
            if (headerStr.includes("Path:audio")) {
              const audioData = buf.slice(2 + headerLen);
              if (audioData.length > 0) {
                audioChunks.push(audioData);
              }
            }
          }
        }
      }
    });

    ws.on("error", (err: any) => {
      if (!isFinished) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!isFinished) {
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(new Error("WebSocket closed before audio received"));
        }
      }
    });
  });
}
