const map = L.map('map', { zoomControl: false }).setView([19.4326, -99.1332], 11);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16
}).addTo(map);

let datosGlobales = [];
let miGrafica = null; 
let marcadoresDict = {}; 
const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let marcadorResaltado = null;
let opcionesOriginales = null;

let capaBaches = L.markerClusterGroup({ maxClusterRadius: 60, disableClusteringAtZoom: 16, spiderfyOnMaxZoom: true }).addTo(map);

function calcularIPU(aforo, volumen, tipoVia) {
    let aforoNorm = Math.min((aforo || 0) / 20000, 1); 
    let volNorm = Math.min((volumen || 0) / 10, 1);
    let viaScore = 0.2; 
    const tipo = String(tipoVia).toLowerCase().trim();
    if (tipo.includes('motorway') || tipo.includes('trunk') || tipo.includes('primary')) viaScore = 1.0;
    else if (tipo.includes('secondary') || tipo.includes('tertiary')) viaScore = 0.6;
    let puntaje = (viaScore * 0.40) + (aforoNorm * 0.35) + (volNorm * 0.25);
    return Math.round(puntaje * 100);
}

function obtenerSemaforoIPU(ipu) {
    if (ipu >= 70) return { color: "#E30052", etiqueta: "Prioridad Crítica", icono: "🔴" };
    if (ipu >= 40) return { color: "#FF9500", etiqueta: "Prioridad Media", icono: "🟠" };
    return { color: "#007AFF", etiqueta: "Prioridad Baja", icono: "🔵" };
}

const leyendaIPU = L.control({ position: 'bottomright' });
leyendaIPU.onAdd = function (map) {
    let div = L.DomUtil.create('div', 'info legend');
    L.DomEvent.disableClickPropagation(div);
    div.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    div.style.padding = "15px"; div.style.borderRadius = "12px"; div.style.boxShadow = "0 4px 15px rgba(0,0,0,0.15)"; div.style.fontFamily = "'Inter', sans-serif";
    div.innerHTML = `
        <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #111;">Prioridad IPU</h4>
        <div style="display: flex; align-items: center; margin-bottom: 10px;"><span style="background: #E30052; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span><span style="font-size: 13px; color: #444; font-weight: 500;">Crítica (≥70)</span></div>
        <div style="display: flex; align-items: center; margin-bottom: 10px;"><span style="background: #FF9500; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span><span style="font-size: 13px; color: #444; font-weight: 500;">Media (40 - 69)</span></div>
        <div style="display: flex; align-items: center;"><span style="background: #007AFF; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span><span style="font-size: 13px; color: #444; font-weight: 500;">Baja (< 40)</span></div>
    `;
    return div;
};
leyendaIPU.addTo(map);

Papa.parse("sipa_final_completo.csv", {
    download: true, header: true, dynamicTyping: true,
    complete: function(results) {
        datosGlobales = results.data.filter(row => row.latitud && row.longitud);
        actualizarDashboard(); 
    }
});

