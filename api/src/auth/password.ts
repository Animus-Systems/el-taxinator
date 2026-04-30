import crypto from "node:crypto";

export type PasswordAlgo = "scrypt";

type ScryptParams = {
  N: number;
  r: number;
  p: number;
  keyLen: number;
};

const DEFAULT_PARAMS: ScryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 32,
};

export const hashPassword = async (password: string): Promise<{ hash: string; algo: PasswordAlgo }> => {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keyLen } = DEFAULT_PARAMS;
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, { N, r, p }, (err, key) => {
      if (err) return reject(err);
      resolve(key as Buffer);
    });
  });

  const saltB64 = salt.toString("base64url");
  const hashB64 = derivedKey.toString("base64url");
  const encoded = `scrypt$${N}$${r}$${p}$${keyLen}$${saltB64}$${hashB64}`;
  return { hash: encoded, algo: "scrypt" };
};

export const verifyPassword = async (encoded: string, password: string): Promise<boolean> => {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 7) return false;
    const [scheme, nStr, rStr, pStr, keyLenStr, saltB64, hashB64] = parts;
    if (scheme !== "scrypt") return false;

    const N = Number.parseInt(nStr ?? "", 10);
    const r = Number.parseInt(rStr ?? "", 10);
    const p = Number.parseInt(pStr ?? "", 10);
    const keyLen = Number.parseInt(keyLenStr ?? "", 10);
    if (![N, r, p, keyLen].every((v) => Number.isFinite(v) && v > 0)) return false;

    const salt = Buffer.from(saltB64 ?? "", "base64url");
    const expected = Buffer.from(hashB64 ?? "", "base64url");
    if (!salt.length || !expected.length) return false;

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, keyLen, { N, r, p }, (err, key) => {
        if (err) return reject(err);
        resolve(key as Buffer);
      });
    });
    if (derivedKey.length !== expected.length) return false;
    return crypto.timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
};
