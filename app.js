// =====================================================================
// HT-RVP-09 Panel de Documentación LAB – Resolución 1619 de 2015
// Versión 02 – RED VITAL PAIPA S.A. E.S.P.
// Cambios frente a la v01 (PE-SIG-SGC-MT-09, incidentes 7 y 50 a 58):
//  - Ingreso con Firebase Authentication (sin contraseñas en el código).
//  - Datos compartidos en Cloud Firestore: evaluaciones, documentos, carpetas
//    y bitácora disponibles en cualquier equipo.
//  - Una carga por evidencia; «Cumple» solo con todas las evidencias y la
//    validación del Líder de Laboratorio.
//  - Documentos con código, versión, huella SHA-256, estado y papelera.
//  - Bitácora inalterable; permisos por perfil aplicados en el servidor.
//  - Migración de los datos de la v01 guardados en cada equipo.
// =====================================================================
import { CHAPTERS } from './datos-1619.js';

const CFG = window.LAB_CONFIG || {};
const APP = CFG.APP || { codigoHT: 'HT-RVP-09', version: '02', fechaVersion: '' };
const MAX_MB = 50;
const EXT_PERMITIDAS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'zip', 'csv'];
const INACTIVIDAD_MIN = 30;
const LEGADO = { items: 'lab_res1619_items', audit: 'lab_res1619_audit', repo: 'lab_repository' };

const ROLES = {
    admin: 'Profesional SIG (Administrador)',
    lider: 'Líder de Laboratorio',
    analista: 'Analista de Laboratorio',
    apoyo: 'Apoyo de Laboratorio',
};
const ESTADOS_ITEM = {
    C: { txt: '✅ Cumple', css: 'cumple', desc: 'Todas las evidencias cargadas y validadas' },
    PV: { txt: '🔎 Por validar', css: 'por-validar', desc: 'Todas las evidencias cargadas; falta la validación del Líder' },
    R: { txt: '↩️ Devuelto', css: 'no-cumple', desc: 'El Líder devolvió el ítem con observaciones' },
    P: { txt: '⏳ Parcial', css: 'pendiente', desc: 'Faltan evidencias por cargar' },
    NC: { txt: '❌ Sin evidencias', css: 'no-cumple', desc: 'No hay evidencias cargadas' },
    NA: { txt: '⏭️ No aplica', css: 'no-aplica', desc: 'Declarado no aplicable por el Líder' },
};
const ESTADOS_DOC = {
    vigente: '🟢 Vigente', obsoleto: '⚪ Obsoleto', papelera: '🗑️ En papelera', por_clasificar: '🟡 Por clasificar',
};
const TIPOS_DOC = {
    evidencia: '📋 Evidencia Res. 1619', reporte: '📄 Reporte interno', resultado_externo: '📤 Resultado externo',
    manual: '📘 Manual', procedimiento: '📋 Procedimiento', certificado: '📜 Certificado', otro: '📁 Otro',
};
const ACCIONES = {
    ingreso: 'Ingreso al panel', cargar_documento: 'Carga de documento', nueva_version: 'Nueva versión',
    papelera: 'Envío a papelera', restaurar: 'Restauración', validar: 'Validación del ítem', devolver: 'Devolución del ítem',
    no_aplica: 'Declaración «No aplica»', quitar_no_aplica: 'Retiro de «No aplica»', observaciones: 'Observaciones',
    crear_carpeta: 'Creación de carpeta', clasificar: 'Clasificación de archivo migrado', usuario: 'Gestión de usuario',
    migracion: 'Migración v01', historico_v01: 'Registro histórico v01',
};

// ---------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------
const S = {
    backend: null, user: null, perfil: null,
    items: {}, docs: [], carpetas: [], bitacora: [], usuarios: [],
    cargado: { items: false, documentos: false, carpetas: false, bitacora: false },
    vista: 'dashboard', capitulo: null, itemAbierto: null, docAbierto: null,
    carpetaActual: null, repoTab: 'documentos', filtroEstado: 'vigentes', busqueda: '',
    filtroBitacora: '', subs: [], enLinea: navigator.onLine, instalar: null, ultimaActividad: Date.now(),
};

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fFecha = (d) => (d instanceof Date && !isNaN(d)) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : (d ? esc(d) : '—');
const fDia = (d = new Date()) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fTam = (b) => !b ? '—' : b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(2) + ' MB';
const yo = () => ({ uid: S.user.uid, nombre: S.perfil.nombre, rol: S.perfil.rol });
const rol = () => S.perfil?.rol;
const esAdmin = () => rol() === 'admin';
const esLider = () => ['lider', 'admin'].includes(rol());
const puedeCargar = () => ['analista', 'apoyo', 'lider', 'admin'].includes(rol());
const puedeRetirar = () => ['analista', 'lider', 'admin'].includes(rol());
const todosLosItems = () => Object.entries(CHAPTERS).flatMap(([cap, c]) => c.items.map((i) => ({ ...i, capitulo: Number(cap) })));
const buscarItem = (codigo) => todosLosItems().find((i) => i.codigo === codigo);
const corto = (h) => h && h.length > 16 ? h.slice(0, 12) + '…' : (h || '—');

function toast(msg, tipo = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast' + (tipo === 'error' ? ' error' : tipo === 'aviso' ? ' aviso' : '');
    t.textContent = msg;
    t.setAttribute('role', 'status');
    $('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 7000 : 3500);
}
function cargando(msg) {
    const o = $('loadingOverlay');
    if (msg === false) { o.classList.remove('active'); return; }
    o.querySelector('span').textContent = msg || 'Procesando...';
    o.classList.add('active');
}
function abrirModal(id) { $(id).classList.add('active'); }
function cerrarModal(id) { $(id).classList.remove('active'); if (id === 'itemModal') S.itemAbierto = null; if (id === 'viewerModal') S.docAbierto = null; }

// Diálogo propio (reemplaza confirm/prompt): devuelve el texto o true; null si cancela.
function dialogo({ titulo, mensaje, campo = null, minimo = 0, ok = 'Aceptar', peligro = false }) {
    return new Promise((resolve) => {
        $('dlgTitulo').textContent = titulo;
        $('dlgMensaje').innerHTML = mensaje;
        const area = $('dlgCampo');
        area.style.display = campo ? 'block' : 'none';
        area.value = '';
        area.placeholder = campo || '';
        const btn = $('dlgOk');
        btn.textContent = ok;
        btn.className = 'btn ' + (peligro ? 'btn-danger' : 'btn-primary');
        const cerrar = (v) => { cerrarModal('dialogModal'); btn.onclick = null; $('dlgCancelar').onclick = null; resolve(v); };
        btn.onclick = () => {
            if (campo) {
                const v = area.value.trim();
                if (v.length < minimo) { toast(`Escriba al menos ${minimo} caracteres.`, 'aviso'); return; }
                cerrar(v);
            } else cerrar(true);
        };
        $('dlgCancelar').onclick = () => cerrar(null);
        abrirModal('dialogModal');
        if (campo) setTimeout(() => area.focus(), 50);
    });
}

function errorTexto(e) {
    const c = e?.code || '';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Correo o contraseña incorrectos.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espere unos minutos o restablezca la contraseña.';
    if (c === 'auth/network-request-failed' || c === 'unavailable') return 'Sin conexión con el servidor. Verifique Internet.';
    if (c === 'permission-denied') return 'Su perfil no tiene permiso para esta acción.';
    if (c === 'sin-confirmacion') return e.message;
    return e?.message || 'Error inesperado.';
}

// ---------------------------------------------------------------------
// Archivos: huella SHA-256 y carga a Cloudinary
// ---------------------------------------------------------------------
async function sha256(blob) {
    const buf = await blob.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function validarArchivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) throw new Error(`Formato «.${ext}» no permitido. Permitidos: ${EXT_PERMITIDAS.join(', ')}.`);
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo supera ${MAX_MB} MB.`);
}
function tipoRecurso(nombre) {
    return /\.(jpe?g|png|gif)$/i.test(nombre) ? 'image' : 'raw';
}
function subirCloudinary(file, carpeta, progreso) {
    const C = CFG.CLOUDINARY || {};
    if (CFG.MODO_PRUEBA) {
        return new Promise((r) => setTimeout(() => r({ url: 'https://ejemplo.invalid/' + encodeURIComponent(file.name), publicId: 'prueba/' + file.name, resourceType: 'raw', bytes: file.size }), 150));
    }
    return new Promise((resolve, reject) => {
        if (!C.cloudName || C.cloudName === 'PEGAR_AQUI') { reject(new Error('Cloudinary no está configurado en config.js.')); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', C.uploadPreset);
        fd.append('folder', `${C.folderBase}/${carpeta}`);
        const rt = tipoRecurso(file.name);
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && progreso) progreso(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => {
            let r = {};
            try { r = JSON.parse(xhr.responseText); } catch (_) { /* respuesta no JSON */ }
            if (xhr.status === 200 && r.secure_url) resolve({ url: r.secure_url, publicId: r.public_id, resourceType: r.resource_type || rt, bytes: r.bytes });
            else reject(new Error(`Cloudinary rechazó el archivo (${xhr.status}${r.error?.message ? ': ' + r.error.message : ''}).`));
        };
        xhr.onerror = () => reject(new Error('Error de red al subir a Cloudinary.'));
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${C.cloudName}/${rt}/upload`);
        xhr.send(fd);
    });
}

// ---------------------------------------------------------------------
// Evaluación de ítems
// ---------------------------------------------------------------------
function docsDe(codigo, evId) {
    return S.docs.filter((d) => d.itemCodigo === codigo && d.evidenciaId === evId);
}
function vigenteDe(codigo, evId) {
    return docsDe(codigo, evId).filter((d) => d.estado === 'vigente').sort((a, b) => b.version - a.version)[0] || null;
}
function porClasificarDe(codigo) {
    return S.docs.filter((d) => d.itemCodigo === codigo && d.estado === 'por_clasificar');
}
function estadoItem(item) {
    const d = S.items[item.codigo] || {};
    if (d.noAplica) return 'NA';
    const total = item.evidencias.length;
    const cargadas = item.evidencias.filter((ev) => vigenteDe(item.codigo, ev.id)).length;
    if (cargadas === 0) return 'NC';
    if (cargadas < total) return 'P';
    const v = d.validacion?.estado;
    if (v === 'validado') return 'C';
    if (v === 'rechazado') return 'R';
    return 'PV';
}
function resumen(items = todosLosItems()) {
    const r = { total: items.length, C: 0, PV: 0, R: 0, P: 0, NC: 0, NA: 0, evTotal: 0, evCargadas: 0 };
    items.forEach((i) => {
        r[estadoItem(i)]++;
        if (!(S.items[i.codigo]?.noAplica)) {
            r.evTotal += i.evidencias.length;
            r.evCargadas += i.evidencias.filter((ev) => vigenteDe(i.codigo, ev.id)).length;
        }
    });
    const base = r.total - r.NA;
    r.pct = base > 0 ? Math.round(r.C / base * 100) : 0;
    r.pctEv = r.evTotal > 0 ? Math.round(r.evCargadas / r.evTotal * 100) : 0;
    return r;
}
const badgeEstado = (e) => `<span class="status-badge ${ESTADOS_ITEM[e].css}" title="${esc(ESTADOS_ITEM[e].desc)}">${ESTADOS_ITEM[e].txt}</span>`;

// ---------------------------------------------------------------------
// Escrituras (todas confirmadas por el servidor)
// ---------------------------------------------------------------------
function opBitacora(accion, datos = {}) {
    return {
        op: 'set', col: 'bitacora', id: S.backend.nuevoId('bitacora'),
        data: { accion, entidad: datos.entidad || '', entidadId: datos.entidadId || '', codigo: datos.codigo || '',
            itemCodigo: datos.itemCodigo || '', detalle: datos.detalle || '', usuario: yo(), fecha: S.backend.TS },
    };
}
function opItem(codigo, cambios) {
    const existe = !!S.items[codigo];
    const base = existe ? {} : { codigo, noAplica: false, observaciones: '', validacion: { estado: 'sin_validar' } };
    return { op: 'set', col: 'items', id: codigo, merge: true,
        data: { ...base, ...cambios, actualizadoPor: yo(), actualizadoEn: S.backend.TS } };
}
function exigirConexion() {
    if (!S.enLinea) throw new Error('Sin conexión a Internet: la acción no se puede confirmar con el servidor.');
}

