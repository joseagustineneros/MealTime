import { describe, it, expect } from 'vitest';
import { firmarSesion, verificarSesion, actorDe, DURACION_SESION_S } from '../src/auth';

const S = 'secreto-de-prueba';
const a = { id: 'u1', rol: 'paciente' as const };

describe('sesiones', () => {
  it('firma y verifica', async () => {
    expect(await verificarSesion(await firmarSesion(a, S), S)).toEqual(a);
  });
  it('rechaza otra clave, token alterado y vencido', async () => {
    const t = await firmarSesion(a, S, 1000);
    expect(await verificarSesion(t, 'otra', 1001)).toBeNull();
    const [c, f] = t.split('.');
    const alterado = (c.slice(0, -2) + (c.endsWith('A') ? 'BB' : 'AA')) + '.' + f;
    expect(await verificarSesion(alterado, S, 1001)).toBeNull();
    expect(await verificarSesion(t, S, 1000 + DURACION_SESION_S)).toBeNull();
    expect(await verificarSesion('basura', S)).toBeNull();
  });
  it('actorDe exige Bearer válido', async () => {
    const t = await firmarSesion(a, S);
    const ok = new Request('https://x/me', { headers: { authorization: `Bearer ${t}` } });
    expect(await actorDe(ok, S)).toEqual(a);
    await expect(actorDe(new Request('https://x/me'), S)).rejects.toThrow(/sesión/);
  });
});
