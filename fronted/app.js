const map = L.map('map', { zoomControl: false }).setView([19.4326, -99.1332], 11);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16
}).addTo(map);

// Variables Globales
let datosGlobales = [];
let miGrafica = null; 
const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// Inicializamos el agrupador de Clusters
let capaBaches = L.markerClusterGroup({
    maxClusterRadius: 60,
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: true 
}).addTo(map);

// --- MOTOR ALGORÍTMICO: CÁLCULO DEL IPU ---
function calcularIPU(aforo, volumen, tipoVia) {
    // Normalización: Evitamos que valores atípicamente gigantes rompan la escala
    let aforoNorm = Math.min((aforo || 0) / 20000, 1); 
    let volNorm = Math.min((volumen || 0) / 10, 1);

    // Puntuación por Tipo de Vía (OpenStreetMap)
    let viaScore = 0.2; // Base para calles locales
    const tipo = String(tipoVia).toLowerCase().trim();
    if (tipo.includes('motorway') || tipo.includes('trunk') || tipo.includes('primary')) {
        viaScore = 1.0;
    } else if (tipo.includes('secondary') || tipo.includes('tertiary')) {
        viaScore = 0.6;
    }

    // Fórmula IPU: 40% Vía, 35% Aforo, 25% Volumen
    let puntaje = (viaScore * 0.40) + (aforoNorm * 0.35) + (volNorm * 0.25);
    return Math.round(puntaje * 100);
}

// --- SEMÁFORO INTELIGENTE ---
function obtenerSemaforoIPU(ipu) {
    if (ipu >= 70) return { color: "#E30052", etiqueta: "Prioridad Crítica", icono: "🔴" };
    if (ipu >= 40) return { color: "#FF9500", etiqueta: "Prioridad Media", icono: "🟠" };
    return { color: "#007AFF", etiqueta: "Prioridad Baja", icono: "🔵" };
}

// Cargar datos
Papa.parse("sipa_final_completo.csv", {
    download: true, header: true, dynamicTyping: true,
    complete: function(results) {
        datosGlobales = results.data.filter(row => row.latitud && row.longitud);
        actualizarDashboard(); 
    }
});

function actualizarDashboard(filtroAlcaldia = null) {
    capaBaches.clearLayers(); 
    
    let datosFiltrados = filtroAlcaldia ? 
        datosGlobales.filter(row => row.alcaldia === filtroAlcaldia) : datosGlobales;

    document.getElementById('btn-limpiar').style.display = filtroAlcaldia ? 'block' : 'none';

    let totalBaches = 0, costoTotal = 0, riesgoTotal = 0;
    let statsAlcaldias = {};
    let marcadoresTemporales = []; 

    datosFiltrados.forEach(row => {
        totalBaches++;
        costoTotal += (row.costo_reparacion || 0);
        riesgoTotal += (row.pasivo_NIF_C9 || 0);

        let alc = row.alcaldia || "SIN REGISTRO";
        if (!statsAlcaldias[alc]) statsAlcaldias[alc] = { cantidad: 0, costo: 0 };
        statsAlcaldias[alc].cantidad++;
        statsAlcaldias[alc].costo += (row.costo_reparacion || 0);

        // APLICAMOS EL CÁLCULO IPU A CADA BACHE
        let ipuCalculado = calcularIPU(row.aforo_estimado, row.volumen_m3, row.tipo_via);
        let semaforo = obtenerSemaforoIPU(ipuCalculado);

        let marker = L.circleMarker([row.latitud, row.longitud], {
            radius: filtroAlcaldia ? 6 : 5, 
            fillColor: semaforo.color, 
            color: "transparent", 
            fillOpacity: 0.9 
        }).bindPopup(`
            <div style="font-family: Inter;">
                <strong>Folio:</strong> ${row.id_folio}<br>
                <strong>SIPA:</strong> <span style="color:${semaforo.color}; font-weight:bold;">${semaforo.icono} ${semaforo.etiqueta}</span><br>
                <strong>IPU:</strong> ${ipuCalculado} / 100<br>
                <strong>Costo APU:</strong> ${formatoMoneda.format(row.costo_reparacion)}
            </div>
        `);
        
        marcadoresTemporales.push(marker);
    });

    capaBaches.addLayers(marcadoresTemporales);

    if (filtroAlcaldia && marcadoresTemporales.length > 0) {
        map.fitBounds(capaBaches.getBounds(), { padding: [50, 50] }); 
    } else {
        map.setView([19.4326, -99.1332], 11); 
    }

    document.getElementById('kpi-total').innerText = totalBaches.toLocaleString('es-MX');
    document.getElementById('kpi-costo').innerText = formatoMoneda.format(costoTotal);
    document.getElementById('kpi-riesgo').innerText = formatoMoneda.format(riesgoTotal);

    if (!filtroAlcaldia) {
        let arrayAlcaldias = Object.keys(statsAlcaldias).map(nombre => {
            return { nombre: nombre, ...statsAlcaldias[nombre] };
        });
        arrayAlcaldias.sort((a, b) => b.cantidad - a.cantidad);

        if(arrayAlcaldias.length > 0) {
            document.getElementById('kpi-peor').innerText = arrayAlcaldias[0].nombre;
            document.getElementById('kpi-mejor').innerText = arrayAlcaldias[arrayAlcaldias.length - 1].nombre;
        }

        let listaHTML = "";
        arrayAlcaldias.forEach(alc => {
            let porcentaje = ((alc.costo / costoTotal) * 100).toFixed(1); 
            listaHTML += `
                <li onclick="actualizarDashboard('${alc.nombre}')">
                    <span class="alc-nombre">${alc.nombre}</span>
                    <span class="alc-datos">
                        <strong>${alc.cantidad.toLocaleString('es-MX')} (${porcentaje}%)</strong>
                        <span class="alc-costo">${formatoMoneda.format(alc.costo)}</span>
                    </span>
                </li>
            `;
        });
        document.getElementById('lista-alcaldias').innerHTML = listaHTML;

        actualizarGrafica(arrayAlcaldias.slice(0, 5)); 
    }
}