// Carga un archivo como documento nuevo o como nueva versión de uno existente.
async function subirDocumento({ file, nombre, tipo, descripcion = '', carpetaId = null, itemCodigo = null, evidenciaId = null,
    reemplaza = null, estado = 'vigente', origen = null, omitirDuplicado = false }) {
    exigirConexion();
    validarArchivo(file);
    const hash = await sha256(file);
    if (!omitirDuplicado) {
        const dup = S.docs.find((d) => d.archivo?.sha256 === hash && d.estado !== 'papelera');
        if (dup) {
            const seguir = await dialogo({ titulo: 'Archivo ya cargado',
                mensaje: `Este mismo archivo ya está en el panel como <b>${esc(dup.codigo)}</b> v${dup.version} (${esc(dup.nombre)}, ${ESTADOS_DOC[dup.estado]}).<br>¿Desea cargarlo de todas formas?`,
                ok: 'Cargar de todas formas' });
            if (!seguir) return null;
        }
    }
    const item = itemCodigo ? buscarItem(itemCodigo) : null;
    const carpetaCloud = item ? `evidencias/cap${item.capitulo}` : 'repositorio';
    cargando(`Subiendo «${file.name}»...`);
    try {
        const up = await subirCloudinary(file, carpetaCloud, (p) => cargando(`Subiendo «${file.name}»... ${p}%`));
        cargando('Registrando en el servidor...');
        const id = S.backend.nuevoId('documentos');
        const version = reemplaza ? (reemplaza.version || 1) + 1 : 1;
        const construir = (codigo) => {
            const ops = [{
                op: 'set', col: 'documentos', id,
                data: {
                    codigo, nombre, tipo, descripcion, carpetaId, itemCodigo, evidenciaId,
                    capitulo: item ? item.capitulo : null, version, estado,
                    serie: reemplaza ? (reemplaza.serie || reemplaza.id) : id, reemplazaA: reemplaza ? reemplaza.id : null,
                    archivo: { nombre: file.name, tamano: file.size, mime: file.type || '', sha256: hash,
                        url: up.url, publicId: up.publicId, resourceType: up.resourceType, almacenamiento: 'cloudinary' },
                    cargadoPor: yo(), cargadoEn: S.backend.TS, origen: origen || { tipo: 'carga' },
                },
            }];
            if (reemplaza) ops.push({ op: 'update', col: 'documentos', id: reemplaza.id, data: { estado: 'obsoleto', reemplazadoPor: id, obsoletoEn: S.backend.TS } });
            if (itemCodigo && estado === 'vigente' && !S.items[itemCodigo]?.noAplica) {
                ops.push(opItem(itemCodigo, { validacion: { estado: 'sin_validar', motivo: `Nueva evidencia ${codigo} v${version}` } }));
            }
            ops.push(opBitacora(reemplaza ? 'nueva_version' : (origen?.tipo === 'migracion_v01' ? 'migracion' : 'cargar_documento'), {
                entidad: 'documento', entidadId: id, codigo, itemCodigo: itemCodigo || '',
                detalle: `${nombre} – v${version} – ${file.name} (${fTam(file.size)}) – SHA-256 ${hash.slice(0, 16)}…` }));
            return ops;
        };
        let codigo;
        if (reemplaza) { codigo = reemplaza.codigo; await S.backend.lote(construir(codigo)); }
        else codigo = await S.backend.crearConCodigo(construir);
        toast(`✅ Guardado y confirmado por el servidor: ${codigo} v${version}`);
        return { id, codigo, version };
    } finally { cargando(false); }
}

// ---------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------
async function iniciar() {
    pintarPie();
    registrarServiceWorker();
    escucharConexion();
    if (CFG.MODO_PRUEBA) {
        const { crearBackendMemoria } = await import('./backend-memoria.js');
        S.backend = crearBackendMemoria(CFG.USUARIOS_PRUEBA || []);
        $('modoPrueba').style.display = 'block';
    } else {
        const fb = CFG.FIREBASE || {};
        if (!fb.apiKey || fb.apiKey === 'PEGAR_AQUI') {
            $('loginError').textContent = '⚙️ El panel no está configurado (config.js). Contacte al Profesional SIG.';
            $('loginError').style.display = 'block';
            return;
        }
        try {
            const { crearBackendFirebase } = await import('./backend-firebase.js');
            S.backend = await crearBackendFirebase(fb);
        } catch (e) {
            console.error(e);
            $('loginError').textContent = '❌ No se pudo conectar con el servidor. Verifique la conexión a Internet y recargue la página.';
            $('loginError').style.display = 'block';
            return;
        }
    }
    S.backend.onAuth(async (u) => {
        if (!u) { mostrarLogin(); return; }
        try {
            const p = await S.backend.perfil(u.uid);
            if (!p || p.activo !== true) {
                await S.backend.logout();
                mostrarLogin('Su cuenta no tiene un perfil activo en el panel. Solicite al Profesional SIG que la habilite.');
                return;
            }
            S.user = u; S.perfil = p;
            entrarApp();
        } catch (e) {
            console.error(e);
            mostrarLogin(errorTexto(e));
        }
    });
}

function mostrarLogin(msg) {
    detenerSuscripciones();
    S.user = null; S.perfil = null;
    S.items = {}; S.docs = []; S.carpetas = []; S.bitacora = []; S.usuarios = []; S.migLog = '';
    S.cargado = { items: false, documentos: false, carpetas: false, bitacora: false };
    ['itemModal', 'viewerModal', 'repoModal', 'dialogModal'].forEach((m) => $(m).classList.remove('active'));
    $('mainApp').style.display = 'none';
    $('loginOverlay').style.display = 'flex';
    $('loginPass').value = '';
    $('loginBtn').disabled = false;
    $('loginBtnTxt').textContent = 'Ingresar';
    const err = $('loginError');
    if (msg) { err.textContent = msg; err.style.display = 'block'; } else err.style.display = 'none';
}

async function login() {
    const email = $('loginUser').value.trim();
    const pass = $('loginPass').value;
    if (!email || !pass) { mostrarLogin('Escriba su correo y su contraseña.'); $('loginUser').value = email; return; }
    if (!S.backend) return;
    $('loginBtn').disabled = true;
    try {
        await S.backend.login(email, pass);
        S.ingresoPendiente = true;
    } catch (e) { mostrarLogin(errorTexto(e)); $('loginUser').value = email; }
    finally { $('loginBtn').disabled = false; }
}

async function olvido() {
    const email = $('loginUser').value.trim();
    if (!email) { mostrarLogin('Escriba su correo institucional y vuelva a seleccionar «¿Olvidó su contraseña?».'); return; }
    try { await S.backend.resetPassword(email); toast('📧 Si el correo está registrado, recibirá un enlace para restablecer la contraseña.'); }
    catch (e) { toast(errorTexto(e), 'error'); }
}

async function cerrarSesion(motivo) {
    if (motivo !== 'inactividad') {
        const ok = await dialogo({ titulo: 'Cerrar sesión', mensaje: '¿Desea cerrar la sesión en este equipo?', ok: 'Cerrar sesión' });
        if (!ok) return;
    }
    await S.backend.logout();
    if (motivo === 'inactividad') toast(`🔒 Sesión cerrada por ${INACTIVIDAD_MIN} minutos de inactividad.`, 'aviso');
}

function entrarApp() {
    $('loginOverlay').style.display = 'none';
    $('mainApp').style.display = 'block';
    $('userNameBadge').textContent = S.perfil.nombre;
    $('userRoleBadge').textContent = ROLES[rol()] || rol();
    $('userRoleBadge').dataset.rol = rol();
    $('footerUserSpan').textContent = `👤 ${S.perfil.nombre}`;
    document.querySelectorAll('[data-solo]').forEach((el) => {
        const req = el.dataset.solo;
        el.style.display = (req === 'admin' && esAdmin()) || (req === 'lider' && esLider()) || (req === 'cargar' && puedeCargar()) ? '' : 'none';
    });
    iniciarSuscripciones();
    if (S.ingresoPendiente) {
        S.ingresoPendiente = false;
        S.backend.lote([opBitacora('ingreso', { entidad: 'sesion', detalle: `${navigator.userAgent.includes('Windows') ? 'Windows' : 'Otro sistema'} – ${location.host}` })]).catch(() => {});
    }
    irA('dashboard');
    toast(`Bienvenido(a), ${S.perfil.nombre}`);
}

function iniciarSuscripciones() {
    detenerSuscripciones();
    const err = (col) => (e) => { console.error(col, e); toast(`No se pudo leer «${col}»: ${errorTexto(e)}`, 'error'); };
    const sub = (col, fn, op) => S.subs.push(S.backend.escuchar(col, (arr) => { fn(arr); S.cargado[col] = true; refrescar(col); }, err(col), op));
    sub('items', (arr) => { S.items = Object.fromEntries(arr.map((x) => [x.id, x])); });
    sub('documentos', (arr) => { S.docs = arr; });
    sub('carpetas', (arr) => { S.carpetas = arr; });
    sub('bitacora', (arr) => { S.bitacora = arr; }, { orden: 'fecha', desc: true, limite: 2000 });
    if (esAdmin()) sub('usuarios', (arr) => { S.usuarios = arr; });
}
function detenerSuscripciones() { S.subs.forEach((u) => { try { u(); } catch (_) { /* ya cerrada */ } }); S.subs = []; }

let refrescoPendiente = null;
function refrescar() {
    clearTimeout(refrescoPendiente);
    refrescoPendiente = setTimeout(() => {
        actualizarBadges();
        const foco = document.activeElement;
        const escribiendo = foco && $('dynamicContent').contains(foco) && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName);
        if (escribiendo) S.renderPendiente = true;
        else if (!$('dialogModal').classList.contains('active')) render();
        if (S.itemAbierto) pintarItemModal();
        if (S.docAbierto) pintarVisor();
    }, 60);
}

