// HT-RVP-09 Panel de Documentación LAB – v02
// Capa de datos con Firebase (Authentication + Cloud Firestore).
// La configuración web de Firebase NO es secreta: el acceso lo controlan
// las reglas de Firestore (firestore.rules) y los dominios autorizados.

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const ESPERA_CONFIRMACION_MS = 20000;

export async function crearBackendFirebase(cfg) {
    const [{ initializeApp }, A, F] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
    ]);

    const app = initializeApp(cfg);
    const auth = A.getAuth(app);
    await A.setPersistence(auth, A.browserSessionPersistence); // la sesión termina al cerrar el navegador
    const db = F.getFirestore(app);
    const TS = { __ts: true };

    // Convierte Timestamps de Firestore a Date en profundidad
    const aJs = (v) => {
        if (v && typeof v.toDate === 'function') return v.toDate();
        if (Array.isArray(v)) return v.map(aJs);
        if (v && typeof v === 'object') {
            const o = {};
            for (const k of Object.keys(v)) o[k] = aJs(v[k]);
            return o;
        }
        return v;
    };
    // Reemplaza el marcador TS por la hora del servidor
    const aFs = (v) => {
        if (v === TS) return F.serverTimestamp();
        if (v instanceof Date) return F.Timestamp.fromDate(v);
        if (Array.isArray(v)) return v.map(aFs);
        if (v && typeof v === 'object') {
            const o = {};
            for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = aFs(v[k]);
            return o;
        }
        return v;
    };
    const conEspera = (p) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(
            'El servidor no confirmó el guardado. Verifique la conexión a Internet antes de continuar.'), { code: 'sin-confirmacion' })),
            ESPERA_CONFIRMACION_MS)),
    ]);

    return {
        modo: 'firebase',
        proyecto: cfg.projectId,
        TS,

        onAuth(cb) {
            return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
        },
        async login(email, pass) {
            await A.signInWithEmailAndPassword(auth, email, pass);
        },
        async logout() { await A.signOut(auth); },
        async resetPassword(email) { await A.sendPasswordResetEmail(auth, email); },
        async cambiarPassword(actual, nueva) {
            const u = auth.currentUser;
            const cred = A.EmailAuthProvider.credential(u.email, actual);
            await A.reauthenticateWithCredential(u, cred);
            await A.updatePassword(u, nueva);
        },

        async perfil(uid) {
            const s = await F.getDoc(F.doc(db, 'usuarios', uid));
            return s.exists() ? { id: s.id, ...aJs(s.data()) } : null;
        },

        escuchar(col, cb, onError, opciones = {}) {
            let q = F.collection(db, col);
            if (opciones.orden) {
                const partes = [F.orderBy(opciones.orden, opciones.desc ? 'desc' : 'asc')];
                if (opciones.limite) partes.push(F.limit(opciones.limite));
                q = F.query(q, ...partes);
            }
            return F.onSnapshot(q, (snap) => {
                cb(snap.docs.map((d) => ({ id: d.id, ...aJs(d.data()) })), snap.metadata.fromCache);
            }, (err) => onError && onError(err));
        },

        nuevoId(col) { return F.doc(F.collection(db, col)).id; },

        // Escritura atómica de varias operaciones: todas se aplican o ninguna.
        async lote(ops) {
            const b = F.writeBatch(db);
            for (const o of ops) {
                const ref = F.doc(db, o.col, o.id);
                if (o.op === 'set') b.set(ref, aFs(o.data), o.merge ? { merge: true } : undefined);
                else if (o.op === 'update') b.update(ref, aFs(o.data));
                else throw new Error('Operación no soportada: ' + o.op);
            }
            await conEspera(b.commit());
        },

        // Asigna el siguiente código LAB-DOC-#### y guarda las operaciones en la misma transacción.
        async crearConCodigo(construirOps) {
            const refC = F.doc(db, 'contadores', 'documentos');
            return conEspera(F.runTransaction(db, async (tx) => {
                const s = await tx.get(refC);
                const n = s.exists() ? (s.data().siguiente || 1) : 1;
                const codigo = 'LAB-DOC-' + String(n).padStart(4, '0');
                const ops = construirOps(codigo);
                tx.set(refC, { siguiente: n + 1 });
                for (const o of ops) {
                    const ref = F.doc(db, o.col, o.id);
                    if (o.op === 'set') tx.set(ref, aFs(o.data), o.merge ? { merge: true } : undefined);
                    else tx.update(ref, aFs(o.data));
                }
                return codigo;
            }));
        },
    };
}
