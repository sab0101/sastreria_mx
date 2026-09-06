// ============================================================
// CONFIGURACIÓN DE FIREBASE - PROYECTO CORRECTO
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAjVlYBHZ4QVOjFNjjuSJqNhLzb4zAhzgQ",
  authDomain: "sastreriamx.firebaseapp.com",
  projectId: "sastreriamx",
  storageBucket: "sastreriamx.firebasestorage.app",
  messagingSenderId: "308757673533",
  appId: "1:308757673533:web:d4821472b5f1d61a82dc54",
  measurementId: "G-4T74NGS25E"
};

// Inicializar Firebase - SOLO UNA VEZ
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Habilitar persistencia offline
db.enablePersistence()
  .catch(err => console.error('Error de persistencia:', err));

// ============================================================
// ESTADO GLOBAL
// ============================================================
let currentUser = null, companyId = null, companyConfig = null;
let orders = [], inventory = [], measurements = [];
let currentView = "ordenes";
let editingId = null, editingMeasureId = null;
let draftPrendas = [], draftPagos = [];
let ownerUnlocked = false;
let adminTab = "dashboard";
let authMode = "login";
let onboardSedes = [];
let deferredPrompt = null;

const UNIDADES = ["Unidades","Metros"];
const METODOS = ["Efectivo","Tarjeta","Transferencia"];
const MEDIDAS_CAMPOS = {
  "Saco": ["Espalda","Hombro","Manga","Pecho","Cintura","Cadera","Largo"],
  "Abrigo": ["Espalda","Hombro","Manga","Pecho","Cintura","Cadera","Largo"],
  "Chaleco": ["Espalda","Hombro","Pecho","Cintura","Largo"],
  "Camisa": ["Cuello","Hombro","Manga","Medio Pecho","Cintura","Largo","Puño","Base"],
  "Pantalón": ["Cintura","Cadera","Entrepierna","Largo","Rodilla"],
};
const LEGAL_TEXT = "GARANTÍA: Este servicio cuenta con garantía de 15 días naturales a partir de la fecha de entrega, aplicable únicamente a defectos de confección o arreglo (Arts. 77 y 92 de la Ley Federal de Protección al Consumidor). No cubre mal uso, lavado inadecuado ni desgaste normal. Prendas no reclamadas después de 30 días naturales de la fecha de entrega quedarán bajo resguardo con cargo por almacenaje. Presente este ticket para recoger su prenda.";

