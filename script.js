// ==========================================
// PROYECTO NOVA X - v29.0 (FINAL)
// ==========================================

// --- 1. CONFIGURACIÓN PWA Y BOTÓN DE INSTALACIÓN ---
let deferredInstallPrompt = null;

// A. Detectar si la app es instalable (Chrome/Android/Edge)
window.addEventListener('beforeinstallprompt', (e) => {
    // Evitamos que Chrome muestre su barra automática (queremos usar nuestro botón)
    e.preventDefault();
    deferredInstallPrompt = e;
    
    // Si NO está instalada, mostramos nuestro banner flotante
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        const banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'flex';
    }
});

// B. Lógica del Botón "INSTALAR AHORA"
document.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('install-btn-action');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                // Lanzamos el cuadro nativo del sistema
                deferredInstallPrompt.prompt();
                // Esperamos a ver qué dice el usuario
                const { outcome } = await deferredInstallPrompt.userChoice;
                console.log(`Usuario respondió: ${outcome}`);
                // Ocultamos el banner pase lo que pase
                document.getElementById('install-banner').style.display = 'none';
                deferredInstallPrompt = null;
            }
        });
    }
});

// C. Si se instaló con éxito, ocultar todo
window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner').style.display = 'none';
    console.log('Nova X instalada correctamente');
});

// D. Detección especial para iPhone (iOS)
function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// --- 2. REGISTRO SERVICE WORKER (Para que funcione Offline) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registrado', reg))
        .catch(err => console.warn('Error SW', err));
}

// --- 3. ESTADO GLOBAL ---
let state = {
    bcv: { rate: 0, currentInput: "0", isFromUSD: true },
    custom: { rate: 0, currentInput: "0", isFromUSD: true },
    general: { currentInput: "0", previousInput: "", operation: null, history: [] }
};
let currentMode = 'bcv';

// --- 4. UTILIDADES ---
function getTodayString() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// HORARIO: 6:00 PM (18:00) a 11:59 PM (23:59)
function isPreviewWindow() {
    const h = new Date().getHours();
    return (h >= 18 && h <= 23); 
}

function formatNumber(numStr) {
    if (!numStr) return "0";
    let parts = numStr.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return parts.join(',');
}

function parseRaw(numStr) {
    return parseFloat(numStr.replace(/\./g, '').replace(',', '.')) || 0;
}

// --- 5. INTERFAZ GRÁFICA (UI) ---

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

// BANNER DE TASA MAÑANA
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
    
    if (type === 'default') {
        content = `
            <div class="next-rate-badge default-badge">
                <span class="next-rate-icon">🏛️</span>
                <span class="next-rate-label" style="color:var(--text-secondary); font-weight:400;">BCV: Promedio de operaciones</span>
            </div>
        `;
    }
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

// --- 6. CORE: MOTOR DE BÚSQUEDA ---

