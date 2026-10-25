// @ts-ignore
import WebSocket from "ws";
import crypto from "crypto";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600n;
const S_TO_NS = 1000000000n;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = "143";
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

const _CS64_COEFFICIENTS: [number, number][] = [
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
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = padLen > 0 ? Buffer.concat([data, Buffer.alloc(padLen)]) : data;
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(padded.readUInt32LE(i));
  }
  if (words.length % 2 !== 0) {
    words.push(0);
  }
  return words;
}

function _sigma0(v: number): number {
  const val = BigInt(v >>> 0);
  const rot = (val >> 7n) ^ (val << 25n) ^ (val >> 18n) ^ (val << 14n) ^ (val >> 3n);
  return Number(rot & 0xFFFFFFFFn);
}

function _sigma1(v: number): number {
  const val = BigInt(v >>> 0);
  const rot = (val >> 17n) ^ (val << 15n) ^ (val >> 19n) ^ (val << 13n) ^ (val >> 10n);
  return Number(rot & 0xFFFFFFFFn);
}

function _sha256_rounds(state: number[], words: number[], first_round: number = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state.map(x => BigInt(x >>> 0));
  const constants = (first_round === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS).map(x => BigInt(x >>> 0));
  const w = words.map(x => BigInt(x >>> 0));
  const mask = 0xFFFFFFFFn;

  const aligned = Math.min(64, Math.floor((first_round + 7) / 8) * 8);

  for (let index = first_round; index < aligned; index++) {
    const rot_e = (e * 0x100000001n);
    const rot_a = (a * 0x100000001n);
    const t1 = (
      h +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (g ^ (e & (f ^ g))) +
      constants[index] +
      w[index]
    );
    const t2 = ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)));
    const next_a = (t1 + t2) & mask;
    const next_e = (d + t1) & mask;
    h = g;
    g = f;
    f = e;
    e = next_e;
    d = c;
    c = b;
    b = a;
    a = next_a;
  }

  for (let index = aligned; index < 64; index += 8) {
    let rot_e = (e * 0x100000001n);
    let rot_a = (a * 0x100000001n);
    let t1 = (
      h +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (g ^ (e & (f ^ g))) +
      constants[index] +
      w[index]
    );
    d = (d + t1) & mask;
    h = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((a & b) | (c & (a | b)))
    ) & mask;

    rot_e = (d * 0x100000001n);
    rot_a = (h * 0x100000001n);
    t1 = (
      g +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (f ^ (d & (e ^ f))) +
      constants[index + 1] +
      w[index + 1]
    );
    c = (c + t1) & mask;
    g = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((h & a) | (b & (h | a)))
    ) & mask;

    rot_e = (c * 0x100000001n);
    rot_a = (g * 0x100000001n);
    t1 = (
      f +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (e ^ (c & (d ^ e))) +
      constants[index + 2] +
      w[index + 2]
    );
    b = (b + t1) & mask;
    f = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((g & h) | (a & (g | h)))
    ) & mask;

    rot_e = (b * 0x100000001n);
    rot_a = (f * 0x100000001n);
    t1 = (
      e +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (d ^ (b & (c ^ d))) +
      constants[index + 3] +
      w[index + 3]
    );
    a = (a + t1) & mask;
    e = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((f & g) | (h & (f | g)))
    ) & mask;

    rot_e = (a * 0x100000001n);
    rot_a = (e * 0x100000001n);
    t1 = (
      d +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (c ^ (a & (b ^ c))) +
      constants[index + 4] +
      w[index + 4]
    );
    h = (h + t1) & mask;
    d = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((e & f) | (g & (e | f)))
    ) & mask;

    rot_e = (h * 0x100000001n);
    rot_a = (d * 0x100000001n);
    t1 = (
      c +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (b ^ (h & (a ^ b))) +
      constants[index + 5] +
      w[index + 5]
    );
    g = (g + t1) & mask;
    c = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((d & e) | (f & (d | e)))
    ) & mask;

    rot_e = (g * 0x100000001n);
    rot_a = (c * 0x100000001n);
    t1 = (
      b +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (a ^ (g & (h ^ a))) +
      constants[index + 6] +
      w[index + 6]
    );
    f = (f + t1) & mask;
    b = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((c & d) | (e & (c | d)))
    ) & mask;

    rot_e = (f * 0x100000001n);
    rot_a = (b * 0x100000001n);
    t1 = (
      a +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (h ^ (f & (g ^ h))) +
      constants[index + 7] +
      w[index + 7]
    );
    e = (e + t1) & mask;
    a = (
      t1 +
      ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) +
      ((b & c) | (d & (b | c)))
    ) & mask;
  }

  return [
    Number(a), Number(b), Number(c), Number(d),
    Number(e), Number(f), Number(g), Number(h),
  ];
}