// ============================================================
// UTILIDADES
// ============================================================
function fmtMoney(n){ return "$" + (Number(n)||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function ticketLabel(n){ return "SAS-" + String(n).padStart(6,'0'); }
function daysDiff(dateStr){
  const d = new Date(dateStr + "T00:00:00"); const t = new Date(todayStr() + "T00:00:00");
  return Math.round((d - t) / 86400000);
}
function totalAbonado(o){ return (o.pagos||[]).reduce((s,p)=>s+Number(p.monto||0),0); }
function saldo(o){ return Number(o.costo||0) - totalAbonado(o); }
function computeAlert(o){
  if(o.proceso === "Terminado") return {label:"Entregado", cls:"done"};
  const diff = daysDiff(o.fechaEntrega);
  if(diff < 0) return {label:"🔴 Atrasado", cls:"late"};
  if(diff === 0) return {label:"🟢 Hoy", cls:"today"};
  if(diff <= 2) return {label:`🟡 Faltan ${diff} día(s)`, cls:"soon"};
  return {label:"En tiempo", cls:"ontime"};
}
function isLate(o){
  if(o.proceso === "Terminado"){ if(!o.fechaEntregaReal) return false; return o.fechaEntregaReal > o.fechaEntrega; }
  return computeAlert(o).cls === "late";
}
function sedeNames(){ return (companyConfig.sedes||[]).map(s=>s.nombre); }
function sedeInfo(nombre){ return (companyConfig.sedes||[]).find(s=>s.nombre===nombre) || {direccion:'', encargados:[]}; }
function traducirErrorFirebase(e){
  const map = {
    'auth/email-already-in-use':'Ese correo ya tiene una cuenta. Intenta iniciar sesión.',
    'auth/invalid-email':'Correo inválido.',
    'auth/weak-password':'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found':'No existe una cuenta con ese correo.',
    'auth/wrong-password':'Contraseña actual incorrecta.',
    'auth/invalid-credential':'Correo o contraseña incorrectos.',
    'auth/requires-recent-login':'Por seguridad, vuelve a escribir tu contraseña actual e inténtalo de nuevo.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':'Falta configurar Firebase. Revisa la API Key en script.js',
    'permission-denied':'No tienes permisos. Revisa las reglas de Firestore en Firebase Console.',
  };
  return map[e.code] || ('Error: ' + e.message);
}
function resizeImage(file, maxW){
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const MEDIDAS_DIAGRAMS = {
  'Saco': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 275 300" width="275" height="300"><rect width="275" height="300" fill="#FBF8F2"/><path d="M105,25 Q120,42 135,25 L155,25 L148,95 L138,165 L148,235 L92,235 L102,165 L92,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M85,25 L58,30 L40,125 L58,132 L92,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M155,25 L182,30 L200,125 L182,132 L148,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><line x1="85" y1="27" x2="155" y2="27" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="30" font-size="11" fill="#756A5B">Hombro</text><line x1="92" y1="95" x2="148" y2="95" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="98" font-size="11" fill="#756A5B">Pecho</text><line x1="102" y1="165" x2="138" y2="165" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="168" font-size="11" fill="#756A5B">Cintura</text><line x1="96" y1="210" x2="144" y2="210" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="213" font-size="11" fill="#756A5B">Cadera</text><line x1="170" y1="25" x2="170" y2="235" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="173" y="130" font-size="11" fill="#756A5B">Largo</text><text x="18" y="118" font-size="10" fill="#1F3A5F">Manga</text></svg>',
  'Chaleco': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 275 300" width="275" height="300"><rect width="275" height="300" fill="#FBF8F2"/><path d="M105,25 Q120,40 135,25 L150,30 L143,90 L138,150 L143,205 L97,205 L102,150 L97,90 L90,30 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><line x1="90" y1="30" x2="150" y2="30" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="195" y="33" font-size="11" fill="#756A5B">Hombro</text><line x1="97" y1="90" x2="143" y2="90" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="195" y="93" font-size="11" fill="#756A5B">Pecho</text><line x1="102" y1="150" x2="138" y2="150" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="195" y="153" font-size="11" fill="#756A5B">Cintura</text><line x1="160" y1="25" x2="160" y2="205" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="163" y="115" font-size="11" fill="#756A5B">Largo</text></svg>',
  'Camisa': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 275 300" width="275" height="300"><rect width="275" height="300" fill="#FBF8F2"/><path d="M108,25 Q120,38 132,25 L155,28 L146,95 L137,165 L146,225 L94,225 L103,165 L94,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M85,27 L50,35 L35,170 L55,178 L94,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M155,27 L190,35 L205,170 L185,178 L146,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><circle cx="120" cy="30" r="10" fill="none" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="3,2"/><text x="140" y="18" font-size="11" fill="#756A5B">Cuello</text><line x1="85" y1="29" x2="155" y2="29" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="210" y="32" font-size="11" fill="#756A5B">Hombro</text><line x1="94" y1="95" x2="146" y2="95" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="210" y="98" font-size="11" fill="#756A5B">Medio Pecho</text><line x1="103" y1="165" x2="137" y2="165" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="210" y="168" font-size="11" fill="#756A5B">Cintura</text><text x="12" y="150" font-size="10" fill="#1F3A5F">Manga</text><line x1="35" y1="172" x2="55" y2="176" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="3,2"/><text x="4" y="190" font-size="10" fill="#756A5B">Puño</text><line x1="94" y1="222" x2="146" y2="222" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="98" y="245" font-size="11" fill="#756A5B">Base</text><line x1="170" y1="25" x2="170" y2="225" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="173" y="128" font-size="11" fill="#756A5B">Largo</text></svg>',
  'Pantalón': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 275 300" width="275" height="300"><rect width="275" height="300" fill="#FBF8F2"/><path d="M80,20 L160,20 L168,65 L178,250 L150,250 L128,118 L112,118 L90,250 L62,250 L72,65 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><line x1="80" y1="22" x2="160" y2="22" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="225" y="25" font-size="11" fill="#756A5B">Cintura</text><line x1="72" y1="65" x2="168" y2="65" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="225" y="68" font-size="11" fill="#756A5B">Cadera</text><line x1="100" y1="185" x2="145" y2="185" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="225" y="188" font-size="11" fill="#756A5B">Rodilla</text><line x1="120" y1="118" x2="120" y2="250" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="70" y="278" font-size="10" fill="#756A5B" text-anchor="middle">Entrepierna</text><line x1="240" y1="20" x2="240" y2="250" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="245" y="135" font-size="11" fill="#756A5B">Largo</text></svg>',
  'Abrigo': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 275 300" width="275" height="300"><rect width="275" height="300" fill="#FBF8F2"/><path d="M105,25 Q120,42 135,25 L155,25 L148,95 L138,165 L148,235 L92,235 L102,165 L92,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M85,25 L58,30 L40,125 L58,132 L92,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><path d="M155,25 L182,30 L200,125 L182,132 L148,95 Z" fill="#EFEAE0" stroke="#1F3A5F" stroke-width="2"/><line x1="85" y1="27" x2="155" y2="27" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="30" font-size="11" fill="#756A5B">Hombro</text><line x1="92" y1="95" x2="148" y2="95" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="98" font-size="11" fill="#756A5B">Pecho</text><line x1="102" y1="165" x2="138" y2="165" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="168" font-size="11" fill="#756A5B">Cintura</text><line x1="96" y1="210" x2="144" y2="210" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="205" y="213" font-size="11" fill="#756A5B">Cadera</text><line x1="170" y1="25" x2="170" y2="235" stroke="#B8862E" stroke-width="1.5" stroke-dasharray="4,3"/><text x="173" y="130" font-size="11" fill="#756A5B">Largo</text><text x="18" y="118" font-size="10" fill="#1F3A5F">Manga</text></svg>',
};

// ============================================================
// AUTENTICACIÓN
// ============================================================
function renderAuthScreen(){
  document.getElementById('root').innerHTML = `
    <div class="authwrap"><div class="authcard">
      <h1>✂️ Sastrería SaaS</h1>
      <div class="sub">${authMode==='login' ? 'Inicia sesión en tu empresa' : 'Crea la cuenta de tu empresa'}</div>
      <div class="autherror" id="authError"></div>
      <label>Correo <input type="email" id="authEmail" autocomplete="username"></label>
      <label>Contraseña <input type="password" id="authPassword" autocomplete="current-password"></label>
      <button class="btn gold" id="authSubmitBtn" style="width:100%;">${authMode==='login'?'Iniciar sesión':'Crear cuenta'}</button>
      <div class="authswitch">
        ${authMode==='login' ? `¿Empresa nueva? <a id="toSignup">Crea tu cuenta</a>` : `¿Ya tienes cuenta? <a id="toLogin">Inicia sesión</a>`}
      </div>
      ${authMode==='login' ? `<div class="authswitch"><a id="forgotPass">Olvidé mi contraseña</a></div>` : ''}
    </div></div>`;
  document.getElementById('authSubmitBtn').addEventListener('click', submitAuth);
  if(authMode==='login'){
    document.getElementById('toSignup').addEventListener('click', ()=>{ authMode='signup'; renderAuthScreen(); });
    document.getElementById('forgotPass').addEventListener('click', sendResetEmail);
  } else {
    document.getElementById('toLogin').addEventListener('click', ()=>{ authMode='login'; renderAuthScreen(); });
  }
}

async function submitAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.style.color = 'var(--red)'; errEl.textContent = '';
  if(!email || !pass){ errEl.textContent = 'Completa correo y contraseña.'; return; }
  try{
    if(authMode==='login'){ await auth.signInWithEmailAndPassword(email, pass); }
    else { await auth.createUserWithEmailAndPassword(email, pass); }
  }catch(e){ errEl.textContent = traducirErrorFirebase(e); }
}

async function sendResetEmail(){
  const email = document.getElementById('authEmail').value.trim();
  const errEl = document.getElementById('authError');
  if(!email){ errEl.style.color='var(--red)'; errEl.textContent = 'Escribe tu correo arriba primero.'; return; }
  try{ await auth.sendPasswordResetEmail(email); errEl.style.color='var(--green)'; errEl.textContent = 'Te mandamos un correo para restablecer tu contraseña.'; }
  catch(e){ errEl.style.color='var(--red)'; errEl.textContent = traducirErrorFirebase(e); }
}

// ============================================================
// ONBOARDING
// ============================================================
function renderOnboarding(){
  if(onboardSedes.length===0) onboardSedes = [{nombre:'', direccion:'', encargados:['']}];
  document.getElementById('root').innerHTML = `
    <div class="onboardwrap"><div class="onboardcard">
      <h1>Configura tu empresa</h1>
      <p style="color:var(--ink-soft);">Esto solo lo haces una vez. Todo lo puedes editar después en "Configuración".</p>
      <div class="formgrid">
        <label class="full">Nombre de tu empresa/sastrería <input type="text" id="ob_nombre" placeholder="Ej. Casa Hernández Sastres"></label>
      </div>
      <h3 style="font-family:'Fraunces',serif;color:var(--navy-deep);">Sucursales</h3>
      <div id="obSedesList"></div>
      <button class="btn ghost small" id="obAddSede" type="button">+ Agregar sucursal</button>
      <h3 style="font-family:'Fraunces',serif;color:var(--navy-deep);">Tipos de prenda que manejas (uno por línea)</h3>
      <textarea id="ob_tiposPrenda" rows="4" style="width:100%;padding:8px;" placeholder="Pantalón&#10;Saco&#10;Vestido&#10;Camisa"></textarea>
      <h3 style="font-family:'Fraunces',serif;color:var(--navy-deep);">Tipos de servicio que ofreces (uno por línea)</h3>
      <textarea id="ob_tiposServicio" rows="4" style="width:100%;padding:8px;" placeholder="Confección nueva&#10;Ajuste / Arreglo&#10;Bastilla"></textarea>
      <h3 style="font-family:'Fraunces',serif;color:var(--navy-deep);">PIN del dueño (para ver Comisiones)</h3>
      <input type="text" id="ob_pin" placeholder="Ej. 1234" style="max-width:160px;">
      <div class="autherror" id="obError"></div>
      <div class="formfoot">
        <button class="btn ghost" id="obLogout" type="button">Cerrar sesión</button>
        <button class="btn gold" id="obSaveBtn" type="button">Guardar y empezar</button>
      </div>
    </div></div>`;
  renderObSedes();
  document.getElementById('obAddSede').addEventListener('click', ()=>{ onboardSedes.push({nombre:'',direccion:'',encargados:['']}); renderObSedes(); });
  document.getElementById('obLogout').addEventListener('click', ()=>auth.signOut());
  document.getElementById('obSaveBtn').addEventListener('click', saveOnboarding);
}

function renderObSedes(){
  document.getElementById('obSedesList').innerHTML = onboardSedes.map((s,i)=>`
    <div class="sedecard">
      <div class="fields">
        <label>Nombre sucursal <input type="text" data-si="${i}" data-f="nombre" value="${s.nombre}"></label>
        <label>Dirección <input type="text" data-si="${i}" data-f="direccion" value="${s.direccion}"></label>
        <button class="btn danger small" type="button" data-removesede="${i}">✕</button>
      </div>
      <label>Encargados (uno por línea) <textarea rows="2" data-si="${i}" data-f="encargados" style="width:100%;">${(s.encargados||[]).join('\n')}</textarea></label>
    </div>`).join('');
  document.querySelectorAll('#obSedesList [data-f]').forEach(el=>{
    el.addEventListener('change', e=>{
      const i = Number(e.target.dataset.si), f = e.target.dataset.f;
      if(f==='encargados') onboardSedes[i][f] = e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);
      else onboardSedes[i][f] = e.target.value;
    });
  });
  document.querySelectorAll('[data-removesede]').forEach(b=>b.addEventListener('click', ()=>{ onboardSedes.splice(Number(b.dataset.removesede),1); renderObSedes(); }));
}

async function saveOnboarding(){
  const nombreEmpresa = document.getElementById('ob_nombre').value.trim();
  const tiposPrenda = document.getElementById('ob_tiposPrenda').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const tiposServicio = document.getElementById('ob_tiposServicio').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const ownerPin = document.getElementById('ob_pin').value.trim();
  const errEl = document.getElementById('obError');
  const sedesLimpias = onboardSedes.filter(s=>s.nombre.trim()).map(s=>({...s, encargados: (s.encargados||[]).filter(Boolean)}));

  if(!nombreEmpresa){ errEl.textContent='Ponle un nombre a tu empresa.'; return; }
  if(sedesLimpias.length===0){ errEl.textContent='Agrega al menos una sucursal con nombre.'; return; }

  const cfg = {
    nombreEmpresa,
    sedes: sedesLimpias,
    tiposPrenda,
    tiposServicio,
    tiposInventario: ["Botones","Cierres","Tela","Hilo","Forro","Otro"],
    ownerPin: ownerPin || "0000",
    commissions: {},
    createdAt: new Date().toISOString()
  };

  try {
    errEl.textContent = '⏳ Guardando...';
    errEl.style.color = 'var(--green)';
    console.log('📤 Guardando configuración en Firebase...');
    await db.collection('companies').doc(companyId).set(cfg);
    errEl.textContent = '✅ ¡Guardado correctamente!';
    companyConfig = cfg;
    await loadAllData();
    setTimeout(() => { renderRoot(); }, 500);
  } catch(e) {
    errEl.style.color = 'var(--red)';
    errEl.textContent = '❌ Error: ' + traducirErrorFirebase(e);
    console.error('Error completo:', e);
  }
}

// ============================================================
// CAPA DE DATOS
// ============================================================
async function loadCompanyConfig(){
  try {
    const doc = await db.collection('companies').doc(companyId).get();
    return doc.exists ? doc.data() : null;
  } catch(e) {
    console.error('Error cargando configuración:', e);
    return null;
  }
}

async function saveCompanyConfig(partial){
  await db.collection('companies').doc(companyId).set(partial, {merge:true});
  companyConfig = {...companyConfig, ...partial};
}

async function loadAllData(){
  try {
    const [ordersSnap, invSnap, measSnap] = await Promise.all([
      db.collection('companies').doc(companyId).collection('orders').get(),
      db.collection('companies').doc(companyId).collection('inventory').get(),
      db.collection('companies').doc(companyId).collection('measurements').get(),
    ]);
    orders = ordersSnap.docs.map(d=>({id:d.id, ...d.data()}));
    inventory = invSnap.docs.map(d=>({id:d.id, ...d.data()}));
    measurements = measSnap.docs.map(d=>({id:d.id, ...d.data()}));
  } catch(e) {
    console.error('Error cargando datos:', e);
  }
}

async function saveOrderDoc(order){
  const {id, ...data} = order;
  if(id){ await db.collection('companies').doc(companyId).collection('orders').doc(id).set(data); return id; }
  const ref = await db.collection('companies').doc(companyId).collection('orders').add(data); return ref.id;
}

async function saveInventoryDoc(item){
  const {id, ...data} = item;
  if(id){ await db.collection('companies').doc(companyId).collection('inventory').doc(id).set(data); return id; }
  const ref = await db.collection('companies').doc(companyId).collection('inventory').add(data); return ref.id;
}

async function saveMeasurementDoc(m){
  const {id, ...data} = m;
  if(id){ await db.collection('companies').doc(companyId).collection('measurements').doc(id).set(data); return id; }
  const ref = await db.collection('companies').doc(companyId).collection('measurements').add(data); return ref.id;
}

async function logAudit(accion, detalle){
  try{
    await db.collection('companies').doc(companyId).collection('auditlog').add({
      fecha: new Date().toISOString(),
      usuario: currentUser.email,
      accion, detalle: detalle || ""
    });
  }catch(e){ console.error('No se pudo registrar auditoría:', e); }
}

// ============================================================
// SHELL DE LA APP
// ============================================================
function renderRoot(){
  const root = document.getElementById('root');
  if(!currentUser){ root.innerHTML = ''; renderAuthScreen(); return; }
  if(!companyConfig){ root.innerHTML = ''; renderOnboarding(); return; }
  root.innerHTML = `
    <div id="app">
      <div class="mobile-topbar">
        <button class="hamburger" id="hamburgerBtn" aria-label="Abrir menú">☰</button>
        <div class="mtb-brand">✂️ ${companyConfig.nombreEmpresa}</div>
      </div>
      <div class="drawer-overlay" id="drawerOverlay"></div>
      <div class="sidebar" id="sidebarMain">
        <div class="brand">
          <span class="icon">✂️</span>
          <div class="txt">
            <div class="mark">${companyConfig.nombreEmpresa}</div>
            <div class="sub">Seguimiento interno</div>
          </div>
          <button class="sidebar-close" id="sidebarCloseBtn" aria-label="Cerrar menú">✕</button>
        </div>
        <nav id="nav">
          <button class="navbtn active" data-view="ordenes"><span class="dot"></span> Órdenes</button>
          <button class="navbtn" data-view="inventario"><span class="dot"></span> Inventario</button>
          <button class="navbtn" data-view="medidas"><span class="dot"></span> Medidas</button>
          <button class="navbtn" data-view="administracion"><span class="dot"></span> 🛡️ Administración</button>
        </nav>
        <div style="border-top:1px dashed #3a4a5f;padding-top:12px;">
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#B9AF9C;margin-bottom:6px;">Sesión activa</div>
          <select id="sessionSede" style="width:100%;font-size:12px;padding:6px 8px;"><option value="">Todas las sucursales (dueño)</option></select>
          <div style="font-size:10px;color:#7C7261;margin-top:4px;">Filtra Órdenes a tu sucursal.</div>
        </div>
        <div style="border-top:1px dashed #3a4a5f;padding-top:12px;display:flex;flex-direction:column;gap:6px;">
          <button class="btn ghost small" id="backupBtn" type="button" style="width:100%;color:#D8CFBE;border-color:#3a4a5f;">💾 Respaldo (JSON)</button>
          <button class="btn ghost small" id="exportBtn" type="button" style="width:100%;color:#D8CFBE;border-color:#3a4a5f;">📊 Exportar Órdenes (Excel)</button>
        </div>
        <div class="sidebar-foot">
          ${currentUser.email}<br>
          <a id="logoutLink" style="color:#D8CFBE;cursor:pointer;text-decoration:underline;">Cerrar sesión</a>
        </div>
      </div>
      <main>
        <div class="pagehead"><h1 id="pagetitle">Dashboard</h1><div class="today" id="todaylabel"></div></div>
        <div id="view"></div>
      </main>
      <nav class="bottom-tabbar">
        <button class="navbtn active" data-view="ordenes"><span class="tabicon">📋</span>Órdenes</button>
        <button class="navbtn" data-view="inventario"><span class="tabicon">🧵</span>Inventario</button>
        <button class="navbtn" data-view="medidas"><span class="tabicon">📏</span>Medidas</button>
        <button class="navbtn" data-view="administracion"><span class="tabicon">🛡️</span>Admin</button>
      </nav>
    </div>`;
  document.getElementById('logoutLink').addEventListener('click', ()=>auth.signOut());
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => { currentView = b.dataset.view; closeDrawer(); render(); }));
  setupSessionSelect();
  setupMobileDrawer();
  render();
}

