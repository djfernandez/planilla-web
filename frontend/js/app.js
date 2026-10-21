
  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
  import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, browserSessionPersistence, OAuthProvider, signInWithPopup, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
  import { apiRequest, configureApi, deleteField, serverTimestamp, uploadFile } from "./api.js";

  const libraries = new Map();
  function loadLibrary(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (!libraries.has(globalName)) {
      libraries.set(globalName, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => {
          if (globalName === 'jspdf') {
            if (!window.jspdf?.jsPDF) return reject(new Error('No se pudo inicializar jsPDF.'));
            window.jsPDF = window.jspdf.jsPDF;
          }
          if (!window[globalName]) return reject(new Error(`No se pudo inicializar ${globalName}.`));
          resolve(window[globalName]);
        };
        script.onerror = () => {
          libraries.delete(globalName);
          reject(new Error(`No se pudo cargar ${globalName}.`));
        };
        document.head.appendChild(script);
      }));
    }
    return libraries.get(globalName);
  }
  const loadXlsx = () => loadLibrary(
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'XLSX');
  const loadJsPdf = () => loadLibrary(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
  const loadPdfLib = () => loadLibrary(
    'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'PDFLib');

  const firebaseConfig = {
    apiKey: "AIzaSyB5XMV9qLNrD2A-79XvkwIvoWbjuhqWBGw",
    authDomain: "planilla-webg.firebaseapp.com",
    projectId: "planilla-webg",
    storageBucket: "planilla-webg.firebasestorage.app",
    messagingSenderId: "578000078503",
    appId: "1:578000078503:web:6b04f45024a8c306f4bd82",
    measurementId: "G-PK95BC655T"
  };

  let app, auth;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    if (import.meta.env.DEV) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    configureApi(auth);
  } catch (error) {
    console.error("Error al inicializar Firebase:", error);
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">Error crítico al inicializar Firebase. Revisa que el objeto 'firebaseConfig' sea correcto.</div>`;
  }

  let currentUserData = null;
  let empresas = [];
  let usuarios = [];
  let partidasContables = [];
  let areas = [];
  let historial = [];
  let isHistEditMode = false;
  const TOPE_GASTO = 45.00;
  let histGroupsCache = new Map();
  let refreshTimer = null;
  let refreshInProgress = false;
  let refreshPending = false;
  let hasLoadedApplicationData = false;
  let currentHistFilteredKeys = []; // Claves (serie-num) visibles tras aplicar filtros
  let histFilterState = { start:'', end:'', area:'', vb:'ALL', pago:'ALL', search:'' };
  let pendingUploadGroupKey = null; // Clave de planilla a la que se adjuntarán comprobantes
  const BANCOS = ["INTERBANK", "BBVA", "SCOTIABANK", "BCP"]; // Lista de bancos
  const MONEDAS = ["SOLES", "DOLARES"]; // Lista de monedas
  // Partidas de control permitidas para usuarios de movilidades (no admin)
  const PCS_MOVILIDADES = ["94301", "234120502", "95301", "94303", "95303"];
  let movilidadesPartidas = [...PCS_MOVILIDADES]; // Valor vigente (viene de config/movilidades)


  onAuthStateChanged(auth, async (user) => {
    toggleLoading(true);
    cleanupListeners();
    hasLoadedApplicationData = false;
    if (user) {
      try {
        currentUserData = await apiRequest('/me');
        currentUserData = { ...currentUserData, uid: user.uid, email: user.email };

        if (currentUserData.activo === false) {
          await signOut(auth);
          alert("Tu cuenta está desactivada. Contacta a un administrador para que la reactive.");
        } else if (!currentUserData.rubricaBase64) {
          showConsentModal();
        } else {
          const nombres = currentUserData.nombres || currentUserData.nombre || '';
          const apellidos = currentUserData.apellidos || '';
          document.getElementById('who').textContent = `Conectado: ${nombres} ${apellidos}`;
          document.getElementById('app-content').style.display = 'block';
          document.getElementById('login-overlay').style.display = 'none';
          document.getElementById('btn-logout').style.display = 'inline-block';

          await setupListeners();
          initializeUI();
        }
      } catch (error) {
        console.error("Error al obtener el perfil de usuario:", error);
        if ([401, 403, 404].includes(error.status)) {
          await signOut(auth);
        }
        alert(error.message || "Ocurrió un error al cargar tu perfil. Inténtalo de nuevo.");
      }
    } else {
      currentUserData = null;
      document.getElementById('who').textContent = 'No autenticado';
      document.getElementById('app-content').style.display = 'none';
      document.getElementById('login-overlay').style.display = 'flex';
      document.getElementById('btn-logout').style.display = 'none';
    }
    toggleLoading(false);
  });

  const fmtSoles = n => 'S/ ' + Number(n || 0).toFixed(2);
  const asDate = value => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const fmtDate = d => {
    if (!d) return '';
    const date = asDate(d);
    if (!date) return 'Fecha inválida';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  const dateToInput = d => {
    if (!d) return '';
    const date = asDate(d);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const normalizar = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const serieFromName = (user) => {
    const nombres = user.nombres || user.nombre || '';
    const apellidos = user.apellidos || '';
    return (normalizar(nombres).slice(0, 2) + normalizar(apellidos).slice(0, 2)).toUpperCase() + '001';
  };

  function toggleLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
  };

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const viewEl = document.getElementById(`view-${viewId}`);
    const tabEl = document.querySelector(`.tab[data-view='${viewId}']`);
    if (viewEl) viewEl.classList.add('active');
    if (tabEl) tabEl.classList.add('active');
    
    // Inicializar scroll horizontal cuando se muestra el historial
    if (viewId === 'hist') {
      requestAnimationFrame(() => {
        setupHistoryScrollSync();
      });
    }
  };

  function initializeUI() {
    document.getElementById('f-emision').value = new Date().toISOString().split('T')[0];
    const nombres = currentUserData.nombres || currentUserData.nombre || '';
    const apellidos = currentUserData.apellidos || '';
    document.getElementById('worker-name').textContent = `${nombres} ${apellidos}`;
    document.getElementById('worker-dni').textContent = currentUserData.dni;
    
    // Generar iniciales para el avatar
    const initials = ((nombres.charAt(0) || '') + (apellidos.charAt(0) || '')).toUpperCase() || '--';
    document.getElementById('worker-avatar').textContent = initials;

    populateProjectSelector();
    updateHeaderInfo();
    document.getElementById('rows').innerHTML = '';
    addRow();
    updateTotalsUI();

    const isAdmin = currentUserData.rol === 'ADMIN';
    document.getElementById('tab-admin').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('hist-admin-controls').style.display = isAdmin ? 'inline-block' : 'none';
  }

  function populateProjectSelector() {
    const selector = document.getElementById('project-selector');
    selector.innerHTML = '';
    const projects = currentUserData.proyectos || [];
    if (projects.length > 0) {
      projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        if (p === currentUserData.proyDef) option.selected = true;
        selector.appendChild(option);
      });
    }
    selector.dispatchEvent(new Event('change'));
  }

  document.getElementById('project-selector').addEventListener('change', (e) => {
    const selectedProject = e.target.value;
    document.querySelectorAll('#rows .proyecto').forEach(input => { input.value = selectedProject; });
  });

  function updateHeaderInfo() {
    const empresa = empresas.find(e => e.id === currentUserData.empresaId);
    if (empresa) {
      const logoEl = document.getElementById('logo');
      logoEl.src = empresa.logoBase64 || '';
      logoEl.style.display = empresa.logoBase64 ? 'block' : 'none';
      document.getElementById('cinfo').innerHTML = `<b>${empresa.razon || ''}</b><br>R.U.C. ${empresa.ruc || ''}<br><span>${empresa.direccion || ''}</span>`;
    }

  }

  async function updatePlanillaNumber() {
    if (!currentUserData?.dni) return;
    const serie = serieFromName(currentUserData);
    try {
      const counter = await apiRequest(`/counters/${encodeURIComponent(currentUserData.dni)}`);
      const numFormatted = String(Number(counter.count || 0) + 1).padStart(5, '0');
      document.getElementById('h-num').textContent = `PLANILLA DE MOVILIDAD ${serie}-${numFormatted}`;
    } catch (error) {
      console.error("Error al actualizar la numeración:", error);
      document.getElementById('h-num').textContent = `PLANILLA DE MOVILIDAD ${serie}-Error`;
    }
  }

  function pcsPermitidasParaUsuario(){
    // Admin ve todas las partidas
    if(currentUserData?.rol === 'ADMIN') {
        return partidasContables;
    }
    // Usuarios de movilidades: solo estas partidas de control (independiente del área)
    return partidasContables.filter(pc => movilidadesPartidas.includes(String(pc.id)));
  }

  // Regenera los selectores de partida ya abiertos (tras cambios en partidas, áreas o configuración)
  function refreshPcSelects() {
    document.querySelectorAll('#rows .pc').forEach(pcSelect => {
      const selectedValue = pcSelect.value;
      pcSelect.innerHTML = pcOptionsHtml();
      if (Array.from(pcSelect.options).some(o => o.value === selectedValue)) pcSelect.value = selectedValue;
    });
  }


  function pcOptionsHtml(){
    const pcsPermitidas = pcsPermitidasParaUsuario();
    // console.log(`Generando ${pcsPermitidas.length} opciones de PC.`);
    return pcsPermitidas
      .map(pc => `<option value="${pc.id}">${pc.id}${pc.descripcion? ' - '+pc.descripcion:''}</option>`)
      .join('');
  }

  function addRow() {
    const rowsContainer = document.getElementById('rows');
    const newRow = document.createElement('div');
    newRow.className = 'trow';
    const rowCount = rowsContainer.children.length + 1;
    const selectedProject = document.getElementById('project-selector').value || currentUserData.proyDef || '';

    newRow.innerHTML = `
      <span class="num">${rowCount}</span>
      <input class="destino uppercase" placeholder="DESTINO">
      <input class="motivo uppercase" placeholder="MOTIVO">
      <input class="proyecto uppercase" value="${selectedProject}" readonly>
      <select class="pc">${pcOptionsHtml()}</select>
      <input type="text" class="monto" inputmode="decimal" placeholder="0.00">
      <button class="btn-del-row">🗑️</button>
    `;
    rowsContainer.appendChild(newRow);

    newRow.querySelector('.btn-del-row').addEventListener('click', () => {
      newRow.remove();
      updateTotalsUI();
    });
    newRow.querySelector('.monto').addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      updateTotalsUI();
    });
  };

  function updateTotalsUI() {
    const fecha = document.getElementById('f-emision').value;
    if (!fecha || !currentUserData) return;

    const fechaInicio = new Date(fecha);
    fechaInicio.setUTCHours(0, 0, 0, 0);
    const fechaFin = new Date(fecha);
    fechaFin.setUTCHours(23, 59, 59, 999);

    const gastosDelDia = historial
      .filter(h => {
        const hDate = asDate(h.fechaEmision);
        if (!hDate) return false;
        return h.userDNI === currentUserData.dni && hDate >= fechaInicio && hDate <= fechaFin;
      })
      .reduce((sum, h) => sum + h.monto, 0);

    const totalActual = Array.from(document.querySelectorAll('#rows .monto')).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
    const excede = (gastosDelDia + totalActual) > TOPE_GASTO;

    document.getElementById('pill-acum').textContent = fmtSoles(gastosDelDia);
    document.getElementById('pill-disp').textContent = fmtSoles(Math.max(0, TOPE_GASTO - gastosDelDia));

    const totalEl = document.getElementById('total');
    totalEl.textContent = fmtSoles(totalActual);
    totalEl.classList.toggle('ok', !excede);
    totalEl.classList.toggle('bad', excede);

    const alertEl = document.getElementById('over-alert');
    alertEl.style.display = excede ? 'block' : 'none';
    if (excede) {
      alertEl.textContent = (gastosDelDia >= TOPE_GASTO)
        ? `Ya has alcanzado el tope de ${fmtSoles(TOPE_GASTO)} para este día.`
        : `Con este monto superas el tope de ${fmtSoles(TOPE_GASTO)} para este día.`;
    }

    document.getElementById('btn-save').disabled = excede || totalActual <= 0;
  }

  function cleanupListeners() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    refreshPending = false;
  }
  window.addEventListener('api:datachanged', () => {
    if (!currentUserData) return;
    if (refreshInProgress) {
      refreshPending = true;
    } else {
      refreshApplicationData();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUserData) refreshApplicationData();
  });

  async function refreshApplicationData() {
    if (refreshInProgress) {
      refreshPending = true;
      return;
    }
    if (document.visibilityState === 'hidden') return;
    refreshInProgress = true;
    try {
      const requestedUid = currentUserData?.uid;
      const data = await apiRequest('/bootstrap');
      if (requestedUid !== currentUserData?.uid || auth.currentUser?.uid !== requestedUid) return;
      empresas = data.empresas;
      usuarios = data.usuarios;
      partidasContables = data.partidasContables;
      areas = data.areas;
      historial = data.historial;
      movilidadesPartidas = Array.isArray(data.movilidades?.partidas)
        ? data.movilidades.partidas.map(String)
        : [...PCS_MOVILIDADES];

      if (currentUserData) updateHeaderInfo();
      if (currentUserData?.rol === 'ADMIN') {
        renderEmpresasTable();
        renderPcTable();
        renderUsuariosTable();
        renderAreasTable();
        renderMovilidadesCard();
      }
      refreshPcSelects();
      initHistFiltersUI();
      renderHistorial();
      updateTotalsUI();
      updatePlanillaNumber();
      hasLoadedApplicationData = true;
    } catch (error) {
      console.error('No se pudieron actualizar los datos:', error);
      if (error.status === 401 || error.status === 403) {
        cleanupListeners();
        await signOut(auth);
      } else if (!hasLoadedApplicationData) {
        alert(error.message || 'No se pudieron cargar los datos de la aplicación.');
      }
    } finally {
      refreshInProgress = false;
      if (refreshPending && currentUserData && document.visibilityState !== 'hidden') {
        refreshPending = false;
        queueMicrotask(refreshApplicationData);
      }
    }
  }

  async function setupListeners() {
    await refreshApplicationData();
    cleanupListeners();
    refreshTimer = setInterval(refreshApplicationData, 60000);
  }

  function getUserDisplayName(u) {
    const nombres = u?.nombres || u?.nombre || '';
    const apellidos = u?.apellidos || '';
    return `${nombres} ${apellidos}`.trim();
  }

  function getApproverAreaIds() {
    if (!currentUserData?.uid) return [];
    return (areas || []).filter(a => a?.approverUid && a.approverUid === currentUserData.uid).map(a => a.id);
  }

  function resolveAreaInfoFromRow(row) {
    const areaId = row?.areaId
      || (currentUserData?.rol === 'ADMIN'
        ? (usuarios.find(u => u.id === row?.userId)?.areaId || '')
        : (currentUserData?.areaId || ''));
    const area = (areas || []).find(a => a.id === areaId);
    return { areaId, areaNombre: area?.nombre || areaId || '' };
  }

  function canApproveArea(areaId) {
    if (!areaId) return false;
    if (currentUserData?.rol === 'ADMIN') return true;
    const area = (areas || []).find(a => a.id === areaId);
    return !!(area?.approverUid && currentUserData?.uid && area.approverUid === currentUserData.uid);
  }

  function initHistFiltersUI() {
    const areaSel = document.getElementById('hist-area-filter');
    if (!areaSel) return;

    const prev = areaSel.value || histFilterState.area || '';
    const isAdmin = currentUserData?.rol === 'ADMIN';
    const approverAreas = getApproverAreaIds();

    const options = [];
    if (isAdmin) {
      options.push({ value: '', label: 'Todas' });
      (areas || []).forEach(a => options.push({ value: a.id, label: a.nombre || a.id }));
      areaSel.disabled = false;
    } else if (approverAreas.length > 0) {
      options.push({ value: '', label: 'Todas mis áreas' });
      (areas || []).filter(a => approverAreas.includes(a.id)).forEach(a => options.push({ value: a.id, label: a.nombre || a.id }));
      areaSel.disabled = false;
    } else {
      const myAreaId = currentUserData?.areaId || '';
      const a = (areas || []).find(x => x.id === myAreaId);
      options.push({ value: myAreaId, label: a?.nombre || myAreaId || '(Sin área)' });
      areaSel.disabled = true;
    }

    areaSel.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    // Restaurar selección si existe
    if (options.some(o => o.value === prev)) areaSel.value = prev;
    else areaSel.value = options[0]?.value || '';

    // Sincronizar estado
    histFilterState.area = areaSel.value;
  }

  function readHistFiltersFromUI() {
    const startEl = document.getElementById('hist-date-start');
    const endEl = document.getElementById('hist-date-end');
    const areaEl = document.getElementById('hist-area-filter');
    const vbEl = document.getElementById('hist-vb-filter');
    const pagoEl = document.getElementById('hist-pago-filter');
    const searchEl = document.getElementById('hist-search');

    histFilterState.start = startEl?.value || '';
    histFilterState.end = endEl?.value || '';
    histFilterState.area = areaEl?.value ?? histFilterState.area ?? '';
    histFilterState.vb = vbEl?.value || 'ALL';
    histFilterState.pago = pagoEl?.value || 'ALL';
    histFilterState.search = searchEl?.value || '';
  }

  function setHistFiltersToUI() {
    const startEl = document.getElementById('hist-date-start');
    const endEl = document.getElementById('hist-date-end');
    const vbEl = document.getElementById('hist-vb-filter');
    const pagoEl = document.getElementById('hist-pago-filter');
    const searchEl = document.getElementById('hist-search');

    if (startEl) startEl.value = histFilterState.start || '';
    if (endEl) endEl.value = histFilterState.end || '';
    if (vbEl) vbEl.value = histFilterState.vb || 'ALL';
    if (pagoEl) pagoEl.value = histFilterState.pago || 'ALL';
    if (searchEl) searchEl.value = histFilterState.search || '';
  }

  function setupHistFilterListeners() {
    const startEl = document.getElementById('hist-date-start');
    const endEl = document.getElementById('hist-date-end');
    const areaEl = document.getElementById('hist-area-filter');
    const vbEl = document.getElementById('hist-vb-filter');
    const pagoEl = document.getElementById('hist-pago-filter');
    const searchEl = document.getElementById('hist-search');
    const clearBtn = document.getElementById('hist-clear-filters');

    if (startEl) startEl.addEventListener('change', () => { readHistFiltersFromUI(); renderHistorial(); });
    if (endEl) endEl.addEventListener('change', () => { readHistFiltersFromUI(); renderHistorial(); });
    if (areaEl) areaEl.addEventListener('change', () => { readHistFiltersFromUI(); renderHistorial(); });
    if (vbEl) vbEl.addEventListener('change', () => { readHistFiltersFromUI(); renderHistorial(); });
    if (pagoEl) pagoEl.addEventListener('change', () => { readHistFiltersFromUI(); renderHistorial(); });

    // Búsqueda con debounce
    let t = null;
    if (searchEl) searchEl.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { readHistFiltersFromUI(); renderHistorial(); }, 250);
    });

    if (clearBtn) clearBtn.addEventListener('click', () => {
      histFilterState = { start:'', end:'', area: histFilterState.area || '', vb:'ALL', pago:'ALL', search:'' };
      setHistFiltersToUI();
      initHistFiltersUI();
      readHistFiltersFromUI();
      renderHistorial();
    });
  }

  function groupMatchesHistFilters(groupKey, rows) {
    if (!rows || rows.length === 0) return false;
    const first = rows[0];

    // Área (resuelta con fallback)
    const { areaId } = resolveAreaInfoFromRow(first);
    if (histFilterState.area) {
      if ((areaId || '') !== histFilterState.area) return false;
    }

    // Fecha (por fecha de emisión)
    const fe = asDate(first.fechaEmision);
    if (histFilterState.start) {
      const s = new Date(histFilterState.start + 'T00:00:00');
      if (!fe || fe < s) return false;
    }
    if (histFilterState.end) {
      const e = new Date(histFilterState.end + 'T23:59:59');
      if (!fe || fe > e) return false;
    }

    // VB
    if (histFilterState.vb === 'APROBADO' && !first.vbOk) return false;
    if (histFilterState.vb === 'PENDIENTE' && !!first.vbOk) return false;

    // Pago
    if (histFilterState.pago === 'PAGADO' && !first.pagado) return false;
    if (histFilterState.pago === 'NOPAGADO' && !!first.pagado) return false;

    // Búsqueda
    const q = (histFilterState.search || '').trim().toLowerCase();
    if (q) {
      const hay = (t) => (t || '').toString().toLowerCase().includes(q);
      const anyRow = rows.some(r => hay(r.destino) || hay(r.motivo) || hay(r.proyecto) || hay(r.pc));
      const groupHay =
        hay(groupKey) ||
        hay(first.proyecto) ||
        hay(first.userNombreCompleto) ||
        hay(first.userDNI) ||
        hay(areaId);

      if (!anyRow && !groupHay) return false;
    }

    return true;
  }

  function setupHistoryScrollSync() {
    const top = document.getElementById('hist-xscroll-top');
    const topInner = document.getElementById('hist-xscroll-top-inner');
    const bottom = document.getElementById('hist-xscroll-bottom');
    if (!top || !topInner || !bottom) return;
    const table = bottom.querySelector('table.tbl');
    
    // Siempre establecer un ancho mínimo amplio para que el scroll sea visible
    // Usar el ancho de la tabla si existe, o un mínimo de 2000px
    const tableWidth = table ? table.scrollWidth : 2000;
    const containerWidth = bottom.clientWidth || 800;
    const minWidth = Math.max(tableWidth, containerWidth + 200, 2000);
    topInner.style.width = minWidth + 'px';

    let syncing = false;
    top.onscroll = () => {
      if (syncing) return;
      syncing = true;
      bottom.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    bottom.onscroll = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = bottom.scrollLeft;
      syncing = false;
    };
  }

  async function updateGroupDocs(groupKey, data) {
    const info = histGroupsCache.get(groupKey);
    if (!info || !info.rows || info.rows.length === 0) throw new Error('Grupo no encontrado');
    await apiRequest(`/history-group/${encodeURIComponent(groupKey)}`, { method: 'PATCH', body: data });
  }

  async function toggleVBForGroup(groupKey) {
    const info = histGroupsCache.get(groupKey);
    if (!info || !info.rows?.length) return;
    const first = info.rows[0];
    const { areaId } = resolveAreaInfoFromRow(first);

    if (!canApproveArea(areaId)) {
      alert('No tienes permisos para dar VB en esta área.');
      renderHistorial(); // revert UI
      return;
    }

    const next = !first.vbOk;
    toggleLoading(true);
    try {
      const payload = next ? {
        vbOk: true,
        vbByUid: currentUserData.uid,
        vbByName: getUserDisplayName(currentUserData),
        vbAt: new Date().toISOString()
      } : {
        vbOk: false,
        vbByUid: deleteField(),
        vbByName: deleteField(),
        vbAt: deleteField()
      };
      await updateGroupDocs(groupKey, payload);
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar el VB. Revisa permisos/reglas.');
    } finally {
      toggleLoading(false);
    }
  }

  async function setPagoForGroup(groupKey, pagado) {
    const isAdmin = currentUserData?.rol === 'ADMIN';
    if (!isAdmin) {
      alert('Solo un administrador puede marcar pagos.');
      renderHistorial();
      return;
    }

    toggleLoading(true);
    try {
      const payload = pagado ? {
        pagado: true,
        pagadoByUid: currentUserData.uid,
        pagadoByName: getUserDisplayName(currentUserData),
        pagadoAt: new Date().toISOString()
      } : {
        pagado: false,
        pagadoByUid: deleteField(),
        pagadoByName: deleteField(),
        pagadoAt: deleteField()
      };
      await updateGroupDocs(groupKey, payload);
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar el estado de pago.');
    } finally {
      toggleLoading(false);
    }
  }

  function openComprobantesModal(groupKey) {
    const overlay = document.getElementById('comprobantes-overlay');
    const body = document.getElementById('comprobantes-body');
    const subtitle = document.getElementById('comprobantes-subtitle');
    if (!overlay || !body || !subtitle) return;

    const info = histGroupsCache.get(groupKey);
    if (!info || !info.rows?.length) return;

    const first = info.rows[0];
    const comps = Array.isArray(first.comprobantes) ? first.comprobantes : [];
    subtitle.textContent = `Planilla: ${groupKey}${first.userNombreCompleto ? ' • ' + first.userNombreCompleto : ''}`;

    if (comps.length === 0) {
      body.innerHTML = `<p class="hint">No hay comprobantes adjuntos.</p>`;
    } else {
      body.innerHTML = `
        <table class="tbl" style="margin-top:8px;">
          <thead><tr>
            <th>#</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th>Descargar</th>
          </tr></thead>
          <tbody>
            ${comps.map((c, i) => `
              <tr>
                <td>${i+1}</td>
                <td>${(c.name || 'archivo').toString()}</td>
                <td>${(c.uploadedByName || '').toString()}</td>
                <td>${c.uploadedAt ? fmtDate(c.uploadedAt) : ''}</td>
                <td><a class="link" href="${c.url || '#'}" target="_blank" rel="noopener">Abrir</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    overlay.style.display = 'flex';
  }

  function requestUploadComprobantes(groupKey) {
    const info = histGroupsCache.get(groupKey);
    if (!info || !info.rows?.length) return;

    const first = info.rows[0];
    if (!first.pagado) {
      alert('Solo se pueden adjuntar comprobantes si la movilidad está marcada como "Pagada".');
      return;
    }

    const isAdmin = currentUserData?.rol === 'ADMIN';
    if (!isAdmin) {
      alert('Solo un administrador puede adjuntar comprobantes.');
      return;
    }

    pendingUploadGroupKey = groupKey;
    const input = document.getElementById('comprobantes-file-input');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function uploadSelectedComprobantes(files) {
    const groupKey = pendingUploadGroupKey;
    pendingUploadGroupKey = null;
    if (!groupKey) return;

    const info = histGroupsCache.get(groupKey);
    if (!info || !info.rows?.length) return;
    const first = info.rows[0];

    if (!first.pagado) {
      alert('Solo se pueden adjuntar comprobantes si está marcado como Pagado.');
      return;
    }

    const isAdmin = currentUserData?.rol === 'ADMIN';
    if (!isAdmin) {
      alert('Solo un administrador puede adjuntar comprobantes.');
      return;
    }

    const existing = Array.isArray(first.comprobantes) ? first.comprobantes : [];
    const newComps = [];

    toggleLoading(true);
    try {
      for (const file of files) {
        const uploaded = await uploadFile(file, 'comprobante', groupKey);
        newComps.push({
          name: file.name,
          url: uploaded.url,
          path: uploaded.path,
          uploadedAt: new Date(),
          uploadedByUid: currentUserData.uid,
          uploadedByName: getUserDisplayName(currentUserData)
        });
      }

      const merged = [...existing, ...newComps];
      await updateGroupDocs(groupKey, { comprobantes: merged });

      // Abrir el modal para ver lo subido
      openComprobantesModal(groupKey);

    } catch (err) {
      console.error(err);
      alert('No se pudieron subir los comprobantes. Revisa permisos o CORS de Storage.');
    } finally {
      toggleLoading(false);
    }
  }


    function renderHistorial() {
    const tableContainer = document.getElementById('hist-table');
    if (!tableContainer) return;

    // Asegurar filtros (si el DOM ya está listo)
    initHistFiltersUI();
    readHistFiltersFromUI();

    tableContainer.innerHTML = '';
    histGroupsCache = new Map();
    currentHistFilteredKeys = [];

    if (historial.length === 0) {
      tableContainer.innerHTML = '<p>No hay registros.</p>';
      requestAnimationFrame(setupHistoryScrollSync);
      return;
    }

    // Orden base (registro desc)
    const sortedHistory = [...historial].sort((a, b) =>
      (asDate(b.fechaRegistro)?.getTime() || 0) - (asDate(a.fechaRegistro)?.getTime() || 0));

    // Agrupar por planilla (serie-num)
    const groups = sortedHistory.reduce((acc, item) => {
      const key = `${item.serie}-${item.num}`;
      (acc[key] ||= []).push(item);
      return acc;
    }, {});

    const groupTotals = {};
    for (const k of Object.keys(groups)) {
      groupTotals[k] = groups[k].reduce((sum, r) => sum + (Number(r.monto) || 0), 0);
    }

    // Mantener el orden de aparición (ya viene por fechaRegistro desc)
    const orderedKeys = Object.keys(groups).sort((a, b) => {
      const aFirst = groups[a]?.[0];
      const bFirst = groups[b]?.[0];
      return (asDate(bFirst?.fechaRegistro)?.getTime() || 0) - (asDate(aFirst?.fechaRegistro)?.getTime() || 0);
    });

    // Filtrar por UI
    const filteredKeys = orderedKeys.filter(k => groupMatchesHistFilters(k, groups[k]));
    currentHistFilteredKeys = filteredKeys;

    if (filteredKeys.length === 0) {
      tableContainer.innerHTML = '<p>No hay registros para los filtros seleccionados.</p>';
      requestAnimationFrame(setupHistoryScrollSync);
      return;
    }

    const isAdmin = currentUserData?.rol === 'ADMIN';

    // Construir tabla
    const table = document.createElement('table');
    table.className = 'tbl';

    let html = `<thead><tr>
        <th class="cell-center">Sel.</th>
        <th>#</th>
        <th>Descargar</th>
        <th>Serie-Num</th>
        <th>Área</th>
        <th>VB</th>
        <th>Pago</th>
        <th>Comp.</th>
        <th>F. Emisión</th>
        <th>F. Registro</th>
        <th>Proyecto</th>
        <th>Destino</th>
        <th>Motivo</th>
        <th>PC</th>
        <th style="text-align:right;">Monto (S/)</th>
        <th style="text-align:right;">Total Planilla (S/)</th>
        ${isAdmin ? '<th>Trabajador</th>' : ''}
        ${(isAdmin && isHistEditMode) ? '<th>Acciones</th>' : ''}
      </tr></thead><tbody>`;

    filteredKeys.forEach(key => {
      const rows = groups[key] || [];
      if (rows.length === 0) return;

      const total = groupTotals[key] || 0;
      const first = rows[0];
      const rowspan = rows.length;
      const pdfUrl = first.pdfUrl || '#';

      const { areaId, areaNombre } = resolveAreaInfoFromRow(first);

      // Estados
      const vbOk = !!first.vbOk;
      const vbByName = first.vbByName || '';
      const vbAt = first.vbAt || null;

      const pagado = !!first.pagado;
      const pagadoByName = first.pagadoByName || '';
      const pagadoAt = first.pagadoAt || null;

      const comps = Array.isArray(first.comprobantes) ? first.comprobantes : [];
      const compsCount = comps.length;

      // Cache para acciones (PDF+Correo, VB, Pago, Comprobantes)
      histGroupsCache.set(key, {
        rows,
        total,
        pdfUrl,
        proyecto: first.proyecto,
        areaId,
        vbOk,
        pagado,
        comprobantes: comps
      });

      // Celdas rowspanned (solo en la primera fila)
      const vbBadge = vbOk
        ? `<span class="badge ok">✅ Aprobado</span>${vbByName ? `<div class="mini">${vbByName}</div>` : ''}`
        : `<span class="badge warn">⏳ Pendiente</span>`;

      const vbBtn = canApproveArea(areaId)
        ? `<button class="btn ghost small btn-toggle-vb" data-group="${key}" title="Dar/Quitar VB">${vbOk ? 'Quitar VB' : 'Dar VB'}</button>`
        : '';

      const pagoBadge = pagado
        ? `<span class="badge ok">💰 Pagado</span>${pagadoByName ? `<div class="mini">${pagadoByName}</div>` : ''}`
        : `<span class="badge warn">⌛ No pagado</span>`;

      const pagoCtrl = isAdmin
        ? `<div style="display:flex;align-items:center;gap:8px;">
             <input type="checkbox" class="chk-pago" data-group="${key}" ${pagado ? 'checked' : ''} />
             <div>${pagoBadge}</div>
           </div>`
        : pagoBadge;

      const compViewBtn = compsCount > 0
        ? `<button class="btn ghost small btn-view-comps" data-group="${key}" title="Ver comprobantes">📎 ${compsCount}</button>`
        : `<span class="mini">—</span>`;

      const compAddBtn = isAdmin
        ? `<button class="btn ghost small btn-add-comps" data-group="${key}" ${pagado ? '' : 'disabled'} title="${pagado ? 'Adjuntar comprobantes' : 'Marca como Pagado para adjuntar'}">➕</button>`
        : '';

      rows.forEach((h, idx) => {
        html += `<tr>`;

        if (idx === 0) {
          html += `
            <td rowspan="${rowspan}" class="cell-center"><input type="checkbox" class="sel-planilla" data-group="${key}"></td>
          `;
        }

        html += `<td>${idx + 1}</td>`;

        if (idx === 0) {
          html += `
            <td rowspan="${rowspan}"><a href="${pdfUrl}" target="_blank" rel="noopener">PDF</a></td>
            <td rowspan="${rowspan}">${key}</td>
            <td rowspan="${rowspan}">${areaNombre}</td>
            <td rowspan="${rowspan}">
              ${vbBadge}
              ${vbBtn ? `<div style="margin-top:6px;">${vbBtn}</div>` : ''}
            </td>
            <td rowspan="${rowspan}">${pagoCtrl}</td>
            <td rowspan="${rowspan}" class="cell-center">
              <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                ${compViewBtn}
                ${compAddBtn}
              </div>
            </td>
          `;
        }

        // Columnas editables en modo admin
        if (isHistEditMode && isAdmin) {
          html += `
            <td><input class="edit-fechaEmision" type="date" value="${dateToInput(h.fechaEmision)}"></td>
            <td>${fmtDate(h.fechaRegistro)}</td>
            <td><input class="edit-proyecto" value="${h.proyecto || ''}"></td>
            <td><input class="edit-destino" value="${h.destino || ''}"></td>
            <td><input class="edit-motivo" value="${h.motivo || ''}"></td>
            <td>${h.pc || ''}</td>
            <td style="text-align:right;"><input class="edit-monto" type="number" step="0.01" value="${Number(h.monto || 0).toFixed(2)}" style="width: 90px;"></td>
          `;
        } else {
          html += `
            <td>${fmtDate(h.fechaEmision)}</td>
            <td>${fmtDate(h.fechaRegistro)}</td>
            <td>${h.proyecto || ''}</td>
            <td>${h.destino || ''}</td>
            <td>${h.motivo || ''}</td>
            <td>${h.pc || ''}</td>
            <td style="text-align:right;">${fmtSoles(h.monto)}</td>
          `;
        }

        if (idx === 0) {
          html += `<td rowspan="${rowspan}" style="text-align:right;">${fmtSoles(total)}</td>`;
          if (isAdmin) html += `<td rowspan="${rowspan}">${first.userNombreCompleto || ''}</td>`;
        }

        if (isAdmin && isHistEditMode) {
          html += `
            <td class="actions-cell">
              <button class="btn primary small btn-save-hist-item" data-id="${h.id}">💾</button>
              <button class="btn danger small btn-del-hist-item" data-id="${h.id}">🗑️</button>
            </td>
          `;
        }

        html += `</tr>`;
      });
    });

    html += `</tbody>`;
    table.innerHTML = html;
    tableContainer.appendChild(table);

    // Listeners (edición admin)
    if (isAdmin && isHistEditMode) {
      tableContainer.querySelectorAll('.btn-save-hist-item').forEach(btn =>
        btn.addEventListener('click', e => saveHistItem(e.target.dataset.id))
      );
      tableContainer.querySelectorAll('.btn-del-hist-item').forEach(btn =>
        btn.addEventListener('click', e => deleteHistItem(e.target.dataset.id))
      );
    }

    // Listeners VB / Pago / Comprobantes
    tableContainer.querySelectorAll('.btn-toggle-vb').forEach(btn =>
      btn.addEventListener('click', e => toggleVBForGroup(e.target.dataset.group))
    );

    tableContainer.querySelectorAll('.chk-pago').forEach(chk => {
      chk.addEventListener('change', e => {
        const group = e.target.dataset.group;
        const next = !!e.target.checked;
        setPagoForGroup(group, next);
      });
    });

    tableContainer.querySelectorAll('.btn-view-comps').forEach(btn =>
      btn.addEventListener('click', e => openComprobantesModal(e.target.dataset.group))
    );

    tableContainer.querySelectorAll('.btn-add-comps').forEach(btn =>
      btn.addEventListener('click', e => requestUploadComprobantes(e.target.dataset.group))
    );

    requestAnimationFrame(setupHistoryScrollSync);
  }


  function renderEmpresasTable() {
    const tableContainer = document.getElementById('emp-table');
    tableContainer.innerHTML = '';
    let table = document.createElement('table');
    table.className = 'tbl';

    let html = `<thead><tr>
      <th>Logo</th><th>Razón Social</th><th>RUC</th><th>Dirección</th><th>Acciones</th>
    </tr></thead><tbody>`;

    empresas.forEach(e => {
      html += `<tr data-id="${e.id}" data-logo-base64="">
        <td style="display: flex; align-items: center; gap: 8px;">
          <img class="logo-preview" src="${e.logoBase64 || 'https://placehold.co/100x40/f0f0f0/ccc?text=Logo'}" style="height:25px">
        </td>
        <td><input class="razon" value="${e.razon || ''}"></td>
        <td><input class="ruc" value="${e.ruc || ''}"></td>
        <td><input class="direccion" value="${e.direccion || ''}"></td>
        <td>
          <div class="actions-cell">
            <button class="btn ghost small btn-change-logo">Subir Archivo</button>
            <input type="file" class="logo-upload" style="display:none;" accept="image/*"/>
            <button class="btn primary small btn-save-empresa">Guardar</button>
          </div>
        </td>
      </tr>`;
    });
    html += `</tbody>`;
    table.innerHTML = html;
    tableContainer.appendChild(table);

    tableContainer.querySelectorAll('.btn-change-logo').forEach(btn => {
      btn.addEventListener('click', (e) => e.target.closest('tr').querySelector('.logo-upload').click());
    });

    tableContainer.querySelectorAll('.logo-upload').forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const row = e.target.closest('tr');
        const preview = row.querySelector('.logo-preview');
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64String = event.target.result;
          preview.src = base64String;
          row.dataset.logoBase64 = base64String;
          alert('Imagen previsualizada. Haz clic en "Guardar" para aplicar el cambio.');
        };
        reader.readAsDataURL(file);
      });
    });

    tableContainer.querySelectorAll('.btn-save-empresa').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const id = row.dataset.id;
        const data = {
          razon: row.querySelector('.razon').value,
          ruc: row.querySelector('.ruc').value,
          direccion: row.querySelector('.direccion').value,
        };
        if(row.dataset.logoBase64) data.logoBase64 = row.dataset.logoBase64;

        toggleLoading(true);
        try {
          await apiRequest(`/catalogs/empresas/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
          row.dataset.logoBase64 = '';
          alert('Empresa actualizada.');
        } catch (error) {
          alert('Error al guardar la empresa.');
          console.error(error);
        } finally {
          toggleLoading(false);
        }
      });
    });
  }

  function renderPcTable() {
    const tableContainer = document.getElementById('pc-table');
    tableContainer.innerHTML = '';
    let table = document.createElement('table');
    table.className = 'tbl compact';
    let html = `<thead><tr><th>Código PC</th><th>Descripción</th><th>Acciones</th></tr></thead><tbody>`;
    partidasContables.forEach(pc => {
      html += `<tr data-id="${pc.id}">
        <td>${pc.id}</td>
        <td><input class="desc" value="${pc.descripcion||''}"/></td>
        <td class="actions-cell">
          <button class="btn primary small icon-only btn-save-pc" data-id="${pc.id}" title="Guardar">💾</button>
          <button class="btn danger small icon-only btn-del-pc" data-id="${pc.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
    });
    html += `</tbody>`;
    table.innerHTML = html;
    tableContainer.appendChild(table);

    tableContainer.querySelectorAll('.btn-save-pc').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        const row = e.target.closest('tr');
        const desc = row.querySelector('.desc').value.trim();
        await apiRequest(`/catalogs/partidasContables/${encodeURIComponent(id)}`, {
          method: 'PATCH', body: { descripcion: desc }
        });
        alert('Partida actualizada.');
      });
    });
    tableContainer.querySelectorAll('.btn-del-pc').forEach(btn => {
      btn.addEventListener('click', e => deletePcItem(e.target.dataset.id));
    });
  }

  document.getElementById('pc-add').addEventListener('click', async () => {
    const id = document.getElementById('pc-new-id').value.trim();
    const desc = document.getElementById('pc-new-desc').value.trim();
    if(!id) { alert('Ingresa un código para la partida contable.'); return; }
    await apiRequest(`/catalogs/partidasContables/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: { descripcion: desc || '' }
    });
    document.getElementById('pc-new-id').value = '';
    document.getElementById('pc-new-desc').value = '';
  });
  document.getElementById('pc-import-btn').addEventListener('click', ()=>document.getElementById('pc-import-file').click());
  document.getElementById('pc-import-file').addEventListener('change', async (e)=>{
    const file=e.target.files[0]; if(!file) return;
    try {
      await loadXlsx();
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data,{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
      const items = [];
      rows.forEach(r=>{
        const id = String(r.PC||r.pc||'').trim();
        if(!id) return;
        const descripcion = String(r.Descripcion||r.descripcion||'').trim();
        items.push({ id, descripcion });
      });
      const result = await apiRequest('/catalogs/partidasContables/batch', {
        method: 'POST', body: { items }
      });
      alert(`Importadas/actualizadas ${result.imported} partidas`);
    } catch (error) {
      console.error('Error al importar partidas:', error);
      alert(error.message || 'No se pudo importar el archivo.');
    } finally {
      e.target.value = '';
    }
  });

  async function deletePcItem(id) {
    if (confirm(`¿Seguro que quieres eliminar la partida contable ${id}?`)) {
      await apiRequest(`/catalogs/partidasContables/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
  }

  // Usuarios visibles según búsqueda y filtro de la tabla de Ajustes
  function usuariosFiltrados() {
    const q = (document.getElementById('usr-search')?.value || '').trim().toLowerCase();
    const f = document.getElementById('usr-filter')?.value || 'todos';
    const lista = usuarios.filter(u => {
      if (f === 'activos' && u.activo === false) return false;
      if (f === 'inactivos' && u.activo !== false) return false;
      if (f === 'cc' && u.cajaChicaActivo !== true) return false;
      if (f === 'admins' && u.rol !== 'ADMIN') return false;
      if (!q) return true;
      const texto = `${u.nombres || u.nombre || ''} ${u.apellidos || ''} ${u.dni || ''} ${u.email || ''}`.toLowerCase();
      return texto.includes(q);
    });
    const activos = usuarios.filter(u => u.activo !== false).length;
    const cc = usuarios.filter(u => u.cajaChicaActivo === true).length;
    const summary = document.getElementById('usr-summary');
    if (summary) summary.textContent = `${lista.length} de ${usuarios.length} · ${activos} activos · ${cc} con Caja Chica`;
    return lista;
  }

  // Tarjeta de partidas para movilidades: lista editable guardada en config/movilidades
  let movPendientes = null; // Edición en curso (null = sin cambios locales)
  function renderMovilidadesCard() {
    const chips = document.getElementById('mov-chips');
    if (!chips) return;
    const lista = movPendientes || movilidadesPartidas;
    chips.innerHTML = lista.map(id => {
      const pc = partidasContables.find(p => String(p.id) === String(id));
      const desc = pc?.descripcion ? ` · ${pc.descripcion}` : '';
      const aviso = pc ? '' : ' (no existe)';
      return `<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #ccc;border-radius:14px;${pc ? '' : 'border-color:#c0392b;color:#c0392b'}">
        <b>${id}</b><span class="hint" style="margin:0">${desc}${aviso}</span>
        <button type="button" data-pc="${id}" class="mov-quitar" title="Quitar" style="border:0;background:none;cursor:pointer;font-size:16px;line-height:1">×</button>
      </span>`;
    }).join('') || '<span class="hint" style="margin:0">Sin partidas configuradas: los usuarios de movilidades no verán ninguna.</span>';
    const dl = document.getElementById('mov-pc-list');
    if (dl) dl.innerHTML = partidasContables.map(p => `<option value="${p.id}">${p.descripcion || ''}</option>`).join('');
    chips.querySelectorAll('.mov-quitar').forEach(b => b.addEventListener('click', () => {
      movPendientes = (movPendientes || [...movilidadesPartidas]).filter(x => String(x) !== String(b.dataset.pc));
      renderMovilidadesCard();
    }));
    document.getElementById('mov-status').textContent = movPendientes ? 'Cambios sin guardar' : '';
    actualizarKpisAjustes();
  }

  document.getElementById('mov-add')?.addEventListener('click', () => {
    const input = document.getElementById('mov-new-pc');
    const id = input.value.trim();
    if (!id) return;
    if (!partidasContables.some(p => String(p.id) === id)) {
      alert(`La partida ${id} no existe en Partidas Contables. Agrégala primero en la sección de Partidas.`);
      return;
    }
    const base = movPendientes || [...movilidadesPartidas];
    if (base.some(x => String(x) === id)) { input.value = ''; return; }
    movPendientes = [...base, id];
    input.value = '';
    renderMovilidadesCard();
  });

  document.getElementById('mov-save')?.addEventListener('click', async () => {
    if (!movPendientes) { document.getElementById('mov-status').textContent = 'No hay cambios'; return; }
    toggleLoading(true);
    try {
      await apiRequest('/catalogs/config/movilidades', { method: 'PATCH', body: {
        partidas: movPendientes,
        actualizadoPor: currentUserData.uid,
        actualizadoEn: new Date().toISOString(),
      } });
      movPendientes = null;
      alert('Partidas de movilidades guardadas.');
    } catch (error) {
      alert('No se pudo guardar. Revisa permisos o conexión.');
      console.error(error);
    } finally {
      toggleLoading(false);
    }
  });

  document.getElementById('mov-reset')?.addEventListener('click', () => {
    if (!confirm('¿Restablecer la lista original de partidas de movilidades? Se guardará de inmediato.')) return;
    movPendientes = [...PCS_MOVILIDADES];
    document.getElementById('mov-save').click();
  });

  // Filtros de la tabla de usuarios (listeners registrados una sola vez; el script es un módulo)
  document.getElementById('usr-search')?.addEventListener('input', () => renderUsuariosTable());
  document.getElementById('usr-filter')?.addEventListener('change', () => renderUsuariosTable());

  // Navegación por secciones de Ajustes: se muestra una a la vez
  function mostrarSeccionAjustes(sec) {
    document.querySelectorAll('#view-admin .card[data-sec]').forEach(c => c.classList.toggle('adm-hide', c.dataset.sec !== sec));
    document.querySelectorAll('#adm-nav .adm-tab').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
    try { localStorage.setItem('ajustes-seccion', sec); } catch (e) { /* sin almacenamiento: no pasa nada */ }
  }
  document.querySelectorAll('#adm-nav .adm-tab').forEach(b => b.addEventListener('click', () => mostrarSeccionAjustes(b.dataset.sec)));
  let seccionAjustesInicial = 'usuarios';
  try { seccionAjustesInicial = localStorage.getItem('ajustes-seccion') || 'usuarios'; } catch (e) { /* ignorar */ }
  mostrarSeccionAjustes(seccionAjustesInicial);

  // Números del resumen superior de Ajustes
  function actualizarKpisAjustes() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpi-activos', usuarios.filter(u => u.activo !== false).length);
    set('kpi-admins', usuarios.filter(u => u.rol === 'ADMIN' && u.activo !== false).length);
    set('kpi-cc', usuarios.filter(u => u.cajaChicaActivo === true).length);
    set('kpi-mov', movilidadesPartidas.length);
  }

  function renderUsuariosTable() {
    actualizarKpisAjustes();
    const tableContainer = document.getElementById('usr-table');
    tableContainer.innerHTML = '';
    let table = document.createElement('table');
    table.className = 'tbl';

    // Headers updated to remove CCO
    let html = `<thead><tr>
      <th>Nombres</th><th>Apellidos</th><th>DNI</th>
      <th>Empresa</th><th>Rol</th><th>Proy. Defecto</th>
      <th>Para</th><th>CC</th>
      <th>Banco</th><th>N° Cuenta</th><th>Moneda</th>
      <th>Proyectos (,)</th><th>Área</th><th>Estado</th><th>Caja Chica</th><th>Acciones</th>
    </tr></thead><tbody>`;

    // Generate options for dropdowns once
    const bankOptions = BANCOS.map(b => `<option value="${b}">${b}</option>`).join('');
    const currencyOptions = MONEDAS.map(m => `<option value="${m}">${m}</option>`).join('');


    usuariosFiltrados().forEach(u => {
      const empresaOptions = empresas.map(e => `<option value="${e.id}" ${e.id === u.empresaId ? 'selected' : ''}>${e.razon}</option>`).join('');
      // Genera las opciones de área asegurándose de que 'areas' esté poblado
      const areaOptions = [`<option value="">(sin área)</option>`]
        .concat((areas || []).map(a => `<option value="${a.id}" ${a.id===u.areaId ? 'selected':''}>${a.nombre||a.id}</option>`))
        .join('');


      // Generate bank and currency options specific to this user's saved value
      const currentBankOptions = BANCOS.map(b => `<option value="${b}" ${u.bank === b ? 'selected' : ''}>${b}</option>`).join('');
      const currentCurrencyOptions = MONEDAS.map(m => `<option value="${m}" ${u.currency === m ? 'selected' : ''}>${m}</option>`).join('');

      // Row updated: Removed CCO input, changed Bank and Currency to select
      html += `<tr data-id="${u.id}" style="${u.activo === false ? 'opacity:.55' : ''}">
        <td><input class="nombres" value="${u.nombres || u.nombre || ''}"></td>
        <td><input class="apellidos" value="${u.apellidos || ''}"></td>
        <td><input class="dni" value="${u.dni || ''}"></td>
        <td><select class="empresaId">${empresaOptions}</select></td>
        <td>
          <select class="rol">
            <option value="USUARIO" ${u.rol === 'USUARIO' ? 'selected' : ''}>USUARIO</option>
            <option value="ADMIN" ${u.rol === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
          </select>
        </td>
        <td><input class="proyDef" value="${u.proyDef || ''}"></td>
        <td><input class="emailTo" value="${(u.emailTo || []).join(', ')}"></td>
        <td><input class="emailCc" value="${(u.emailCc || []).join(', ')}"></td>
        <td><select class="bank">${currentBankOptions}</select></td>
        <td><input class="accountNumber" value="${u.accountNumber || ''}"></td>
        <td><select class="currency" style="width: 80px;">${currentCurrencyOptions}</select></td>
        <td><textarea class="proyectos" rows="2">${Array.isArray(u.proyectos) ? u.proyectos.join(', ') : ''}</textarea></td>
        <td><select class="areaId">${areaOptions}</select></td>
        <td>
          <select class="activo">
            <option value="true" ${u.activo !== false ? 'selected' : ''}>Activo</option>
            <option value="false" ${u.activo === false ? 'selected' : ''}>Inactivo</option>
          </select>
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="cc-activo" title="Habilitado para Caja Chica" ${u.cajaChicaActivo === true ? 'checked' : ''}>
        </td>
        <td class="actions-cell">
          <button class="btn primary small icon-only btn-save-usuario" title="Guardar">💾</button>
          <a href="${u.consentPdfUrl || '#'}" target="_blank" class="btn ghost small ${!u.consentPdfUrl ? 'disabled' : ''}" title="Ver Consentimiento">📄</a>
          <button class="btn danger small icon-only btn-reset-consent" title="Forzar Consentimiento">🔄</button>
        </td>
      </tr>`;
    });
    html += `</tbody>`;
    table.innerHTML = html;
    tableContainer.appendChild(table);

    tableContainer.querySelectorAll('.btn-save-usuario').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const id = row.dataset.id;
        const parseEmails = (selector) => row.querySelector(selector).value.split(',').map(e => e.trim()).filter(Boolean);
        // Data updated to read from selects and remove bcc
        const data = {
          nombres: row.querySelector('.nombres').value,
          apellidos: row.querySelector('.apellidos').value,
          dni: row.querySelector('.dni').value,
          empresaId: row.querySelector('.empresaId').value,
          rol: row.querySelector('.rol').value,
          proyDef: row.querySelector('.proyDef').value,
          proyectos: row.querySelector('.proyectos').value.split(',').map(p => p.trim()).filter(Boolean),
          areaId: row.querySelector('.areaId').value || null,
          emailTo: parseEmails('.emailTo'),
          emailCc: parseEmails('.emailCc'),
          // emailBcc removed
          bank: row.querySelector('.bank').value, // Read from select
          accountNumber: row.querySelector('.accountNumber').value,
          currency: row.querySelector('.currency').value, // Read from select
          activo: row.querySelector('.activo').value === 'true',
          cajaChicaActivo: row.querySelector('.cc-activo').checked,
        };

        // Salvaguardas: no desactivarse a sí mismo ni dejar el sistema sin administradores activos
        if (id === currentUserData.uid && data.activo === false) {
          alert('No puedes desactivar tu propia cuenta.');
          return;
        }
        const otrosAdminsActivos = usuarios.filter(x => x.id !== id && x.rol === 'ADMIN' && x.activo !== false).length;
        const seguiraSiendoAdminActivo = data.rol === 'ADMIN' && data.activo === true;
        if (otrosAdminsActivos === 0 && !seguiraSiendoAdminActivo) {
          alert('Debe quedar al menos un administrador activo.');
          return;
        }

        toggleLoading(true);
        try {
          await apiRequest(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
          alert('Usuario actualizado.');
        } catch (error) {
          alert('Error al guardar el usuario.');
          console.error(error);
        } finally {
          toggleLoading(false);
        }
      });
    });

    tableContainer.querySelectorAll('.btn-reset-consent').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const id = row.dataset.id;
        const userName = row.querySelector('.nombres').value;
        if (confirm(`¿Estás seguro de que quieres forzar a ${userName} a aceptar nuevamente los términos y condiciones? Se borrará su rúbrica actual.`)) {
          toggleLoading(true);
          try {
            await apiRequest(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: {
              rubricaBase64: deleteField(),
              consentPdfUrl: deleteField()
            } });
            alert(`Consentimiento reseteado para ${userName}. La próxima vez que inicie sesión, se le solicitará nuevamente.`);
          } catch (error) {
            alert('Error al resetear el consentimiento.');
            console.error(error);
          } finally {
            toggleLoading(false);
          }
        }
      });
    });
  }

    function renderAreasTable() {
    const tableContainer = document.getElementById('areas-table');
    tableContainer.innerHTML = '';
    let table = document.createElement('table');
    table.className = 'tbl';

    let html = `<thead><tr>
        <th>ID Área</th>
        <th>Nombre</th>
        <th>Aprobador (VB)</th>
        <th>Prefijos (,)</th>
        <th>IDs Exactos (,)</th>
        <th>Acciones</th>
    </tr></thead><tbody>`;

    areas.forEach(a => {
      const opts = ['<option value="">(Sin asignar)</option>'];
      (usuarios || []).forEach(u => {
        const label = `${(u.nombres || u.nombre || '').trim()} ${(u.apellidos || '').trim()}`.trim()
          || (u.email || u.id);
        const selected = (a.approverUid && a.approverUid === u.id) ? 'selected' : '';
        opts.push(`<option value="${u.id}" ${selected}>${label}${u.email ? ' • ' + u.email : ''}</option>`);
      });

      html += `<tr data-id="${a.id}">
        <td>${a.id}</td>
        <td><input class="nombre" value="${a.nombre || ''}"></td>
        <td>
          <select class="approverUid">
            ${opts.join('')}
          </select>
        </td>
        <td><input class="allowedPrefixes" value="${(a.allowedPrefixes || []).join(',')}"></td>
        <td><input class="allowedIds" value="${(a.allowedIds || []).join(',')}"></td>
        <td class="actions-cell">
          <button class="btn primary small icon-only btn-save-area" title="Guardar">💾</button>
          <button class="btn danger small icon-only btn-del-area" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
    });

    html += `</tbody>`;
    table.innerHTML = html;
    tableContainer.appendChild(table);

    tableContainer.querySelectorAll('.btn-save-area').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const id = row.dataset.id;
        const data = {
          nombre: row.querySelector('.nombre').value.trim(),
          approverUid: row.querySelector('.approverUid').value || '',
          allowedPrefixes: row.querySelector('.allowedPrefixes').value.split(',').map(p => p.trim()).filter(Boolean),
          allowedIds: row.querySelector('.allowedIds').value.split(',').map(p => p.trim()).filter(Boolean),
        };
        await apiRequest(`/catalogs/areas/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
        alert('Área actualizada');
      });
    });

    tableContainer.querySelectorAll('.btn-del-area').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('tr').dataset.id;
        if (confirm(`¿Seguro que quieres eliminar el área ${id}?`)) {
          await apiRequest(`/catalogs/areas/${encodeURIComponent(id)}`, { method: 'DELETE' });
          alert('Área eliminada');
        }
      });
    });
  }


  document.getElementById('area-add').addEventListener('click', async () => {
    const id = document.getElementById('area-new-id').value.trim().toLowerCase();
    const nombre = document.getElementById('area-new-nombre').value.trim();
    if(!id || !nombre) { alert('El ID y el Nombre son obligatorios'); return; }
    const data = {
      nombre: nombre,
      allowedPrefixes: document.getElementById('area-new-prefixes').value.split(',').map(p=>p.trim()).filter(Boolean),
      allowedIds: document.getElementById('area-new-ids').value.split(',').map(p=>p.trim()).filter(Boolean),
      approverUid: '',
    };
    await apiRequest(`/catalogs/areas/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
    document.getElementById('area-new-id').value = '';
    document.getElementById('area-new-nombre').value = '';
    document.getElementById('area-new-prefixes').value = '';
    document.getElementById('area-new-ids').value = '';
  });

  // Historial: filtros + comprobantes (listeners globales)
  setupHistFilterListeners();

  const compOverlay = document.getElementById('comprobantes-overlay');
  const compClose = document.getElementById('comprobantes-close');
  const compInput = document.getElementById('comprobantes-file-input');

  if (compClose && compOverlay) {
    compClose.addEventListener('click', () => compOverlay.style.display = 'none');
    compOverlay.addEventListener('click', (e) => { if (e.target === compOverlay) compOverlay.style.display = 'none'; });
  }

  if (compInput) {
    compInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) uploadSelectedComprobantes(files);
    });
  }

  document.getElementById('hist-edit-toggle').addEventListener('click', () => {
    isHistEditMode = !isHistEditMode;
    document.getElementById('hist-edit-toggle').textContent = isHistEditMode ? 'Desactivar Edición' : 'Activar Edición';
    document.getElementById('hist-edit-toggle').classList.toggle('danger', isHistEditMode);
    renderHistorial();
  });

  async function saveHistItem(itemId) {
    const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
    if (!row) return;

    let fechaEmision = new Date(row.querySelector('.fechaEmision').value);
    fechaEmision.setMinutes(fechaEmision.getMinutes() + fechaEmision.getTimezoneOffset());

    const data = {
      fechaEmision,
      proyecto: row.querySelector('.proyecto').value.toUpperCase(),
      destino: row.querySelector('.destino').value.toUpperCase(),
      motivo: row.querySelector('.motivo').value.toUpperCase(),
      monto: parseFloat(row.querySelector('.monto').value) || 0,
    };

    toggleLoading(true);
    try {
      await apiRequest(`/history/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: data });
      alert('Registro actualizado.');
    } catch (e) {
      console.error(e);
      alert('Error al guardar el registro.');
    } finally {
      toggleLoading(false);
    }
  };

  async function deleteHistItem(itemId) {
    if (!confirm('¿Estás seguro de eliminar este registro del historial?')) return;
    toggleLoading(true);
    try {
      await apiRequest(`/history/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      alert('Registro eliminado.');
    } catch (e) {
      console.error(e);
      alert('Error al eliminar el registro.');
    } finally {
      toggleLoading(false);
    }
  };

  async function showConsentModal() {
    document.getElementById('consent-overlay').style.display = 'flex';

    const canvas = document.getElementById('signature-canvas');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasSigned = false;

    const nombres = currentUserData.nombres || currentUserData.nombre || '';
    const apellidos = currentUserData.apellidos || '';
    document.getElementById('consent-user-name').textContent = `${nombres} ${apellidos}`;
    document.getElementById('consent-user-email').textContent = currentUserData.email;

    function getMousePos(canvas, evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }
    function getTouchPos(canvas, evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.touches[0].clientX - rect.left, y: evt.touches[0].clientY - rect.top };
    }

    function startDrawing(e) { drawing = true; hasSigned = true; draw(e); }
    function stopDrawing() { drawing = false; ctx.beginPath(); }
    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      let pos = (e.type === 'touchmove') ? getTouchPos(canvas, e) : getMousePos(canvas, e);
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
      ctx.lineTo(pos.x, pos.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); stopDrawing(); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });

    document.getElementById('clear-signature').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasSigned = false;
    });

    const checkbox = document.getElementById('terms-checkbox');
    const saveButton = document.getElementById('save-consent');
    checkbox.addEventListener('change', () => { saveButton.disabled = !checkbox.checked; });

    saveButton.addEventListener('click', async () => {
      if (!hasSigned) { alert('Por favor, registra tu rúbrica en el panel.'); return; }
      toggleLoading(true);
      const rubricaBase64 = canvas.toDataURL();

      try {
        const consentPDFBlob = await generateConsentPDF(rubricaBase64);
        const consentFile = new File([consentPDFBlob], 'declaracion_jurada.pdf', { type: 'application/pdf' });
        const uploaded = await uploadFile(consentFile, 'consentimiento');
        const consentPdfUrl = uploaded.url;
        await apiRequest(`/users/${encodeURIComponent(currentUserData.uid)}`, { method: 'PATCH', body: {
          rubricaBase64,
          consentPdfUrl
        } });
        currentUserData.rubricaBase64 = rubricaBase64;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(consentPDFBlob);
        a.download = `declaracion_jurada_${currentUserData.dni}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        document.getElementById('consent-overlay').style.display = 'none';
        location.reload();
      } catch(e) {
        console.error("Error saving consent:", e);
        alert("No se pudo guardar el consentimiento. Inténtalo de nuevo.");
      } finally {
        toggleLoading(false);
      }
    });
  }

  document.getElementById('btn-add-empresa').addEventListener('click', async () => {
    const id = prompt("Ingresa un ID único para la nueva empresa (ej: EMP03):");
    if(id && id.trim() !== "") {
      const razon = prompt("Ingresa la Razón Social:");
      const ruc = prompt("Ingresa el RUC:");
      if(razon && ruc) {
        toggleLoading(true);
        try {
          await apiRequest(`/catalogs/empresas/${encodeURIComponent(id.trim().toUpperCase())}`, {
            method: 'PUT',
            body: {
            razon: razon.toUpperCase(),
            ruc: ruc,
            direccion: "",
            logoBase64: ""
            }
          });
          alert("Empresa agregada con éxito.");
        } catch(e) {
          alert("Error al agregar la empresa.");
          console.error(e);
        } finally {
          toggleLoading(false);
        }
      }
    }
  });

  document.getElementById('app-content').addEventListener('click', (e) => {
    if (e.target.matches('.tab')) {
      showView(e.target.dataset.view);
    }
    if (e.target.matches('#btn-add-row')) {
      addRow();
    }
    if (e.target.matches('.toggle-collapse')) {
      const targetId = e.target.dataset.target;
      const content = document.getElementById(targetId);
      if (content) {
        content.classList.toggle('collapsed');
        e.target.textContent = content.classList.contains('collapsed') ? '[Expandir]' : '[Contraer]';
      }
    }
  });

  const handleSocialLogin = async (provider) => {
    try {
      await setPersistence(auth, browserSessionPersistence);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(`Error con el inicio de sesión de Microsoft:`, error);
      const errorEl = document.getElementById('login-error');
      errorEl.style.display = 'block';
      errorEl.innerHTML = `<strong>Error de inicio de sesión.</strong><br>${error.message}`;
    }
  };

  document.getElementById('btn-microsoft-login').addEventListener('click', () => {
    const provider = new OAuthProvider('microsoft.com');
    handleSocialLogin(provider);
  });

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    try {
      toggleLoading(true);
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Firebase Login Error:", error);
      errorEl.style.display = 'block';
      if (error.code === 'auth/invalid-credential') {
        errorEl.innerHTML = `<strong>Credenciales incorrectas.</strong><br>Verifica tu email y contraseña. Revisa que el usuario exista en Firebase Authentication.`;
      } else {
        errorEl.textContent = "Error inesperado: " + error.message;
      }
    } finally {
      toggleLoading(false);
    }
  });

  document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    if (!email) {
      errorEl.textContent = 'Por favor, ingresa tu correo electrónico para restablecer la contraseña.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      toggleLoading(true);
      await sendPasswordResetEmail(auth, email);
      errorEl.style.color = 'var(--ok)';
      errorEl.innerHTML = 'Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.';
      errorEl.style.display = 'block';
    } catch (error) {
      errorEl.style.color = 'var(--bad)';
      errorEl.innerHTML = 'No se pudo enviar el correo. Verifica que la dirección sea correcta.';
      errorEl.style.display = 'block';
    } finally {
      toggleLoading(false);
      setTimeout(() => { errorEl.style.color = 'var(--bad)'; }, 5000);
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); });
  document.getElementById('f-emision').addEventListener('change', updateTotalsUI);

  document.getElementById('btn-save').addEventListener('click', async () => {
    toggleLoading(true);
    let fechaEmision = new Date(document.getElementById('f-emision').value);
    if(document.getElementById('f-emision').value.length === 10) {
      fechaEmision.setMinutes(fechaEmision.getMinutes() + fechaEmision.getTimezoneOffset());
    }

    try {
      const counter = await apiRequest(`/counters/${encodeURIComponent(currentUserData.dni)}`);
      const expectedCount = Number(counter.count || 0);
      const nextNum = expectedCount + 1;
      const serie = serieFromName(currentUserData);
      const numFormatted = String(nextNum).padStart(5, '0');

      const pdfBlob = await generatePDF(serie, numFormatted, fechaEmision, true);
      const pdfFile = new File([pdfBlob], `${serie}-${numFormatted}.pdf`, { type: 'application/pdf' });
      const uploaded = await uploadFile(pdfFile, 'planilla', `${serie}-${numFormatted}.pdf`);
      const rows = [];
      document.querySelectorAll('#rows .trow').forEach(row => {
        const monto = parseFloat(row.querySelector('.monto').value) || 0;
        if (monto > 0) {
          rows.push({
            destino: row.querySelector('.destino').value.toUpperCase(),
            motivo: row.querySelector('.motivo').value.toUpperCase(),
            pc: row.querySelector('.pc').value,
            monto
          });
        }
      });
      if (rows.length === 0) throw new Error('Agrega al menos un desplazamiento con monto mayor que cero.');
      await apiRequest('/planillas', {
        method: 'POST',
        body: {
          expectedCount,
          serie,
          fechaEmision: fechaEmision.toISOString(),
          proyecto: document.getElementById('project-selector').value || currentUserData.proyDef || '',
          pdfUrl: uploaded.url,
          rows
        }
      });

      alert(`Planilla ${serie}-${numFormatted} guardada y almacenada en la nube.`);
      initializeUI();
      showView('hist');

    } catch (error) {
      console.error("Error al guardar planilla: ", error);
      console.error("Código de error:", error.code);
      console.error("Mensaje:", error.message);
      alert(`Error al guardar: ${error.code || 'desconocido'}\n\n${error.message || 'Revisa las reglas de Storage/Firestore en la consola de Firebase.'}`);
    } finally {
      toggleLoading(false);
    }
  });

  document.getElementById('btn-export-excel').addEventListener('click', async () => {
    try {
      await loadXlsx();
    } catch (error) {
      console.error('No se pudo cargar la librería de Excel:', error);
      alert(error.message);
      return;
    }
    const visibleKeys = new Set(currentHistFilteredKeys || []);
    let dataToExport = [...historial];
    if (visibleKeys.size) {
      dataToExport = dataToExport.filter(h => visibleKeys.has(`${h.serie}-${h.num}`));
    }
    if (dataToExport.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const isAdmin = currentUserData.rol === 'ADMIN';
    if(!isAdmin) {
      dataToExport = dataToExport.filter(h => h.userId === currentUserData.uid);
    }

    const sortedData = dataToExport.sort((a, b) =>
      (asDate(b.fechaRegistro)?.getTime() || 0) - (asDate(a.fechaRegistro)?.getTime() || 0));

    const planillas = sortedData.reduce((acc, item) => {
      const key = `${item.serie}-${item.num}`;
      if (!acc[key]) acc[key] = { ...item, totalPlanilla: 0 };
      acc[key].totalPlanilla += item.monto;
      return acc;
    }, {});

    const seen = new Set();
    const formattedData = sortedData.map((item, index) => {
      const key = `${item.serie}-${item.num}`;
      const firstOfGroup = !seen.has(key);
      if (firstOfGroup) seen.add(key);

      const { areaNombre } = resolveAreaInfoFromRow(item);
      const comps = Array.isArray(item.comprobantes) ? item.comprobantes : [];
      const compsUrls = comps.map(c => c?.url).filter(Boolean).join('\n');

      const record = {
        "Item": index + 1,
        "Serie-Num": key,
        "Área": areaNombre,
        "VB": item.vbOk ? "APROBADO" : "PENDIENTE",
        "VB Por": item.vbByName || "",
        "Pagado": item.pagado ? "PAGADO" : "NO PAGADO",
        "Pagado Por": item.pagadoByName || "",
        "Comprobantes": comps.length,
        "URLs Comprobantes": compsUrls,
        "Fecha Emision": fmtDate(item.fechaEmision),
        "Fecha Registro": fmtDate(item.fechaRegistro),
        "Proyecto": item.proyecto,
        "Destino": item.destino,
        "Motivo": item.motivo,
        "Partida Contable (PC)": item.pc,
        "Monto (S/)": item.monto,
        "Total Planilla (S/)": planillas[key].totalPlanilla,
        "URL del PDF": firstOfGroup ? (item.pdfUrl || "") : ""
      };

      if(isAdmin) {
        record["Trabajador"] = item.userNombreCompleto;
        record["DNI"] = item.userDNI;
      }
      return record;
    });

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const colWidths = [];
    const headers = Object.keys(formattedData[0] || {});
    headers.forEach(header => { colWidths.push({ wch: Math.max(12, header.length + 2) }); });
    formattedData.forEach(row => {
      headers.forEach((header, i) => {
        const value = row[header] ? row[header].toString() : '';
        if (value.length + 2 > colWidths[i].wch) colWidths[i].wch = value.length + 2;
      });
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial Movilidad");

    const today = new Date().toISOString().slice(0, 10);
    let fileName;
    if(isAdmin) {
      fileName = `reporte_general_movilidad_${today}.xlsx`;
    } else {
      const userName = (currentUserData.nombres || currentUserData.nombre || '').toLowerCase().replace(' ', '_');
      fileName = `reporte_${userName}_${today}.xlsx`;
    }

    XLSX.writeFile(wb, fileName);
  });

  async function fetchPdfAsArrayBuffer(url) {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('Content-Type') || '').toLowerCase();
    const looksLikePdf = ct.includes('application/pdf') || ct.includes('application/octet-stream');
    if (!looksLikePdf) throw new Error(`Tipo no admitido: ${ct || 'desconocido'}`);
    return await res.arrayBuffer();
  }

  // Helper to convert Blob to Base64 Data URL
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result); // result includes "data:mime/type;base64," prefix
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Function to generate and download the EML file
  async function generateAndDownloadEml(details, pdfBlob, pdfFileName) {
    const { to, cc, subject, htmlBody } = details; // Removed BCC
    const boundary = `----=_Part_${Math.random().toString(16).substring(2)}`;
    const from = currentUserData.email || 'noreply@example.com'; // Use user's email or a default

    // Get PDF Base64 content (remove data URL prefix)
    const pdfDataUrl = await blobToBase64(pdfBlob);
    const pdfBase64 = pdfDataUrl.substring(pdfDataUrl.indexOf(',') + 1);

    // Get HTML Base64 content - Ensure UTF-8 characters are handled correctly
    const utf8Bytes = new TextEncoder().encode(htmlBody);
    const binaryString = String.fromCharCode(...utf8Bytes);
    const htmlBase64 = btoa(binaryString);

    let emlContent = `From: ${from}\n`;
    if (to && to.length > 0) emlContent += `To: ${to.join(', ')}\n`;
    if (cc && cc.length > 0) emlContent += `Cc: ${cc.join(', ')}\n`;
    // Bcc header removed
    emlContent += `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\n`; // Encode subject for UTF-8
    emlContent += `MIME-Version: 1.0\n`;
    emlContent += `Content-Type: multipart/mixed; boundary="${boundary}"\n\n`;

    // --- Start of multipart message ---
    emlContent += `This is a multi-part message in MIME format.\n`; // Optional preamble

    // HTML Part
    emlContent += `--${boundary}\n`;
    emlContent += `Content-Type: text/html; charset="UTF-8"\n`;
    emlContent += `Content-Transfer-Encoding: base64\n\n`;
    emlContent += `${htmlBase64.replace(/(.{76})/g, "$1\n")}\n\n`; // Chunk base64

    // PDF Attachment Part
    emlContent += `--${boundary}\n`;
    emlContent += `Content-Type: application/pdf; name="${pdfFileName}"\n`;
    emlContent += `Content-Transfer-Encoding: base64\n`;
    emlContent += `Content-Disposition: attachment; filename="${pdfFileName}"\n\n`;
    emlContent += `${pdfBase64.replace(/(.{76})/g, "$1\n")}\n\n`; // Chunk base64

    // End boundary
    emlContent += `--${boundary}--`;

    // Create Blob and Download Link
    const emlBlob = new Blob([emlContent], { type: 'message/rfc822' });
    const emlUrl = URL.createObjectURL(emlBlob);
    const a = document.createElement('a');
    a.href = emlUrl;
    a.download = `${subject.replace(/[^a-z0-9]/gi, '_')}.eml`; // Create a safe filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(emlUrl); // Clean up
  }


  // --- Nueva función para Unir PDFs por Proyecto ---
  const btnUnirPdfs = document.getElementById('btn-unir-pdfs');
  if (btnUnirPdfs) btnUnirPdfs.addEventListener('click', async () => {
      try {
        await loadPdfLib();
      } catch (error) {
        console.error('No se pudo cargar la librería PDF:', error);
        alert(error.message);
        return;
      }
      const selectedKeys = Array.from(document.querySelectorAll('.sel-planilla:checked'))
        .map(chk => chk.dataset.group);

      if (selectedKeys.length === 0) {
        alert('Selecciona al menos 1 planilla');
        return;
      }

      const byProyecto = {};
      selectedKeys.forEach(k => {
        const g = histGroupsCache.get(k);
        if (!g) return;
        (byProyecto[g.proyecto] ||= []).push(g); // Agrupa por proyecto
      });

      toggleLoading(true);
      let downloadsCount = 0;
      const totalProyectos = Object.keys(byProyecto).length;

      try {
          for (const proyecto of Object.keys(byProyecto)) {
              const infos = byProyecto[proyecto];
              const merged = await PDFLib.PDFDocument.create();
              const saltados = [];

              for (const info of infos) {
                if (!info.pdfUrl || info.pdfUrl === '#') {
                  saltados.push({ razon: 'sin URL', ref: `${info.rows?.[0]?.serie}-${info.rows?.[0]?.num}` });
                  continue;
                }
                try {
                  const bytes = await fetchPdfAsArrayBuffer(info.pdfUrl);
                  const src = await PDFLib.PDFDocument.load(bytes);
                  const pages = await merged.copyPages(src, src.getPageIndices());
                  pages.forEach(p => merged.addPage(p));
                } catch (err) {
                  console.error(`No se pudo leer PDF para proyecto ${proyecto}:`, info.pdfUrl, err);
                  const refP = `${info.rows?.[0]?.serie}-${info.rows?.[0]?.num}`;
                  saltados.push({ razon: err.message || 'lectura fallida', ref: refP });
                  continue;
                }
              }

              if (merged.getPageCount() > 0) {
                  const bytes = await merged.save();
                  const blob = new Blob([bytes], { type: 'application/pdf' });
                  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
                  const pdfFileName = `consolidado_${proyecto}_${stamp}.pdf`;

                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = pdfFileName;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  downloadsCount++;
              }

              if (saltados.length > 0) {
                 alert(`PDFs unidos para el proyecto "${proyecto}", pero se omitieron:\n${saltados.map(s => `• ${s.ref} (${s.razon})`).join('\n')}`);
              }
          } // fin for proyecto

          if (downloadsCount > 0) {
             alert(`Se descargaron ${downloadsCount} PDFs consolidados (uno por proyecto).`);
          } else {
             alert('No se pudo generar ningún PDF consolidado. Revisa los errores en la consola (F12).');
          }

      } catch (err) {
        console.error('Fallo general al unir PDFs por proyecto:', err);
        alert('Error al unir los PDFs. Revisa la consola (F12) para más detalle.');
      } finally {
        toggleLoading(false);
      }
  });


  // --- Event listener para Generar EML Consolidado ---
  document.getElementById('btn-generar-eml').addEventListener('click', async () => {
    try {
      await loadPdfLib();
    } catch (error) {
      console.error('No se pudo cargar la librería PDF:', error);
      alert(error.message);
      return;
    }
    const selectedKeys = Array.from(document.querySelectorAll('.sel-planilla:checked'))
      .map(chk => chk.dataset.group);

    if (selectedKeys.length === 0) {
      alert('Selecciona al menos 1 planilla para generar el EML');
      return;
    }

    const planillasSeleccionadas = [];
    selectedKeys.forEach(k => {
        const groupInfo = histGroupsCache.get(k);
        if(groupInfo) {
            planillasSeleccionadas.push(...groupInfo.rows); // Añadir todas las filas
        }
    });

    // Agrupar por proyecto para el resumen
    const porProyectoResumen = planillasSeleccionadas.reduce((acc, item) => {
        const proyecto = item.proyecto || 'SIN PROYECTO';
        acc[proyecto] = (acc[proyecto] || 0) + (item.monto || 0);
        return acc;
    }, {});

    toggleLoading(true);
    try {
      const merged = await PDFLib.PDFDocument.create();
      let totalGeneral = 0; // Suma total de todos los proyectos
      const saltados = [];

      // --- Generar Cuadro Totalizado HTML (Estilos Compactos y alineación correcta, SIN width: 100%) ---
      let cuadroTotalizadoHtml = `
          <p><b>Cuadro totalizado:</b></p>
          <table style="width: auto; border-collapse: collapse; font-family: Roboto, sans-serif; font-size: 10px; margin-bottom: 6px;">
            <thead style="background-color: #f2f2f2;">
              <tr>
                <th style="border: 1px solid #ddd; padding: 1px 6px; text-align: left;">Proyecto</th>
                <th style="border: 1px solid #ddd; padding: 1px 6px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
      `;
      for (const proyectoKey in porProyectoResumen) {
          cuadroTotalizadoHtml += `
              <tr>
                  <td style="border: 1px solid #ddd; padding: 1px 6px;">${proyectoKey}</td>
                  <td style="border: 1px solid #ddd; padding: 1px 6px; text-align: right; white-space: nowrap;">S/ ${Number(porProyectoResumen[proyectoKey]).toFixed(2)}</td>
              </tr>
          `;
          totalGeneral += porProyectoResumen[proyectoKey]; // Suma para el total general
      }
       cuadroTotalizadoHtml += `</tbody></table>`;


      // --- Generar Cuadro Detallado HTML (Estilos Compactos, SIN width: 100%, AÑADIDA COLUMNA PC) ---
      let detalleHtml = `
          <p><b>Cuadro detallado:</b></p>
          <table style="width: auto; border-collapse: collapse; font-family: Roboto, sans-serif; font-size: 11px;">
            <thead style="background-color: #f2f2f2;">
              <tr>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">Fecha</th>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">Planilla</th>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">Proyecto</th>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">Destino</th>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">Motivo</th>
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: left;">PC</th> <!-- Nueva Cabecera -->
                <th style="border: 1px solid #ddd; padding: 4px 6px; text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
        `;

        // Iterar sobre las planillas originales seleccionadas para unir PDFs y detalle
        for (const key of selectedKeys) {
            const info = histGroupsCache.get(key);
            if (!info) continue;

            // Añadir filas al detalle HTML (ahora incluyendo proyecto y PC)
            info.rows.forEach(it => {
              detalleHtml += `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${fmtDate(it.fechaEmision)}</td>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${it.serie}-${it.num}</td>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${it.proyecto || 'N/A'}</td>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${it.destino}</td>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${it.motivo}</td>
                  <td style="border: 1px solid #ddd; padding: 4px 6px;">${it.pc || ''}</td> <!-- Nueva Celda -->
                  <td style="border: 1px solid #ddd; padding: 4px 6px; text-align: right;">${fmtSoles(it.monto)}</td>
                </tr>
              `;
            });

            // Unir PDF
            if (!info.pdfUrl || info.pdfUrl === '#') {
              saltados.push({ razon: 'sin URL', ref: key });
              continue;
            }
            try {
              const bytes = await fetchPdfAsArrayBuffer(info.pdfUrl);
              const src = await PDFLib.PDFDocument.load(bytes);
              const pages = await merged.copyPages(src, src.getPageIndices());
              pages.forEach(p => merged.addPage(p));
            } catch (err) {
              console.error('No se pudo leer un PDF:', info.pdfUrl, err);
              saltados.push({ razon: err.message || 'lectura fallida', ref: key });
              continue;
            }
        }
        detalleHtml += '</tbody></table>';

        if (merged.getPageCount() === 0) {
          alert(
            `No se pudo consolidar ningún PDF para el EML.\n` +
            (saltados.length ? `Saltados: ${saltados.map(s => `${s.ref} (${s.razon})`).join(', ')}` : '')
          );
          toggleLoading(false);
          return;
        }

        const bytes = await merged.save();
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });

        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        // Nombre de archivo genérico para el consolidado total
        const pdfFileName = `reembolso_consolidado_${stamp}.pdf`;

        // Descargar el PDF como respaldo
        const pdfDownloadLink = document.createElement('a');
        pdfDownloadLink.href = URL.createObjectURL(pdfBlob);
        pdfDownloadLink.download = pdfFileName;
        pdfDownloadLink.click();
        URL.revokeObjectURL(pdfDownloadLink.href);

        const avisoSaltados = saltados.length
          ? `<br><br><p style="color: red; font-size: 11px;"><b>Archivos omitidos en PDF:</b><br>${saltados.map(s => `• ${s.ref} (${s.razon})`).join('<br>')}</p>`
          : '';

        // Asunto genérico para el consolidado total
        const asunto = `Transferencia por Reembolso de movilidad - Consolidado - ${new Date().toLocaleDateString('es-PE')}`;

        // Obtener el nombre completo del usuario para el saludo
        const userNameFull = `${currentUserData.nombres || ''} ${currentUserData.apellidos || ''}`.trim();

        // Construir el cuerpo HTML completo
        const bodyHtml = `
          <html>
          <body style="font-family: Roboto, sans-serif; font-size: 14px; color: #333;">
            <p>Estimados, se adjunta la solicitud de reembolso por movilidad consolidada, con el <b>Total General a rendir: ${fmtSoles(totalGeneral)}</b></p>
            ${cuadroTotalizadoHtml}
            ${detalleHtml}
            <p><b>Datos Bancarios:</b><br>
               Beneficiario: ${userNameFull}<br>
               Banco: ${currentUserData.bank || '(No configurado)'}<br>
               N° Cuenta: ${currentUserData.accountNumber || '(No configurado)'}<br>
               Moneda: ${currentUserData.currency || '(No configurado)'}
            </p>
            ${avisoSaltados}
            <p>Saludos.</p>
            <p>${userNameFull}</p>
          </body>
          </html>
        `;

        const emailDetails = {
          to: currentUserData.emailTo || [],
          cc: currentUserData.emailCc || [],
          subject: asunto,
          htmlBody: bodyHtml
        };

        // Generar y descargar el archivo EML
        await generateAndDownloadEml(emailDetails, pdfBlob, pdfFileName);

        alert(`Se ha descargado el PDF consolidado (${pdfFileName}) y el archivo EML correspondiente.`);

    } catch (err) {
      console.error('Fallo general en la preparación del EML:', err);
      alert('Error preparando el archivo EML. Revisa la consola (F12) para más detalle.');
    } finally {
      toggleLoading(false);
    }
  });


  async function generateConsentPDF(rubricaBase64) {
    await loadJsPdf();
    const doc = new jsPDF();
    const nombres = currentUserData.nombres || currentUserData.nombre || '';
    const apellidos = currentUserData.apellidos || '';
    const empresa = empresas.find(e => e.id === currentUserData.empresaId);

    if (empresa?.logoBase64) {
      try { doc.addImage(empresa.logoBase64, 'PNG', 15, 15, 40, 15, undefined, 'FAST'); } catch(e) { console.error("Error adding base64 image to PDF:", e); }
    }
    let yPos = 15 + 15 + 10;

    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text("Declaración Jurada y Consentimiento de Uso", doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
    yPos += 5;

    if (empresa) {
      doc.setFontSize(12); doc.setFont(undefined, 'normal');
      doc.text(empresa.razon || '', doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      yPos += 10;
    }
    doc.setLineWidth(0.5); doc.line(15, yPos, 195, yPos); yPos += 10;

    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    const metadata = doc.splitTextToSize(
      `Fecha y Hora: ${new Date().toLocaleString('es-PE')}\n` +
      `Nombre Completo: ${nombres} ${apellidos}\n` +
      `DNI: ${currentUserData.dni}\n` +
      `Correo Electrónico: ${currentUserData.email}\n` +
      `Agente de Usuario: ${navigator.userAgent}`, 180
    );
    doc.text(metadata, 15, yPos);
    yPos += (metadata.length * 5) + 15;

    doc.setFont(undefined, 'bold'); doc.text("Términos Aceptados:", 15, yPos); yPos += 10;
    doc.setFont(undefined, 'normal');
    const terms = doc.splitTextToSize(
      "1. Acepto la responsabilidad total por el uso de este sistema y la veracidad de la información que registre en él.\n\n" +
      "2. Confirmo que el correo electrónico asociado a esta cuenta es de mi propiedad y autorizo su uso para la generación y notificación de planillas de movilidad.\n\n" +
      "3. Acepto que la rúbrica digital registrada a continuación será utilizada como mi firma personal en todos los documentos (PDF) generados por este sistema, sirviendo como validación de los gastos declarados.",
      180
    );
    doc.text(terms, 15, yPos);
    yPos += 60;

    if (rubricaBase64) {
      try { doc.addImage(rubricaBase64, 'PNG', (doc.internal.pageSize.getWidth() / 2) - 30, yPos, 60, 30); } catch(e) { console.error("Error adding signature to consent PDF:", e); }
    }
    yPos += 35;
    doc.line((doc.internal.pageSize.getWidth() / 2) - 40, yPos, (doc.internal.pageSize.getWidth() / 2) + 40, yPos);
    yPos += 5;
    doc.text("Firma del Trabajador", doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });

    return doc.output('blob');
  }

  async function generatePDF(serie, num, fecha, returnBlob = false) {
    await loadJsPdf();
    const doc = new jsPDF();
    const empresa = empresas.find(e => e.id === currentUserData.empresaId);
    if (empresa?.logoBase64) {
      try { doc.addImage(empresa.logoBase64, 'PNG', 15, 12, 30, 15, undefined, 'FAST'); } catch(e) { console.error("Error adding base64 image to PDF:", e); }
    }

    doc.setFontSize(8); doc.setFont(undefined,'bold'); doc.text(empresa?.razon||'',195,15,{align:'right'});
    doc.setFont(undefined,'normal');
    if(empresa?.ruc) doc.text(`R.U.C. ${empresa.ruc}`,195,19,{align:'right'});
    if(empresa?.direccion) doc.text(empresa.direccion,195,23,{align:'right'});

    doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.text(`PLANILLA POR GASTO DE MOVILIDAD - Nro. ${serie}-${num}`, doc.internal.pageSize.getWidth()/2,45,{align:'center'});

    doc.setFontSize(10); doc.setFont(undefined,'normal');
    doc.text(`Fecha de Emisión: ${fmtDate(fecha)}`,15,60);
    const nombres = currentUserData.nombres || currentUserData.nombre || '';
    const apellidos = currentUserData.apellidos || '';
    doc.text(`Trabajador: ${nombres} ${apellidos}`,15,67);
    doc.text(`D.N.I.: ${currentUserData.dni}`,150,67);

    let y=80;
    doc.setFont(undefined,'bold');
    doc.text('#',15,y); doc.text('Destino',28,y); doc.text('Motivo',78,y); doc.text('Proyecto',128,y); doc.text('PC',165,y); doc.text('Monto (S/)',195,y,{align:'right'});
    doc.line(15,y+2,195,y+2); y+=8;
    doc.setFont(undefined,'normal');

    let totalPlanilla = 0;
    document.querySelectorAll('#rows .trow').forEach((row, i) => {
      const monto = parseFloat(row.querySelector('.monto').value) || 0;
      if (monto > 0) {
        const destino = row.querySelector('.destino').value.toUpperCase();
        const motivo = row.querySelector('.motivo').value.toUpperCase();
        const proyecto = row.querySelector('.proyecto').value;
        const pc = row.querySelector('.pc').value;

        doc.text(String(i+1),15,y);
        doc.text(doc.splitTextToSize(destino,45),28,y);
        doc.text(doc.splitTextToSize(motivo,45),78,y);
        doc.text(doc.splitTextToSize(proyecto,30),128,y);
        doc.text(pc,165,y);
        doc.text(monto.toFixed(2),195,y,{align:'right'});
        y += 10;
        totalPlanilla += monto;
      }
    });

    doc.line(15,y,195,y); y+=7;
    doc.setFont(undefined,'bold');
    doc.text('Total S/.',165,y);
    doc.text(totalPlanilla.toFixed(2),195,y,{align:'right'});

    if (currentUserData.rubricaBase64) {
      try { doc.addImage(currentUserData.rubricaBase64, 'PNG', 85, y + 15, 50, 25); } catch(e) { console.error("Error adding signature to PDF:", e); }
    }

    doc.line(80,y+40,140,y+40);
    doc.text('Firma del Trabajador', doc.internal.pageSize.getWidth()/2,y+45,{align:'center'});

    doc.setFontSize(7); doc.setTextColor(100);
    const disclaimer="Base Legal: Inciso a1) del artículo 37° del TUO de la Ley del Impuesto a la Renta e inciso v) del articulo 21° del Reglamento de la ley del Impuesto a la Renta, Nota: La falta de consignación de la fecha en que se incurrió en el gasto, nombres y apellidos de cada trabajador, número de DNI, motivo y destino del desplazamiento y monto gastado, respecto a cada desplazamiento sólo inhabilita la planilla para la sustentación del gasto que corresponda a tal desplazamiento. (*) Numeración de la planilla.";
    doc.text(doc.splitTextToSize(disclaimer,180),15, doc.internal.pageSize.getHeight()-20);

    if (returnBlob) {
      return doc.output('blob');
    } else {
      doc.save(`Planilla_${serie}-${num}.pdf`);
    }
  }