function actualizarDashboard(filtroAlcaldia = null) {
    capaBaches.clearLayers(); marcadoresDict = {}; 
    let datosFiltrados = filtroAlcaldia ? datosGlobales.filter(row => row.alcaldia === filtroAlcaldia) : datosGlobales;
    document.getElementById('btn-limpiar').style.display = filtroAlcaldia ? 'block' : 'none';

    let totalBaches = 0, costoTotal = 0, riesgoTotal = 0;
    let statsAlcaldias = {}; let marcadoresTemporales = []; 

    datosFiltrados.forEach(row => {
        totalBaches++; costoTotal += (row.costo_reparacion || 0); riesgoTotal += (row.pasivo_NIF_C9 || 0);
        let alc = row.alcaldia || "SIN REGISTRO";
        if (!statsAlcaldias[alc]) statsAlcaldias[alc] = { cantidad: 0, costo: 0 };
        statsAlcaldias[alc].cantidad++; statsAlcaldias[alc].costo += (row.costo_reparacion || 0);

        row.ipuCalculado = calcularIPU(row.aforo_estimado, row.volumen_m3, row.tipo_via);
        let semaforo = obtenerSemaforoIPU(row.ipuCalculado);

        let marker = L.circleMarker([row.latitud, row.longitud], {
            radius: filtroAlcaldia ? 6 : 5, fillColor: semaforo.color, color: "transparent", fillOpacity: 0.9 
        }).bindPopup(`
            <div style="font-family: Inter;">
                <strong>Folio:</strong> ${row.id_folio}<br>
                <strong>SIPA:</strong> <span style="color:${semaforo.color}; font-weight:bold;">${semaforo.icono} ${semaforo.etiqueta}</span><br>
                <strong>IPU:</strong> ${row.ipuCalculado} / 100<br>
                <strong>Costo APU:</strong> ${formatoMoneda.format(row.costo_reparacion)}
            </div>
        `);
        marcadoresDict[row.id_folio] = marker; marcadoresTemporales.push(marker);
    });

    capaBaches.addLayers(marcadoresTemporales);
    if (filtroAlcaldia && marcadoresTemporales.length > 0) map.fitBounds(capaBaches.getBounds(), { padding: [50, 50] }); 
    else map.setView([19.4326, -99.1332], 11); 

    document.getElementById('kpi-total').innerText = totalBaches.toLocaleString('es-MX');
    document.getElementById('kpi-costo').innerText = formatoMoneda.format(costoTotal);
    document.getElementById('kpi-riesgo').innerText = formatoMoneda.format(riesgoTotal);

    let top20 = [...datosFiltrados].sort((a, b) => b.ipuCalculado - a.ipuCalculado).slice(0, 20);
    let top20HTML = "";
    top20.forEach((row, index) => {
        let claseColor = row.ipuCalculado >= 70 ? 'ipu-critica' : (row.ipuCalculado >= 40 ? 'ipu-media' : 'ipu-baja');
        top20HTML += `
            <div class="bache-card" onclick="volarHaciaBache(${row.latitud}, ${row.longitud}, '${row.id_folio}')">
                <div class="bache-header">
                    <span class="bache-folio">#${index + 1} | Folio: ${row.id_folio}</span>
                    <span class="bache-ipu ${claseColor}">${row.ipuCalculado} IPU</span>
                </div>
                <div class="bache-detalle">📍 ${row.colonia || 'Sin colonia'} (${row.alcaldia})<br>🚗 Aforo: ${row.aforo_estimado || 0} | 💰 Costo: ${formatoMoneda.format(row.costo_reparacion)}</div>
            </div>`;
    });
    if(document.getElementById('lista-top20')) document.getElementById('lista-top20').innerHTML = top20HTML;

    if (!filtroAlcaldia) {
        let arrayAlcaldias = Object.keys(statsAlcaldias).map(nombre => ({ nombre: nombre, ...statsAlcaldias[nombre] }));
        arrayAlcaldias.sort((a, b) => b.cantidad - a.cantidad);
        if(arrayAlcaldias.length > 0) {
            document.getElementById('kpi-peor').innerText = arrayAlcaldias[0].nombre; document.getElementById('kpi-mejor').innerText = arrayAlcaldias[arrayAlcaldias.length - 1].nombre;
        }
        let listaHTML = "";
        arrayAlcaldias.forEach(alc => {
            let porcentaje = ((alc.costo / costoTotal) * 100).toFixed(1); 
            listaHTML += `<li onclick="actualizarDashboard('${alc.nombre}')"><span class="alc-nombre">${alc.nombre}</span><span class="alc-datos"><strong>${alc.cantidad.toLocaleString('es-MX')} (${porcentaje}%)</strong><span class="alc-costo">${formatoMoneda.format(alc.costo)}</span></span></li>`;
        });
        document.getElementById('lista-alcaldias').innerHTML = listaHTML;
        actualizarGrafica(arrayAlcaldias.slice(0, 5)); 
    }
}

function actualizarGrafica(top5) {
    const ctx = document.getElementById('graficaAlcaldias').getContext('2d');
    if (miGrafica) { miGrafica.destroy(); }
    miGrafica = new Chart(ctx, {
        type: 'doughnut', data: { labels: top5.map(a => a.nombre), datasets: [{ data: top5.map(a => a.cantidad), backgroundColor: ['#E30052', '#ff3377', '#ff6699', '#ff99bb', '#ffccdd'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } }, cutout: '65%' }
    });
}

window.volarHaciaBache = function(lat, lng, folio) {
    map.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });
    setTimeout(() => {
        let marker = marcadoresDict[folio];
        if (marker) {
            const aplicarEstilos = () => {
                if (marcadorResaltado) marcadorResaltado.setStyle(opcionesOriginales);
                opcionesOriginales = { radius: marker.options.radius, fillColor: marker.options.fillColor, color: marker.options.color, weight: marker.options.weight, fillOpacity: marker.options.fillOpacity };
                marker.setStyle({ radius: 12, color: '#000000', weight: 4, fillColor: '#FFEA00', fillOpacity: 1 });
                marcadorResaltado = marker; marker.openPopup();
            };
            capaBaches.zoomToShowLayer(marker, function () { aplicarEstilos(); });
            if (map.hasLayer(marker)) aplicarEstilos();
        }
    }, 1600);
}

