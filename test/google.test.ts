import { describe, it, expect, beforeAll } from 'vitest';
import { verificarIdToken, type JwkGoogle } from '../src/google';
import { CLIENTE, b64json, cargaGoogle, emisorFalso, type Emisor } from './google-falso';

const AHORA = 1_800_000_000;
let g: Emisor, intruso: Emisor;
beforeAll(async () => { g = await emisorFalso(); intruso = await emisorFalso(); });

const carga = (extra: object = {}) => cargaGoogle(AHORA, extra);
const verificar = (t: string, obtener = g.obtener) => verificarIdToken(t, CLIENTE, obtener, AHORA);

describe('verificarIdToken', () => {
  it('acepta un token válido y devuelve la identidad', async () => {
    expect(await verificar(await g.firmar(carga())))
      .toEqual({ sub: 'g-123', email: 'ficticio@ejemplo.cl', nombre: 'Persona Ficticia' });
    const variante = carga({ iss: 'accounts.google.com', email_verified: 'true', name: undefined });
    expect(await verificar(await g.firmar(variante))).toMatchObject({ sub: 'g-123', nombre: '' });
  });

  it('rechaza firma de otra clave, alg distinto y formato malo', async () => {
    await expect(verificar(await g.firmar(carga(), undefined, intruso.privada))).rejects.toThrow(/firma/);
    const [h, p] = (await g.firmar(carga())).split('.');
    await expect(verificar(`${b64json({ alg: 'none', kid: 'k1' })}.${p}.`)).rejects.toThrow(/algoritmo/);
    await expect(verificar(`${b64json({ alg: 'HS256', kid: 'k1' })}.${p}.AAAA`)).rejects.toThrow(/algoritmo/);
    await expect(verificar('a.b')).rejects.toThrow(/formato/);
    await expect(verificar(`${h}.${p}.@@@`)).rejects.toThrow(/formato|firma/);
  });

  it('rechaza emisor, audiencia, vencido, futuro y correo no verificado', async () => {
    const casos: [object, RegExp][] = [
      [{ iss: 'https://otro.com' }, /emisor/],
      [{ aud: 'otro-cliente' }, /audiencia/],
      [{ exp: AHORA - 61 }, /vencido/],
      [{ iat: AHORA + 600 }, /futuro/],
      [{ email_verified: false }, /no verificado/],
      [{ email: undefined }, /correo/],
      [{ sub: '' }, /sujeto/],
    ];
    for (const [cambio, motivo] of casos) {
      await expect(verificar(await g.firmar(carga(cambio)))).rejects.toThrow(motivo);
    }
  });

  it('tolera 60 s de desfase y acepta aud en lista', async () => {
    expect((await verificar(await g.firmar(carga({ exp: AHORA - 30, aud: ['x', CLIENTE] })))).sub).toBe('g-123');
  });

  it('kid desconocido en caché: recarga claves una sola vez (rotación)', async () => {
    const t = await g.firmar(carga());
    const llamadas: boolean[] = [];
    const vieja: JwkGoogle = { ...g.jwk, kid: 'vieja' };
    const rotada = async (forzar = false) => { llamadas.push(forzar); return forzar ? [g.jwk] : [vieja]; };
    expect((await verificar(t, rotada)).sub).toBe('g-123');
    expect(llamadas).toEqual([false, true]);

    llamadas.length = 0;
    const nunca = async (forzar = false) => { llamadas.push(forzar); return [vieja]; };
    await expect(verificar(t, nunca)).rejects.toThrow(/clave desconocida/);
    expect(llamadas).toEqual([false, true]);
  });

  it('sin GOOGLE_CLIENT_ID falla como error de configuración', async () => {
    await expect(verificarIdToken(await g.firmar(carga()), '', g.obtener, AHORA)).rejects.toThrow(/GOOGLE_CLIENT_ID/);
  });
});
