// HT-RVP-09 Panel de Documentación LAB – Configuración pública (versión 02)
// Este archivo SE PUBLICA con el panel. No contiene contraseñas ni claves secretas:
//  - La configuración web de Firebase es pública por diseño; el acceso lo controlan
//    las reglas de Firestore (firestore.rules) y los dominios autorizados en Authentication.
//  - Cloudinary usa un «upload preset» sin firma, restringido a carpeta, formatos y tamaño.
// Los valores se copian de la consola de Firebase: Configuración del proyecto > Tus apps > Web.
window.LAB_CONFIG = {
    APP: {
        codigoHT: 'HT-RVP-09',
        version: '02',
        fechaVersion: '20/10/2026',
        urlOficial: 'https://redvitalpaipa.github.io/panellab'   // informativo; el código no depende de este valor
    },
    FIREBASE: {
        apiKey: 'PEGAR_AQUI',
        authDomain: 'PEGAR_AQUI.firebaseapp.com',
        projectId: 'PEGAR_AQUI',
        appId: 'PEGAR_AQUI'
    },
    CLOUDINARY: {
        cloudName: 'z11uufz3',
        uploadPreset: 'lab_uploads',
        folderBase: 'SIG_LABORATORIO'
    },
    // Solo para pruebas en un equipo local: usa una base de datos en memoria.
    // En la versión publicada debe estar en false.
    MODO_PRUEBA: false
};
