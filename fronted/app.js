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

// MAGIA DE CLUSTERS: Inicializamos el agrupador
let capaBaches = L.markerClusterGroup({
    maxClusterRadius: 60,
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: true 
}).addTo(map);

// Lógica de Clasificación, Colores y Traducción al Español
function obtenerDetallesVia(tipoVia) {
    if (!tipoVia) return { color: "#8E8E93", label: "No registrado" };
    const tipo = String(tipoVia).toLowerCase().trim();
    
    // 1. Autopistas y Vías Primarias (Guinda)
    if (tipo.includes('motorway') || tipo.includes('trunk') || tipo.includes('primary')) {
        return { color: "#E30052", label: "Vía Primaria / Eje" };
    } 
    // 2. Vías Secundarias y Terciarias (Naranja)
    else if (tipo.includes('secondary') || tipo.includes('tertiary')) {
        return { color: "#FF9500", label: "Vía Secundaria / Avenida" };
    } 
    // 3. Calles Residenciales y Locales (Azul)
    else {
        return { color: "#007AFF", label: "Calle Residencial / Local" };
    }
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

        // Obtenemos color y etiqueta traducida al español
        let detalles = obtenerDetallesVia(row.tipo_via);

        let marker = L.circleMarker([row.latitud, row.longitud], {
            radius: filtroAlcaldia ? 6 : 5, 
            fillColor: detalles.color, 
            color: "transparent", 
            fillOpacity: 0.9 
        }).bindPopup(`
            <div style="font-family: Inter;">
                <strong>Folio:</strong> ${row.id_folio}<br>
                <strong>Vía:</strong> <span style="color:${detalles.color}; font-weight:bold;">${detalles.label}</span><br>
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