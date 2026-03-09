const N8N_AUDIO_URL = 'https://n8n-production-0142.up.railway.app/webhook/historia-clinica-audio';
const N8N_ENVIAR_URL = 'https://n8n-production-0142.up.railway.app/webhook/historia-clinica';

// ── FECHA ──
function setFecha() {
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    document.getElementById('fecha-auto').textContent = `${d}/${m}/${y}`;
}
setFecha();

// ── MÉDICO ──
function cargarMedico() {
    const nombre = localStorage.getItem('cpm_medico_nombre');
    const especialidad = localStorage.getItem('cpm_medico_especialidad');
    if (nombre) {
        document.getElementById('medico-nombre-display').textContent = nombre;
        document.getElementById('medico-especialidad-display').textContent = especialidad || '—';
        document.getElementById('medico-saved').style.display = 'flex';
        document.getElementById('medico-vacio').style.display = 'none';
    } else {
        document.getElementById('medico-saved').style.display = 'none';
        document.getElementById('medico-vacio').style.display = 'block';
    }
}

function abrirModalMedico() {
    document.getElementById('modal-nombre').value = localStorage.getItem('cpm_medico_nombre') || '';
    document.getElementById('modal-especialidad').value = localStorage.getItem('cpm_medico_especialidad') || '';
    document.getElementById('modal-overlay').classList.add('open');
}

function cerrarModalSiFuera(e) {
    if (e.target === document.getElementById('modal-overlay')) {
        document.getElementById('modal-overlay').classList.remove('open');
    }
}

function guardarMedico() {
    const nombre = document.getElementById('modal-nombre').value.trim();
    const especialidad = document.getElementById('modal-especialidad').value.trim();
    if (!nombre) { showToast('Ingresá el nombre del médico', 'error'); return; }
    localStorage.setItem('cpm_medico_nombre', nombre);
    localStorage.setItem('cpm_medico_especialidad', especialidad);
    document.getElementById('modal-overlay').classList.remove('open');
    cargarMedico();
    showToast('Médico guardado ✓', 'success');
}

cargarMedico();

// ── CHAR COUNT ──
document.getElementById('evolucion').addEventListener('input', function () {
    document.getElementById('char-count').textContent = this.value.length;
});

// ── ONDAS DE AUDIO ──
let audioContext, analyser, microphone, animFrameId;
const NUM_BARS = 40;

function crearBarras() {
    const container = document.getElementById('wave-container');
    container.innerHTML = `<div class="wave-status"><div class="wave-dot"></div><span>Grabando</span></div>`;
    for (let i = 0; i < NUM_BARS; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.height = '4px';
        container.appendChild(bar);
    }
}

function animarOndas() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    function draw() {
        animFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        const bars = document.querySelectorAll('.wave-bar');
        const rango = 150;
        const step = Math.floor(rango / NUM_BARS);
        bars.forEach((bar, i) => {
            const value = dataArray[i * step] / 255;
            const height = Math.max(4, value * 60);
            bar.style.height = height + 'px';
            const green = Math.floor(197 + value * 58);
            bar.style.background = `rgb(34, ${green}, 94)`;
        });
    }
    draw();
}

// ── MEDIA RECORDER ──
let mediaRecorder, audioChunks = [], grabando = false, stream;

async function toggleGrabacion() {
    if (!grabando) {
        await iniciarGrabacion();
    } else {
        detenerGrabacion();
    }
}

async function iniciarGrabacion() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Ondas visuales
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        crearBarras();
        animarOndas();
        document.getElementById('wave-container').classList.add('activo');

        // MediaRecorder
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
            await procesarAudio();
        };
        mediaRecorder.start();

        grabando = true;
        const btn = document.getElementById('btn-grabar');
        btn.className = 'btn-grabar grabando';
        document.getElementById('btn-grabar-texto').textContent = 'Detener dictado';

    } catch (e) {
        showToast('No se pudo acceder al micrófono', 'error');
    }
}