document.addEventListener('focusout', (e) => {
    if (S.renderPendiente && $('dynamicContent').contains(e.target)) {
        setTimeout(() => { const f = document.activeElement; if (!(f && $('dynamicContent').contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) { S.renderPendiente = false; render(); } }, 200);
    }
});

// Cierre por inactividad (equipos compartidos)
['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { S.ultimaActividad = Date.now(); }, { passive: true }));
setInterval(() => {
    if (S.user && Date.now() - S.ultimaActividad > INACTIVIDAD_MIN * 60000) cerrarSesion('inactividad');
}, 30000);

// ---------------------------------------------------------------------
// Navegación y vistas
// ---------------------------------------------------------------------
function irA(vista, capitulo = null) {
    S.vista = vista; S.capitulo = capitulo;
    if (vista === 'repository') { S.carpetaActual = null; }
    document.querySelectorAll('.nav-item').forEach((n) => {
        n.classList.toggle('active', n.dataset.view === vista && (vista !== 'chapter' || Number(n.dataset.chapter) === capitulo));
    });
    if (window.innerWidth <= 768) $('sidebar').classList.remove('open');
    render();
    window.scrollTo(0, 0);
}
function render() {
    if (!S.user) return;
    const v = S.vista;
    const listo = S.cargado.items && S.cargado.documentos;
    if (!listo && v !== 'admin') { $('dynamicContent').innerHTML = '<div class="audit-empty"><div class="cloud-loading"></div> Cargando datos del servidor...</div>'; return; }
    if (v === 'dashboard') vistaDashboard();
    else if (v === 'chapter') vistaCapitulo(S.capitulo);
    else if (v === 'repository') vistaRepositorio();
    else if (v === 'audit') vistaBitacora();
    else if (v === 'certificate') vistaAutoevaluacion();
    else if (v === 'reports') vistaReportes();
    else if (v === 'admin') vistaAdmin();
}
function titulo(t, sub) { $('pageTitle').textContent = t; $('pageSubtitle').textContent = sub; }

function actualizarBadges() {
    for (const cap in CHAPTERS) {
        const r = resumen(CHAPTERS[cap].items.map((i) => ({ ...i, capitulo: Number(cap) })));
        const b = $(`ch${cap}badge`);
        if (b) b.textContent = `${r.C + r.NA}/${r.total}`;
    }
    $('dashboardBadge').textContent = resumen().pct + '%';
    $('repoBadge').textContent = S.docs.filter((d) => d.estado === 'vigente' || d.estado === 'por_clasificar').length;
    $('auditBadge').textContent = S.bitacora.length;
}

function vistaDashboard() {
    const r = resumen();
    const color = r.pct >= 80 ? '#0d7a6b' : r.pct >= 50 ? '#d97706' : '#dc2626';
    const legado = esAdmin() && hayLegadoLocal();
    const pend = S.docs.filter((d) => d.estado === 'por_clasificar').length;
    let h = '';
    if (legado) h += `<div class="aviso-box">📦 Este navegador tiene datos de la versión 01 del panel. <button class="btn btn-primary btn-sm" data-accion="ir" data-vista="admin">Ir a Migración</button></div>`;
    if (pend) h += `<div class="aviso-box">🟡 Hay ${pend} archivo(s) migrado(s) por clasificar en su evidencia. Ábralos desde el ítem correspondiente.</div>`;
    h += `
    <div class="stats-grid">
        <div class="stat-card green"><div class="icon">✅</div><div class="number">${r.C}</div><div class="label">Cumplen (validados)</div></div>
        <div class="stat-card blue"><div class="icon">🔎</div><div class="number">${r.PV}</div><div class="label">Por validar</div></div>
        <div class="stat-card yellow"><div class="icon">⏳</div><div class="number">${r.P + r.R}</div><div class="label">Parciales / devueltos</div></div>
        <div class="stat-card red"><div class="icon">❌</div><div class="number">${r.NC}</div><div class="label">Sin evidencias</div></div>
        <div class="stat-card"><div class="icon">⏭️</div><div class="number">${r.NA}</div><div class="label">No aplica</div></div>
        <div class="stat-card blue"><div class="icon">📎</div><div class="number">${r.pctEv}%</div><div class="label">Evidencias (${r.evCargadas}/${r.evTotal})</div></div>
    </div>
    <div class="certificate-box" style="border-color:${color}">
        <div class="certificate-percentage" style="color:${color}">${r.pct}%</div>
        <div class="certificate-subtitle">Ítems que cumplen y están validados, sobre ${r.total - r.NA} ítems aplicables – Resolución 1619 de 2015</div>
        <div class="certificate-footer">Autoevaluación interna. No reemplaza la verificación de la autoridad sanitaria.</div>
    </div>
    <h3 class="dashboard-title">📋 Capítulos de la Resolución 1619 de 2015</h3>
    <div class="chapter-grid">`;
    for (const cap in CHAPTERS) {
        const c = CHAPTERS[cap];
        const rc = resumen(c.items.map((i) => ({ ...i, capitulo: Number(cap) })));
        h += `<div class="chapter-card" data-accion="capitulo" data-cap="${cap}" tabindex="0">
            <div class="chapter-card-header"><span class="title"><i class="fas ${esc(c.icon)}"></i> Capítulo ${cap}</span><span class="text-muted">${rc.C}/${rc.total - rc.NA}</span></div>
            <div class="chapter-name">${esc(c.name)}</div>
            <div class="chapter-stats"><span>✅ ${rc.pct}%</span><span>📎 ${rc.pctEv}%</span><span>🔎 ${rc.PV}</span></div>
            <div class="chapter-progress"><div class="chapter-progress-bar" style="width:${rc.pct}%"></div></div>
        </div>`;
    }
    h += `</div><h3 class="dashboard-title">🔄 Últimas actividades</h3>${tablaBitacora(S.bitacora.slice(0, 10))}`;
    $('dynamicContent').innerHTML = h;
    titulo('LABORATORIO', 'Sistema de gestión de calidad del laboratorio de agua potable – Resolución 1619 de 2015');
}

function vistaCapitulo(cap) {
    const c = CHAPTERS[cap];
    if (!c) return;
    let h = `<div class="header-info"><div><h2 class="info-title"><i class="fas ${esc(c.icon)}"></i> Capítulo ${cap}: ${esc(c.name)}</h2>
        <p class="info-subtitle">${c.items.length} requisitos – haga clic en un requisito para ver y cargar sus evidencias</p></div>
        <div><button class="btn btn-success btn-sm" data-accion="pdf-capitulo" data-cap="${cap}"><i class="fas fa-file-pdf"></i> Exportar PDF</button></div></div>
        <div class="table-container"><div class="table-wrapper"><table>
        <thead><tr><th>Código</th><th>Tipo</th><th>Requisito</th><th>Estado</th><th>Evidencias</th></tr></thead><tbody>`;
    c.items.forEach((i) => {
        const e = estadoItem(i);
        const n = i.evidencias.filter((ev) => vigenteDe(i.codigo, ev.id)).length;
        const pct = Math.round(n / i.evidencias.length * 100);
        const pc = porClasificarDe(i.codigo).length;
        h += `<tr class="table-row-cursor" data-accion="item" data-codigo="${esc(i.codigo)}" tabindex="0">
            <td><span class="codigo">${esc(i.codigo)}</span></td>
            <td>${i.tipo === 'A' ? '🔴 A' : i.tipo === 'B' ? '🟡 B' : '🔵 C'}</td>
            <td class="table-text">${esc(i.requisito)}${pc ? ` <span class="status-badge pendiente">🟡 ${pc} por clasificar</span>` : ''}</td>
            <td>${badgeEstado(e)}</td>
            <td><div class="table-progress-container"><span class="table-progress-number">${n}/${i.evidencias.length}</span>
                <div class="table-progress-bar"><div class="table-progress-fill" style="width:${pct}%;background:${pct === 100 ? '#0d7a6b' : pct > 0 ? '#d97706' : '#dc2626'}"></div></div></div></td>
        </tr>`;
    });
    h += '</tbody></table></div></div>';
    $('dynamicContent').innerHTML = h;
    titulo(`Capítulo ${cap}: ${c.name}`, `${c.items.length} requisitos de evaluación`);
}

// ---------------------------------------------------------------------
// Modal de ítem: evidencias, observaciones y validación
// ---------------------------------------------------------------------
function abrirItem(codigo) {
    S.itemAbierto = codigo;
    pintarItemModal();
    abrirModal('itemModal');
}
function pintarItemModal() {
    const item = buscarItem(S.itemAbierto);
    if (!item) return;
    const d = S.items[item.codigo] || {};
    const e = estadoItem(item);
    $('modalTitle').textContent = `📋 Ítem ${item.codigo} – Capítulo ${item.capitulo}`;
    let h = `<div class="form-group"><label>Requisito (tipo ${esc(item.tipo)})</label><div class="readonly-box">${esc(item.requisito)}</div></div>
        <div class="form-group"><label>Modo de verificación</label><div class="readonly-box">${esc(item.modoVerificacion)}</div></div>
        <div class="auto-evaluation-box estado-${ESTADOS_ITEM[e].css}"><div class="auto-eval-text">${ESTADOS_ITEM[e].txt}</div>
        <div class="auto-eval-detail">${esc(ESTADOS_ITEM[e].desc)}${d.validacion?.estado && d.validacion.estado !== 'sin_validar' ? ` – ${esc(d.validacion.por?.nombre || '')}, ${fFecha(d.validacion.en)}${d.validacion.comentario ? ': «' + esc(d.validacion.comentario) + '»' : ''}` : ''}
        ${d.noAplica ? `<br>Justificación: «${esc(d.justificacionNA || '')}»` : ''}</div></div>
        <div class="form-group"><label>📋 Evidencias requeridas (una carga por evidencia)</label>
        <table class="ev-table"><thead><tr><th>Evidencia</th><th>Documento vigente</th><th>Acciones</th></tr></thead><tbody>`;
    item.evidencias.forEach((ev) => {
        const v = vigenteDe(item.codigo, ev.id);
        const nVers = docsDe(item.codigo, ev.id).filter((x) => x.estado !== 'por_clasificar').length;
        h += `<tr class="${v ? 'ev-ok' : 'ev-falta'}"><td>${v ? '✅' : '⬜'} ${esc(ev.nombre)}</td>
            <td>${v ? `<a href="#" data-accion="ver-doc" data-id="${esc(v.id)}"><b>${esc(v.codigo)}</b> v${v.version}</a><br><small>${esc(v.archivo?.nombre)} · ${esc(v.cargadoPor?.nombre)} · ${fFecha(v.cargadoEn)}</small>` : '<span class="text-danger">Sin cargar</span>'}</td>
            <td class="ev-acciones">${puedeCargar() && !d.noAplica ? `<button type="button" class="btn btn-primary btn-sm" data-accion="cargar-ev" data-ev="${esc(ev.id)}">${v ? '🔁 Nueva versión' : '📤 Cargar'}</button>` : ''}
            ${nVers > 1 ? `<button type="button" class="btn btn-secondary btn-sm" data-accion="historial" data-id="${esc(v ? v.id : '')}" data-codigo="${esc(item.codigo)}" data-ev="${esc(ev.id)}">🕘 ${nVers} versiones</button>` : ''}</td></tr>`;
    });
    h += '</tbody></table></div>';
    const pc = porClasificarDe(item.codigo);
    if (pc.length) {
        h += `<div class="form-group"><label>🟡 Archivos migrados de la versión 01 por clasificar</label><div class="help-text">La v01 no indicaba a qué evidencia correspondía cada archivo. Ábralo, verifique su contenido y asígnelo a la evidencia correcta.</div>
            <table class="ev-table"><tbody>`;
        pc.forEach((doc) => {
            h += `<tr><td><a href="#" data-accion="ver-doc" data-id="${esc(doc.id)}">${esc(doc.codigo)}</a> · ${esc(doc.archivo?.nombre)}<br><small>${esc(doc.origen?.equipo || '')} · ${esc(doc.origen?.fechaOriginal || '')}</small></td>
                <td>${puedeCargar() ? `<select class="input-inline" id="cls-${esc(doc.id)}">${item.evidencias.map((ev) => `<option value="${esc(ev.id)}">${esc(ev.nombre)}</option>`).join('')}</select>` : ''}</td>
                <td>${puedeCargar() ? `<button type="button" class="btn btn-success btn-sm" data-accion="clasificar" data-id="${esc(doc.id)}">Asignar</button>` : ''}</td></tr>`;
        });
        h += '</tbody></table></div>';
    }
    h += `<div class="form-group"><label>Observaciones</label>
        <textarea id="itemObservaciones" rows="3" class="modal-textarea" ${puedeCargar() ? '' : 'readonly'}>${esc(d.observaciones || '')}</textarea>
        ${d.actualizadoPor ? `<div class="help-text">Última actualización: ${esc(d.actualizadoPor.nombre)} – ${fFecha(d.actualizadoEn)}</div>` : ''}</div>`;
    let botones = '';
    if (puedeCargar()) botones += `<button type="button" class="btn btn-secondary" data-accion="guardar-obs">💾 Guardar observaciones</button>`;
    if (esLider()) {
        if (d.noAplica) botones += `<button type="button" class="btn btn-secondary" data-accion="quitar-na">Quitar «No aplica»</button>`;
        else {
            botones += `<button type="button" class="btn btn-secondary" data-accion="no-aplica">⏭️ Declarar «No aplica»</button>`;
            if (e === 'PV' || e === 'C' || e === 'R') {
                if (e !== 'C') botones += `<button type="button" class="btn btn-success" data-accion="validar">✅ Validar ítem</button>`;
                botones += `<button type="button" class="btn btn-danger" data-accion="devolver">↩️ Devolver</button>`;
            }
        }
    }
    const previo = $('itemObservaciones');
    const textoSinGuardar = previo && previo.dataset.codigo === item.codigo && previo.value !== (previo.dataset.guardado || '') ? previo.value : null;
    $('itemBody').innerHTML = h;
    const obs = $('itemObservaciones');
    obs.dataset.codigo = item.codigo; obs.dataset.guardado = d.observaciones || '';
    if (textoSinGuardar !== null) obs.value = textoSinGuardar;
    $('itemButtons').innerHTML = `<button type="button" class="btn btn-secondary" data-accion="cerrar" data-modal="itemModal">Cerrar</button>${botones}`;
}

let cargaPendiente = null;
function pedirArchivo(destino) {
    cargaPendiente = destino;
    const inp = $('fileInput');
    inp.value = '';
    inp.click();
}
async function alElegirArchivo(file) {
    const dest = cargaPendiente; cargaPendiente = null;
    if (!dest || !file) return;
    try {
        if (dest.tipo === 'evidencia') {
            const item = buscarItem(dest.codigo);
            const ev = item.evidencias.find((x) => x.id === dest.ev);
            const prev = vigenteDe(item.codigo, ev.id);
            await subirDocumento({ file, nombre: `${item.codigo} – ${ev.nombre}`, tipo: 'evidencia', itemCodigo: item.codigo, evidenciaId: ev.id, reemplaza: prev });
        } else if (dest.tipo === 'version') {
            await subirDocumento({ file, nombre: dest.doc.nombre, tipo: dest.doc.tipo, descripcion: dest.doc.descripcion, carpetaId: dest.doc.carpetaId,
                itemCodigo: dest.doc.itemCodigo, evidenciaId: dest.doc.evidenciaId, reemplaza: dest.doc });
        }
    } catch (e) { console.error(e); toast(errorTexto(e), 'error'); }
}

async function guardarObservaciones() {
    const codigo = S.itemAbierto;
    const txt = $('itemObservaciones').value.trim();
    try {
        exigirConexion();
        cargando('Guardando...');
        await S.backend.lote([opItem(codigo, { observaciones: txt }), opBitacora('observaciones', { entidad: 'item', entidadId: codigo, itemCodigo: codigo, detalle: txt.slice(0, 300) })]);
        toast('✅ Observaciones guardadas y confirmadas por el servidor');
    } catch (e) { toast(errorTexto(e), 'error'); } finally { cargando(false); }
}
async function validarItem(accion) {
    const codigo = S.itemAbierto;
    let comentario = '';
    if (accion === 'devolver') {
        comentario = await dialogo({ titulo: `Devolver ítem ${codigo}`, mensaje: 'Indique qué debe corregirse o completarse.', campo: 'Observación para el Analista', minimo: 5, ok: 'Devolver', peligro: true });
        if (!comentario) return;
    } else {
        const ok = await dialogo({ titulo: `Validar ítem ${codigo}`, mensaje: 'Confirme que revisó cada evidencia vigente y que cumple el requisito de la Resolución 1619 de 2015.', ok: 'Validar' });
        if (!ok) return;
    }
    try {
        exigirConexion();
        cargando('Guardando...');
        const estado = accion === 'validar' ? 'validado' : 'rechazado';
        await S.backend.lote([opItem(codigo, { validacion: { estado, por: yo(), en: S.backend.TS, comentario } }),
            opBitacora(accion === 'validar' ? 'validar' : 'devolver', { entidad: 'item', entidadId: codigo, itemCodigo: codigo, detalle: comentario })]);
        toast(accion === 'validar' ? '✅ Ítem validado' : '↩️ Ítem devuelto al Analista');
    } catch (e) { toast(errorTexto(e), 'error'); } finally { cargando(false); }
}
async function noAplica(quitar) {
    const codigo = S.itemAbierto;
    let just = '';
    if (!quitar) {
        just = await dialogo({ titulo: `«No aplica» – ítem ${codigo}`, mensaje: 'Justifique por qué el requisito no aplica al laboratorio.', campo: 'Justificación', minimo: 10, ok: 'Declarar' });
        if (!just) return;
    }
    try {
        exigirConexion();
        cargando('Guardando...');
        await S.backend.lote([opItem(codigo, { noAplica: !quitar, justificacionNA: just, validacion: { estado: 'sin_validar' } }),
            opBitacora(quitar ? 'quitar_no_aplica' : 'no_aplica', { entidad: 'item', entidadId: codigo, itemCodigo: codigo, detalle: just })]);
        toast('✅ Guardado');
    } catch (e) { toast(errorTexto(e), 'error'); } finally { cargando(false); }
}
async function clasificar(docId) {
    const doc = S.docs.find((d) => d.id === docId);
    const evId = $(`cls-${docId}`)?.value;
    if (!doc || !evId) return;
    const item = buscarItem(doc.itemCodigo);
    const ev = item.evidencias.find((x) => x.id === evId);
    const prev = vigenteDe(doc.itemCodigo, evId);
    const ok = await dialogo({ titulo: 'Asignar archivo migrado', mensaje: `Asignar <b>${esc(doc.codigo)}</b> (${esc(doc.archivo?.nombre)}) a la evidencia «${esc(ev.nombre)}»${prev ? `. Reemplazará a ${esc(prev.codigo)} v${prev.version}, que quedará obsoleta` : ''}.`, ok: 'Asignar' });
    if (!ok) return;
    try {
        exigirConexion();
        cargando('Guardando...');
        const version = prev ? prev.version + 1 : 1;
        const ops = [{ op: 'update', col: 'documentos', id: doc.id, data: { estado: 'vigente', evidenciaId: evId, version, serie: prev ? (prev.serie || prev.id) : doc.id, reemplazaA: prev ? prev.id : null, clasificado: { por: yo(), en: S.backend.TS } } }];
        if (prev) ops.push({ op: 'update', col: 'documentos', id: prev.id, data: { estado: 'obsoleto', reemplazadoPor: doc.id, obsoletoEn: S.backend.TS } });
        ops.push(opItem(doc.itemCodigo, { validacion: { estado: 'sin_validar', motivo: `Archivo migrado ${doc.codigo} asignado` } }));
        ops.push(opBitacora('clasificar', { entidad: 'documento', entidadId: doc.id, codigo: doc.codigo, itemCodigo: doc.itemCodigo, detalle: `Asignado a «${ev.nombre}» como v${version}` }));
        await S.backend.lote(ops);
        toast('✅ Archivo asignado a la evidencia');
    } catch (e) { toast(errorTexto(e), 'error'); } finally { cargando(false); }
}

// ---------------------------------------------------------------------
// Repositorio documental
// ---------------------------------------------------------------------
function carpetaRuta(id) {
    const ruta = [];
    let c = S.carpetas.find((x) => x.id === id);
    while (c) { ruta.unshift(c); c = S.carpetas.find((x) => x.id === c.parent); }
    return ruta;
}
function filtrarDocs(lista) {
    const f = S.filtroEstado;
    let r = lista.filter((d) => f === 'todos' ? (d.estado !== 'papelera' || esLider()) : f === 'vigentes' ? d.estado === 'vigente' : d.estado === f);
    const q = S.busqueda.trim().toLowerCase();
    if (q) r = r.filter((d) => [d.codigo, d.nombre, d.descripcion, d.archivo?.nombre, d.itemCodigo, d.cargadoPor?.nombre].join(' ').toLowerCase().includes(q));
    return r.sort((a, b) => (a.codigo > b.codigo ? 1 : -1) || b.version - a.version);
}
function filaDoc(d, conItem) {
    const ext = (d.archivo?.nombre || '').split('.').pop().toLowerCase();
    const cls = ext === 'pdf' ? 'type-pdf' : /xlsx?|csv/.test(ext) ? 'type-excel' : /docx?/.test(ext) ? 'type-word' : /jpe?g|png|gif/.test(ext) ? 'type-image' : ext === 'zip' ? 'type-zip' : 'type-other';
    return `<tr class="repo-row" data-accion="ver-doc" data-id="${esc(d.id)}" tabindex="0">
        <td><span class="codigo">${esc(d.codigo)}</span> <small>v${d.version}</small></td>
        <td>${esc(d.nombre)}${d.descripcion ? `<br><small class="text-muted">${esc(d.descripcion)}</small>` : ''}</td>
        ${conItem ? `<td>${d.itemCodigo ? `<span class="codigo">${esc(d.itemCodigo)}</span>` : '—'}</td>` : ''}
        <td><span class="repo-file-type-badge ${cls}">${esc(ext || '—')}</span> ${fTam(d.archivo?.tamano)}</td>
        <td>${esc(d.cargadoPor?.nombre)}<br><small>${fFecha(d.cargadoEn)}</small></td>
        <td>${ESTADOS_DOC[d.estado] || esc(d.estado)}</td></tr>`;
}
function vistaRepositorio() {
    const tab = S.repoTab;
    const filtros = `<div class="repo-filtros">
        <input type="search" id="repoBuscar" class="input-inline" placeholder="🔍 Buscar por código, nombre, archivo, ítem o usuario" value="${esc(S.busqueda)}">
        <select id="repoEstado" class="input-inline">
            <option value="vigentes" ${S.filtroEstado === 'vigentes' ? 'selected' : ''}>Vigentes</option>
            <option value="obsoleto" ${S.filtroEstado === 'obsoleto' ? 'selected' : ''}>Obsoletos (versiones anteriores)</option>
            <option value="por_clasificar" ${S.filtroEstado === 'por_clasificar' ? 'selected' : ''}>Por clasificar (migrados)</option>
            ${esLider() ? `<option value="papelera" ${S.filtroEstado === 'papelera' ? 'selected' : ''}>Papelera</option>` : ''}
            <option value="todos" ${S.filtroEstado === 'todos' ? 'selected' : ''}>Todos</option>
        </select></div>`;
    const vig = S.docs.filter((d) => d.estado === 'vigente');
    let h = `<div class="repo-stats-panel">
        <div class="stat-item"><span class="stat-number">${vig.length}</span><span class="stat-label">Vigentes</span></div>
        <div class="stat-item"><span class="stat-number">${vig.filter((d) => d.itemCodigo).length}</span><span class="stat-label">Evidencias</span></div>
        <div class="stat-item"><span class="stat-number">${S.docs.filter((d) => d.estado === 'obsoleto').length}</span><span class="stat-label">Versiones obsoletas</span></div>
        <div class="stat-item"><span class="stat-number">${S.docs.filter((d) => d.estado === 'por_clasificar').length}</span><span class="stat-label">Por clasificar</span></div>
        <div class="stat-item"><span class="stat-number">${S.carpetas.filter((c) => c.estado === 'activa').length}</span><span class="stat-label">Carpetas</span></div>
    </div>
    <div class="tabs"><button class="tab ${tab === 'documentos' ? 'active' : ''}" data-accion="repo-tab" data-tab="documentos">📁 Documentos del laboratorio</button>
        <button class="tab ${tab === 'evidencias' ? 'active' : ''}" data-accion="repo-tab" data-tab="evidencias">📋 Evidencias Res. 1619</button></div>`;
    if (tab === 'documentos') {
        const ruta = carpetaRuta(S.carpetaActual);
        const migas = `<span class="breadcrumb-item" data-accion="carpeta" data-id="">📁 Raíz</span>` + ruta.map((c) => ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-item" data-accion="carpeta" data-id="${esc(c.id)}">${esc(c.nombre)}</span>`).join('');
        const subcarpetas = S.carpetas.filter((c) => (c.parent || null) === S.carpetaActual && (c.estado === 'activa' || (S.filtroEstado === 'papelera' && esLider())));
        const docs = filtrarDocs(S.docs.filter((d) => !d.itemCodigo && (S.busqueda ? true : (d.carpetaId || null) === S.carpetaActual)));
        h += `<div class="repo-toolbar"><div class="repo-breadcrumb"><i class="fas fa-folder-open"></i> ${migas}</div>
            <div class="repo-actions">${puedeCargar() ? `<button class="btn btn-primary btn-sm" data-accion="subir-doc"><i class="fas fa-upload"></i> Subir documento</button>
            <button class="btn btn-success btn-sm" data-accion="nueva-carpeta"><i class="fas fa-folder-plus"></i> Nueva carpeta</button>` : ''}</div></div>${filtros}
            <div class="repo-table-container"><table class="repo-table"><thead><tr><th>Código</th><th>Nombre</th><th>Archivo</th><th>Cargado por</th><th>Estado</th></tr></thead><tbody>`;
        if (!S.busqueda) subcarpetas.forEach((c) => {
            h += `<tr class="repo-row repo-folder-row" data-accion="carpeta" data-id="${esc(c.id)}" tabindex="0"><td colspan="3"><i class="fas fa-folder" style="color:#e8a838"></i> ${esc(c.nombre)} ${c.estado === 'papelera' ? '<span class="status-badge no-cumple">En papelera</span>' : ''}</td>
                <td>${esc(c.creadoPor?.nombre)}<br><small>${fFecha(c.creadoEn)}</small></td>
                <td>${c.estado === 'activa' && puedeRetirar() ? `<button class="btn btn-danger btn-sm repo-action-btn" data-accion="carpeta-papelera" data-id="${esc(c.id)}" title="Enviar a papelera"><i class="fas fa-trash"></i></button>` : ''}
                ${c.estado === 'papelera' && esAdmin() ? `<button class="btn btn-secondary btn-sm" data-accion="carpeta-restaurar" data-id="${esc(c.id)}">Restaurar</button>` : ''}</td></tr>`;
        });
        if (!docs.length && (S.busqueda || !subcarpetas.length)) h += `<tr><td colspan="5" class="repo-empty-row">No hay documentos con este filtro.</td></tr>`;
        docs.forEach((d) => { h += filaDoc(d, false); });
        h += '</tbody></table></div>';
    } else {
        const docs = filtrarDocs(S.docs.filter((d) => d.itemCodigo));
        h += filtros + `<div class="repo-table-container"><table class="repo-table"><thead><tr><th>Código</th><th>Evidencia</th><th>Ítem</th><th>Archivo</th><th>Cargado por</th><th>Estado</th></tr></thead><tbody>`;
        if (!docs.length) h += `<tr><td colspan="6" class="repo-empty-row">No hay evidencias con este filtro.</td></tr>`;
        docs.forEach((d) => { h += filaDoc(d, true); });
        h += '</tbody></table></div>';
    }
    $('dynamicContent').innerHTML = h;
    const b = $('repoBuscar');
    b.oninput = () => { S.busqueda = b.value; clearTimeout(b._t); b._t = setTimeout(() => { const pos = b.selectionStart; vistaRepositorio(); const nb = $('repoBuscar'); nb.focus(); nb.setSelectionRange(pos, pos); }, 250); };
    $('repoEstado').onchange = (e) => { S.filtroEstado = e.target.value; vistaRepositorio(); };
    titulo('Repositorio documental', 'Documentos con código, versión, huella SHA-256 y responsable');
}

function abrirSubirDoc() {
    $('repoNombre').value = ''; $('repoDesc').value = ''; $('repoFileInput').value = '';
    $('repoFilePreview').textContent = 'Sin archivo seleccionado';
    $('repoDestino').textContent = S.carpetaActual ? '📁 ' + carpetaRuta(S.carpetaActual).map((c) => c.nombre).join(' › ') : '📁 Raíz';
    abrirModal('repoModal');
}
async function guardarDocRepo() {
    const file = $('repoFileInput').files[0];
    const nombre = $('repoNombre').value.trim();
    if (!nombre) { toast('Escriba el nombre del documento.', 'aviso'); return; }
    if (!file) { toast('Seleccione el archivo.', 'aviso'); return; }
    try {
        const r = await subirDocumento({ file, nombre, tipo: $('repoTipo').value, descripcion: $('repoDesc').value.trim(), carpetaId: S.carpetaActual });
        if (r) cerrarModal('repoModal');
    } catch (e) { toast(errorTexto(e), 'error'); }
}
async function nuevaCarpeta() {
    const nombre = await dialogo({ titulo: 'Nueva carpeta', mensaje: 'Se creará en la ubicación actual del repositorio.', campo: 'Nombre de la carpeta', minimo: 2, ok: 'Crear' });
    if (!nombre) return;
    if (S.carpetas.some((c) => c.estado === 'activa' && (c.parent || null) === S.carpetaActual && c.nombre.toLowerCase() === nombre.toLowerCase())) { toast('Ya existe una carpeta con ese nombre aquí.', 'aviso'); return; }
    try {
        exigirConexion();
        cargando('Creando carpeta...');
        const id = S.backend.nuevoId('carpetas');
        await S.backend.lote([{ op: 'set', col: 'carpetas', id, data: { nombre, parent: S.carpetaActual, estado: 'activa', creadoPor: yo(), creadoEn: S.backend.TS } },
            opBitacora('crear_carpeta', { entidad: 'carpeta', entidadId: id, detalle: nombre })]);
        toast('📁 Carpeta creada');
    } catch (e) { toast(errorTexto(e), 'error'); } finally { cargando(false); }
}
async function carpetaPapelera(id, restaurar) {
    const c = S.carpetas.find((x) => x.id === id);
    if (!c) return;
    try {
        if (restaurar) {
            exigirConexion();
            await S.backend.lote([{ op: 'update', col: 'carpetas', id, data: { estado: 'activa', restaurado: { por: yo(), en: S.backend.TS } } }, opBitacora('restaurar', { entidad: 'carpeta', entidadId: id, detalle: c.nombre })]);
            toast('Carpeta restaurada');
            return;
        }
        const activos = S.docs.filter((d) => d.carpetaId === id && d.estado !== 'papelera').length + S.carpetas.filter((x) => x.parent === id && x.estado === 'activa').length;
        if (activos) { toast(`La carpeta tiene ${activos} elemento(s). Envíelos primero a la papelera o muévalos.`, 'aviso'); return; }
        const motivo = await dialogo({ titulo: `Enviar a la papelera: ${c.nombre}`, mensaje: 'La carpeta no se borra: queda en la papelera y el Profesional SIG puede restaurarla.', campo: 'Motivo', minimo: 5, ok: 'Enviar a papelera', peligro: true });
        if (!motivo) return;
        exigirConexion();
        await S.backend.lote([{ op: 'update', col: 'carpetas', id, data: { estado: 'papelera', papelera: { por: yo(), en: S.backend.TS, motivo } } }, opBitacora('papelera', { entidad: 'carpeta', entidadId: id, detalle: `${c.nombre}: ${motivo}` })]);
        toast('🗑️ Carpeta enviada a la papelera');
    } catch (e) { toast(errorTexto(e), 'error'); }
}

// Visor de documento
function verDoc(id) { S.docAbierto = id; pintarVisor(); abrirModal('viewerModal'); }
function pintarVisor() {
    const d = S.docs.find((x) => x.id === S.docAbierto);
    if (!d) return;
    const item = d.itemCodigo ? buscarItem(d.itemCodigo) : null;
    const ev = item && d.evidenciaId ? item.evidencias.find((x) => x.id === d.evidenciaId) : null;
    const filas = [
        ['Código', `<b>${esc(d.codigo)}</b> – versión ${d.version}`], ['Estado', ESTADOS_DOC[d.estado] || esc(d.estado)],
        ['Nombre', esc(d.nombre)], ['Tipo', TIPOS_DOC[d.tipo] || esc(d.tipo)], ['Descripción', esc(d.descripcion || '—')],
        ['Ubicación', item ? `Capítulo ${item.capitulo} › Ítem ${esc(item.codigo)}${ev ? ' › ' + esc(ev.nombre) : ' › (por clasificar)'}` : '📁 ' + (carpetaRuta(d.carpetaId).map((c) => esc(c.nombre)).join(' › ') || 'Raíz')],
        ['Archivo', `${esc(d.archivo?.nombre)} (${fTam(d.archivo?.tamano)})`],
        ['Huella SHA-256', `<code class="hash">${esc(d.archivo?.sha256)}</code>`],
        ['Cargado por', `${esc(d.cargadoPor?.nombre)} (${esc(ROLES[d.cargadoPor?.rol] || d.cargadoPor?.rol || '')}) – ${fFecha(d.cargadoEn)}`],
    ];
    if (d.origen?.tipo === 'migracion_v01') filas.push(['Origen', `Migrado de la v01 – equipo «${esc(d.origen.equipo)}» – ${esc(d.origen.usuarioOriginal || '')} ${esc(d.origen.fechaOriginal || '')}`]);
    if (d.estado === 'obsoleto') { const n = S.docs.find((x) => x.id === d.reemplazadoPor); filas.push(['Reemplazado por', n ? `${esc(n.codigo)} v${n.version} – ${fFecha(d.obsoletoEn)}` : fFecha(d.obsoletoEn)]); }
    if (d.estado === 'papelera') filas.push(['Papelera', `${esc(d.papelera?.por?.nombre)} – ${fFecha(d.papelera?.en)}: «${esc(d.papelera?.motivo)}»`]);
    if (d.clasificado) filas.push(['Clasificado por', `${esc(d.clasificado.por?.nombre)} – ${fFecha(d.clasificado.en)}`]);
    const serie = S.docs.filter((x) => (x.serie || x.id) === (d.serie || d.id)).sort((a, b) => b.version - a.version);
    $('viewerTitle').textContent = `📄 ${d.codigo} v${d.version}`;
    $('viewerContent').innerHTML = `<table class="meta-table">${filas.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
        ${serie.length > 1 ? `<h4 class="mt-2">🕘 Historial de versiones</h4><table class="ev-table"><thead><tr><th>Versión</th><th>Archivo</th><th>Cargado</th><th>Estado</th></tr></thead><tbody>${serie.map((x) => `<tr ${x.id === d.id ? 'class="ev-ok"' : ''}><td><a href="#" data-accion="ver-doc" data-id="${esc(x.id)}">v${x.version}</a></td><td>${esc(x.archivo?.nombre)}</td><td>${esc(x.cargadoPor?.nombre)} – ${fFecha(x.cargadoEn)}</td><td>${ESTADOS_DOC[x.estado]}</td></tr>`).join('')}</tbody></table>` : ''}`;
    let b = `<button class="btn btn-secondary" data-accion="cerrar" data-modal="viewerModal">Cerrar</button>`;
    if (d.archivo?.url) b += `<a class="btn btn-primary" href="${esc(d.archivo.url)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Abrir archivo</a>`;
    if (d.estado === 'vigente' && puedeCargar()) b += `<button class="btn btn-success" data-accion="nueva-version" data-id="${esc(d.id)}">🔁 Nueva versión</button>`;
    if ((d.estado === 'vigente' || d.estado === 'por_clasificar') && puedeRetirar()) b += `<button class="btn btn-danger" data-accion="doc-papelera" data-id="${esc(d.id)}"><i class="fas fa-trash"></i> Enviar a papelera</button>`;
    if (d.estado === 'papelera' && esAdmin()) b += `<button class="btn btn-secondary" data-accion="doc-restaurar" data-id="${esc(d.id)}">♻️ Restaurar</button>`;
    $('viewerButtons').innerHTML = b;
}
async function docPapelera(id, restaurar) {
    const d = S.docs.find((x) => x.id === id);
    if (!d) return;
    try {
        if (restaurar) {
            exigirConexion();
            const ops = [{ op: 'update', col: 'documentos', id, data: { estado: d.estadoAnterior || 'vigente', restaurado: { por: yo(), en: S.backend.TS } } },
                opBitacora('restaurar', { entidad: 'documento', entidadId: id, codigo: d.codigo, itemCodigo: d.itemCodigo || '', detalle: `v${d.version}` })];
            if (d.itemCodigo && (d.estadoAnterior || 'vigente') === 'vigente') {
                const otra = vigenteDe(d.itemCodigo, d.evidenciaId);
                if (otra) { toast(`No se puede restaurar: la evidencia ya tiene vigente ${otra.codigo} v${otra.version}.`, 'aviso'); return; }
                ops.push(opItem(d.itemCodigo, { validacion: { estado: 'sin_validar', motivo: `Restaurado ${d.codigo}` } }));
            }
            await S.backend.lote(ops);
            toast('♻️ Documento restaurado');
            return;
        }
        const motivo = await dialogo({ titulo: `Enviar a la papelera: ${d.codigo} v${d.version}`, mensaje: 'El documento no se borra: queda en la papelera con el motivo, y solo el Profesional SIG puede restaurarlo.' + (d.itemCodigo ? '<br><b>La evidencia del ítem quedará sin cargar y el ítem volverá a revisión.</b>' : ''), campo: 'Motivo', minimo: 5, ok: 'Enviar a papelera', peligro: true });
        if (!motivo) return;
        exigirConexion();
        const ops = [{ op: 'update', col: 'documentos', id, data: { estado: 'papelera', estadoAnterior: d.estado, papelera: { por: yo(), en: S.backend.TS, motivo } } },
            opBitacora('papelera', { entidad: 'documento', entidadId: id, codigo: d.codigo, itemCodigo: d.itemCodigo || '', detalle: `v${d.version}: ${motivo}` })];
        if (d.itemCodigo && d.estado === 'vigente' && !S.items[d.itemCodigo]?.noAplica) ops.push(opItem(d.itemCodigo, { validacion: { estado: 'sin_validar', motivo: `Retirado ${d.codigo}` } }));
        await S.backend.lote(ops);
        toast('🗑️ Enviado a la papelera');
    } catch (e) { toast(errorTexto(e), 'error'); }
}

// ---------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------
function tablaBitacora(lista) {
    if (!lista.length) return '<div class="table-container"><div class="audit-empty">Sin registros.</div></div>';
    return `<div class="table-container"><div class="table-wrapper"><table><thead><tr><th>Fecha (servidor)</th><th>Acción</th><th>Ítem / documento</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody>
        ${lista.map((b) => `<tr><td class="table-text">${fFecha(b.fecha)}</td><td>${esc(ACCIONES[b.accion] || b.accion)}</td>
        <td>${b.itemCodigo ? `<span class="codigo">${esc(b.itemCodigo)}</span> ` : ''}${b.codigo ? esc(b.codigo) : ''}</td>
        <td class="table-text">${esc(b.detalle)}</td><td>${esc(b.usuario?.nombre)}<br><small>${esc(ROLES[b.usuario?.rol] || '')}</small></td></tr>`).join('')}
        </tbody></table></div></div>`;
}
function bitacoraFiltrada() {
    const q = S.filtroBitacora.trim().toLowerCase();
    return q ? S.bitacora.filter((b) => [ACCIONES[b.accion], b.itemCodigo, b.codigo, b.detalle, b.usuario?.nombre].join(' ').toLowerCase().includes(q)) : S.bitacora;
}
function vistaBitacora() {
    const l = bitacoraFiltrada();
    $('dynamicContent').innerHTML = `<div class="audit-header"><div><h2 class="audit-title"><i class="fas fa-history"></i> Bitácora de auditoría</h2>
        <p class="audit-subtitle">Registros con fecha y hora del servidor. No se pueden modificar ni borrar.</p></div>
        <div><button class="btn btn-primary btn-sm" data-accion="pdf-bitacora"><i class="fas fa-file-pdf"></i> PDF</button>
        <button class="btn btn-success btn-sm" data-accion="xls-bitacora"><i class="fas fa-file-excel"></i> Excel</button></div></div>
        <div class="repo-filtros"><input type="search" id="bitBuscar" class="input-inline" placeholder="🔍 Filtrar por acción, ítem, código, detalle o usuario" value="${esc(S.filtroBitacora)}"></div>
        <p class="help-text">${l.length} registro(s)</p>${tablaBitacora(l.slice(0, 500))}`;
    const b = $('bitBuscar');
    b.oninput = () => { S.filtroBitacora = b.value; clearTimeout(b._t); b._t = setTimeout(() => { vistaBitacora(); const nb = $('bitBuscar'); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); }, 300); };
    titulo('Bitácora de auditoría', `${S.bitacora.length} registros`);
}

// ---------------------------------------------------------------------
// Reporte interno de autoevaluación y reportes
// ---------------------------------------------------------------------
const AVISO_INTERNO = 'Reporte interno de autoevaluación. No constituye certificación ni reemplaza la verificación de la autoridad sanitaria.';
function vistaAutoevaluacion() {
    const r = resumen();
    const color = r.pct >= 80 ? '#0d7a6b' : r.pct >= 50 ? '#d97706' : '#dc2626';
    let filas = '';
    for (const cap in CHAPTERS) {
        const rc = resumen(CHAPTERS[cap].items.map((i) => ({ ...i, capitulo: Number(cap) })));
        filas += `<tr><td>${cap}. ${esc(CHAPTERS[cap].name)}</td><td>${rc.total}</td><td>${rc.C}</td><td>${rc.PV}</td><td>${rc.P + rc.R + rc.NC}</td><td>${rc.NA}</td><td><b>${rc.pct}%</b></td></tr>`;
    }
    $('dynamicContent').innerHTML = `<div class="audit-header"><div><h2 class="audit-title"><i class="fas fa-clipboard-check"></i> Reporte interno de autoevaluación</h2>
        <p class="audit-subtitle">${AVISO_INTERNO}</p></div><div><button class="btn btn-primary btn-sm" data-accion="pdf-autoeval"><i class="fas fa-file-pdf"></i> Exportar PDF</button></div></div>
        <div class="certificate-box" style="border-color:${color}"><div class="certificate-percentage" style="color:${color}">${r.pct}%</div>
        <div class="certificate-subtitle">${r.C} ítems validados de ${r.total - r.NA} aplicables · ${r.PV} por validar · evidencias ${r.evCargadas}/${r.evTotal}</div></div>
        <div class="table-container mt-2"><div class="table-wrapper"><table><thead><tr><th>Capítulo</th><th>Ítems</th><th>Cumplen</th><th>Por validar</th><th>Pendientes</th><th>No aplica</th><th>%</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
    titulo('Reporte interno de autoevaluación', 'Resolución 1619 de 2015');
}
function vistaReportes() {
    const tarjeta = (acc, icono, t, d, b) => `<div class="report-card"><div class="report-card-icon">${icono}</div><div class="report-card-title">${t}</div><div class="report-card-desc">${d}</div><button class="btn btn-report" data-accion="${acc}">${b}</button></div>`;
    $('dynamicContent').innerHTML = `<div class="audit-header"><div><h2 class="audit-title"><i class="fas fa-file-export"></i> Reportes</h2><p class="audit-subtitle">Evidencia para auditorías internas y respaldo (PA-GCOM-FO-08)</p></div></div>
        <div class="reports-grid">
        ${tarjeta('pdf-completo', '📚', 'Reporte completo', 'Los 6 capítulos en un solo PDF, con el estado de cada evidencia', 'Exportar PDF')}
        ${tarjeta('xls-maestro', '📑', 'Listado maestro de documentos', 'Todos los documentos y evidencias con código, versión, estado, huella SHA-256 y enlace', 'Exportar Excel')}
        ${tarjeta('pdf-autoeval', '📋', 'Reporte interno de autoevaluación', 'Porcentaje de cumplimiento validado por capítulo', 'Exportar PDF')}
        ${tarjeta('pdf-bitacora', '🕘', 'Bitácora de auditoría', 'Historial completo de acciones', 'Exportar PDF')}
        ${esAdmin() ? tarjeta('json-respaldo', '💾', 'Respaldo completo', 'Todas las colecciones en JSON, para el registro PA-GCOM-FO-08', 'Descargar JSON') : ''}
        </div>`;
    titulo('Reportes', 'Exportaciones del panel');
}

function pdfBase(tituloDoc, orient = 'p') {
    if (!window.jspdf) throw new Error('No se cargó la librería de PDF. Verifique Internet y recargue.');
    const doc = new window.jspdf.jsPDF(orient, 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(9); doc.setTextColor(26, 58, 107);
    doc.text('RED VITAL PAIPA S.A. E.S.P. – Laboratorio de Agua Potable', 14, 12);
    doc.text(`${APP.codigoHT} · Versión ${APP.version}`, w - 14, 12, { align: 'right' });
    doc.setFontSize(14); doc.setTextColor(10, 22, 40); doc.text(tituloDoc, 14, 21);
    doc.setFontSize(8); doc.setTextColor(90, 110, 130);
    doc.text(`Generado: ${fFecha(new Date())} por ${S.perfil.nombre} (${ROLES[rol()]})`, 14, 27);
    return doc;
}
function pdfPie(doc) {
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120);
        const h = doc.internal.pageSize.getHeight();
        doc.text(AVISO_INTERNO, 14, h - 8);
        doc.text(`Página ${i} de ${n}`, doc.internal.pageSize.getWidth() - 14, h - 8, { align: 'right' });
    }
}
const ESTILO_TABLA = { styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [13, 40, 71], textColor: 255 } };
function filasCapitulo(cap) {
    return CHAPTERS[cap].items.flatMap((i) => {
        const item = { ...i, capitulo: Number(cap) };
        const e = estadoItem(item);
        return i.evidencias.map((ev, k) => {
            const v = vigenteDe(i.codigo, ev.id);
            return [k === 0 ? i.codigo : '', k === 0 ? i.requisito : '', k === 0 ? ESTADOS_ITEM[e].txt.replace(/^\S+\s/, '') : '', ev.nombre, v ? `${v.codigo} v${v.version}` : 'Sin cargar', v ? `${v.cargadoPor?.nombre} ${fFecha(v.cargadoEn)}` : ''];
        });
    });
}
function pdfCapitulo(cap) {
    const doc = pdfBase(`Capítulo ${cap}: ${CHAPTERS[cap].name}`, 'l');
    doc.autoTable({ ...ESTILO_TABLA, startY: 32, head: [['Ítem', 'Requisito', 'Estado', 'Evidencia', 'Documento', 'Cargado']], body: filasCapitulo(cap), columnStyles: { 1: { cellWidth: 80 } } });
    pdfPie(doc); doc.save(`HT-RVP-09_Capitulo_${cap}_${fDia().replace(/\//g, '-')}.pdf`);
}
function pdfCompleto() {
    const doc = pdfBase('Reporte completo – Resolución 1619 de 2015', 'l');
    const r = resumen();
    doc.setFontSize(9); doc.setTextColor(30);
    doc.text(`Cumplimiento validado: ${r.pct}% · ${r.C} cumplen · ${r.PV} por validar · ${r.P + r.R + r.NC} pendientes · ${r.NA} no aplica · evidencias ${r.evCargadas}/${r.evTotal}`, 14, 33);
    let y = 38;
    for (const cap in CHAPTERS) {
        doc.setFontSize(11); doc.setTextColor(13, 40, 71);
        if (y > 180) { doc.addPage(); y = 20; }
        doc.text(`Capítulo ${cap}: ${CHAPTERS[cap].name}`, 14, y);
        doc.autoTable({ ...ESTILO_TABLA, startY: y + 3, head: [['Ítem', 'Requisito', 'Estado', 'Evidencia', 'Documento', 'Cargado']], body: filasCapitulo(cap), columnStyles: { 1: { cellWidth: 80 } } });
        y = doc.lastAutoTable.finalY + 10;
    }
    pdfPie(doc); doc.save(`HT-RVP-09_Reporte_completo_${fDia().replace(/\//g, '-')}.pdf`);
}
function pdfAutoeval() {
    const doc = pdfBase('Reporte interno de autoevaluación – Resolución 1619 de 2015');
    const r = resumen();
    doc.setFontSize(22); doc.setTextColor(13, 40, 71); doc.text(`${r.pct}%`, 14, 42);
    doc.setFontSize(9); doc.setTextColor(30);
    doc.text(`${r.C} ítems validados de ${r.total - r.NA} aplicables · ${r.PV} por validar · evidencias cargadas ${r.evCargadas}/${r.evTotal}`, 14, 50);
    const body = Object.keys(CHAPTERS).map((cap) => { const rc = resumen(CHAPTERS[cap].items.map((i) => ({ ...i, capitulo: Number(cap) }))); return [`${cap}. ${CHAPTERS[cap].name}`, rc.total, rc.C, rc.PV, rc.P + rc.R + rc.NC, rc.NA, rc.pct + '%']; });
    doc.autoTable({ ...ESTILO_TABLA, startY: 56, head: [['Capítulo', 'Ítems', 'Cumplen', 'Por validar', 'Pendientes', 'No aplica', '%']], body });
    let y = doc.lastAutoTable.finalY + 30;
    doc.text('_______________________________', 14, y); doc.text('_______________________________', 110, y);
    doc.text('Analista de Laboratorio', 14, y + 6); doc.text('Líder de Laboratorio (revisó)', 110, y + 6);
    pdfPie(doc); doc.save(`HT-RVP-09_Autoevaluacion_${fDia().replace(/\//g, '-')}.pdf`);
}
function pdfBitacora() {
    const doc = pdfBase('Bitácora de auditoría', 'l');
    const l = bitacoraFiltrada();
    doc.autoTable({ ...ESTILO_TABLA, startY: 32, head: [['Fecha (servidor)', 'Acción', 'Ítem', 'Código', 'Detalle', 'Usuario', 'Rol']],
        body: l.map((b) => [fFecha(b.fecha), ACCIONES[b.accion] || b.accion, b.itemCodigo || '', b.codigo || '', b.detalle || '', b.usuario?.nombre || '', ROLES[b.usuario?.rol] || '']),
        columnStyles: { 4: { cellWidth: 90 } } });
    pdfPie(doc); doc.save(`HT-RVP-09_Bitacora_${fDia().replace(/\//g, '-')}.pdf`);
}

let xlsxCargado = null;
function cargarXlsx() {
    if (window.XLSX) return Promise.resolve();
    xlsxCargado = xlsxCargado || new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar la librería de Excel.'));
        document.head.appendChild(s);
    });
    return xlsxCargado;
}
async function descargarExcel(nombre, hojas) {
    try {
        await cargarXlsx();
        const wb = window.XLSX.utils.book_new();
        for (const [hoja, filas] of hojas) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(filas), hoja);
        window.XLSX.writeFile(wb, nombre + '.xlsx');
    } catch (e) {
        // Respaldo: CSV que Excel abre directamente
        const filas = hojas[0][1];
        const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombre + '.csv');
        toast('Se descargó en CSV (sin conexión a la librería de Excel).', 'aviso');
    }
}
function descargarBlob(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function xlsMaestro() {
    const filas = [['Código', 'Versión', 'Estado', 'Nombre', 'Tipo', 'Capítulo', 'Ítem', 'Evidencia', 'Carpeta', 'Archivo', 'Tamaño (bytes)', 'SHA-256', 'Cargado por', 'Rol', 'Fecha de carga', 'Reemplazado por', 'Motivo papelera', 'Origen', 'Enlace', 'Public ID Cloudinary']];
    [...S.docs].sort((a, b) => (a.codigo > b.codigo ? 1 : -1) || a.version - b.version).forEach((d) => {
        const item = d.itemCodigo ? buscarItem(d.itemCodigo) : null;
        const ev = item?.evidencias.find((x) => x.id === d.evidenciaId);
        const reem = S.docs.find((x) => x.id === d.reemplazadoPor);
        filas.push([d.codigo, d.version, d.estado, d.nombre, d.tipo, d.capitulo || '', d.itemCodigo || '', ev?.nombre || '', carpetaRuta(d.carpetaId).map((c) => c.nombre).join(' / '),
            d.archivo?.nombre, d.archivo?.tamano, d.archivo?.sha256, d.cargadoPor?.nombre, ROLES[d.cargadoPor?.rol] || '', fFecha(d.cargadoEn),
            reem ? `${reem.codigo} v${reem.version}` : '', d.papelera?.motivo || '', d.origen?.tipo === 'migracion_v01' ? `v01 – ${d.origen.equipo}` : 'Carga', d.archivo?.url, d.archivo?.publicId]);
    });
    const ev = [['Capítulo', 'Ítem', 'Tipo', 'Estado del ítem', 'Evidencia requerida', 'Documento vigente', 'Versión', 'Cargado por', 'Fecha']];
    todosLosItems().forEach((i) => {
        const e = ESTADOS_ITEM[estadoItem(i)].txt.replace(/^\S+\s/, '');
        i.evidencias.forEach((x) => { const v = vigenteDe(i.codigo, x.id); ev.push([i.capitulo, i.codigo, i.tipo, e, x.nombre, v?.codigo || 'Sin cargar', v?.version || '', v?.cargadoPor?.nombre || '', v ? fFecha(v.cargadoEn) : '']); });
    });
    descargarExcel(`HT-RVP-09_Listado_maestro_${fDia().replace(/\//g, '-')}`, [['Documentos', filas], ['Evidencias por ítem', ev]]);
}
function xlsBitacora() {
    const filas = [['Fecha (servidor)', 'Acción', 'Ítem', 'Código', 'Detalle', 'Usuario', 'Rol']];
    bitacoraFiltrada().forEach((b) => filas.push([fFecha(b.fecha), ACCIONES[b.accion] || b.accion, b.itemCodigo, b.codigo, b.detalle, b.usuario?.nombre, ROLES[b.usuario?.rol] || '']));
    descargarExcel(`HT-RVP-09_Bitacora_${fDia().replace(/\//g, '-')}`, [['Bitácora', filas]]);
}
function jsonRespaldo() {
    const datos = { formato: 'HT-RVP-09-respaldo', version: APP.version, generado: new Date().toISOString(), por: S.perfil.nombre, proyecto: S.backend.proyecto,
        items: S.items, documentos: S.docs, carpetas: S.carpetas, bitacora: S.bitacora, usuarios: S.usuarios };
    descargarBlob(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }), `HT-RVP-09_Respaldo_${fDia().replace(/\//g, '-')}.json`);
}