function openDrawer(){
  document.getElementById('sidebarMain').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('show');
}
function closeDrawer(){
  const sb = document.getElementById('sidebarMain');
  const ov = document.getElementById('drawerOverlay');
  if(sb) sb.classList.remove('open');
  if(ov) ov.classList.remove('show');
}
function setupMobileDrawer(){
  document.getElementById('hamburgerBtn').addEventListener('click', openDrawer);
  document.getElementById('sidebarCloseBtn').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
}

function setupSessionSelect(){
  const sel = document.getElementById('sessionSede');
  sedeNames().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
  sel.value = window.__session || "";
  sel.addEventListener('change', e => { window.__session = e.target.value; window.__sedeFilter = e.target.value; render(); });
  document.getElementById('backupBtn').addEventListener('click', downloadBackup);
  document.getElementById('exportBtn').addEventListener('click', exportOrdersExcel);
}

function downloadBackup(){
  const data = { empresa: companyConfig.nombreEmpresa, orders, inventory, measurements, commissions: companyConfig.commissions||{}, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `respaldo_${companyId}_${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
}

function exportOrdersExcel(){
  const rows = orders.map(o => ({
    Ticket: ticketLabel(o.ticket), "Fecha del registro": o.fechaRecibido, "Fecha de entrega": o.fechaEntrega,
    Cliente: o.cliente, Celular: o.celular, Sede: o.sede, Encargado: o.encargado, Proceso: o.proceso,
    "Costo total": o.costo, Abonado: totalAbonado(o), Saldo: saldo(o), Entregó: o.entrego || "", Notas: o.notas || ""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Órdenes");
  XLSX.writeFile(wb, `ordenes_${todayStr()}.xlsx`);
}

function setActiveNav(view){
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  const titles = {ordenes:"Órdenes", inventario:"Inventario", medidas:"Medidas de clientes", administracion:"Administración"};
  document.getElementById('pagetitle').textContent = titles[view];
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render(){
  document.getElementById('todaylabel').textContent = "Hoy: " + new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  setActiveNav(currentView);
  const view = document.getElementById('view');
  if(currentView === 'ordenes'){ view.innerHTML = renderOrdenes(); attachOrdenesEvents(); }
  else if(currentView === 'inventario'){ view.innerHTML = renderInventario(); attachInventarioEvents(); }
  else if(currentView === 'medidas'){ view.innerHTML = renderMedidas(); attachMedidasEvents(); }
  else if(currentView === 'administracion'){
    if(!ownerUnlocked){ view.innerHTML = renderOwnerLock(); attachOwnerLockEvents(); }
    else { view.innerHTML = renderAdministracion(); attachAdministracionEvents(); }
  }
}

// ============================================================
// ADMINISTRACIÓN
// ============================================================
function renderOwnerLock(){
  return `<div class="lock"><h2>🛡️ Administración</h2>
    <p style="color:var(--ink-soft);font-size:13px;">Dashboard, Comisiones y Configuración están protegidos. Escribe el PIN del dueño para entrar.</p>
    <input type="password" id="ownerPinInput" placeholder="PIN del dueño" style="width:100%;margin:14px 0;">
    <div id="ownerLockError" style="color:var(--red);font-size:12px;height:16px;"></div>
    <button class="btn gold" id="ownerLockBtn" style="width:100%;">Entrar</button>
    <p style="color:var(--ink-soft);font-size:11px;margin-top:14px;"><a id="forgotPinLink" style="color:var(--navy);cursor:pointer;text-decoration:underline;">¿Olvidaste tu PIN?</a></p>
  </div>`;
}

function attachOwnerLockEvents(){
  document.getElementById('ownerLockBtn').addEventListener('click', () => {
    const val = document.getElementById('ownerPinInput').value;
    if(val === (companyConfig.ownerPin || "0000")){ ownerUnlocked = true; render(); }
    else document.getElementById('ownerLockError').textContent = "PIN incorrecto.";
  });
  document.getElementById('ownerPinInput').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('ownerLockBtn').click(); });
  document.getElementById('forgotPinLink').addEventListener('click', openForgotPinModal);
}

function openForgotPinModal(){
  document.getElementById('modalBox').innerHTML = `
    <h2>¿Olvidaste tu PIN?</h2>
    <p style="color:var(--ink-soft);font-size:13px;">Para restablecerlo, confirma la contraseña de la cuenta con la que iniciaste sesión (<b>${currentUser.email}</b>) y elige un PIN nuevo.</p>
    <div class="formgrid">
      <label class="full">Contraseña de tu cuenta <input type="password" id="fp_password"></label>
      <label class="full">Nuevo PIN <input type="text" id="fp_newpin" placeholder="Ej. 1234"></label>
    </div>
    <div class="autherror" id="fpError"></div>
    <div class="formfoot">
      <button class="btn ghost" id="cancelBtn" type="button">Cancelar</button>
      <button class="btn gold" id="fpSaveBtn" type="button">Restablecer PIN y entrar</button>
    </div>`;
  document.getElementById('cancelBtn').addEventListener('click', () => document.getElementById('overlay').classList.remove('show'));
  document.getElementById('fpSaveBtn').addEventListener('click', async () => {
    const pass = document.getElementById('fp_password').value;
    const newPin = document.getElementById('fp_newpin').value.trim();
    const errEl = document.getElementById('fpError');
    errEl.textContent = '';
    if(!pass){ errEl.textContent = 'Escribe tu contraseña.'; return; }
    if(!newPin){ errEl.textContent = 'Escribe un PIN nuevo.'; return; }
    try{
      const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, pass);
      await currentUser.reauthenticateWithCredential(credential);
      await saveCompanyConfig({ownerPin: newPin});
      ownerUnlocked = true;
      document.getElementById('overlay').classList.remove('show');
      render();
    }catch(e){ errEl.textContent = traducirErrorFirebase(e); }
  });
  document.getElementById('overlay').classList.add('show');
}

function renderAdministracion(){
  return `
    ${ownerSessionBar()}
    <div class="filters" style="margin-bottom:20px;">
      <button class="btn ${adminTab==='dashboard'?'gold':'ghost'} small" data-admintab="dashboard" type="button">Dashboard</button>
      <button class="btn ${adminTab==='comisiones'?'gold':'ghost'} small" data-admintab="comisiones" type="button">Comisiones</button>
      <button class="btn ${adminTab==='config'?'gold':'ghost'} small" data-admintab="config" type="button">Configuración</button>
      <button class="btn ${adminTab==='auditoria'?'gold':'ghost'} small" data-admintab="auditoria" type="button">Historial</button>
    </div>
    <div id="adminContent">Cargando…</div>`;
}

function ownerSessionBar(){
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <button class="btn ghost small" id="ownerLockBackBtn" type="button" style="border-color:var(--red);color:var(--red);">🔒 Bloquear esta sección</button>
  </div>`;
}

function wireOwnerSessionBar(){
  const btn = document.getElementById('ownerLockBackBtn');
  if(btn) btn.addEventListener('click', () => { ownerUnlocked = false; render(); });
}

async function attachAdministracionEvents(){
  wireOwnerSessionBar();
  document.querySelectorAll('[data-admintab]').forEach(b => b.addEventListener('click', () => { adminTab = b.dataset.admintab; render(); }));
  const content = document.getElementById('adminContent');
  if(adminTab === 'dashboard'){ content.innerHTML = renderDashboard(); attachDashboardEvents(); }
  else if(adminTab === 'comisiones'){ content.innerHTML = renderComisiones(); attachComisionesEvents(); }
  else if(adminTab === 'config'){ content.innerHTML = renderConfig(); attachConfigEvents(); }
  else if(adminTab === 'auditoria'){
    content.innerHTML = 'Cargando historial…';
    try{
      const snap = await db.collection('companies').doc(companyId).collection('auditlog').orderBy('fecha','desc').limit(100).get();
      window.__auditLog = snap.docs.map(d=>d.data());
    }catch(e){ window.__auditLog = []; console.error(e); }
    content.innerHTML = renderAuditoriaContent();
  }
}

function renderAuditoriaContent(){
  const rows = (window.__auditLog || []).map(a => `<tr>
    <td data-label="Fecha">${new Date(a.fecha).toLocaleString('es-MX')}</td>
    <td data-label="Usuario">${a.usuario}</td>
    <td data-label="Acción">${a.accion}</td>
    <td data-label="Detalle">${a.detalle||''}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="empty">Sin actividad registrada todavía.</td></tr>';
  return `
    <div class="note">Últimas ${(window.__auditLog||[]).length} acciones.</div>
    <table class="orders"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ============================================================
// DASHBOARD
// ============================================================
function getMonthsAvailable(){
  const set = new Set(orders.map(o=>o.fechaRecibido.slice(0,7)));
  return Array.from(set).sort().reverse();
}

function renderCorteCaja(){
  const fecha = window.__cajaFecha || todayStr();
  const sede = window.__cajaSede || "";
  let pagosDia = [];
  orders.forEach(o => { if(sede && o.sede !== sede) return; (o.pagos||[]).forEach(p => { if(p.fecha === fecha) pagosDia.push(p); }); });
  const porMetodo = {}; METODOS.forEach(m => porMetodo[m] = 0);
  pagosDia.forEach(p => { porMetodo[p.metodo] = (porMetodo[p.metodo]||0) + Number(p.monto||0); });
  const total = Object.values(porMetodo).reduce((a,b)=>a+b, 0);
  return `
    <div class="kpis" style="margin-bottom:10px;">
      ${METODOS.map(m=>`<div class="kpi"><div class="num">${fmtMoney(porMetodo[m])}</div><div class="lbl">${m}</div></div>`).join('')}
      <div class="kpi green"><div class="num">${fmtMoney(total)}</div><div class="lbl">Total del día</div></div>
    </div>
    ${pagosDia.length===0 ? '<div class="note">Sin pagos registrados en esta fecha/sucursal.</div>' : ''}`;
}

function renderDashboard(){
  const pendientes = orders.filter(o => o.proceso !== "Terminado");
  const atrasadas = pendientes.filter(o => computeAlert(o).cls === "late");
  const hoy = pendientes.filter(o => computeAlert(o).cls === "today");
  const porVencer = pendientes.filter(o => computeAlert(o).cls === "soon");
  const totalPorCobrar = orders.reduce((s,o) => s + saldo(o), 0);
  const mesActual = todayStr().slice(0,7);
  const cobradoMes = orders.reduce((s,o)=> s + (o.pagos||[]).filter(p=>p.fecha.slice(0,7)===mesActual).reduce((a,p)=>a+Number(p.monto),0), 0);

  let sedeRows = sedeNames().map(sede => {
    const os = orders.filter(o=>o.sede===sede);
    const pend = os.filter(o=>o.proceso!=="Terminado").length;
    const venc = os.filter(o=>computeAlert(o).cls==="late").length;
    const ingresos = os.filter(o=>o.fechaRecibido.slice(0,7)===mesActual).reduce((s,o)=>s+Number(o.costo),0);
    return `<tr><td data-label="Sucursal">${sede}</td><td data-label="Pendientes">${pend}</td><td data-label="Atrasadas">${venc}</td><td data-label="Ingresos del mes">${fmtMoney(ingresos)}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="empty">Agrega sucursales en Configuración.</td></tr>`;

  const mesFilter = window.__dashMes || "";
  const sedeFilter = window.__dashSede || "";
  const monthOptions = ['<option value="">Todos los meses</option>', ...getMonthsAvailable().map(m=>{
    const label = new Date(m+"-02").toLocaleDateString('es-MX',{month:'long',year:'numeric'});
    return `<option value="${m}" ${m===mesFilter?'selected':''}>${label}</option>`;
  })].join('');
  const sedeOptions = ['<option value="">Todas las sucursales</option>', ...sedeNames().map(s=>`<option value="${s}" ${s===sedeFilter?'selected':''}>${s}</option>`)].join('');

  const filtered = orders.filter(o => (!mesFilter || o.fechaRecibido.slice(0,7)===mesFilter) && (!sedeFilter || o.sede===sedeFilter));
  const terminadosF = filtered.filter(o=>o.proceso==="Terminado" && o.fechaEntregaReal);
  const onTimeF = terminadosF.filter(o=>o.fechaEntregaReal<=o.fechaEntrega).length;
  const lateF = terminadosF.length - onTimeF;
  const totalF = terminadosF.length || 1;

  const atrasoMap = {};
  filtered.forEach(o => { const key = o.encargado + "|" + o.sede; if(!atrasoMap[key]) atrasoMap[key] = {encargado:o.encargado, sede:o.sede, atrasos:0, total:0}; atrasoMap[key].total++; if(isLate(o)) atrasoMap[key].atrasos++; });
  const atrasoRanking = Object.values(atrasoMap).filter(x=>x.atrasos>0).sort((a,b)=>b.atrasos-a.atrasos).slice(0,8);

  const ventaMap = {};
  filtered.forEach(o => { const key = o.encargado + "|" + o.sede; if(!ventaMap[key]) ventaMap[key] = {encargado:o.encargado, sede:o.sede, total:0}; ventaMap[key].total += Number(o.costo||0); });
  const ventaRanking = Object.values(ventaMap).sort((a,b)=>b.total-a.total).slice(0,8);

  return `
    <div class="kpis">
      <div class="kpi"><div class="num">${pendientes.length}</div><div class="lbl">Órdenes pendientes</div></div>
      <div class="kpi red"><div class="num">${atrasadas.length}</div><div class="lbl">🔴 Atrasadas</div></div>
      <div class="kpi green"><div class="num">${hoy.length}</div><div class="lbl">🟢 Entregas de hoy</div></div>
      <div class="kpi amber"><div class="num">${porVencer.length}</div><div class="lbl">🟡 Por vencer (1-2 días)</div></div>
      <div class="kpi"><div class="num">${fmtMoney(totalPorCobrar)}</div><div class="lbl">Total por cobrar</div></div>
      <div class="kpi green"><div class="num">${fmtMoney(cobradoMes)}</div><div class="lbl">Cobrado este mes</div></div>
    </div>
    <h2 class="section-title">Resumen por sucursal</h2>
    <table class="orders"><thead><tr><th>Sucursal</th><th>Pendientes</th><th>Atrasadas</th><th>Ingresos del mes</th></tr></thead><tbody>${sedeRows}</tbody></table>
    <h2 class="section-title">Corte de caja del día</h2>
    <div class="filters">
      <input type="date" id="cajaFecha" value="${window.__cajaFecha || todayStr()}">
      <select id="cajaSede">${['<option value="">Todas las sucursales</option>', ...sedeNames().map(s=>`<option value="${s}" ${s===(window.__cajaSede||"")?'selected':''}>${s}</option>`)].join('')}</select>
    </div>
    ${renderCorteCaja()}
    <h2 class="section-title">Cumplimiento de entregas</h2>
    <div class="filters">
      <select id="dashMes">${monthOptions}</select>
      <select id="dashSede">${sedeOptions}</select>
    </div>
    <div class="barchart">
      <div class="bar-row"><div class="label">A tiempo</div><div class="bar-track"><div class="bar-fill ontime" style="width:${(onTimeF/totalF*100).toFixed(0)}%">${onTimeF}</div></div></div>
      <div class="bar-row"><div class="label">Atrasadas</div><div class="bar-track"><div class="bar-fill late" style="width:${(lateF/totalF*100).toFixed(0)}%">${lateF}</div></div></div>
      ${terminadosF.length===0 ? '<div class="note" style="margin:0;">No hay órdenes Terminadas con estos filtros.</div>' : `<div class="note" style="margin:8px 0 0;">${terminadosF.length} orden(es) entregada(s).</div>`}
    </div>
    <div class="rank-grid">
      <div>
        <h2 class="section-title" style="margin-top:0;">Ranking de atrasos</h2>
        <table class="orders"><thead><tr><th>Encargado</th><th>Sucursal</th><th>Atrasos</th><th>Total</th></tr></thead>
        <tbody>${atrasoRanking.map(a=>`<tr><td data-label="Encargado">${a.encargado}</td><td data-label="Sucursal">${a.sede}</td><td data-label="Atrasos"><b style="color:var(--red);">${a.atrasos}</b></td><td data-label="Total">${a.total}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">🎉 Sin atrasos</td></tr>'}</tbody></table>
      </div>
      <div>
        <h2 class="section-title" style="margin-top:0;">Ranking de ventas</h2>
        <table class="orders"><thead><tr><th>Encargado</th><th>Sucursal</th><th>Vendido</th></tr></thead>
        <tbody>${ventaRanking.map(a=>`<tr><td data-label="Encargado">${a.encargado}</td><td data-label="Sucursal">${a.sede}</td><td data-label="Vendido"><b style="color:var(--navy);">${fmtMoney(a.total)}</b></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sin datos</td></tr>'}</tbody></table>
      </div>
    </div>`;
}

function attachDashboardEvents(){
  document.getElementById('dashMes').addEventListener('change', e => { window.__dashMes = e.target.value; render(); });
  document.getElementById('dashSede').addEventListener('change', e => { window.__dashSede = e.target.value; render(); });
  document.getElementById('cajaFecha').addEventListener('change', e => { window.__cajaFecha = e.target.value; render(); });
  document.getElementById('cajaSede').addEventListener('change', e => { window.__cajaSede = e.target.value; render(); });
}

// ============================================================
// ÓRDENES
// ============================================================
function renderRecordatorioBanner(){
  const activos = orders.filter(o => !o.eliminado && o.proceso !== "Terminado");
  const hoy = activos.filter(o => computeAlert(o).cls === "today").length;
  const manana = activos.filter(o => daysDiff(o.fechaEntrega) === 1).length;
  if(hoy===0 && manana===0) return '';
  const partes = [];
  if(hoy>0) partes.push(`${hoy} entrega(s) para HOY`);
  if(manana>0) partes.push(`${manana} para MAÑANA`);
  return `<div class="note" style="background:var(--amber-bg);border-color:var(--amber);color:#7F5A00;">⏰ ${partes.join(' y ')}</div>`;
}

function renderOrdenes(){
  const sesion = window.__session || "";
  const sedeFilter = sesion || window.__sedeFilter || "";
  const procFilter = window.__procFilter || "";
  const searchTerm = (window.__search || "").toLowerCase();
  const verPapelera = !!window.__papelera;
  let rows = orders.filter(o => {
    if(verPapelera){ if(!o.eliminado) return false; }
    else { if(o.eliminado) return false; }
    if(sedeFilter && o.sede !== sedeFilter) return false;
    if(procFilter && o.proceso !== procFilter) return false;
    if(searchTerm && !(ticketLabel(o.ticket).toLowerCase().includes(searchTerm) || o.cliente.toLowerCase().includes(searchTerm) || o.celular.includes(searchTerm))) return false;
    return true;
  }).sort((a,b) => b.ticket - a.ticket);

  const rowsHtml = rows.map(o => {
    const alert = computeAlert(o);
    const pend = saldo(o);
    const prendasResumen = (o.prendas||[]).map(p=>p.tipo).join(", ") || "—";
    const thumbs = (o.prendas||[]).filter(p=>p.foto).slice(0,3).map(p=>`<img src="${p.foto}">`).join('');
    return `<tr class="${alert.cls==='late' ? 'overdue':''}" data-view="${o.id}" style="cursor:pointer;">
      <td class="ticket" data-label="Ticket">${ticketLabel(o.ticket)}</td>
      <td data-label="Cliente">${o.cliente}<br><span style="color:var(--ink-soft);font-size:11.5px;">${o.celular}</span></td>
      <td data-label="Prendas">${prendasResumen}<div class="thumbs">${thumbs}</div></td>
      <td data-label="Sede/Encargado">${o.sede}<br><span style="color:var(--ink-soft);font-size:11.5px;">${o.encargado}</span></td>
      <td data-label="Registro/Entrega">Reg: ${new Date(o.fechaRecibido+"T00:00:00").toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}<br>Entr: ${new Date(o.fechaEntrega+"T00:00:00").toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</td>
      <td data-label="Proceso"><span class="procbadge">${o.proceso}</span></td>
      <td data-label="Costo/Saldo">${fmtMoney(o.costo)}<br><span style="color:var(--ink-soft);font-size:11.5px;">saldo ${fmtMoney(pend)}</span></td>
      <td data-label="Alerta">${verPapelera ? '<span class="badge done">Archivado</span>' : `<span class="badge ${alert.cls}">${alert.label}</span>`}</td>
      <td><button class="rowbtn" data-edit="${o.id}">${verPapelera?'Ver':'Editar'}</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" class="empty">${verPapelera ? 'Papelera vacía.' : 'Sin órdenes.'}</td></tr>`;

  const procOptions = ['<option value="">Todos los procesos</option>', ...["Pendiente","Haciéndose","Terminado"].map(p=>`<option value="${p}" ${p===procFilter?'selected':''}>${p}</option>`)].join('');
  const sedeControl = sesion
    ? `<span class="procbadge" style="padding:8px 12px;">📍 ${sesion}</span>`
    : `<select id="sedeFilter"><option value="">Todas las sucursales</option>${sedeNames().map(s=>`<option value="${s}" ${s===sedeFilter?'selected':''}>${s}</option>`).join('')}</select>`;

  if(sedeNames().length===0) return `<div class="note">Primero agrega al menos una sucursal en Configuración.</div>`;

  const archivadosCount = orders.filter(o=>o.eliminado).length;

  return `
    ${verPapelera ? '' : renderRecordatorioBanner()}
    <div class="filters">
      <input type="text" id="searchInput" placeholder="Buscar..." value="${window.__search||''}" style="min-width:220px;">
      ${sedeControl}
      <select id="procFilter">${procOptions}</select>
      <span style="flex:1;"></span>
      <button class="btn ghost small" id="papeleraBtn" type="button">${verPapelera ? '⬅️ Volver' : `🗑️ Papelera (${archivadosCount})`}</button>
      ${verPapelera ? '' : '<button class="btn gold" id="newOrderBtn">➕ Nueva orden</button>'}
    </div>
    <table class="orders">
      <thead><tr><th>Ticket</th><th>Cliente</th><th>Prendas</th><th>Sede / Encargado</th><th>Registro / Entrega</th><th>Proceso</th><th>Costo / Saldo</th><th>Alerta</th><th></th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function attachOrdenesEvents(){
  document.getElementById('searchInput').addEventListener('input', e => { window.__search = e.target.value; render(); });
  const sedeSel = document.getElementById('sedeFilter');
  if(sedeSel) sedeSel.addEventListener('change', e => { window.__sedeFilter = e.target.value; render(); });
  document.getElementById('procFilter').addEventListener('change', e => { window.__procFilter = e.target.value; render(); });
  document.getElementById('papeleraBtn').addEventListener('click', () => { window.__papelera = !window.__papelera; render(); });
  const newBtn = document.getElementById('newOrderBtn');
  if(newBtn) newBtn.addEventListener('click', () => openOrderModal(null));
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openOrderModal(b.dataset.edit); }));
  document.querySelectorAll('tr[data-view]').forEach(tr => tr.addEventListener('click', () => openDetailModal(tr.dataset.view)));
}

// ============================================================
// ÓRDENES - MODALES
// ============================================================
function renderPrendasRows(){
  document.getElementById('prendasList').innerHTML = draftPrendas.map((p, i) => `
    <div class="subrow">
      <div class="fields">
        <label>Tipo <select data-pi="${i}" data-field="tipo">${(companyConfig.tiposPrenda||[]).map(t=>`<option ${t===p.tipo?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>Servicio <select data-pi="${i}" data-field="servicio">${(companyConfig.tiposServicio||[]).map(t=>`<option ${t===p.servicio?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>Detalle <input type="text" data-pi="${i}" data-field="nota" value="${p.nota||''}"></label>
        <label>Precio <input type="number" data-pi="${i}" data-field="precio" value="${p.precio||0}" min="0"></label>
        <label>Foto ${p.foto?`<img src="${p.foto}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">`:''}<input type="file" accept="image/*" capture="environment" data-pi="${i}" data-field="foto"></label>
        <button class="btn danger small" data-removeprenda="${i}" type="button">✕</button>
      </div>
    </div>`).join('') || `<div class="note">Sin prendas.</div>`;

  document.querySelectorAll('#prendasList select[data-field], #prendasList input[type=text]').forEach(el => {
    el.addEventListener('change', e => { draftPrendas[e.target.dataset.pi][e.target.dataset.field] = e.target.value; });
  });
  document.querySelectorAll('#prendasList input[data-field="precio"]').forEach(el => {
    el.addEventListener('input', e => { draftPrendas[e.target.dataset.pi].precio = Number(e.target.value)||0; recomputeCostoTotal(); });
  });
  document.querySelectorAll('#prendasList input[type=file]').forEach(el => {
    el.addEventListener('change', async e => {
      const f = e.target.files[0]; if(!f) return;
      const dataUrl = await resizeImage(f, 240);
      draftPrendas[e.target.dataset.pi].foto = dataUrl;
      renderPrendasRows();
    });
  });
  document.querySelectorAll('[data-removeprenda]').forEach(b => b.addEventListener('click', () => { draftPrendas.splice(Number(b.dataset.removeprenda), 1); renderPrendasRows(); recomputeCostoTotal(); }));
}

function renderPagosRows(){
  document.getElementById('pagosList').innerHTML = draftPagos.map((p, i) => `
    <div class="subrow"><div class="fields" style="grid-template-columns:1fr 1fr 1fr auto;">
      <label>Fecha <input type="date" data-gi="${i}" data-field="fecha" value="${p.fecha}"></label>
      <label>Monto <input type="number" data-gi="${i}" data-field="monto" value="${p.monto}" min="0"></label>
      <label>Método <select data-gi="${i}" data-field="metodo">${METODOS.map(m=>`<option ${m===p.metodo?'selected':''}>${m}</option>`).join('')}</select></label>
      <button class="btn danger small" data-removepago="${i}" type="button">✕</button>
    </div></div>`).join('') || `<div class="note">Sin pagos.</div>`;
  document.querySelectorAll('#pagosList select, #pagosList input').forEach(el => {
    el.addEventListener('change', e => { const f = e.target.dataset.field; draftPagos[e.target.dataset.gi][f] = f === 'monto' ? Number(e.target.value) : e.target.value; updateSubtotal(); });
  });
  document.querySelectorAll('[data-removepago]').forEach(b => b.addEventListener('click', () => { draftPagos.splice(Number(b.dataset.removepago), 1); renderPagosRows(); updateSubtotal(); }));
  updateSubtotal();
}

function recomputeCostoTotal(){
  const costo = draftPrendas.reduce((s,p)=>s+Number(p.precio||0),0);
  const f = document.getElementById('f_costo'); if(f) f.value = costo;
  updateSubtotal();
}

function updateSubtotal(){
  const costo = Number(document.getElementById('f_costo')?.value || 0);
  const abonado = draftPagos.reduce((s,p)=>s+Number(p.monto||0),0);
  document.getElementById('subtotalBox').textContent = `Costo: ${fmtMoney(costo)} · Abonado: ${fmtMoney(abonado)} · Saldo: ${fmtMoney(costo-abonado)}`;
}

function openOrderModal(id){
  editingId = id;
  const sesion = window.__session || "";
  const nextTicket = orders.length ? Math.max(...orders.map(o=>o.ticket)) + 1 : 1;
  const defaultSede = sesion || sedeNames()[0];
  const o = id ? orders.find(x=>x.id===id) : {
    ticket: nextTicket, fechaRecibido: todayStr(), cliente:"", celular:"",
    fechaEntrega: todayStr(), sede: defaultSede, encargado: sedeInfo(defaultSede).encargados[0] || "",
    proceso:"Pendiente", costo:0, entrego:"", notas:"", prendas:[], pagos:[], fechaEntregaReal:null
  };
  draftPrendas = JSON.parse(JSON.stringify(o.prendas||[]));
  draftPagos = JSON.parse(JSON.stringify(o.pagos||[]));

  document.getElementById('modalBox').innerHTML = `
    <h2>${id ? `Editar ${ticketLabel(o.ticket)}` : `Nueva orden (${ticketLabel(nextTicket)})`}</h2>
    <div class="formgrid">
      <label>Registro <input type="date" id="f_fechaRecibido" value="${o.fechaRecibido}"></label>
      <label>Cliente <input type="text" id="f_cliente" value="${o.cliente}"></label>
      <label>Celular <input type="tel" id="f_celular" value="${o.celular}"></label>
      <label>Entrega <input type="date" id="f_fechaEntrega" value="${o.fechaEntrega}"></label>
      <label>Sede <select id="f_sede">${sedeNames().map(s=>`<option ${s===o.sede?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Encargado <select id="f_encargado"></select></label>
      <label>Proceso <select id="f_proceso">${["Pendiente","Haciéndose","Terminado"].map(p=>`<option ${p===o.proceso?'selected':''}>${p}</option>`).join('')}</select></label>
      <label>Costo total <input type="number" id="f_costo" value="${o.costo}" readonly></label>
      <label>Entregó <input type="text" id="f_entrego" value="${o.entrego}"></label>
      <label class="full">Notas <input type="text" id="f_notas" value="${o.notas||''}"></label>
    </div>
    <h3>Prendas</h3>
    <div id="prendasList"></div>
    <button class="btn ghost small" id="addPrendaBtn" type="button">+ Agregar prenda</button>
    <h3>Pagos</h3>
    <div id="pagosList"></div>
    <button class="btn ghost small" id="addPagoBtn" type="button">+ Agregar pago</button>
    <div class="subtotal" id="subtotalBox"></div>
    <div id="historyBox"></div>
    <div class="formfoot">
      <button class="btn ghost" id="cancelBtn" type="button">Cancelar</button>
      <button class="btn gold" id="saveBtn" type="button">Guardar</button>
    </div>`;

  function fillEncargados(){
    const sede = document.getElementById('f_sede').value;
    document.getElementById('f_encargado').innerHTML = sedeInfo(sede).encargados.map(n=>`<option ${n===o.encargado?'selected':''}>${n}</option>`).join('');
  }
  fillEncargados();
  document.getElementById('f_sede').addEventListener('change', fillEncargados);
  renderPrendasRows(); renderPagosRows(); recomputeCostoTotal();

  const hist = orders.filter(x => x.celular === o.celular && x.id !== id);
  const historyBox = document.getElementById('historyBox');
  if(o.celular && hist.length){
    historyBox.innerHTML = `<div class="historybox"><b>Historial</b> (${o.celular}) — ${hist.length} orden(es)
      <ul>${hist.slice(0,5).map(x=>`<li>${ticketLabel(x.ticket)} — ${fmtMoney(x.costo)}</li>`).join('')}</ul></div>`;
  }

  document.getElementById('cancelBtn').addEventListener('click', () => {
    if(confirm('¿Cerrar sin guardar?')) document.getElementById('overlay').classList.remove('show');
  });
  document.getElementById('addPrendaBtn').addEventListener('click', () => {
    draftPrendas.push({tipo:(companyConfig.tiposPrenda||[])[0]||"", servicio:(companyConfig.tiposServicio||[])[0]||"", nota:"", precio:0, foto:""});
    renderPrendasRows(); recomputeCostoTotal();
  });
  document.getElementById('addPagoBtn').addEventListener('click', () => { draftPagos.push({fecha: todayStr(), monto:0, metodo:METODOS[0]}); renderPagosRows(); });
  document.getElementById('saveBtn').addEventListener('click', saveOrderFromModal);
  document.getElementById('overlay').classList.add('show');
}

async function saveOrderFromModal(){
  const data = {
    ticket: editingId ? orders.find(o=>o.id===editingId).ticket : (orders.length ? Math.max(...orders.map(o=>o.ticket))+1 : 1),
    fechaRecibido: document.getElementById('f_fechaRecibido').value,
    cliente: document.getElementById('f_cliente').value.trim(),
    celular: document.getElementById('f_celular').value.trim(),
    fechaEntrega: document.getElementById('f_fechaEntrega').value,
    sede: document.getElementById('f_sede').value,
    encargado: document.getElementById('f_encargado').value,
    proceso: document.getElementById('f_proceso').value,
    costo: Number(document.getElementById('f_costo').value),
    entrego: document.getElementById('f_entrego').value.trim(),
    notas: document.getElementById('f_notas').value.trim(),
    prendas: draftPrendas, pagos: draftPagos,
  };
  if(!data.cliente || !data.celular){ alert("Cliente y celular son obligatorios."); return; }
  if(editingId){
    const prev = orders.find(o=>o.id===editingId);
    let fechaEntregaReal = prev.fechaEntregaReal || null;
    if(data.proceso === "Terminado" && prev.proceso !== "Terminado") fechaEntregaReal = todayStr();
    if(data.proceso !== "Terminado") fechaEntregaReal = null;
    const updated = {...prev, ...data, fechaEntregaReal, id: editingId};
    await saveOrderDoc(updated);
    const idx = orders.findIndex(o=>o.id===editingId); orders[idx] = updated;
    await logAudit('Editar orden', `${ticketLabel(updated.ticket)} — ${updated.cliente}`);
  }else{
    const newOrder = {...data, fechaEntregaReal: data.proceso==="Terminado" ? todayStr() : null};
    const newId = await saveOrderDoc(newOrder);
    orders.push({...newOrder, id:newId});
    await logAudit('Crear orden', `${ticketLabel(newOrder.ticket)} — ${newOrder.cliente}`);
  }
  document.getElementById('overlay').classList.remove('show');
  render();
}

function receiptLinesHtml(o){
  return (o.prendas||[]).map(p => `<div class="rline"><span>${p.tipo} - ${p.servicio}${p.nota?` - ${p.nota}`:''}</span><span>${fmtMoney(p.precio||0)}</span></div>`).join('') || '<div class="rline"><span>(sin prendas)</span><span></span></div>';
}

function openDetailModal(id){
  const o = orders.find(x=>x.id===id); if(!o) return;
  const alert = computeAlert(o);
  document.getElementById('modalBox').innerHTML = `
    <h2>Detalle ${ticketLabel(o.ticket)} <span class="badge ${alert.cls}">${alert.label}</span></h2>
    <div class="receipt">
      <div class="rtitle">${companyConfig.nombreEmpresa}</div>
      <div class="rsmall">${sedeInfo(o.sede).direccion || o.sede}</div>
      <div class="rdiv"></div>
      <div class="rline"><span>Ticket</span><span>${ticketLabel(o.ticket)}</span></div>
      <div class="rline"><span>Registro</span><span>${new Date(o.fechaRecibido+"T00:00:00").toLocaleDateString('es-MX')}</span></div>
      <div class="rline"><span>Entrega</span><span>${new Date(o.fechaEntrega+"T00:00:00").toLocaleDateString('es-MX')}</span></div>
      <div class="rline"><span>Cliente</span><span>${o.cliente}</span></div>
      <div class="rline"><span>Celular</span><span>${o.celular}</span></div>
      <div class="rline"><span>Sede / Encargado</span><span>${o.sede} / ${o.encargado}</span></div>
      <div class="rline"><span>Proceso</span><span>${o.proceso}</span></div>
      <div class="rdiv"></div>${receiptLinesHtml(o)}<div class="rdiv"></div>
      <div class="rline"><b>Costo total</b><b>${fmtMoney(o.costo)}</b></div>
      <div class="rline"><span>Abonado</span><span>${fmtMoney(totalAbonado(o))}</span></div>
      <div class="rline"><b>Saldo</b><b>${fmtMoney(saldo(o))}</b></div>
      ${o.notas ? `<div class="rline"><span>Notas</span><span>${o.notas}</span></div>` : ''}
    </div>
    <div class="formfoot">
      <button class="btn ghost" id="cancelBtn" type="button">Cerrar</button>
      <button class="btn ghost" id="printClienteBtn" type="button">🖨️ Ticket</button>
      <button class="btn gold" id="editFromDetailBtn" type="button">Editar</button>
    </div>`;
  document.getElementById('cancelBtn').addEventListener('click', () => document.getElementById('overlay').classList.remove('show'));
  document.getElementById('editFromDetailBtn').addEventListener('click', () => openOrderModal(o.id));
  document.getElementById('printClienteBtn').addEventListener('click', () => printTicket(o, 'cliente'));
  document.getElementById('overlay').classList.add('show');
}

function printTicket(o, tipo){
  const area = document.getElementById('printArea');
  area.innerHTML = `<div class="receipt" style="border:none;background:#fff;padding:0;">
    <div class="rtitle">${companyConfig.nombreEmpresa}</div>
    <div class="rsmall">${sedeInfo(o.sede).direccion || o.sede}</div>
    <div class="rdiv"></div>
    <div class="rline"><b>TICKET</b><b>${ticketLabel(o.ticket)}</b></div>
    <div class="rline"><span>Cliente</span><span>${o.cliente}</span></div>
    <div class="rline"><span>Entrega</span><span>${new Date(o.fechaEntrega+"T00:00:00").toLocaleDateString('es-MX')}</span></div>
    <div class="rdiv"></div>${receiptLinesHtml(o)}<div class="rdiv"></div>
    <div class="rline"><b>TOTAL</b><b>${fmtMoney(o.costo)}</b></div>
    <div class="rline"><b>SALDO</b><b>${fmtMoney(saldo(o))}</b></div>
    <div class="rlegal">${LEGAL_TEXT}</div>
  </div>`;
  window.print();
}

function toggleArchiveOrder(o, archivar){
  const msg = archivar ? `¿Archivar ${ticketLabel(o.ticket)}?` : `¿Restaurar ${ticketLabel(o.ticket)}?`;
  if(!confirm(msg)) return;
  const updated = {...o, eliminado: archivar};
  saveOrderDoc(updated).then(() => {
    const idx = orders.findIndex(x=>x.id===o.id); orders[idx] = updated;
    render();
  });
}

// ============================================================
// INVENTARIO
// ============================================================
function renderInventario(){
  const sedeFilter = window.__invSede || "";
  const tipoFilter = window.__invTipo || "";
  let rows = inventory.filter(x => (!sedeFilter || x.sede===sedeFilter) && (!tipoFilter || x.tipo===tipoFilter)).sort((a,b)=> b.fecha.localeCompare(a.fecha));
  const bajos = inventory.filter(x => Number(x.existenciaActual) < Number(x.stockMinimo||0) && Number(x.stockMinimo||0) > 0);
  const rowsHtml = rows.map(x => {
    const stockBajo = Number(x.existenciaActual) < Number(x.stockMinimo||0) && Number(x.stockMinimo||0) > 0;
    return `<tr class="${stockBajo?'overdue':''}">
      <td data-label="Fecha">${new Date(x.fecha+"T00:00:00").toLocaleDateString('es-MX')}</td>
      <td data-label="Sede">${x.sede}</td><td data-label="Tipo">${x.tipo}</td><td data-label="Descripción">${x.descripcion}</td>
      <td data-label="Cantidad">${x.cantidad} ${x.unidad}</td>
      <td data-label="Existencia">${x.existenciaActual!==undefined ? `${x.existenciaActual} ${x.unidad}${stockBajo?' ⚠️':''}` : '—'}</td>
      <td data-label="Proveedor">${x.proveedor||'—'}</td>
      <td><button class="rowbtn" data-editinv="${x.id}">Editar</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty">Sin materiales.</td></tr>`;
  const sedeOptions = ['<option value="">Todas</option>', ...sedeNames().map(s=>`<option value="${s}" ${s===sedeFilter?'selected':''}>${s}</option>`)].join('');
  const tipoOptions = ['<option value="">Todos</option>', ...(companyConfig.tiposInventario||[]).map(t=>`<option value="${t}" ${t===tipoFilter?'selected':''}>${t}</option>`)].join('');
  return `
    ${bajos.length ? `<div class="note" style="background:var(--red-bg);border-color:var(--red);color:var(--red);">⚠️ ${bajos.length} material(es) por debajo del stock mínimo</div>` : ''}
    <div class="filters">
      <select id="invSede">${sedeOptions}</select>
      <select id="invTipo">${tipoOptions}</select>
      <span style="flex:1;"></span>
      <button class="btn gold" id="newInvBtn">➕ Nuevo material</button>
    </div>
    <table class="orders"><thead><tr><th>Fecha</th><th>Sede</th><th>Tipo</th><th>Descripción</th><th>Cantidad</th><th>Existencia</th><th>Proveedor</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function attachInventarioEvents(){
  document.getElementById('invSede').addEventListener('change', e => { window.__invSede = e.target.value; render(); });
  document.getElementById('invTipo').addEventListener('change', e => { window.__invTipo = e.target.value; render(); });
  document.getElementById('newInvBtn').addEventListener('click', () => openInventoryModal(null));
  document.querySelectorAll('[data-editinv]').forEach(b => b.addEventListener('click', () => openInventoryModal(b.dataset.editinv)));
}

function openInventoryModal(id){
  const it = id ? inventory.find(x=>x.id===id) : { fecha: todayStr(), sede:sedeNames()[0]||"", tipo:(companyConfig.tiposInventario||[])[0]||"", descripcion:"", cantidad:0, unidad:UNIDADES[0], proveedor:"", costo:0, existenciaActual:0, stockMinimo:0 };
  document.getElementById('modalBox').innerHTML = `
    <h2>${id ? 'Editar material' : 'Nuevo material'}</h2>
    <div class="formgrid">
      <label>Fecha <input type="date" id="i_fecha" value="${it.fecha}"></label>
      <label>Sede <select id="i_sede">${sedeNames().map(s=>`<option ${s===it.sede?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Tipo <select id="i_tipo">${(companyConfig.tiposInventario||[]).map(t=>`<option ${t===it.tipo?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Descripción <input type="text" id="i_descripcion" value="${it.descripcion}"></label>
      <label>Cantidad <input type="number" id="i_cantidad" value="${it.cantidad}" min="0"></label>
      <label>Unidad <select id="i_unidad">${UNIDADES.map(u=>`<option ${u===it.unidad?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>Proveedor <input type="text" id="i_proveedor" value="${it.proveedor||''}"></label>
      <label>Existencia actual <input type="number" id="i_existenciaActual" value="${it.existenciaActual||0}" min="0"></label>
      <label>Stock mínimo <input type="number" id="i_stockMinimo" value="${it.stockMinimo||0}" min="0"></label>
    </div>
    <div class="formfoot"><button class="btn ghost" id="cancelBtn" type="button">Cancelar</button><button class="btn gold" id="saveInvBtn" type="button">Guardar</button></div>`;
  document.getElementById('cancelBtn').addEventListener('click', () => document.getElementById('overlay').classList.remove('show'));
  document.getElementById('saveInvBtn').addEventListener('click', async () => {
    const data = {
      fecha: document.getElementById('i_fecha').value, sede: document.getElementById('i_sede').value,
      tipo: document.getElementById('i_tipo').value, descripcion: document.getElementById('i_descripcion').value.trim(),
      cantidad: Number(document.getElementById('i_cantidad').value), unidad: document.getElementById('i_unidad').value,
      proveedor: document.getElementById('i_proveedor').value.trim(),
      existenciaActual: Number(document.getElementById('i_existenciaActual').value),
      stockMinimo: Number(document.getElementById('i_stockMinimo').value),
    };
    if(!data.descripcion){ alert("La descripción es obligatoria."); return; }
    if(id){ const merged = {...it, ...data, id}; await saveInventoryDoc(merged); const idx = inventory.findIndex(x=>x.id===id); inventory[idx] = merged; }
    else { const newId = await saveInventoryDoc(data); inventory.push({...data, id:newId}); }
    document.getElementById('overlay').classList.remove('show'); render();
  });
  document.getElementById('overlay').classList.add('show');
}

// ============================================================
// MEDIDAS
// ============================================================
function renderMedidas(){
  const searchTerm = (window.__measSearch || "").toLowerCase();
  let rows = measurements.filter(m => !searchTerm || m.cliente.toLowerCase().includes(searchTerm) || m.celular.includes(searchTerm)).sort((a,b)=>a.cliente.localeCompare(b.cliente));
  const rowsHtml = rows.map(m => `<tr>
    <td data-label="Cliente">${m.cliente}<br><span style="color:var(--ink-soft);font-size:11.5px;">${m.celular}</span></td>
    <td data-label="Prenda">${m.tipo}</td>
    <td data-label="Medidas (cm)">${MEDIDAS_CAMPOS[m.tipo].map(c=>`${c}: ${m.medidas[c]??'—'}cm`).join(' · ')}</td>
    <td data-label="Actualizado">${new Date(m.fechaActualizacion+"T00:00:00").toLocaleDateString('es-MX')}</td>
    <td><button class="rowbtn" data-editmeas="${m.id}">Editar</button></td>
  </tr>`).join('') || `<tr><td colspan="5" class="empty">Sin medidas.</td></tr>`;
  return `
    <div class="filters"><input type="text" id="measSearch" placeholder="Buscar..." value="${window.__measSearch||''}" style="min-width:240px;"><span style="flex:1;"></span><button class="btn gold" id="newMeasBtn">➕ Nuevas medidas</button></div>
    <table class="orders"><thead><tr><th>Cliente</th><th>Prenda</th><th>Medidas (cm)</th><th>Actualizado</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function attachMedidasEvents(){
  document.getElementById('measSearch').addEventListener('input', e => { window.__measSearch = e.target.value; render(); });
  document.getElementById('newMeasBtn').addEventListener('click', () => openMeasureModal(null));
  document.querySelectorAll('[data-editmeas]').forEach(b => b.addEventListener('click', () => openMeasureModal(b.dataset.editmeas)));
}

function renderMeasureFields(tipo, medidas){
  return MEDIDAS_CAMPOS[tipo].map(campo => `<label>${campo} (cm) <input type="number" class="measfield" data-campo="${campo}" value="${medidas[campo]??''}" min="0"></label>`).join('');
}

function openMeasureModal(id){
  editingMeasureId = id;
  const m = id ? measurements.find(x=>x.id===id) : { cliente:"", celular:"", tipo:"Saco", medidas:{}, notas:"", historial:[] };
  document.getElementById('modalBox').innerHTML = `
    <h2>${id ? 'Editar medidas' : 'Nuevas medidas'}</h2>
    <div class="formgrid">
      <label>Cliente <input type="text" id="m_cliente" value="${m.cliente}"></label>
      <label>Celular <input type="tel" id="m_celular" value="${m.celular}"></label>
      <label>Prenda <select id="m_tipo">${Object.keys(MEDIDAS_CAMPOS).map(t=>`<option ${t===m.tipo?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="full">Notas <input type="text" id="m_notas" value="${m.notas||''}"></label>
    </div>
    <h3>Medidas (cm)</h3>
    <div class="measure-layout"><div class="measure-fields" id="measureFields"></div><div class="measure-diagram" id="measureDiagram"></div></div>
    ${(m.historial&&m.historial.length) ? `<div class="historybox"><b>Historial</b><ul>${m.historial.map(h=>`<li>${new Date(h.fecha+"T00:00:00").toLocaleDateString('es-MX')}: ${Object.entries(h.medidas).map(([k,v])=>`${k} ${v}cm`).join(', ')}</li>`).join('')}</ul></div>` : ''}
    <div class="formfoot"><button class="btn ghost" id="cancelBtn" type="button">Cancelar</button><button class="btn gold" id="saveMeasBtn" type="button">Guardar</button></div>`;
  function fillFields(){
    document.getElementById('measureFields').innerHTML = renderMeasureFields(document.getElementById('m_tipo').value, m.medidas);
    document.getElementById('measureDiagram').innerHTML = MEDIDAS_DIAGRAMS[document.getElementById('m_tipo').value] || '';
  }
  fillFields();
  document.getElementById('m_tipo').addEventListener('change', fillFields);
  document.getElementById('cancelBtn').addEventListener('click', () => document.getElementById('overlay').classList.remove('show'));
  document.getElementById('saveMeasBtn').addEventListener('click', async () => {
    const cliente = document.getElementById('m_cliente').value.trim();
    const celular = document.getElementById('m_celular').value.trim();
    const tipo = document.getElementById('m_tipo').value;
    const notas = document.getElementById('m_notas').value.trim();
    if(!cliente || !celular){ alert("Cliente y celular son obligatorios."); return; }
    const medidas = {};
    document.querySelectorAll('.measfield').forEach(inp => { medidas[inp.dataset.campo] = Number(inp.value)||0; });
    if(id){
      const historial = m.historial || [];
      if(m.medidas && Object.keys(m.medidas).length) historial.push({fecha: m.fechaActualizacion, medidas: m.medidas});
      const updated = {...m, cliente, celular, tipo, medidas, notas, fechaActualizacion: todayStr(), historial, id};
      await saveMeasurementDoc(updated);
      const idx = measurements.findIndex(x=>x.id===id); measurements[idx] = updated;
    }else{
      const newM = { cliente, celular, tipo, medidas, notas, fechaActualizacion: todayStr(), historial:[] };
      const newId = await saveMeasurementDoc(newM);
      measurements.push({...newM, id:newId});
    }
    document.getElementById('overlay').classList.remove('show'); render();
  });
  document.getElementById('overlay').classList.add('show');
}

// ============================================================
// COMISIONES
// ============================================================
function renderComisiones(){
  const mesActual = todayStr().slice(0,7);
  let allStaff = [];
  (companyConfig.sedes||[]).forEach(s => (s.encargados||[]).forEach(n => allStaff.push({sede:s.nombre, nombre:n})));
  const commissions = companyConfig.commissions || {};
  const rows = allStaff.map(({sede,nombre}) => {
    const key = sede+"|"+nombre;
    const total = orders.filter(o=>o.sede===sede && o.encargado===nombre && o.fechaRecibido.slice(0,7)===mesActual).reduce((s,o)=>s+Number(o.costo),0);
    const pct = commissions[key] !== undefined ? commissions[key] : 10;
    const comision = total * pct/100;
    return `<tr><td data-label="Encargado">${nombre}</td><td data-label="Sede">${sede}</td><td data-label="Total">${fmtMoney(total)}</td>
      <td data-label="%"><input type="number" class="pctinput" data-key="${key}" value="${pct}" min="0" max="100">%</td>
      <td data-label="Comisión">${fmtMoney(comision)}</td></tr>`;
  }).join('');
  const totalGeneral = allStaff.reduce((s,{sede,nombre})=>{
    const total = orders.filter(o=>o.sede===sede && o.encargado===nombre && o.fechaRecibido.slice(0,7)===mesActual).reduce((s,o)=>s+Number(o.costo),0);
    const pct = commissions[sede+"|"+nombre] !== undefined ? commissions[sede+"|"+nombre] : 10;
    return s + total*pct/100;
  },0);
  return `
    <div class="note">Mes: ${new Date(mesActual+"-02").toLocaleDateString('es-MX',{month:'long',year:'numeric'})}</div>
    <table class="commissions"><thead><tr><th>Encargado</th><th>Sede</th><th>Total</th><th>%</th><th>Comisión</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">Sin encargados.</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;"><td colspan="4" data-label="">Total</td><td data-label="Total general">${fmtMoney(totalGeneral)}</td></tr></tfoot>
    </table>`;
}

function attachComisionesEvents(){
  document.querySelectorAll('.pctinput').forEach(inp => {
    inp.addEventListener('change', async e => {
      const commissions = {...(companyConfig.commissions||{})};
      commissions[e.target.dataset.key] = Number(e.target.value);
      await saveCompanyConfig({commissions});
      render();
    });
  });
}

// ============================================================
// CONFIGURACIÓN
// ============================================================
let draftSedes = [];

function renderConfig(){
  draftSedes = JSON.parse(JSON.stringify(companyConfig.sedes||[]));
  return `
    <div class="formgrid">
      <label class="full">Nombre empresa <input type="text" id="cfg_nombre" value="${companyConfig.nombreEmpresa}"></label>
    </div>
    <h3>Sucursales</h3>
    <div id="cfgSedesList"></div>
    <button class="btn ghost small" id="cfgAddSede" type="button">+ Agregar sucursal</button>
    <h3>Tipos de prenda</h3>
    <textarea id="cfg_tiposPrenda" rows="4" style="width:100%;padding:8px;">${(companyConfig.tiposPrenda||[]).join('\n')}</textarea>
    <h3>Tipos de servicio</h3>
    <textarea id="cfg_tiposServicio" rows="4" style="width:100%;padding:8px;">${(companyConfig.tiposServicio||[]).join('\n')}</textarea>
    <h3>Tipos de inventario</h3>
    <textarea id="cfg_tiposInventario" rows="3" style="width:100%;padding:8px;">${(companyConfig.tiposInventario||[]).join('\n')}</textarea>
    <div class="formfoot"><button class="btn gold" id="cfgSaveBtn" type="button">Guardar</button></div>

    <h3 style="margin-top:30px;">🔒 PIN del dueño</h3>
    <input type="text" id="cfg_pin" value="${companyConfig.ownerPin||'0000'}" style="max-width:160px;">
    <button class="btn ghost small" id="cfgSavePinBtn" type="button" style="margin-top:10px;">Guardar PIN</button>

    <h3 style="margin-top:30px;">👤 Cuenta de acceso</h3>
    <div class="note">Correo actual: <b>${currentUser.email}</b></div>
    <div class="formgrid">
      <label>Nuevo correo <input type="email" id="cfg_newEmail" placeholder="nuevo@correo.com"></label>
      <label>Contraseña actual <input type="password" id="cfg_emailPassword"></label>
    </div>
    <div class="autherror" id="cfgEmailMsg"></div>
    <button class="btn ghost small" id="cfgChangeEmailBtn" type="button">Cambiar correo</button>

    <h3 style="margin-top:24px;">🔑 Cambiar contraseña</h3>
    <div class="formgrid">
      <label>Contraseña actual <input type="password" id="cfg_currentPassword"></label>
      <label></label>
      <label>Nueva contraseña <input type="password" id="cfg_newPassword"></label>
      <label>Repetir nueva contraseña <input type="password" id="cfg_newPassword2"></label>
    </div>
    <div class="autherror" id="cfgPasswordMsg"></div>
    <button class="btn ghost small" id="cfgChangePasswordBtn" type="button">Cambiar contraseña</button>

    <div class="note" style="margin-top:20px;border-color:var(--red);background:var(--red-bg);color:var(--red);">
      <b>⚠️ Zona de peligro</b> - Esto borra TODOS tus datos permanentemente.
    </div>
    <button class="btn" id="deleteAccountBtn" type="button" style="background:var(--red);">🗑️ Eliminar cuenta y datos</button>`;
}

function renderCfgSedes(){
  document.getElementById('cfgSedesList').innerHTML = draftSedes.map((s,i)=>`
    <div class="sedecard">
      <div class="fields">
        <label>Nombre <input type="text" data-si="${i}" data-f="nombre" value="${s.nombre}"></label>
        <label>Dirección <input type="text" data-si="${i}" data-f="direccion" value="${s.direccion}"></label>
        <button class="btn danger small" type="button" data-removesede="${i}">✕</button>
      </div>
      <label>Encargados <textarea rows="2" data-si="${i}" data-f="encargados" style="width:100%;">${(s.encargados||[]).join('\n')}</textarea></label>
    </div>`).join('');
  document.querySelectorAll('#cfgSedesList [data-f]').forEach(el=>{
    el.addEventListener('change', e=>{
      const i = Number(e.target.dataset.si), f = e.target.dataset.f;
      if(f==='encargados') draftSedes[i][f] = e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);
      else draftSedes[i][f] = e.target.value;
    });
  });
  document.querySelectorAll('[data-removesede]').forEach(b=>b.addEventListener('click', ()=>{
    const i = Number(b.dataset.removesede);
    const nombreSede = draftSedes[i].nombre;
    const activos = orders.filter(o => o.sede === nombreSede && o.proceso !== "Terminado" && !o.eliminado).length;
    if(activos > 0){
      alert(`No puedes quitar "${nombreSede}" — tiene ${activos} orden(es) activa(s).`);
      return;
    }
    draftSedes.splice(i,1); renderCfgSedes();
  }));
}

async function changeEmailAccount(){
  const newEmail = document.getElementById('cfg_newEmail').value.trim();
  const pass = document.getElementById('cfg_emailPassword').value;
  const errEl = document.getElementById('cfgEmailMsg');
  errEl.style.color = 'var(--red)'; errEl.textContent = '';
  if(!newEmail){ errEl.textContent = 'Escribe el nuevo correo.'; return; }
  if(!pass){ errEl.textContent = 'Escribe tu contraseña actual.'; return; }
  try{
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, pass);
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.verifyBeforeUpdateEmail(newEmail);
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✅ Te enviamos un correo de verificación a ' + newEmail + '. Ábrelo para confirmar el cambio.';
    document.getElementById('cfg_newEmail').value = '';
    document.getElementById('cfg_emailPassword').value = '';
  }catch(e){
    errEl.textContent = traducirErrorFirebase(e);
  }
}

async function changePasswordAccount(){
  const currentPass = document.getElementById('cfg_currentPassword').value;
  const newPass = document.getElementById('cfg_newPassword').value;
  const newPass2 = document.getElementById('cfg_newPassword2').value;
  const errEl = document.getElementById('cfgPasswordMsg');
  errEl.style.color = 'var(--red)'; errEl.textContent = '';
  if(!currentPass){ errEl.textContent = 'Escribe tu contraseña actual.'; return; }
  if(!newPass || newPass.length < 6){ errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
  if(newPass !== newPass2){ errEl.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
  try{
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPass);
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.updatePassword(newPass);
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✅ Contraseña actualizada correctamente.';
    document.getElementById('cfg_currentPassword').value = '';
    document.getElementById('cfg_newPassword').value = '';
    document.getElementById('cfg_newPassword2').value = '';
  }catch(e){
    errEl.textContent = traducirErrorFirebase(e);
  }
}

function attachConfigEvents(){
  renderCfgSedes();
  document.getElementById('cfgAddSede').addEventListener('click', ()=>{ draftSedes.push({nombre:'',direccion:'',encargados:['']}); renderCfgSedes(); });
  document.getElementById('cfgSaveBtn').addEventListener('click', async () => {
    const nombreEmpresa = document.getElementById('cfg_nombre').value.trim();
    const tiposPrenda = document.getElementById('cfg_tiposPrenda').value.split('\n').map(x=>x.trim()).filter(Boolean);
    const tiposServicio = document.getElementById('cfg_tiposServicio').value.split('\n').map(x=>x.trim()).filter(Boolean);
    const tiposInventario = document.getElementById('cfg_tiposInventario').value.split('\n').map(x=>x.trim()).filter(Boolean);
    const sedes = draftSedes.filter(s=>s.nombre.trim()).map(s=>({...s, encargados:(s.encargados||[]).filter(Boolean)}));
    if(!nombreEmpresa || sedes.length===0){ alert("Nombre y al menos una sucursal."); return; }
    await saveCompanyConfig({nombreEmpresa, tiposPrenda, tiposServicio, tiposInventario, sedes});
    renderRoot();
  });
  document.getElementById('cfgSavePinBtn').addEventListener('click', async () => {
    const ownerPin = document.getElementById('cfg_pin').value.trim() || "0000";
    await saveCompanyConfig({ownerPin});
    alert("PIN actualizado.");
  });
  document.getElementById('cfgChangeEmailBtn').addEventListener('click', changeEmailAccount);
  document.getElementById('cfgChangePasswordBtn').addEventListener('click', changePasswordAccount);
  document.getElementById('deleteAccountBtn').addEventListener('click', openDeleteAccountModal);
}

// ============================================================
// ELIMINAR CUENTA
// ============================================================
async function deleteAllCompanyData(){
  const collections = ['orders','inventory','measurements','auditlog'];
  for(const col of collections){
    try {
      const snap = await db.collection('companies').doc(companyId).collection(col).get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));
    } catch(e) { console.error('Error eliminando:', col, e); }
  }
  await db.collection('companies').doc(companyId).delete();
}

function openDeleteAccountModal(){
  document.getElementById('modalBox').innerHTML = `
    <h2 style="color:var(--red);">⚠️ Eliminar cuenta</h2>
    <p>Esto borra TODOS los datos permanentemente.</p>
    <div class="formgrid">
      <label class="full">Contraseña <input type="password" id="del_password"></label>
      <label class="full">Escribe ELIMINAR <input type="text" id="del_confirm"></label>
    </div>
    <div class="autherror" id="delError"></div>
    <div class="formfoot">
      <button class="btn ghost" id="cancelBtn" type="button">Cancelar</button>
      <button class="btn" id="confirmDeleteBtn" type="button" style="background:var(--red);color:#fff;">Eliminar todo</button>
    </div>`;
  document.getElementById('cancelBtn').addEventListener('click', () => document.getElementById('overlay').classList.remove('show'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    const pass = document.getElementById('del_password').value;
    const confirmText = document.getElementById('del_confirm').value.trim();
    const errEl = document.getElementById('delError');
    if(confirmText !== 'ELIMINAR'){ errEl.textContent = 'Escribe ELIMINAR'; return; }
    if(!pass){ errEl.textContent = 'Escribe tu contraseña.'; return; }
    try{
      const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, pass);
      await currentUser.reauthenticateWithCredential(credential);
      await deleteAllCompanyData();
      await currentUser.delete();
    }catch(e){
      errEl.textContent = traducirErrorFirebase(e);
    }
  });
  document.getElementById('overlay').classList.add('show');
}

// ============================================================
// AUTHENTICACIÓN Y PWA
// ============================================================
auth.onAuthStateChanged(async user => {
  if(user){
    currentUser = user; companyId = user.uid;
    try{
      companyConfig = await loadCompanyConfig();
      if(companyConfig){ await loadAllData(); }
    }catch(e){ console.error(e); }
  } else {
    currentUser = null; companyId = null; companyConfig = null;
    orders = []; inventory = []; measurements = [];
  }
  renderRoot();
});

// ============================================================
// PWA - SERVICE WORKER (ruta y scope relativos, sin nombre de carpeta hardcodeado)
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('✅ SW registrado correctamente:', reg.scope))
      .catch(err => console.log('❌ SW no registrado:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('✅ App lista para instalar');
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.add('show');
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        console.log('Usuario:', result.outcome);
        const banner = document.getElementById('installBanner');
        if (banner) banner.classList.remove('show');
        deferredPrompt = null;
      }
    });
  }

  const closeBtn = document.getElementById('closeBannerBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const banner = document.getElementById('installBanner');
      if (banner) banner.classList.remove('show');
    });
  }
});

window.addEventListener('appinstalled', () => {
  console.log('✅ App instalada');
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('show');
});