// ==========================================
// PROYECTO AUREEN X - v28.0 (ALWAYS ON BANNER)
// ==========================================

// --- 1. CONFIGURACIÓN PWA ---
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.style.display = 'block';
});

// --- 2. ESTADO GLOBAL ---
let state = {
    bcv: { rate: 0, currentInput: "0", isFromUSD: true },
    custom: { rate: 0, currentInput: "0", isFromUSD: true },
    general: { currentInput: "0", previousInput: "", operation: null, history: [] }
};
let currentMode = 'bcv';

// --- 3. UTILIDADES ---
function getTodayString() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// NUEVO HORARIO: 6:00 PM (18:00) a 11:59 PM (23:59)
function isPreviewWindow() {
    const h = new Date().getHours();
    return (h >= 18 && h <= 23); 
}

function isNewDay() { return !isPreviewWindow(); }

function formatNumber(numStr) {
    if (!numStr) return "0";
    let parts = numStr.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return parts.join(',');
}

function parseRaw(numStr) {
    return parseFloat(numStr.replace(/\./g, '').replace(',', '.')) || 0;
}

// --- 4. INTERFAZ GRÁFICA (UI) ---

function applyRateToUI(rate, dateLabel, color) {
    const bcvRateDisplay = document.getElementById('bcv-rate-display');
    const bcvDateDisplay = document.getElementById('bcv-date-display');
    
    if (!bcvRateDisplay) return;

    state.bcv.rate = parseFloat(rate);
    bcvRateDisplay.innerText = state.bcv.rate.toFixed(2).replace('.', ',');
    bcvDateDisplay.innerText = dateLabel;
    bcvRateDisplay.style.color = color;
    updateDisplay('bcv');
}

// FUNCIÓN MAESTRA DEL BANNER
function updateBannerUI(type, value = "") {
    const displayContainer = document.querySelector('.rate-info');
    if (!displayContainer) return;

    let container = document.querySelector('.next-rate-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'next-rate-container';
        displayContainer.parentNode.insertBefore(container, displayContainer.nextSibling);
    }
    
    let content = "";
    
    // CASO 1: ESTADO POR DEFECTO (DÍA)
    if (type === 'default') {
        content = `
            <div class="next-rate-badge default-badge">
                <span class="next-rate-icon">🏛️</span>
                <span class="next-rate-label" style="color:var(--text-secondary); font-weight:400;">BCV: Promedio de operaciones</span>
            </div>
        `;
    }
    // CASO 2: TASA NUEVA DETECTADA (NOCHE)
    else if (type === 'new_rate') {
        content = `
            <div class="next-rate-badge alert-badge">
                <span class="next-rate-icon">🔴</span>
                <span class="next-rate-label">Tasa Mañana:</span>
                <span class="next-rate-value" style="color:#FF5252; font-weight:700; margin-left:5px;">
                    ${value}
                </span>
            </div>
        `;
    }
    // CASO 3: MONITOREANDO / SIN CAMBIOS (NOCHE)
    else if (type === 'monitoring') {
        content = `
            <div class="next-rate-badge monitoring-badge">
                <span class="next-rate-icon">📡</span>
                <span class="next-rate-label">Monitoreando BCV...</span>
            </div>
        `;
    }

    container.innerHTML = content;
}

// --- 5. CORE: MOTOR DE BÚSQUEDA ---

