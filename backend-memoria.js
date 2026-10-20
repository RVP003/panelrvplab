// HT-RVP-09 Panel de Documentación LAB – v02
// Capa de datos en memoria SOLO PARA PRUEBAS (config.MODO_PRUEBA = true en un equipo local).
// Reproduce la interfaz de backend-firebase.js; no guarda nada en el navegador.

export function crearBackendMemoria(usuariosPrueba = []) {
    const TS = { __ts: true };
    const datos = { usuarios: {}, items: {}, documentos: {}, carpetas: {}, bitacora: {}, contadores: {} };
    const cuentas = {};
    const subs = [];
    let authCb = null;
    let actual = null;
    let n = 0;

    usuariosPrueba.forEach((u, i) => {
        const uid = 'uid' + (i + 1);
        cuentas[u.email] = { uid, pass: u.password };
        datos.usuarios[uid] = { nombre: u.nombre, email: u.email, rol: u.rol, activo: true };
    });

    const clonar = (v) => JSON.parse(JSON.stringify(v), (k, x) =>
        (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)) ? new Date(x) : x);
    const resolver = (v) => {
        if (v === TS) return new Date();
        if (v instanceof Date) return v;
        if (Array.isArray(v)) return v.map(resolver);
        if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = resolver(v[k]); return o; }
        return v;
    };
    const lista = (col, op = {}) => {
        let arr = Object.entries(datos[col] || {}).map(([id, d]) => ({ id, ...clonar(d) }));
        if (op.orden) {
            arr.sort((a, b) => (a[op.orden] > b[op.orden] ? 1 : -1) * (op.desc ? -1 : 1));
            if (op.limite) arr = arr.slice(0, op.limite);
        }
        return arr;
    };
    const notificar = () => setTimeout(() => subs.forEach((s) => s.cb(lista(s.col, s.op), false)), 0);
    const aplicar = (o) => {
        datos[o.col] = datos[o.col] || {};
        const prev = datos[o.col][o.id];
        if (o.op === 'update' && !prev) throw new Error('No existe ' + o.col + '/' + o.id);
        if (o.op === 'set' && o.col === 'bitacora' && prev) throw new Error('La bitácora no se modifica');
        datos[o.col][o.id] = (o.op === 'update' || o.merge) ? { ...(prev || {}), ...resolver(o.data) } : resolver(o.data);
    };

    return {
        modo: 'memoria',
        proyecto: 'prueba-local',
        TS,
        _datos: datos,
        onAuth(cb) { authCb = cb; setTimeout(() => cb(actual), 0); return () => { authCb = null; }; },
        async login(email, pass) {
            const c = cuentas[email];
            if (!c || c.pass !== pass) throw Object.assign(new Error('Credenciales inválidas'), { code: 'auth/invalid-credential' });
            actual = { uid: c.uid, email };
            authCb && authCb(actual);
        },
        async logout() { actual = null; authCb && authCb(null); },
        async resetPassword() {},
        async cambiarPassword() {},
        async perfil(uid) { return datos.usuarios[uid] ? { id: uid, ...clonar(datos.usuarios[uid]) } : null; },
        escuchar(col, cb, onError, op = {}) {
            const s = { col, cb, op };
            subs.push(s);
            setTimeout(() => cb(lista(col, op), false), 0);
            return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
        },
        nuevoId(col) { n++; return col.slice(0, 3) + Date.now().toString(36) + n; },
        async lote(ops) {
            const copia = JSON.stringify(datos);
            try { ops.forEach(aplicar); } catch (e) { Object.assign(datos, JSON.parse(copia)); throw e; }
            notificar();
        },
        async crearConCodigo(construirOps) {
            const c = datos.contadores.documentos?.siguiente || 1;
            const codigo = 'LAB-DOC-' + String(c).padStart(4, '0');
            const ops = construirOps(codigo);
            await this.lote([...ops, { op: 'set', col: 'contadores', id: 'documentos', data: { siguiente: c + 1 } }]);
            return codigo;
        },
    };
}