async function fetchBCVRate(forceUpdate = false) {
    const bcvRateDisplay = document.getElementById('bcv-rate-display');
    const todayStr = getTodayString();
    
    const colorGreen = "#2ECC71"; 
    const colorOld = "#FFB74D";   

    const savedRate = parseFloat(localStorage.getItem('aureen-bcv-rate')) || 0;
    const savedDate = localStorage.getItem('aureen-bcv-date');
    const savedNextRate = parseFloat(localStorage.getItem('aureen-next-rate')) || 0;

    // MOSTRAR CACHÉ
    if (savedRate > 0) {
        const color = (savedDate === todayStr) ? colorGreen : colorOld;
        applyRateToUI(savedRate, savedDate || "--/--", color);
    }

    // CONTROL DEL BANNER
    if (!isPreviewWindow()) {
        updateBannerUI('default');
    } 
    else if (isPreviewWindow() && savedNextRate > 0) {
        const isSame = Math.abs(savedNextRate - savedRate) < 0.01;
        updateBannerUI(isSame ? 'monitoring' : 'new_rate', savedNextRate.toFixed(2).replace('.', ','));
    }
    else {
        updateBannerUI('monitoring');
    }

    // BÚSQUEDA DE DATOS
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

        // 2. Microlink
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

        // 3. DolarAPI
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

        // RESULTADO
        if (success && fetchedRate > 0) {
            if (isPreviewWindow()) {
                if (savedRate === 0 || savedDate !== todayStr) {
                    applyRateToUI(fetchedRate, todayStr, colorGreen);
                    localStorage.setItem('aureen-bcv-rate', fetchedRate);
                    localStorage.setItem('aureen-bcv-date', todayStr);
                } else {
                    applyRateToUI(savedRate, todayStr, colorGreen);
                }
                
                const isSame = Math.abs(fetchedRate - savedRate) < 0.01;
                if (isSame) {
                    updateBannerUI('monitoring');
                } else {
                    updateBannerUI('new_rate', fetchedRate.toFixed(2).replace('.', ','));
                    localStorage.setItem('aureen-next-rate', fetchedRate);
                }
            } else {
                localStorage.setItem('aureen-bcv-rate', fetchedRate);
                localStorage.setItem('aureen-bcv-date', todayStr);
                applyRateToUI(fetchedRate, todayStr, colorGreen);
                updateBannerUI('default');
                localStorage.removeItem('aureen-next-rate');
            }
        } else {
            if (savedRate > 0) {
                applyRateToUI(savedRate, savedDate || "--/--", (savedDate === todayStr) ? colorGreen : colorOld);
            }
        }
    }
}

// --- 7. VIGILANTE ---
function startNightlyWatcher() {
    setInterval(() => {
        const nowH = new Date().getHours();
        const nowM = new Date().getMinutes();
        if ((nowH === 20 && nowM === 0) || (nowH === 0 && nowM === 0)) fetchBCVRate(true);
    }, 60000);
}

// --- 8. INICIALIZACIÓN ---
window.onload = function() {
    try { Telegram.WebApp.ready(); } catch (e) {}

    const savedTheme = localStorage.getItem('aureen-calc-theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').checked = true;
    }

    try { state.general.history = JSON.parse(localStorage.getItem('aureen-calc-history')) || []; } catch (e) {}
    
    // CARGAR MODO MANUAL
    const savedCustom = localStorage.getItem('aureen-custom-val');
    if (savedCustom) {
        const customInput = document.getElementById('custom-rate-input');
        if(customInput) customInput.value = savedCustom;
        state.custom.rate = parseFloat(savedCustom);
    }

    fetchBCVRate();        
    startNightlyWatcher(); 
    updateDisplay('custom');
    //updateDisplay('general'); // Si usas el modo general descomenta esto

    // LÓGICA FALLBACK PARA IPHONE
    // Solo si es iOS y NO está instalada, mostramos el modal viejo
    if (isIOS() && !window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => {
            if (!sessionStorage.getItem('install-modal-closed')) showModal('install-pwa-modal');
        }, 3000);
    }
};

// --- 9. FUNCIONES DE CALCULADORA ---
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
            const customInput = document.getElementById('custom-rate-input');
            const inputVal = customInput ? customInput.value : "0";
            localStorage.setItem('aureen-custom-val', inputVal);
            state.custom.rate = parseFloat(inputVal.replace(',', '.')) || 0;
        }
        
        if(mainDisplay) mainDisplay.innerText = formatNumber(state[mode].currentInput);
        
        const currentRate = state[mode].rate;
        if (currentRate === 0) { if(subDisplay) subDisplay.innerText = "0,00"; return; }
        
        const mainValue = parseRaw(state[mode].currentInput);
        let subValue = state[mode].isFromUSD ? (mainValue * currentRate) : (mainValue / currentRate);
        
        if (state[mode].isFromUSD) { 
            if(fromSymbol) fromSymbol.innerText = "$"; 
            if(toSymbol) toSymbol.innerText = "Bs"; 
        } else { 
            if(fromSymbol) fromSymbol.innerText = "Bs"; 
            if(toSymbol) toSymbol.innerText = "$"; 
        }
        
        if (!isFinite(subValue) || isNaN(subValue)) subValue = 0;
        if(subDisplay) subDisplay.innerText = subValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}