// ---------------------------------------------------------------------
// Administración: usuarios y migración de la v01
// ---------------------------------------------------------------------
function vistaAdmin() {
    if (!esAdmin()) { irA('dashboard'); return; }
    const leg = hayLegadoLocal() ? resumenLegado(leerLegadoLocal()) : null;
    $('dynamicContent').innerHTML = `
    <div class="tabs"><span class="tab active">⚙️ Administración (Profesional SIG)</span></div>
    <h3 class="dashboard-title">👥 Usuarios del panel</h3>
    <p class="help-text">1) Cree la cuenta en la consola de Firebase (Authentication › Agregar usuario) con el correo institucional de la persona. 2) Copie su UID y regístrelo aquí con su rol. Las cuentas se desactivan, no se borran.</p>
    <div class="table-container"><div class="table-wrapper"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>UID</th><th></th></tr></thead><tbody>
    ${S.usuarios.map((u) => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${esc(ROLES[u.rol] || u.rol)}</td><td>${u.activo ? '🟢 Activo' : '⚪ Inactivo'}</td><td><code>${esc(u.id)}</code></td>
        <td><button class="btn btn-secondary btn-sm" data-accion="editar-usuario" data-id="${esc(u.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="6">Sin usuarios.</td></tr>'}
    </tbody></table></div></div>
    <div class="form-row mt-1"><input id="nuUid" class="input-inline" placeholder="UID de Firebase"><input id="nuNombre" class="input-inline" placeholder="Nombre completo">
        <input id="nuEmail" class="input-inline" placeholder="Correo"><select id="nuRol" class="input-inline">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" data-accion="guardar-usuario">Registrar / actualizar</button></div>

    <h3 class="dashboard-title">📦 Migración de los datos de la versión 01</h3>
    <p class="help-text">La v01 guardaba las evaluaciones, la bitácora y el repositorio en el navegador de cada equipo. Migre cada equipo una sola vez: los archivos repetidos se detectan por su huella SHA-256 y no se duplican. Los archivos que estaban en los ítems quedan «por clasificar», porque la v01 no indicaba a qué evidencia correspondían.</p>
    <div class="mig-box"><b>Opción A – Datos de este navegador:</b> ${leg ? leg : 'no se encontraron datos de la v01 en este navegador (dirección actual: ' + esc(location.host) + ').'}
        ${leg ? `<div class="form-row mt-1"><input id="migEquipo" class="input-inline" placeholder="Nombre del equipo (p. ej. PTAP-Analista)"><button class="btn btn-primary btn-sm" data-accion="migrar-local">Migrar datos de este equipo</button></div>` : ''}</div>
    <div class="mig-box"><b>Opción B – Archivos exportados desde otros equipos</b> (página <code>migracion-v01.html</code> abierta en cada equipo):
        <div class="form-row mt-1"><input type="file" id="migArchivos" accept=".json" multiple class="input-inline"><button class="btn btn-primary btn-sm" data-accion="migrar-archivos">Migrar archivos seleccionados</button></div></div>
    <pre id="migLog" class="mig-log" aria-live="polite">${esc(S.migLog || '')}</pre>

    <h3 class="dashboard-title">ℹ️ Información técnica</h3>
    <table class="meta-table"><tr><th>Herramienta</th><td>${esc(APP.codigoHT)} – versión ${esc(APP.version)} (${esc(APP.fechaVersion)})</td></tr>
    <tr><th>Proyecto de datos</th><td>${esc(S.backend.proyecto)} (${S.backend.modo === 'firebase' ? 'Firebase' : 'MODO DE PRUEBA'})</td></tr>
    <tr><th>Dirección</th><td>${esc(location.origin + location.pathname)}</td></tr>
    <tr><th>Documentos / carpetas / registros de bitácora</th><td>${S.docs.length} / ${S.carpetas.length} / ${S.bitacora.length}</td></tr></table>`;
    titulo('Administración', 'Usuarios, migración e información técnica');
}
async function guardarUsuario(datos) {
    const d = datos || { id: $('nuUid').value.trim(), nombre: $('nuNombre').value.trim(), email: $('nuEmail').value.trim(), rol: $('nuRol').value, activo: true };
    if (!d.id || d.nombre.length < 3 || !d.email.includes('@')) { toast('Complete UID, nombre y correo.', 'aviso'); return; }
    if (d.id === S.user.uid && (d.rol !== 'admin' || !d.activo)) { toast('No puede quitarse a sí mismo el rol de administrador.', 'aviso'); return; }
    try {
        exigirConexion();
        await S.backend.lote([{ op: 'set', col: 'usuarios', id: d.id, merge: true, data: { nombre: d.nombre, email: d.email, rol: d.rol, activo: d.activo } },
            opBitacora('usuario', { entidad: 'usuario', entidadId: d.id, detalle: `${d.nombre} – ${ROLES[d.rol]} – ${d.activo ? 'activo' : 'inactivo'}` })]);
        toast('✅ Usuario guardado');
    } catch (e) { toast(errorTexto(e), 'error'); }
}
// Lectura del rol/activo del diálogo de edición (el diálogo se cierra antes de resolver)
document.addEventListener('change', (e) => {
    if (e.target.id === 'edRol' || e.target.id === 'edActivo') S._edicion = { rol: $('edRol').value, activo: $('edActivo').checked };
});

