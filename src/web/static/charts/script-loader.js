/**
 * Lightweight external script loader for declarative dashboards.
 *
 * Keeps HTML pages free of hardcoded chart library includes.
 */

const pendingLoads = new Map();

export function ensureScriptLoaded(src, globalVarName, timeoutMs = 15000) {
    if (globalVarName && window[globalVarName]) {
        return Promise.resolve();
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
        return waitForGlobal(globalVarName, timeoutMs);
    }

    if (pendingLoads.has(src)) {
        return pendingLoads.get(src);
    }

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;

        script.onload = () => {
            if (!globalVarName) {
                resolve();
                return;
            }
            waitForGlobal(globalVarName, timeoutMs).then(resolve).catch(reject);
        };

        script.onerror = () => {
            reject(new Error(`Failed to load script: ${src}`));
        };

        document.head.appendChild(script);
    });

    pendingLoads.set(src, promise);

    return promise;
}

function waitForGlobal(globalVarName, timeoutMs) {
    if (!globalVarName) {
        return Promise.resolve();
    }

    if (window[globalVarName]) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const start = Date.now();

        const tick = () => {
            if (window[globalVarName]) {
                resolve();
                return;
            }

            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Timed out waiting for global: ${globalVarName}`));
                return;
            }

            setTimeout(tick, 50);
        };

        tick();
    });
}
