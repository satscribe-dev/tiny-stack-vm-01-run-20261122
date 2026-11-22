// Tiny stack VM for make.fun's tiny-stack-vm-01 (ISA v1).
// Runs every instance in /input/<id>/ (program.bin + input.bin) and writes
// /output/<id>/stdout.bin + exit.txt. Values are signed 32-bit and wrap;
// the ten traps end a program at once with the trap's code, keeping the
// output written before the trap. Written from ISA.md; where ISA.md and the
// reference VM could be read two ways, the reference VM (vm.mjs) is the rule.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Opcode table: which bytes are real opcodes, and how many immediate bytes each takes.
const KNOWN = new Uint8Array(256);
for (const o of [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 48, 49, 50, 51, 52, 64, 65, 80, 81, 82, 83]) KNOWN[o] = 1;
const IMM = new Uint8Array(256);
IMM[0x01] = 1;
IMM[0x02] = 4;
IMM[0x30] = IMM[0x31] = IMM[0x32] = IMM[0x33] = 2;

function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64); // call stack
  const M = new Int32Array(256); // memory, all zero
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const end = (code) => [out.subarray(0, ol), code];
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    if (!KNOWN[op]) return end(5);
    const imm = IMM[op];
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    pc = nx;
    // Two-operand arithmetic / logic / compare: pops 2, pushes 1 (never overflows).
    if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
      if (sp < 2) return end(2);
      const b = D[sp - 1], a = D[sp - 2];
      let r;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) {
        if (b === 0) return end(4);
        r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      } else if (op === 0x14) {
        if (b === 0) return end(4);
        r = b === -1 ? 0 : (a % b) | 0;
      } else if (op === 0x15) {
        if (b === 0) return end(4);
        r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      } else if (op === 0x16) {
        if (b === 0) return end(4);
        r = ((a >>> 0) % (b >>> 0)) | 0;
      } else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    switch (op) {
      case 0x00: return end(0);
      case 0x01:
        if (sp === 256) return end(3);
        D[sp++] = (p[nx - 1] << 24) >> 24;
        break;
      case 0x02:
        if (sp === 256) return end(3);
        D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 0x03:
        if (sp < 1) return end(2);
        sp--;
        break;
      case 0x04:
        if (sp < 1) return end(2);
        if (sp === 256) return end(3);
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 0x05:
        if (sp < 2) return end(2);
        { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; }
        break;
      case 0x06:
        if (sp < 2) return end(2);
        if (sp === 256) return end(3);
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 0x07:
        if (sp < 3) return end(2);
        { const t = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = t; }
        break;
      case 0x17:
        if (sp < 1) return end(2);
        D[sp - 1] = (-D[sp - 1]) | 0;
        break;
      case 0x1b:
        if (sp < 1) return end(2);
        D[sp - 1] = ~D[sp - 1];
        break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (op !== 0x30) {
          if (sp < 1) return end(2);
          const v = D[--sp];
          take = op === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 0x40:
        if (sp < 1) return end(2);
        if (D[sp - 1] < 0 || D[sp - 1] > 255) return end(6);
        D[sp - 1] = M[D[sp - 1]];
        break;
      case 0x41: {
        if (sp < 2) return end(2);
        const addr = D[sp - 1];
        if (addr < 0 || addr > 255) return end(6);
        M[addr] = D[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        if (sp < 1) return end(2);
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (sp < 1) return end(2);
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        if (sp === 256) return end(3);
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        if (sp < 1) return end(2);
        return end(D[--sp] & 255);
    }
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  const [o, code] = run(
    new Uint8Array(readFileSync(join(IN_DIR, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(IN_DIR, id, 'input.bin'))),
  );
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), o);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), code + '\n');
}