async function fetchBCVRate(forceUpdate = false) {
    const bcvRateDisplay = document.getElementById('bcv-rate-display');
    const todayStr = getTodayString();
    
    const colorGreen = "#2ECC71"; 
    const colorOld = "#FFB74D";   

    const savedRate = parseFloat(localStorage.getItem('aureen-bcv-rate')) || 0;
    const savedDate = localStorage.getItem('aureen-bcv-date');
    const savedNextRate = parseFloat(localStorage.getItem('aureen-next-rate')) || 0;

    // A. MOSTRAR CACHÉ (Verde)
    if (savedRate > 0) {
        const color = (savedDate === todayStr) ? colorGreen : colorOld;
        applyRateToUI(savedRate, savedDate || "--/--", color);
    }

    // B. CONTROL DEL BANNER (Lógica Inicial)
    // Si NO es de noche -> Mostrar mensaje por defecto "Promedio Operaciones"
    if (!isPreviewWindow()) {
        updateBannerUI('default');
    } 
    // Si ES de noche y ya tenemos tasa futura guardada -> Mostrarla
    else if (isPreviewWindow() && savedNextRate > 0) {
        const isSame = Math.abs(savedNextRate - savedRate) < 0.01;
        updateBannerUI(isSame ? 'monitoring' : 'new_rate', savedNextRate.toFixed(2).replace('.', ','));
    }
    // Si ES de noche pero no tenemos nada aún -> Mostrar "Monitoreando"
    else {
        updateBannerUI('monitoring');
    }

    // C. BÚSQUEDA DE DATOS
    if (forceUpdate || isPreviewWindow() || savedDate !== todayStr) {
        
        if (forceUpdate && bcvRateDisplay) {
            bcvRateDisplay.innerText = "...";
            bcvRateDisplay.style.color = "var(--text-secondary)";
        }

        let fetchedRate = 0;
        let success = false;
        const cacheBuster = `?t=${Date.now()}`;

        // 1. PyDolarVenezuela API
        if (!success) {
            try {
                const resp = await fetch(`https://pydolarve.org/api/v1/dollar?monitor=bcv&${cacheBuster}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.price) {
                        fetchedRate = parseFloat(data.price);
                        if (fetchedRate > 10) success = true;
                    }
                }
            } catch (e) {}
        }

        // 2. Microlink (Respaldo)
        if (!success && isPreviewWindow()) {
            try {
                const target = `https://www.bcv.org.ve/?t=${cacheBuster}`;
                const microUrl = `https://api.microlink.io/?url=${encodeURIComponent(target)}&filter=body`;
                const resp = await fetch(microUrl);
                if (resp.ok) {
                    const json = await resp.json();
                    const rawHtml = JSON.stringify(json); 
                    const match = rawHtml.match(/(\d{2,3},\d{4,8})/);
                    if (match && match[1]) {
                        fetchedRate = parseFloat(match[1].replace(',', '.'));
                        if (fetchedRate > 10) success = true;
                    }
                }
            } catch(e) {}
        }

        // 3. DolarAPI (Respaldo final)
        if (!success) {
            try {
                const resp = await fetch(`https://ve.dolarapi.com/v1/dolares/oficial?${cacheBuster}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.promedio > 0) { 
                        fetchedRate = parseFloat(data.promedio); 
                        success = true; 
                    }
                }
            } catch (e) {}
        }

        // D. RESULTADO
        if (success && fetchedRate > 0) {
            
            // --- MODO NOCHE (8 PM - 12 AM) ---
            if (isPreviewWindow()) {
                // Tasa Verde: Intacta
                if (savedRate === 0 || savedDate !== todayStr) {
                    applyRateToUI(fetchedRate, todayStr, colorGreen);
                    localStorage.setItem('aureen-bcv-rate', fetchedRate);
                    localStorage.setItem('aureen-bcv-date', todayStr);
                } else {
                    applyRateToUI(savedRate, todayStr, colorGreen);
                }
                
                // Tasa Roja: VERIFICAR CAMBIO
                const isSame = Math.abs(fetchedRate - savedRate) < 0.01;
                
                if (isSame) {
                    // Si es igual, mostramos que seguimos monitoreando (o el mensaje default si prefieres)
                    updateBannerUI('monitoring');
                } else {
                    // SI ES DIFERENTE: ¡BANNER ROJO!
                    updateBannerUI('new_rate', fetchedRate.toFixed(2).replace('.', ','));
                    localStorage.setItem('aureen-next-rate', fetchedRate);
                }
            } 
            
            // --- MODO DÍA ---
            else {
                // Actualizamos verde
                localStorage.setItem('aureen-bcv-rate', fetchedRate);
                localStorage.setItem('aureen-bcv-date', todayStr);
                applyRateToUI(fetchedRate, todayStr, colorGreen);
                // Ponemos el banner por defecto
                updateBannerUI('default');
                // Borramos memoria de tasa futura
                localStorage.removeItem('aureen-next-rate');
            }
        } else {
            // FALLO: Restaurar verde si existe
            if (savedRate > 0) {
                applyRateToUI(savedRate, savedDate || "--/--", (savedDate === todayStr) ? colorGreen : colorOld);
            }
        }
    }
}

// --- 6. VIGILANTE ---
function startNightlyWatcher() {
    // Al iniciar, verifica hora
    const h = new Date().getHours();
    
    // Si estamos en el cambio de turno (7:59 -> 8:00), actualiza
    setInterval(() => {
        const nowH = new Date().getHours();
        const nowM = new Date().getMinutes();
        if ((nowH === 20 && nowM === 0) || (nowH === 0 && nowM === 0)) fetchBCVRate(true);
    }, 60000);
}

// --- 7. INICIALIZACIÓN ---
window.onload = function() {
    try { Telegram.WebApp.ready(); } catch (e) {}

    const savedTheme = localStorage.getItem('aureen-calc-theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').checked = true;
    }

    try { state.general.history = JSON.parse(localStorage.getItem('aureen-calc-history')) || []; } catch (e) {}
    
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }

    // CARGAR MODO MANUAL
    const savedCustom = localStorage.getItem('aureen-custom-val');
    if (savedCustom) {
        document.getElementById('custom-rate-input').value = savedCustom;
        state.custom.rate = parseFloat(savedCustom);
    }

    fetchBCVRate();        
    startNightlyWatcher(); 
    updateDisplay('custom');
    updateDisplay('general');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone) {
        setTimeout(() => {
            if (!sessionStorage.getItem('install-modal-closed')) showModal('install-pwa-modal');
        }, 3000);
    }
};

// --- 8. FUNCIONES CORE ---
function switchMode(mode) {
    document.getElementById('options-menu').classList.remove('show');
    currentMode = mode;
    document.querySelectorAll('.mode-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${mode}-mode`).classList.add('active');
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');
}
function appendNumber(number, mode) {
    if (state[mode].currentInput === "0" && number !== '00') state[mode].currentInput = number;
    else if (state[mode].currentInput !== "0" || (state[mode].currentInput === "0" && number === '00')) {
         if(state[mode].currentInput.replace(/[,.]/g, '').length < 15) state[mode].currentInput += number;
    }
    updateDisplay(mode);
}
function appendDecimal(mode) {
    if (!state[mode].currentInput.includes(',')) state[mode].currentInput += ',';
    updateDisplay(mode);
}
function deleteLast(mode) {
    state[mode].currentInput = state[mode].currentInput.slice(0, -1);
    if (state[mode].currentInput === "") state[mode].currentInput = "0";
    updateDisplay(mode);
}
function clearAll(mode) {
    state[mode].currentInput = "0";
    if (mode === 'general') { state.general.previousInput = ""; state.general.operation = null; }
    updateDisplay(mode);
}
function updateDisplay(mode) {
    if (mode === 'bcv' || mode === 'custom') {
        const mainDisplay = document.getElementById(`${mode}-main-display`);
        const subDisplay = document.getElementById(`${mode}-sub-display`);
        const fromSymbol = document.getElementById(`${mode}-from-symbol`);
        const toSymbol = document.getElementById(`${mode}-to-symbol`);
        
        if (mode === 'custom') {
            const inputVal = document.getElementById('custom-rate-input').value;
            // Guardar al escribir
            localStorage.setItem('aureen-custom-val', inputVal);
            state.custom.rate = parseFloat(inputVal.replace(',', '.')) || 0;
        }
        mainDisplay.innerText = formatNumber(state[mode].currentInput);
        const currentRate = state[mode].rate;
        if (currentRate === 0) { subDisplay.innerText = "0,00"; return; }
        const mainValue = parseRaw(state[mode].currentInput);
        let subValue = state[mode].isFromUSD ? (mainValue * currentRate) : (mainValue / currentRate);
        if (state[mode].isFromUSD) { fromSymbol.innerText = "$"; toSymbol.innerText = "Bs"; }
        else { fromSymbol.innerText = "Bs"; toSymbol.innerText = "$"; }
        if (!isFinite(subValue) || isNaN(subValue)) subValue = 0;
        subDisplay.innerText = subValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (mode === 'general') {
        document.getElementById('general-main-display').innerText = formatNumber(state.general.currentInput);
        if(state.general.operation != null) {
            document.getElementById('general-sub-display').innerText = `${formatNumber(state.general.previousInput)} ${state.general.operation}`;
        } else {
            document.getElementById('general-sub-display').innerText = '';
        }
    }
}
function swapCurrencies(mode) {
    state[mode].isFromUSD = !state[mode].isFromUSD;
    const subDisplayText = document.getElementById(`${mode}-sub-display`).innerText;
    state[mode].currentInput = parseRaw(subDisplayText).toString().replace('.', ',');
    updateDisplay(mode);
}

// --- 9. UI EXTRAS ---
function toggleOptionsMenu() { document.getElementById('options-menu').classList.toggle('show'); }
function showModal(id) { 
    document.getElementById(id).classList.add('show'); 
    document.getElementById('options-menu').classList.remove('show');
    if (id === 'history-screen') renderHistory();
}
function closeModal(id) { 
    document.getElementById(id).classList.remove('show');
    if (id === 'install-pwa-modal') sessionStorage.setItem('install-modal-closed', 'true');
}
function toggleTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle.checked) { document.body.setAttribute('data-theme', 'light'); localStorage.setItem('aureen-calc-theme', 'light'); }
    else { document.body.removeAttribute('data-theme'); localStorage.setItem('aureen-calc-theme', 'dark'); }
    // En el modo "Solaris" no hay checkbox, pero la lógica es la misma
    const body = document.body;
    const current = body.getAttribute('data-theme');
    if(current === 'light') {
        body.removeAttribute('data-theme');
        localStorage.setItem('aureen-calc-theme', 'dark');
    } else {
        body.setAttribute('data-theme', 'light');
        localStorage.setItem('aureen-calc-theme', 'light');
    }
    if (navigator.vibrate) navigator.vibrate(10);
}
function triggerInstallPrompt() { if (deferredInstallPrompt) deferredInstallPrompt.prompt(); }
window.addEventListener('click', (e) => {
    const menu = document.getElementById('options-menu');
    const btn = document.getElementById('options-menu-btn');
    if (e.target && !menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('show');
});

// WIDGET COMPARTIR
function toggleShare(mode) {
    const widget = document.getElementById(`share-widget-${mode}`);
    if (widget.classList.contains('open')) {
        widget.classList.remove('open');
    } else {
        document.querySelectorAll('.share-container').forEach(el => el.classList.remove('open'));
        widget.classList.add('open');
        setTimeout(() => { widget.classList.remove('open'); }, 5000);
    }
    if (navigator.vibrate) navigator.vibrate(10);
}

// ==========================================
// MÓDULO DE COMPARTIR PRO (DISEÑO TICKET)
// ==========================================

// Helper para extraer datos limpios y evitar repetir código
function getShareData(mode) {
    const mainText = document.getElementById(`${mode}-main-display`).innerText;
    const subText = document.getElementById(`${mode}-sub-display`).innerText;
    
    // Formateamos la tasa asegurando 2 decimales
    const rate = state[mode].rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = getTodayString(); // Usamos tu función de fecha existente
    
    // Identificamos quién es quién para no confundir al usuario
    let amountUSD, amountBS;
    
    if (state[mode].isFromUSD) {
        amountUSD = mainText;
        amountBS = subText;
    } else {
        amountUSD = subText;
        amountBS = mainText; // Si el input es Bs, el main es Bs
    }

    return { amountUSD, amountBS, rate, date };
}

function shareToWhatsApp(mode) {
    // 1. Verificar si está vacío (Tu lógica original)
    if (parseRaw(state[mode].currentInput) === 0) {
        const shopPhoneNumber = "584141802040"; 
        window.open(`https://wa.me/${shopPhoneNumber}?text=${encodeURIComponent("Hola Erick, me interesa saber más sobre Aureen X.")}`, '_blank');
        return; 
    }

    const data = getShareData(mode);

    // 2. FORMATO TICKET DIGITAL
    // Las líneas '────' crean orden visual.
    // La flecha '⬇️' indica conversión.
    const message = 
`*Aureen X* 💎 | Reporte
──────────────
💵 *${data.amountUSD} $*
      ⬇️
🇻🇪 *${data.amountBS} Bs*
──────────────
📅 *Fecha:* ${data.date}
📈 *Tasa:* ${data.rate}

🤖 _Calcula aquí:_
👉 t.me/aureenAIbot`;

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}

function shareToTelegram(mode) {
    const data = getShareData(mode);
    
    // Telegram soporta Markdown limpio.
    const msg = 
`💎 **Cálculo Aureen X**

💵 **${data.amountUSD} $**
🇻🇪 **${data.amountBS} Bs**

ℹ️ _Tasa del día (${data.date}):_ **${data.rate}**
🔗 @aureenAIbot`;

    const url = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/aureenAIbot")}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

function shareToSocial(platform, mode) {
    // Redirigimos a la genérica con el modo correcto
    shareToSocialGeneric(platform, mode);
}

function shareToSocialGeneric(platform, mode) {
    const data = getShareData(mode);
    
    // FORMATO REDES (X / THREADS)
    // Formato horizontal con hashtags para viralidad
    const msg = `💱 Aureen X | ${data.date}\n\n💵 ${data.amountUSD}$ ➡️ 🇻🇪 ${data.amountBS} Bs\n\n📊 Tasa: ${data.rate}\n\n#BCV #Venezuela #Dolar #Aureen`;
    const botLink = "https://t.me/aureenAIbot";

    let url = "";

    if (platform === 'x') {
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(botLink)}`;
    } else if (platform === 'threads') {
        url = `https://www.threads.net/intent/post?text=${encodeURIComponent(msg + "\n\n" + botLink)}`;
    } else if (platform === 'telegram') {
        // Redundancia por si acaso se llama directo
        shareToTelegram(mode);
        return;
    }
    
    window.open(url, '_blank');
}

// Haptic
function triggerHaptic() { if (navigator.vibrate) navigator.vibrate(15); }
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button, .venezuela-banner, .creator-signature, .main-amount, .converted-amount').forEach(btn => {
        btn.addEventListener('click', () => triggerHaptic());
    });
});