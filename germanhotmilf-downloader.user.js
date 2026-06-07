// ==UserScript==
// @name         GermanHotMilf Gallery Downloader
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Download all full-size photos from a gallery with one click.
// @author       mcscraper
// @match        https://german-hotmilf.com/gallery/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      centrofiles.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const LOG = (...a) => console.log('[GHM-DL]', ...a);

    const PATH      = window.location.pathname;
    const isGallery = /\/gallery\/\d+\/[^/]+\/?$/.test(PATH) &&
                      !/\/photo\/\d+/.test(PATH);

    if (!isGallery) return;

    const galleryId = PATH.match(/\/gallery\/(\d+)/)?.[1] || '0';

    // ── UI ───────────────────────────────────────────────────────────────────
    const btn = document.createElement('button');
    btn.textContent = '⬇ Download All';
    btn.style.cssText = [
        'position:fixed', 'top:80px', 'right:20px', 'z-index:99999',
        'background:#27ae60', 'color:#fff', 'border:none',
        'padding:12px 18px', 'border-radius:6px',
        'font:bold 14px/1 sans-serif', 'cursor:pointer',
        'box-shadow:0 3px 10px rgba(0,0,0,.45)',
    ].join(';');
    document.body.appendChild(btn);

    const setStatus = (text, colour) => {
        btn.textContent = text;
        if (colour) btn.style.background = colour;
    };

    // ── Main ─────────────────────────────────────────────────────────────────
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        setStatus('⏳ Loading…', '#2980b9');

        // Ask for a save folder while we still have the user-gesture context.
        const pageWindow = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        let dirHandle = null;
        if (typeof pageWindow.showDirectoryPicker === 'function') {
            try {
                dirHandle = await pageWindow.showDirectoryPicker({ mode: 'readwrite' });
            } catch (e) {
                if (e.name === 'AbortError') {
                    setStatus('❌ Cancelled', '#c0392b');
                    btn.disabled = false;
                    return;
                }
                LOG('showDirectoryPicker failed, falling back to GM_download:', e);
            }
        }

        // Scroll to trigger lazy-load of all thumbnails.
        const step = window.innerHeight * 0.85;
        for (let y = 0; y <= document.body.scrollHeight + step; y += step) {
            window.scrollTo(0, y);
            await sleep(160);
        }
        window.scrollTo(0, 0);
        await sleep(400);

        const items = [...document.querySelectorAll('.photo-item[data-id]')];
        LOG(`Found ${items.length} photo items`);
        if (!items.length) {
            setStatus('❌ No photos found', '#c0392b');
            btn.disabled = false;
            return;
        }

        let ok = 0, fail = 0;
        const total = items.length;

        for (let i = 0; i < total; i++) {
            const item    = items[i];
            const photoId = item.dataset.id;
            setStatus(`⬇ ${i + 1} / ${total}`, '#2980b9');

            // Click thumbnail → inline viewer opens.
            const prevViewerSrc = viewerImgSrc();
            item.click();
            const viewerSrc = await waitFor(() => {
                const s = viewerImgSrc();
                return s && s !== prevViewerSrc && s.includes('centrofiles') ? s : null;
            }, 12_000);

            if (!viewerSrc) {
                LOG(`⚠ viewer timeout id=${photoId}`);
                fail++;
                continue;
            }

            // Click "Show original size" → site creates .gallery-real-pixels-view with nr-origin.jpg.
            const origBtn = document.querySelector('#show-real-pixel');
            let dlSrc = viewerSrc;

            if (origBtn) {
                origBtn.click();
                const origSrc = await waitFor(() => {
                    const img = document.querySelector('.gallery-real-pixels-view img');
                    return img?.src || null;
                }, 8_000);

                if (origSrc) {
                    dlSrc = origSrc;
                    LOG(`Origin URL: ${origSrc.slice(0, 80)}…`);
                    origBtn.click();
                    await sleep(200);
                } else {
                    LOG(`⚠ .gallery-real-pixels-view img not found — using viewer URL`);
                }
            }

            const pad  = String(i + 1).padStart(3, '0');
            const ext  = dlSrc.match(/\.(webp|jpe?g|png)(?=[?#]|$)/i)?.[1]
                             ?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg';
            const fname = `${galleryId}-${pad}.${ext}`;

            LOG(`Saving [${i + 1}/${total}] as ${fname}`);

            const blob = await fetchBlob(dlSrc);
            if (!blob) {
                LOG(`⚠ fetch failed for id=${photoId}`);
                fail++;
                continue;
            }

            if (dirHandle) {
                try {
                    const fh = await dirHandle.getFileHandle(fname, { create: true });
                    const writable = await fh.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (e) {
                    LOG(`Write error ${fname}:`, e);
                    fail++;
                    continue;
                }
            } else {
                await downloadViaGM(dlSrc, fname);
            }
            ok++;

            // Close the fullscreen viewer before clicking the next thumbnail.
            const closeBtn = document.querySelector('.gallery-fullscreen-hide');
            if (closeBtn) {
                closeBtn.click();
            } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            await sleep(300);
        }

        const summary = `✓ ${ok} downloaded${fail ? `, ${fail} failed` : ''}`;
        LOG(summary);
        setStatus(summary, ok === total ? '#27ae60' : '#e67e22');
        btn.disabled = false;

        GM_notification({ title: 'GHM Downloader', text: summary, timeout: 5000 });
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    function viewerImgSrc() {
        return document.querySelector('.gallery-full-image img')?.src ?? '';
    }

    function waitFor(fn, timeout) {
        return new Promise(resolve => {
            const deadline = Date.now() + timeout;
            const check = () => {
                const v = fn();
                if (v) return resolve(v);
                if (Date.now() >= deadline) return resolve(null);
                setTimeout(check, 120);
            };
            check();
        });
    }

    function fetchBlob(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onload: (r) => resolve(r.response),
                onerror: (e) => { LOG('Fetch error:', e); resolve(null); },
            });
        });
    }

    function downloadViaGM(url, filename) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onload(r) {
                    const blobUrl = URL.createObjectURL(r.response);
                    const a = document.createElement('a');
                    a.href     = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => { URL.revokeObjectURL(blobUrl); resolve(); }, 1500);
                },
                onerror: e => { LOG(`Fetch error ${filename}:`, e); resolve(); },
            });
        });
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