function _expand_sha256_schedule(words: number[], first_word: number = 16): void {
  const mask = 0xFFFFFFFFn;
  for (let index = first_word; index < 64; index++) {
    const x = BigInt(words[index - 2] >>> 0);
    const y = BigInt(words[index - 15] >>> 0);
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    const sum = (s1 + BigInt(words[index - 7] >>> 0) + s0 + BigInt(words[index - 16] >>> 0)) & mask;
    words.push(Number(sum));
  }
}

function _sha256_init(data: Buffer): number[] {
  const mask = 0xFFFFFFFF;
  const words: number[] = new Array(14).fill(0);
  words.push(data.readUIntBE(0, 3));
  words.push(data.readUInt32BE(3));

  for (let index = 16; index < 30; index++) {
    let value = _SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += (index === 16 ? (_sigma1(words[index - 2]) ^ _SHA256_SIGMA1_ADJUSTMENT) : _sigma1(words[index - 2]));
    }
    if (index - 7 >= 14) {
      value += words[index - 7];
    }
    if (index - 15 >= 14) {
      value += (index === 29 ? (_sigma0(words[index - 15]) ^ _SHA256_SIGMA0_ADJUSTMENT) : _sigma0(words[index - 15]));
    }
    words.push((value & mask) >>> 0);
  }

  const w28_sig1 = _sigma1(words[28]);
  const w15_sig0 = _sigma0(words[15]);
  const val30 = (
    w28_sig1 + words[23] + w15_sig0 + words[14] + _SHA256_ADJUSTMENT - _SHA256_ROUND_CONSTANTS[14]
  ) & mask;
  words.push(val30 >>> 0);

  _expand_sha256_schedule(words, 31);
  const working = _sha256_rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, i) => ((x + working[i]) & mask) >>> 0);
}

function _sha256_digest(data: Buffer): Buffer {
  if (data.length < 7) {
    throw new Error("Token salt must contain at least seven bytes");
  }
  const mask = 0xFFFFFFFF;
  const length = 57 + data.length;
  const padZeroCount = ((55 - length) % 64 + 64) % 64;

  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64BE(BigInt(length * 8));

  const padded = Buffer.concat([
    data.subarray(7),
    Buffer.from([0x80]),
    Buffer.alloc(padZeroCount),
    lenBuf,
  ]);

  let state = _sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const chunk = padded.subarray(offset, offset + 64);
    const words: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      words.push(chunk.readUInt32BE(i));
    }
    _expand_sha256_schedule(words);
    const working = _sha256_rounds(state, words);
    state = state.map((x, i) => ((x + working[i]) & mask) >>> 0);
  }

  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(state[i], i * 4);
  }
  return out;
}