function actualizarGrafica(top5) {
    const ctx = document.getElementById('graficaAlcaldias').getContext('2d');
    if (miGrafica) { miGrafica.destroy(); }
    miGrafica = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: top5.map(a => a.nombre),
            datasets: [{
                data: top5.map(a => a.cantidad),
                backgroundColor: ['#E30052', '#ff3377', '#ff6699', '#ff99bb', '#ffccdd'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
            cutout: '65%' 
        }
    });
}

document.getElementById('btn-limpiar').addEventListener('click', () => actualizarDashboard(null));

const btnResumen = document.getElementById('btn-resumen');
const btnMapa = document.getElementById('btn-mapa');
const vistaResumen = document.getElementById('vista-resumen');
const vistaMapa = document.getElementById('vista-mapa');
const panelLateral = document.getElementById('panel-lateral');

btnResumen.addEventListener('click', () => {
    btnResumen.classList.add('active'); btnMapa.classList.remove('active');
    vistaResumen.classList.add('active'); vistaMapa.classList.remove('active');
    panelLateral.classList.remove('compact');
});

btnMapa.addEventListener('click', () => {
    btnMapa.classList.add('active'); btnResumen.classList.remove('active');
    vistaMapa.classList.add('active'); vistaResumen.classList.remove('active');
    panelLateral.classList.add('compact');
});

// --- LEYENDA NATIVA DE LEAFLET (SEGURO CONTRA BLOQUEOS) ---
const leyendaIPU = L.control({ position: 'bottomright' });

leyendaIPU.onAdd = function (map) {
    let div = L.DomUtil.create('div', 'info legend');
    
    // Evita que hacer clic en la leyenda mueva el mapa por accidente
    L.DomEvent.disableClickPropagation(div);
    
    // Estilos inyectados con JavaScript (sin necesidad de tocar style.css)
    div.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    div.style.padding = "15px";
    div.style.borderRadius = "12px";
    div.style.boxShadow = "0 4px 15px rgba(0,0,0,0.15)";
    div.style.fontFamily = "'Inter', sans-serif";
    div.style.border = "1px solid rgba(0,0,0,0.05)";
    
    div.innerHTML = `
        <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #111;">Prioridad IPU</h4>
        
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="background: #E30052; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span>
            <span style="font-size: 13px; color: #444; font-weight: 500;">Crítica (≥70)</span>
        </div>
        
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="background: #FF9500; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span>
            <span style="font-size: 13px; color: #444; font-weight: 500;">Media (40 - 69)</span>
        </div>
        
        <div style="display: flex; align-items: center;">
            <span style="background: #007AFF; width: 16px; height: 16px; border-radius: 50%; margin-right: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-block;"></span>
            <span style="font-size: 13px; color: #444; font-weight: 500;">Baja (< 40)</span>
        </div>
    `;
    return div;
};

leyendaIPU.addTo(map);