function hayLegadoLocal() {
    try { return !!(localStorage.getItem(LEGADO.items) || localStorage.getItem(LEGADO.audit) || localStorage.getItem(LEGADO.repo)); } catch (_) { return false; }
}
function leerLegadoLocal() {
    const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || def); } catch (_) { return JSON.parse(def); } };
    return { items: leer(LEGADO.items, '{}'), audit: leer(LEGADO.audit, '[]'), repository: leer(LEGADO.repo, '[]') };
}
function resumenLegado(p) {
    const arch = Object.values(p.items || {}).reduce((n, i) => n + (i.archivos?.length || 0), 0);
    const docs = (p.repository || []).filter((d) => !d.esCarpeta).length;
    return `${Object.keys(p.items || {}).length} ítems evaluados (${arch} archivos), ${(p.audit || []).length} registros de bitácora, ${docs} documentos y ${(p.repository || []).filter((d) => d.esCarpeta).length} carpetas del repositorio.`;
}
function dataUrlABlob(du) {
    const [cab, b64] = du.split(',');
    const mime = (cab.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
}
async function migrar(paquete, equipo) {
    const log = (m) => { S.migLog = (S.migLog || '') + m + '\n'; const el = $('migLog'); if (el) { el.textContent = S.migLog; el.scrollTop = el.scrollHeight; } };
    const hashesRun = new Set();
    exigirConexion();
    const slug = equipo.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40) || 'equipo';
    const cont = { carpetas: 0, docs: 0, dup: 0, omitidos: 0, porClasificar: 0, bitacora: 0, obs: 0 };
    log(`▶ Migración del equipo «${equipo}» – ${fFecha(new Date())}`);
    const yaMigrado = (legacyId) => S.docs.some((d) => d.origen?.legacyId === legacyId && d.origen?.equipo === equipo);
    const archivoExistente = (hash) => S.docs.find((d) => d.archivo?.sha256 === hash && d.estado !== 'papelera');
    const crearDesdeBlob = async (blob, nombreArchivo, extra) => {
        const file = new File([blob], nombreArchivo, { type: blob.type });
        const hash = await sha256(file);
        const ex = archivoExistente(hash);
        if (ex || hashesRun.has(hash)) { cont.dup++; log(`  = ${nombreArchivo}: ya existe${ex ? ' como ' + ex.codigo : ' en esta migración'} (no se duplica)`); return; }
        hashesRun.add(hash);
        try { validarArchivo(file); } catch (e) { cont.omitidos++; log(`  ✖ ${nombreArchivo}: ${e.message}`); return; }
        const r = await subirDocumento({ file, ...extra, omitirDuplicado: true });
        if (r) { log(`  + ${nombreArchivo} → ${r.codigo}`); return r; }
    };

    // 1) Carpetas
    const mapa = {};
    const carpetasV1 = (paquete.repository || []).filter((d) => d.esCarpeta);
    let pendientes = [...carpetasV1];
    for (let vuelta = 0; vuelta < 10 && pendientes.length; vuelta++) {
        const sig = [];
        for (const c of pendientes) {
            if (c.parent && !(c.parent in mapa)) { sig.push(c); continue; }
            const parent = c.parent ? mapa[c.parent] : null;
            const ex = S.carpetas.find((x) => x.estado === 'activa' && (x.parent || null) === parent && x.nombre.toLowerCase() === String(c.nombre).toLowerCase());
            if (ex) { mapa[c.id] = ex.id; continue; }
            const id = S.backend.nuevoId('carpetas');
            await S.backend.lote([{ op: 'set', col: 'carpetas', id, data: { nombre: c.nombre, parent, estado: 'activa', creadoPor: yo(), creadoEn: S.backend.TS, origen: { tipo: 'migracion_v01', equipo, legacyId: c.id } } },
                opBitacora('migracion', { entidad: 'carpeta', entidadId: id, detalle: `Carpeta «${c.nombre}» (v01, ${equipo})` })]);
            S.carpetas.push({ id, nombre: c.nombre, parent, estado: 'activa' });
            mapa[c.id] = id; cont.carpetas++; log(`  📁 ${c.nombre}`);
        }
        pendientes = sig;
    }

    // 2) Documentos del repositorio
    for (const d of (paquete.repository || []).filter((x) => !x.esCarpeta)) {
        if (yaMigrado(d.id)) { cont.dup++; log(`  = ${d.nombre}: ya migrado`); continue; }
        const origen = { tipo: 'migracion_v01', equipo, legacyId: d.id, fechaOriginal: d.createdAt || '', usuarioOriginal: d.usuario || '' };
        const extra = { nombre: d.nombre || d.fileName || 'Documento v01', tipo: TIPOS_DOC[d.tipo] ? d.tipo : 'otro', descripcion: d.descripcion || '', carpetaId: d.parent ? (mapa[d.parent] || null) : null, origen };
        try {
            if (d.fileData && String(d.fileData).startsWith('data:')) { await crearDesdeBlob(dataUrlABlob(d.fileData), d.fileName || d.nombre || 'archivo', extra); cont.docs++; }
            else if (d.cloudinaryUrl) {
                const resp = await fetch(d.cloudinaryUrl);
                if (!resp.ok) throw new Error('No se pudo descargar de Cloudinary (' + resp.status + ')');
                await crearDesdeBlob(await resp.blob(), d.fileName || d.nombre || 'archivo', extra); cont.docs++;
            } else { cont.omitidos++; log(`  ✖ ${d.nombre}: solo estaba en Google Drive; cárguelo manualmente.`); }
        } catch (e) { cont.omitidos++; log(`  ✖ ${d.nombre}: ${errorTexto(e)}`); }
    }

    // 3) Archivos y observaciones de los ítems
    for (const [codigo, it] of Object.entries(paquete.items || {})) {
        const item = buscarItem(codigo);
        if (!item) { log(`  ✖ Ítem ${codigo} no existe en la v02`); continue; }
        for (const [k, a] of (it.archivos || []).entries()) {
            const legacyId = `${it.id || codigo}-${k}-${a.name}`;
            if (yaMigrado(legacyId)) { cont.dup++; continue; }
            if (!a.data) { cont.omitidos++; log(`  ✖ ${codigo} ${a.name}: sin contenido`); continue; }
            try {
                const r = await crearDesdeBlob(dataUrlABlob(a.data), a.name || 'archivo', { nombre: `${codigo} – ${a.name}`, tipo: 'evidencia', itemCodigo: codigo, estado: 'por_clasificar',
                    origen: { tipo: 'migracion_v01', equipo, legacyId, fechaOriginal: it.updatedAt || '', usuarioOriginal: it.usuario || '' } });
                if (r) cont.porClasificar++;
            } catch (e) { cont.omitidos++; log(`  ✖ ${codigo} ${a.name}: ${errorTexto(e)}`); }
        }
        if (it.observaciones && !(S.items[codigo]?.observaciones || '').includes(it.observaciones)) {
            const nueva = [S.items[codigo]?.observaciones, `[v01 – ${equipo}] ${it.observaciones}`].filter(Boolean).join('\n');
            await S.backend.lote([opItem(codigo, { observaciones: nueva }), opBitacora('migracion', { entidad: 'item', entidadId: codigo, itemCodigo: codigo, detalle: `Observaciones v01 (${equipo})` })]);
            cont.obs++;
        }
    }

    // 4) Bitácora histórica (sin duplicar)
    const existentes = new Set(S.bitacora.filter((b) => b.accion === 'historico_v01').map((b) => b.entidadId));
    const evMap = { C: 'Cumple', NC: 'No cumple', NA: 'No aplica', P: 'Pendiente' };
    const nuevos = (paquete.audit || []).filter((a) => !existentes.has(`${slug}:${a.id}`));
    for (let i = 0; i < nuevos.length; i += 10) {
        const ops = nuevos.slice(i, i + 10).map((a) => ({ ...opBitacora('historico_v01', { entidad: 'historico', entidadId: `${slug}:${a.id}`, itemCodigo: a.itemCodigo || '',
            detalle: `[${a.timestamp || 's.f.'} – ${a.usuario || 'sin usuario'} – ${equipo}] ${a.action === 'update' ? 'Actualización' : 'Registro'}: evaluación ${evMap[a.evaluacion] || a.evaluacion} (${a.evidenciasCargadas || 0}/${a.evidenciasRequeridas || 0} evidencias)${a.observaciones ? ' – ' + a.observaciones : ''}` }) }));
        await S.backend.lote(ops);
        cont.bitacora += ops.length;
    }
    await S.backend.lote([opBitacora('migracion', { entidad: 'migracion', entidadId: slug,
        detalle: `Equipo «${equipo}»: ${cont.carpetas} carpetas, ${cont.docs} documentos, ${cont.porClasificar} archivos por clasificar, ${cont.dup} duplicados omitidos, ${cont.omitidos} no migrados, ${cont.obs} observaciones, ${cont.bitacora} registros históricos` })]);
    log(`✔ Fin: ${cont.carpetas} carpetas, ${cont.docs} documentos, ${cont.porClasificar} por clasificar, ${cont.dup} duplicados omitidos, ${cont.omitidos} no migrados, ${cont.bitacora} registros históricos.`);
    return cont;
}
async function migrarLocal() {
    const equipo = $('migEquipo').value.trim();
    if (equipo.length < 3) { toast('Escriba el nombre del equipo (p. ej. PTAP-Analista).', 'aviso'); return; }
    const ok = await dialogo({ titulo: 'Migrar datos de este equipo', mensaje: resumenLegado(leerLegadoLocal()) + '<br><br>Los datos de la v01 no se borran de este navegador.', ok: 'Migrar' });
    if (!ok) return;
    try { await migrar(leerLegadoLocal(), equipo); toast('✅ Migración terminada. Revise el registro.'); } catch (e) { toast(errorTexto(e), 'error'); }
}
async function migrarArchivos() {
    const files = [...($('migArchivos').files || [])];
    if (!files.length) { toast('Seleccione uno o varios archivos JSON exportados.', 'aviso'); return; }
    for (const f of files) {
        try {
            const p = JSON.parse(await f.text());
            if (p.formato !== 'HT-RVP-09-v01-exportacion') throw new Error('El archivo no es una exportación de la v01.');
            const ok = await dialogo({ titulo: `Migrar «${f.name}»`, mensaje: `Equipo: <b>${esc(p.equipo)}</b> – exportado ${esc(p.exportadoEn)}<br>${resumenLegado(p.datos)}`, ok: 'Migrar' });
            if (!ok) continue;
            await migrar(p.datos, p.equipo || f.name);
        } catch (e) { toast(`${f.name}: ${errorTexto(e)}`, 'error'); }
    }
    toast('✅ Migración de archivos terminada. Revise el registro.');
}

