// A tiny stack VM for make.fun's tiny-stack-vm-01: an exact interpreter of the kit's ISA
// (generator/subject/ISA.md; vm.mjs is the rule where the two could be read two ways).
// The edge cases are the point: wrapping 32-bit arithmetic (Math.imul, never a float
// product), unsigned DIVU/MODU/LTU, shift counts masked to 5 bits, sign-extended PUSH8,
// EXIT's low byte, IN returning -1 once the input is used up, and every trap keeping the
// output written before it while ending with its own code (2 underflow, 3 stack overflow,
// 4 division by zero, 5 unknown opcode, 6 bad address, 7 call overflow, 8 empty RET,
// 9 pc or immediate outside the program, 10 step limit, 11 output limit).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcodes in decimal: 0 HALT, 1 PUSH8, 2 PUSH32, 3 POP, 4 DUP, 5 SWAP, 6 OVER, 7 ROT,
// 16..34 arithmetic (23 NEG, 27 NOT unary), 48 JMP, 49 JZ, 50 JNZ, 51 CALL, 52 RET,
// 64 LOAD, 65 STORE, 80 PRINT, 81 PUTC, 82 IN, 83 EXIT.
function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; e: number } {
  const n = p.length;
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64); // call stack
  const M = new Int32Array(256); // memory, all zero at the start
  const out = new Uint8Array(65536);
  let sp = 0, cs = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const done = (e: number) => ({ o: out.subarray(0, ol), e });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    const known = op < 8 || (op > 15 && op < 35 && op !== 31) || (op > 47 && op < 53) || op === 64 || op === 65 || (op > 79 && op < 84);
    if (!known) return done(5);
    const imm = op === 1 ? 1 : op === 2 ? 4 : op > 47 && op < 52 ? 2 : 0;
    if (pc + imm >= n) return done(9);
    steps++;
    const nx = pc + 1 + imm;
    const im = imm === 1 ? (p[nx - 1] << 24) >> 24
      : imm === 4 ? p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24)
      : imm === 2 ? ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16 : 0;
    pc = nx;
    if (op > 15 && op < 35 && op !== 23 && op !== 27) {
      // Binary arithmetic and comparison: pop b (the top), then a, push the result.
      if (sp < 2) return done(2);
      const b = D[sp - 1], a = D[sp - 2];
      let r: number;
      if (op === 16) r = (a + b) | 0;
      else if (op === 17) r = (a - b) | 0;
      else if (op === 18) r = Math.imul(a, b);
      else if (op === 19) { if (!b) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
      else if (op === 20) { if (!b) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
      else if (op === 21) { if (!b) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
      else if (op === 22) { if (!b) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
      else if (op === 24) r = a & b;
      else if (op === 25) r = a | b;
      else if (op === 26) r = a ^ b;
      else if (op === 28) r = a << (b & 31);
      else if (op === 29) r = a >> (b & 31);
      else if (op === 30) r = (a >>> (b & 31)) | 0;
      else if (op === 32) r = a === b ? 1 : 0;
      else if (op === 33) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      D[sp - 2] = r;
      sp--;
      continue;
    }
    switch (op) {
      case 0: return done(0);
      case 1: case 2:
        if (sp > 255) return done(3);
        D[sp++] = im; break;
      case 3:
        if (sp < 1) return done(2);
        sp--; break;
      case 4:
        if (sp < 1) return done(2);
        if (sp > 255) return done(3);
        D[sp] = D[sp - 1]; sp++; break;
      case 5: {
        if (sp < 2) return done(2);
        const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break;
      }
      case 6:
        if (sp < 2) return done(2);
        if (sp > 255) return done(3);
        D[sp] = D[sp - 2]; sp++; break;
      case 7: {
        if (sp < 3) return done(2);
        const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break;
      }
      case 23:
        if (sp < 1) return done(2);
        D[sp - 1] = -D[sp - 1] | 0; break;
      case 27:
        if (sp < 1) return done(2);
        D[sp - 1] = ~D[sp - 1]; break;
      case 48: pc = nx + im; break;
      case 49:
        if (sp < 1) return done(2);
        if (D[--sp] === 0) pc = nx + im; break;
      case 50:
        if (sp < 1) return done(2);
        if (D[--sp] !== 0) pc = nx + im; break;
      case 51:
        if (cs > 63) return done(7);
        C[cs++] = nx; pc = im & 65535; break;
      case 52:
        if (cs === 0) return done(8);
        pc = C[--cs]; break;
      case 64: {
        if (sp < 1) return done(2);
        const a = D[sp - 1];
        if (a < 0 || a > 255) return done(6);
        D[sp - 1] = M[a]; break;
      }
      case 65: {
        if (sp < 2) return done(2);
        const a = D[sp - 1];
        if (a < 0 || a > 255) return done(6);
        M[a] = D[sp - 2]; sp -= 2; break;
      }
      case 80: {
        if (sp < 1) return done(2);
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (sp < 1) return done(2);
        if (ol > 65535) return done(11);
        out[ol++] = D[--sp] & 255; break;
      case 82:
        if (sp > 255) return done(3);
        D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83:
        if (sp < 1) return done(2);
        return done(D[sp - 1] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), `${r.e}\n`);
}
