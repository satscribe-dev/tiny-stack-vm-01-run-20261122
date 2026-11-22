// Tiny stack VM, make.fun tiny-stack-vm-01 (ISA v1): runs /input/<id>/program.bin
// + input.bin, writes /output/<id>/stdout.bin + exit.txt. Values wrap to signed
// 32 bits; traps end the program at once with the trap code, keeping earlier output.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
function run(p, q) {
  const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), o = new Uint8Array(65536);
  let s = 0, c = 0, l = 0, j = 0, pc = 0, t = 0;
  const e = (x) => [o.subarray(0, l), x];
  for (;;) {
    if (t === 1e6) return e(10);
    if (pc < 0 || pc >= n) return e(9);
    const op = p[pc], im = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op < 52 ? 2 : 0;
    if (pc + im >= n) return e(9);
    t++;
    const nx = pc + 1 + im;
    pc = nx;
    if (op >= 16 && op <= 34 && op !== 23 && op !== 27 && op !== 31) {
      if (s < 2) return e(2);
      const b = D[s - 1], a = D[s - 2];
      if (op >= 19 && op <= 22 && b === 0) return e(4);
      let r;
      if (op === 16) r = (a + b) | 0;
      else if (op === 17) r = (a - b) | 0;
      else if (op === 18) r = Math.imul(a, b);
      else if (op === 19) r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      else if (op === 20) r = b === -1 ? 0 : (a % b) | 0;
      else if (op === 21) r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      else if (op === 22) r = ((a >>> 0) % (b >>> 0)) | 0;
      else if (op === 24) r = a & b;
      else if (op === 25) r = a | b;
      else if (op === 26) r = a ^ b;
      else if (op === 28) r = a << (b & 31);
      else if (op === 29) r = a >> (b & 31);
      else if (op === 30) r = (a >>> (b & 31)) | 0;
      else if (op === 32) r = a === b ? 1 : 0;
      else if (op === 33) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      s -= 2;
      D[s++] = r;
      continue;
    }
    switch (op) {
      case 0: return e(0);
      case 1:
        if (s === 256) return e(3);
        D[s++] = (p[nx - 1] << 24) >> 24;
        break;
      case 2:
        if (s === 256) return e(3);
        D[s++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 3:
        if (s < 1) return e(2);
        s--;
        break;
      case 4:
        if (s < 1) return e(2);
        if (s === 256) return e(3);
        D[s] = D[s - 1];
        s++;
        break;
      case 5:
        if (s < 2) return e(2);
        { const w = D[s - 1]; D[s - 1] = D[s - 2]; D[s - 2] = w; }
        break;
      case 6:
        if (s < 2) return e(2);
        if (s === 256) return e(3);
        D[s] = D[s - 2];
        s++;
        break;
      case 7:
        if (s < 3) return e(2);
        { const w = D[s - 3]; D[s - 3] = D[s - 2]; D[s - 2] = D[s - 1]; D[s - 1] = w; }
        break;
      case 23:
        if (s < 1) return e(2);
        D[s - 1] = (-D[s - 1]) | 0;
        break;
      case 27:
        if (s < 1) return e(2);
        D[s - 1] = ~D[s - 1];
        break;
      case 48:
      case 49:
      case 50: {
        let take = op === 48;
        if (op !== 48) {
          if (s < 1) return e(2);
          const v = D[--s];
          take = op === 49 ? v === 0 : v !== 0;
        }
        if (take) pc = nx + ((((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16));
        break;
      }
      case 51:
        if (c === 64) return e(7);
        C[c++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (c === 0) return e(8);
        pc = C[--c];
        break;
      case 64:
        if (s < 1) return e(2);
        if (D[s - 1] < 0 || D[s - 1] > 255) return e(6);
        D[s - 1] = M[D[s - 1]];
        break;
      case 65: {
        if (s < 2) return e(2);
        const a = D[s - 1];
        if (a < 0 || a > 255) return e(6);
        M[a] = D[s - 2];
        s -= 2;
        break;
      }
      case 80: {
        if (s < 1) return e(2);
        const d = '' + D[s - 1];
        if (l + d.length > 65536) return e(11);
        s--;
        for (let i = 0; i < d.length; i++) o[l++] = d.charCodeAt(i);
        break;
      }
      case 81:
        if (s < 1) return e(2);
        if (l + 1 > 65536) return e(11);
        o[l++] = D[--s] & 255;
        break;
      case 82:
        if (s === 256) return e(3);
        D[s++] = j < q.length ? q[j++] : -1;
        break;
      case 83:
        if (s < 1) return e(2);
        return e(D[--s] & 255);
      default: return e(5);
    }
  }
}
for (const id of readdirSync(I).sort()) {
  const [o, x] = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), o);
  writeFileSync(join(O, id, 'exit.txt'), x + '\n');
}