// ---------------------------------------------------------------------
// Instalación (PWA), conexión y pie
// ---------------------------------------------------------------------
function registrarServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
        const avisar = (w) => {
            $('updateBanner').style.display = 'flex';
            $('updateBtn').onclick = () => w.postMessage('actualizar');
        };
        if (reg.waiting) avisar(reg.waiting);
        reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) avisar(w); });
        });
    }).catch((e) => console.warn('SW:', e));
    // Solo recarga cuando el usuario aceptó una actualización (no en la primera instalación)
    const habiaControlador = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaControlador && !recargado) { recargado = true; location.reload(); } });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.instalar = e; document.querySelectorAll('.btn-instalar').forEach((b) => { b.style.display = ''; }); });
window.addEventListener('appinstalled', () => { S.instalar = null; document.querySelectorAll('.btn-instalar').forEach((b) => { b.style.display = 'none'; }); toast('✅ Panel instalado en este equipo'); });
async function instalarApp() {
    if (!S.instalar) { toast('Use el menú del navegador › «Instalar Panel LAB» o «Aplicaciones › Instalar este sitio».', 'aviso'); return; }
    S.instalar.prompt();
    await S.instalar.userChoice;
    S.instalar = null;
}
function escucharConexion() {
    const pintar = () => {
        S.enLinea = navigator.onLine;
        const b = $('netBadge');
        b.className = 'net-badge ' + (S.enLinea ? 'ok' : 'off');
        b.innerHTML = S.enLinea ? '<i class="fas fa-wifi"></i> En línea' : '<i class="fas fa-plug-circle-xmark"></i> Sin conexión';
    };
    window.addEventListener('online', pintar); window.addEventListener('offline', pintar); pintar();
}
function pintarPie() {
    const t = `${APP.codigoHT} · Versión ${APP.version} · ${APP.fechaVersion}`;
    document.querySelectorAll('.footer-version').forEach((e) => { e.textContent = t; });
}

