const map = L.map('map', { zoomControl: false }).setView([19.4326, -99.1332], 11);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16
}).addTo(map);

// Variables Globales
let datosGlobales = [];
let capaBaches = L.featureGroup().addTo(map); // Capa agrupable para hacer zoom automático
let miGrafica = null; // Instancia de Chart.js
const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// 1. Cargar datos una sola vez
Papa.parse("sipa_final_completo.csv", {
    download: true, header: true, dynamicTyping: true,
    complete: function(results) {
        datosGlobales = results.data.filter(row => row.latitud && row.longitud);
        actualizarDashboard(); // Dibuja todo por primera vez sin filtros
    }
});

// 2. Función Maestra Dinámica (Se ejecuta cada que filtras)
function actualizarDashboard(filtroAlcaldia = null) {
    capaBaches.clearLayers(); // Limpiamos el mapa
    
    // Si hay filtro, extraemos solo esa alcaldía. Si no, usamos todo.
    let datosFiltrados = filtroAlcaldia ? 
        datosGlobales.filter(row => row.alcaldia === filtroAlcaldia) : datosGlobales;

    // Mostrar/Ocultar el botón de limpiar filtro
    document.getElementById('btn-limpiar').style.display = filtroAlcaldia ? 'block' : 'none';

    let totalBaches = 0, costoTotal = 0, riesgoTotal = 0;
    let statsAlcaldias = {};

    // Procesar Matemáticas
    datosFiltrados.forEach(row => {
        totalBaches++;
        costoTotal += (row.costo_reparacion || 0);
        riesgoTotal += (row.pasivo_NIF_C9 || 0);

        let alc = row.alcaldia || "SIN REGISTRO";
        if (!statsAlcaldias[alc]) statsAlcaldias[alc] = { cantidad: 0, costo: 0 };
        statsAlcaldias[alc].cantidad++;
        statsAlcaldias[alc].costo += (row.costo_reparacion || 0);

        // Dibujar marcador
        let marker = L.circleMarker([row.latitud, row.longitud], {
            radius: filtroAlcaldia ? 4 : 3, // Puntos más grandes si está filtrado
            fillColor: "#E30052", color: "transparent", fillOpacity: 0.6
        }).bindPopup(`<strong>Folio:</strong> ${row.id_folio}<br><strong>Costo:</strong> ${formatoMoneda.format(row.costo_reparacion)}`);
        
        capaBaches.addLayer(marker);
    });

    // Zoom Automático en el Mapa
    if (filtroAlcaldia && capaBaches.getLayers().length > 0) {
        map.fitBounds(capaBaches.getBounds(), { padding: [50, 50] }); // Vuela a la alcaldía
    } else {
        map.setView([19.4326, -99.1332], 11); // Regresa a vista CDMX completa
    }

    // Actualizar KPIs de la Pestaña Mapa
    document.getElementById('kpi-total').innerText = totalBaches.toLocaleString('es-MX');
    document.getElementById('kpi-costo').innerText = formatoMoneda.format(costoTotal);
    document.getElementById('kpi-riesgo').innerText = formatoMoneda.format(riesgoTotal);

    // Actualizar Lista Interactiva y Gráfica (Solo si NO hay filtro activo)
    if (!filtroAlcaldia) {
        let arrayAlcaldias = Object.keys(statsAlcaldias).map(nombre => {
            return { nombre: nombre, ...statsAlcaldias[nombre] };
        });
        arrayAlcaldias.sort((a, b) => b.cantidad - a.cantidad);

        // Extremos
        document.getElementById('kpi-peor').innerText = arrayAlcaldias[0].nombre;
        document.getElementById('kpi-mejor').innerText = arrayAlcaldias[arrayAlcaldias.length - 1].nombre;

        // Construir Lista Interactiva
        let listaHTML = "";
        arrayAlcaldias.forEach(alc => {
            let porcentaje = ((alc.costo / costoTotal) * 100).toFixed(1); // Cálculo % Presupuesto
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

        // Construir Gráfica Chart.js (Doughnut)
        actualizarGrafica(arrayAlcaldias.slice(0, 5)); // Mandamos el Top 5 a la gráfica
    }
}

// 3. Función para la Gráfica de Pastel (Top 5 Alcaldías Críticas)
function actualizarGrafica(top5) {
    const ctx = document.getElementById('graficaAlcaldias').getContext('2d');
    
    // Si ya existe una gráfica, la destruimos para redibujarla limpia
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
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
            },
            cutout: '65%' // Hace el agujero del centro más delgado
        }
    });
}

// 4. Eventos de los Botones
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