function _cs64_digest(data: Buffer, digest: Buffer): [number, number] {
  const mask = 0xFFFFFFFFn;
  let key_a = BigInt(digest.readUInt32LE(0)) | 1n;
  let key_b = BigInt(digest.readUInt32LE(4)) | 1n;
  const factor = BigInt(_CS64_FACTOR);

  const factors = [
    (key_a * factor) & mask,
    (key_b * factor) & mask,
  ];

  const terms: bigint[] = [];
  const offsets: bigint[] = [];

  for (let i = 0; i < _CS64_COEFFICIENTS.length; i++) {
    const [coef, off] = _CS64_COEFFICIENTS[i];
    terms.push((BigInt(coef) * factors[i % 2]) & mask);
    offsets.push(BigInt(off) & mask);
  }

  const paddedData = Buffer.concat([Buffer.from([0x00]), data]);
  const words = _words_le4_even(paddedData);

  for (let index = 0; index < words.length; index++) {
    const word = BigInt(words[index] >>> 0);
    const isEven = (index % 2 === 0);
    let term = word * (isEven ? key_a : key_b);
    let offset = BigInt(_rol16(Number(word))) * (isEven ? 0xEF0569FBn : 0xC31713DBn);

    if (index === 0) {
      term += BigInt(_CS64_ADJUSTMENT0) * factors[0];
      offset += BigInt(_CS64_ADJUSTMENT1);
    }
    terms.push(term & mask);
    offsets.push(offset & mask);
  }

  let swap_acc = 0n;
  let swap_last = 0n;
  let state = 0n;
  let acc = 0n;

  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];

    let t = BigInt(_rol16(Number((offsets[index] + x) & mask)));
    let q = (t * 0x76F50F34n) & mask;
    swap_acc = (swap_acc + BigInt(_rol16(Number(q))) * 0xC3EFEA97n + q) & mask;

    t = BigInt(_rol16(Number((offsets[index + 1] + y) & mask)));
    q = (t * 0x1881CE3Cn) & mask;
    swap_last = (BigInt(_rol16(Number(q))) * 0x35BD1EC9n + q) & mask;
    swap_acc = (swap_acc + swap_last) & mask;

    state = (state * key_a + x) & mask;
    state = (BigInt(_rol16(Number(state))) * 0xCF98B111n) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x87085B9Fn) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x12CEB96Dn) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x257E1D83n) & mask;
    acc = (acc + state) & mask;

    t = (state * key_b + y) & mask;
    t = (BigInt(_rol16(Number(t))) * 0xA27416F5n) & mask;
    t = (BigInt(_rol16(Number(t))) * 0xD38396FFn) & mask;
    state = (BigInt(_rol16(Number((BigInt(_rol16(Number(t))) * 0x7C932B89n) & mask))) * 0xBFA49F69n) & mask;
    acc = (acc + state) & mask;
  }

  return [Number((swap_last ^ state) & mask), Number((swap_acc ^ acc) & mask)];
}

export function generateSecMsGecV2(unixTimestamp?: number): string {
  const ts = unixTimestamp !== undefined ? unixTimestamp : (Date.now() / 1000);
  let ticks = BigInt(Math.floor(ts)) + WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= 10000000n;

  const strToHash = Buffer.from(`${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`, "ascii");
  const digest = _sha256_digest(strToHash);
  const [cs0, cs1] = _cs64_digest(strToHash, digest);

  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(cs0, 0);
  csBuf.writeUInt32LE(cs1, 4);

  return `${csBuf.toString("hex").toUpperCase()}-${digest.toString("hex").toUpperCase()}`;
}

function dateToString(): string {
  const d = new Date();
  return d.toUTCString();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function synthesizeEdgeTTS(
  text: string,
  voice: string = "en-NG-AbeoNeural",
  timeoutMs: number = 15000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomUUID().replace(/-/g, "");
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const secMsGec = generateSecMsGecV2();

    const url = `${WSS_URL}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const muid = crypto.randomBytes(16).toString("hex").toUpperCase();
    const headers = {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Sec-WebSocket-Version": "13",
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${muid};`,
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
        const lang = voice.startsWith("en-NG") ? "en-NG" : "en-US";
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
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