// ---------------------------------------------------------------------
// Eventos (delegación: sin funciones globales ni onclick en el HTML)
// ---------------------------------------------------------------------
const ACC = {
    ir: (el) => irA(el.dataset.vista),
    capitulo: (el) => irA('chapter', Number(el.dataset.cap)),
    item: (el) => abrirItem(el.dataset.codigo),
    cerrar: (el) => cerrarModal(el.dataset.modal),
    'cargar-ev': (el) => pedirArchivo({ tipo: 'evidencia', codigo: S.itemAbierto, ev: el.dataset.ev }),
    historial: (el) => { const v = el.dataset.id ? S.docs.find((d) => d.id === el.dataset.id) : docsDe(el.dataset.codigo, el.dataset.ev).sort((a, b) => b.version - a.version)[0]; if (v) verDoc(v.id); },
    'guardar-obs': () => guardarObservaciones(),
    validar: () => validarItem('validar'),
    devolver: () => validarItem('devolver'),
    'no-aplica': () => noAplica(false),
    'quitar-na': () => noAplica(true),
    clasificar: (el) => clasificar(el.dataset.id),
    'ver-doc': (el) => verDoc(el.dataset.id),
    'nueva-version': (el) => { const d = S.docs.find((x) => x.id === el.dataset.id); if (d) pedirArchivo({ tipo: 'version', doc: d }); },
    'doc-papelera': (el) => docPapelera(el.dataset.id, false),
    'doc-restaurar': (el) => docPapelera(el.dataset.id, true),
    'repo-tab': (el) => { S.repoTab = el.dataset.tab; vistaRepositorio(); },
    carpeta: (el) => { S.carpetaActual = el.dataset.id || null; vistaRepositorio(); },
    'subir-doc': () => abrirSubirDoc(),
    'nueva-carpeta': () => nuevaCarpeta(),
    'carpeta-papelera': (el) => carpetaPapelera(el.dataset.id, false),
    'carpeta-restaurar': (el) => carpetaPapelera(el.dataset.id, true),
    'pdf-capitulo': (el) => pdfCapitulo(el.dataset.cap),
    'pdf-completo': () => pdfCompleto(),
    'pdf-autoeval': () => pdfAutoeval(),
    'pdf-bitacora': () => pdfBitacora(),
    'xls-bitacora': () => xlsBitacora(),
    'xls-maestro': () => xlsMaestro(),
    'json-respaldo': () => jsonRespaldo(),
    'guardar-usuario': () => guardarUsuario(),
    'editar-usuario': async (el) => {
        const u = S.usuarios.find((x) => x.id === el.dataset.id);
        S._edicion = { rol: u.rol, activo: u.activo };
        const ok = await dialogo({ titulo: `Editar: ${u.nombre}`, mensaje: `<div class="form-row"><select id="edRol" class="input-inline">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <label class="checkbox-label"><input type="checkbox" id="edActivo" ${u.activo ? 'checked' : ''}> Activo</label></div>`, ok: 'Guardar' });
        if (ok) await guardarUsuario({ id: u.id, nombre: u.nombre, email: u.email, rol: S._edicion.rol, activo: S._edicion.activo });
    },
    'migrar-local': () => migrarLocal(),
    'migrar-archivos': () => migrarArchivos(),
    instalar: () => instalarApp(),
    logout: () => cerrarSesion(),
    'cambiar-pass': async () => {
        const actual = await dialogo({ titulo: 'Cambiar contraseña', mensaje: 'Paso 1 de 2: escriba su contraseña actual.', campo: 'Contraseña actual', minimo: 6, ok: 'Continuar' });
        if (!actual) return;
        const nueva = await dialogo({ titulo: 'Cambiar contraseña', mensaje: 'Paso 2 de 2: nueva contraseña (mínimo 10 caracteres, con letras y números).', campo: 'Nueva contraseña', minimo: 10, ok: 'Cambiar' });
        if (!nueva) return;
        if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) { toast('La contraseña debe tener letras y números.', 'aviso'); return; }
        try { await S.backend.cambiarPassword(actual, nueva); toast('✅ Contraseña cambiada'); } catch (e) { toast(errorTexto(e), 'error'); }
    },
};
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    const fn = ACC[el.dataset.accion];
    if (fn) { e.stopPropagation(); Promise.resolve(fn(el)).catch((err) => { console.error(err); toast(errorTexto(err), 'error'); }); }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-accion][tabindex]')) e.target.click();
    if (e.key === 'Escape') ['dialogModal', 'viewerModal', 'repoModal', 'itemModal'].some((m) => $(m).classList.contains('active') && (m === 'dialogModal' ? $('dlgCancelar').click() : cerrarModal(m), true));
});
document.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => irA(n.dataset.view, n.dataset.chapter ? Number(n.dataset.chapter) : null)));
$('loginBtn').addEventListener('click', login);
$('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('loginUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginPass').focus(); });
$('olvidoBtn').addEventListener('click', olvido);
$('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('fileInput').addEventListener('change', (e) => alElegirArchivo(e.target.files[0]));
$('repoFileInput').addEventListener('change', (e) => { const f = e.target.files[0]; $('repoFilePreview').textContent = f ? `📎 ${f.name} (${fTam(f.size)})` : 'Sin archivo seleccionado'; if (f && !$('repoNombre').value) $('repoNombre').value = f.name.replace(/\.[^.]+$/, ''); });
$('saveRepoBtn').addEventListener('click', guardarDocRepo);

// Prueba automatizada: acceso a estado interno solo en MODO_PRUEBA
if (CFG.MODO_PRUEBA) window.__LAB = { S, resumen, estadoItem, migrar };

iniciar();