map.on('popupclose', function() {
    if (marcadorResaltado) { marcadorResaltado.setStyle(opcionesOriginales); marcadorResaltado = null; }
});
document.getElementById('btn-limpiar').addEventListener('click', () => actualizarDashboard(null));

// --- ALGORITMO DEL SIMULADOR DE PRESUPUESTO ---
document.getElementById('btn-calcular-sim').addEventListener('click', () => {
    const inputPresupuesto = parseFloat(document.getElementById('input-presupuesto').value);
    
    if (isNaN(inputPresupuesto) || inputPresupuesto <= 0) {
        alert("Por favor ingresa un monto válido mayor a $0");
        return;
    }

    // 1. Filtrar baches que sí tengan costo registrado
    let bachesCandidatos = [...datosGlobales].filter(row => row.costo_reparacion && row.costo_reparacion > 0);
    
    // 2. Ordenar: Primero los de mayor IPU. Si empatan, el más barato primero.
    bachesCandidatos.sort((a, b) => {
        if (b.ipuCalculado === a.ipuCalculado) {
            return a.costo_reparacion - b.costo_reparacion; 
        }
        return b.ipuCalculado - a.ipuCalculado; 
    });

    let presupuestoRestante = inputPresupuesto;
    let bachesSeleccionados = [];
    let gastoTotal = 0;

    // 3. Llenar la mochila
    for (let bache of bachesCandidatos) {
        if (bache.costo_reparacion <= presupuestoRestante) {
            bachesSeleccionados.push(bache);
            presupuestoRestante -= bache.costo_reparacion;
            gastoTotal += bache.costo_reparacion;
        }
    }

    // 4. Mostrar Resultados
    document.getElementById('resultado-simulador').style.display = 'block';
    document.getElementById('sim-cantidad').innerText = bachesSeleccionados.length;
    document.getElementById('sim-gasto').innerText = formatoMoneda.format(gastoTotal);

    let htmlLista = "";
    bachesSeleccionados.forEach((row, index) => {
        let claseColor = row.ipuCalculado >= 70 ? 'ipu-critica' : (row.ipuCalculado >= 40 ? 'ipu-media' : 'ipu-baja');
        htmlLista += `
            <div class="bache-card" onclick="volarHaciaBache(${row.latitud}, ${row.longitud}, '${row.id_folio}')">
                <div class="bache-header">
                    <span class="bache-folio">#${index + 1} | Folio: ${row.id_folio}</span>
                    <span class="bache-ipu ${claseColor}">${row.ipuCalculado} IPU</span>
                </div>
                <div class="bache-detalle">📍 ${row.colonia || 'Sin colonia'} <br>💰 Costo: ${formatoMoneda.format(row.costo_reparacion)}</div>
            </div>`;
    });
    
    if (bachesSeleccionados.length === 0) {
        htmlLista = `<p style="font-size: 13px; color: #E30052; text-align: center; padding: 10px;">El presupuesto no alcanza para reparar ningún bache registrado.</p>`;
    }
    
    document.getElementById('lista-simulador').innerHTML = htmlLista;
});

// --- LÓGICA DE PESTAÑAS ---
const btnResumen = document.getElementById('btn-resumen');
const btnMapa = document.getElementById('btn-mapa');
const btnTop20 = document.getElementById('btn-top20'); 
const btnSimulador = document.getElementById('btn-simulador'); // NUEVO

const vistaResumen = document.getElementById('vista-resumen');
const vistaMapa = document.getElementById('vista-mapa');
const vistaTop20 = document.getElementById('vista-top20'); 
const vistaSimulador = document.getElementById('vista-simulador'); // NUEVO
const panelLateral = document.getElementById('panel-lateral');

function cambiarPestana(botonActivo, vistaActiva, esMapa) {
    [btnResumen, btnMapa, btnTop20, btnSimulador].forEach(btn => { if(btn) btn.classList.remove('active'); });
    [vistaResumen, vistaMapa, vistaTop20, vistaSimulador].forEach(vista => { if(vista) vista.classList.remove('active'); });
    
    if(botonActivo) botonActivo.classList.add('active');
    if(vistaActiva) vistaActiva.classList.add('active');
    if(esMapa) panelLateral.classList.add('compact'); else panelLateral.classList.remove('compact');
}

if(btnResumen) btnResumen.addEventListener('click', () => cambiarPestana(btnResumen, vistaResumen, false));
if(btnMapa) btnMapa.addEventListener('click', () => cambiarPestana(btnMapa, vistaMapa, true));
if(btnTop20) btnTop20.addEventListener('click', () => cambiarPestana(btnTop20, vistaTop20, false));
if(btnSimulador) btnSimulador.addEventListener('click', () => cambiarPestana(btnSimulador, vistaSimulador, false));