function detenerGrabacion() {
    grabando = false;

    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (microphone) microphone.disconnect();
    if (audioContext) audioContext.close();
    if (stream) stream.getTracks().forEach(t => t.stop());

    document.getElementById('wave-container').classList.remove('activo');

    const btn = document.getElementById('btn-grabar');
    btn.className = 'btn-grabar procesando';
    document.getElementById('btn-grabar-texto').textContent = 'Transcribiendo...';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function procesarAudio() {
    try {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('data', blob, 'audio.webm');

        const response = await fetch(N8N_AUDIO_URL, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        const texto = result.texto || result.text || '';

        if (texto) {
            const actual = document.getElementById('evolucion').value;
            document.getElementById('evolucion').value = actual ? actual + ' ' + texto : texto;
            document.getElementById('char-count').textContent = document.getElementById('evolucion').value.length;
            showToast('Transcripción lista ✓', 'success');
        } else {
            showToast('No se detectó audio', 'error');
        }

    } catch (e) {
        showToast('Error al transcribir', 'error');
    }

    const btn = document.getElementById('btn-grabar');
    btn.className = 'btn-grabar idle';
    document.getElementById('btn-grabar-texto').textContent = 'Iniciar dictado';
}

// ── ADJUNTOS ──
let adjuntos = [];

function agregarAdjuntos(input) {
    const files = Array.from(input.files);
    files.forEach(file => {
        const id = Date.now() + Math.random();
        const reader = new FileReader();
        reader.onload = (e) => {
            adjuntos.push({ id, name: file.name, type: file.type, data: e.target.result });
            renderAdjuntos();
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
}

function renderAdjuntos() {
    const grid = document.getElementById('adjuntos-grid');
    grid.innerHTML = '';
    adjuntos.forEach(adj => {
        const div = document.createElement('div');
        div.className = 'adjunto-item';
        if (adj.type.startsWith('image/')) {
            div.innerHTML = `
        <img src="${adj.data}" alt="${adj.name}">
        <button class="btn-remove" onclick="removerAdjunto('${adj.id}')">×</button>
      `;
        } else {
            div.innerHTML = `
        <div style="text-align:center;padding:8px">
          <div class="pdf-icon">📄</div>
          <div class="pdf-name">${adj.name}</div>
        </div>
        <button class="btn-remove" onclick="removerAdjunto('${adj.id}')">×</button>
      `;
        }
        grid.appendChild(div);
    });
}

function removerAdjunto(id) {
    adjuntos = adjuntos.filter(a => String(a.id) !== String(id));
    renderAdjuntos();
}

// ── ENVIAR ──
async function enviar() {
    const pacienteNombre = document.getElementById('paciente-nombre').value.trim();
    const pacienteDni = document.getElementById('paciente-dni').value.trim();
    const evolucion = document.getElementById('evolucion').value.trim();
    const medicoNombre = localStorage.getItem('cpm_medico_nombre');

    if (!medicoNombre) { showToast('Configurá el médico primero', 'error'); abrirModalMedico(); return; }
    if (!pacienteNombre) { showToast('Ingresá el nombre del paciente', 'error'); return; }
    if (!pacienteDni) { showToast('Ingresá el DNI del paciente', 'error'); return; }
    if (!evolucion) { showToast('La evolución está vacía', 'error'); return; }

    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const hoy = new Date();
    const fecha = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

    const payload = {
        fecha,
        medico: medicoNombre,
        especialidad: localStorage.getItem('cpm_medico_especialidad') || '',
        paciente_nombre: pacienteNombre,
        paciente_dni: pacienteDni,
        evolucion,
        adjuntos: adjuntos.map(a => ({ name: a.name, type: a.type, data: a.data })),
        timestamp: new Date().toISOString()
    };

    try {
        await fetch(N8N_ENVIAR_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Historia clínica enviada ✓', 'success');
        document.getElementById('paciente-nombre').value = '';
        document.getElementById('paciente-dni').value = '';
        document.getElementById('evolucion').value = '';
        document.getElementById('char-count').textContent = '0';
        adjuntos = [];
        renderAdjuntos();
    } catch (e) {
        showToast('Error al enviar. Verificá la conexión.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Enviar historia clínica';
}

// ── TOAST ──
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}