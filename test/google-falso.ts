// Emisor de idTokens de prueba: par RSA propio que imita a Google.
import type { JwkGoogle, ObtenerClaves } from '../src/google';

export const CLIENTE = 'cliente-prueba.apps.googleusercontent.com';
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64json = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));
const ALG = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

export interface Emisor {
  jwk: JwkGoogle;
  privada: CryptoKey;
  obtener: ObtenerClaves;
  firmar(carga: object, cab?: object, clave?: CryptoKey): Promise<string>;
}

export async function emisorFalso(kid = 'k1'): Promise<Emisor> {
  const par = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('jwk', par.publicKey)) as JsonWebKey;
  const jwk: JwkGoogle = { kid, kty: 'RSA', n: pub.n!, e: pub.e!, alg: 'RS256' };
  return {
    jwk,
    privada: par.privateKey,
    obtener: async () => [jwk],
    async firmar(carga, cab = { alg: 'RS256', kid, typ: 'JWT' }, clave = par.privateKey) {
      const datos = `${b64json(cab)}.${b64json(carga)}`;
      const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, enc.encode(datos));
      return `${datos}.${b64url(firma)}`;
    },
  };
}

export const cargaGoogle = (ahoraS: number, extra: object = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENTE, sub: 'g-123', email: 'ficticio@ejemplo.cl',
  email_verified: true, name: 'Persona Ficticia', iat: ahoraS - 10, exp: ahoraS + 3600, ...extra,
});