function swapCurrencies(mode) {
    state[mode].isFromUSD = !state[mode].isFromUSD;
    const subDisplay = document.getElementById(`${mode}-sub-display`);
    if(subDisplay) {
        const subDisplayText = subDisplay.innerText;
        state[mode].currentInput = parseRaw(subDisplayText).toString().replace('.', ',');
        updateDisplay(mode);
    }
}

// --- 10. UI EXTRAS & COMPARTIR ---
function toggleOptionsMenu() { document.getElementById('options-menu').classList.toggle('show'); }
function showModal(id) { 
    document.getElementById(id).classList.add('show'); 
    document.getElementById('options-menu').classList.remove('show');
}
function closeModal(id) { 
    document.getElementById(id).classList.remove('show');
    if (id === 'install-pwa-modal') sessionStorage.setItem('install-modal-closed', 'true');
}
function toggleTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle && toggle.checked) { document.body.setAttribute('data-theme', 'light'); localStorage.setItem('aureen-calc-theme', 'light'); }
    else { document.body.removeAttribute('data-theme'); localStorage.setItem('aureen-calc-theme', 'dark'); }
    
    // Fallback botón solaris
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

window.addEventListener('click', (e) => {
    const menu = document.getElementById('options-menu');
    const btn = document.getElementById('options-menu-btn');
    if (menu && e.target && !menu.contains(e.target) && btn && !btn.contains(e.target)) menu.classList.remove('show');
});

// WIDGET COMPARTIR
function toggleShare(mode) {
    const widget = document.getElementById(`share-widget-${mode}`);
    if (widget) {
        if (widget.classList.contains('open')) {
            widget.classList.remove('open');
        } else {
            document.querySelectorAll('.share-container').forEach(el => el.classList.remove('open'));
            widget.classList.add('open');
            setTimeout(() => { widget.classList.remove('open'); }, 5000);
        }
        if (navigator.vibrate) navigator.vibrate(10);
    }
}

// ==========================================
// MÓDULO DE COMPARTIR (DISEÑO TICKET/RECIBO)
// ==========================================
function getShareData(mode) {
    const mainText = document.getElementById(`${mode}-main-display`).innerText;
    const subText = document.getElementById(`${mode}-sub-display`).innerText;
    const rate = state[mode].rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = getTodayString();
    
    let amountUSD, amountBS;
    if (state[mode].isFromUSD) {
        amountUSD = mainText;
        amountBS = subText;
    } else {
        amountUSD = subText;
        amountBS = mainText;
    }
    return { amountUSD, amountBS, rate, date };
}

function shareToWhatsApp(mode) {
    if (parseRaw(state[mode].currentInput) === 0) {
        const shopPhoneNumber = "584141802040"; 
        window.open(`https://wa.me/${shopPhoneNumber}?text=${encodeURIComponent("Hola Erick, me interesa  Nova X.")}`, '_blank');
        return; 
    }
    const data = getShareData(mode);
    const message = 
`*Nova X* 💎 | Reporte
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
    const msg = 
`💎 **Cálculo Nova X**

💵 **${data.amountUSD} $**
🇻🇪 **${data.amountBS} Bs**

ℹ️ _Tasa del día (${data.date}):_ **${data.rate}**
🔗 @aureenAIbot`;
    const url = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/aureenAIbot")}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

function shareToSocial(platform, mode) {
    shareToSocialGeneric(platform, mode);
}

function shareToSocialGeneric(platform, mode) {
    const data = getShareData(mode);
    const msg = `💱 Nova X | ${data.date}\n\n💵 ${data.amountUSD}$ ➡️ 🇻🇪 ${data.amountBS} Bs\n\n📊 Tasa: ${data.rate}\n\n#BCV #Venezuela #Dolar #NovaX`;
    const botLink = "https://t.me/aureenAIbot";
    let url = "";
    if (platform === 'x') {
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(botLink)}`;
    } else if (platform === 'threads') {
        url = `https://www.threads.net/intent/post?text=${encodeURIComponent(msg + "\n\n" + botLink)}`;
    } else if (platform === 'telegram') {
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
