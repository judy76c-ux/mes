const PrintMaster = (function() {
    const DEFAULTS = {
        title: '작 업 기 준 서',
        subtitle: '',
        docNo: '',
        revisionDate: '',
        orientation: 'landscape',
        header: false,
        footer: true,
        autoPrint: true,
        scaleMode: 'fit-width',
        logoMarkSrc: 'assets/viscosity-std/image3.png',
        logoTextSrc: ''
    };

    function _esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _stripInteractive(root) {
        root.querySelectorAll('[contenteditable]').forEach(el => {
            el.setAttribute('contenteditable', 'false');
            el.style.outline = 'none';
            el.style.background = 'transparent';
        });
        root.querySelectorAll('.pts-selected, .pts-editing').forEach(el => {
            el.classList.remove('pts-selected', 'pts-editing');
        });
        root.querySelectorAll('.pts-resize-handle, .pts-object-resize, .no-print').forEach(el => el.remove());
        root.querySelectorAll('[onmousedown], [onclick], [ondblclick], [onpaste], [onmousemove], [onmouseup]').forEach(el => {
            ['onmousedown', 'onclick', 'ondblclick', 'onpaste', 'onmousemove', 'onmouseup'].forEach(attr => el.removeAttribute(attr));
        });
        return root;
    }

    function _companyLogoHtml(options) {
        const mark = options.logoMarkSrc
            ? `<img class="pm-logo-mark-img" src="${_esc(options.logoMarkSrc)}" alt="KC">`
            : `<div class="pm-logo-mark">
                    <div class="pm-logo-kc">KC</div>
                    <div class="pm-logo-arrow"></div>
                    <div class="pm-logo-green"></div>
                    <div class="pm-logo-blue"></div>
               </div>`;
        const text = options.logoTextSrc
            ? `<img class="pm-logo-text-img" src="${_esc(options.logoTextSrc)}" alt="KC 케미칼 주식회사">`
            : `<div class="pm-logo-text">
                    <div>KC 케미칼 주식회사</div>
                    <small>KOREA COMPETENT CHEMICAL Co., Ltd.</small>
               </div>`;
        return `${mark}${text}`;
    }

    function _headerHtml(options) {
        if (!options.header) return '';
        return `
            <div class="pm-doc-header">
                <div class="pm-doc-meta">
                    <div class="pm-meta-label">문서번호</div>
                    <div class="pm-meta-value">${_esc(options.docNo) || '<span class="pm-placeholder">텍스트를 입력하십시오</span>'}</div>
                    <div class="pm-meta-label">개정일</div>
                    <div class="pm-meta-value">${_esc(options.revisionDate) || '<span class="pm-placeholder">텍스트를 입력하십시오</span>'}</div>
                </div>
                <div class="pm-title-block">
                    <h1>${_esc(options.title)}</h1>
                    <h2>${_esc(options.subtitle) || '<span class="pm-placeholder">제목을 추가하려면 클릭하십시오.</span>'}</h2>
                </div>
                <div class="pm-approval">
                    <div class="pm-approval-side">결<br>재</div>
                    <div class="pm-approval-col"><b>작성</b><div></div></div>
                    <div class="pm-approval-col"><b>검토</b><div></div></div>
                    <div class="pm-approval-col"><b>승인</b><div></div></div>
                </div>
            </div>`;
    }

    function _style(options, sourceWidth, sourceHeight) {
        const pageWidth = options.orientation === 'portrait' ? '190mm' : '277mm';
        const pageHeight = options.orientation === 'portrait' ? '277mm' : '190mm';
        const contentHeight = options.header ? `calc(${pageHeight} - 42mm)` : `calc(${pageHeight} - 18mm)`;
        const printableMm = options.orientation === 'portrait' ? 172 : 259;
        const printScale = Math.min(1, (printableMm * 3.7795275591) / Math.max(1, Number(sourceWidth || 1)));
        return `
            @page { size: A4 ${options.orientation}; margin: 5mm; }
            html, body { margin:0; padding:0; background:#fff; }
            body {
                font-family: Inter, 'Malgun Gothic', Arial, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color:#0f172a;
            }
            * { box-sizing:border-box; }
            .pm-page {
                width:${pageWidth};
                height:${pageHeight};
                margin:0 auto;
                position:relative;
                background:
                    linear-gradient(90deg,#5aa23d 0 50%,#ff7a00 50% 100%) top / 100% 2mm no-repeat,
                    linear-gradient(90deg,#5aa23d 0 50%,#ff7a00 50% 100%) bottom / 100% 2mm no-repeat,
                    linear-gradient(#5aa23d,#5aa23d) left / 4mm 100% no-repeat,
                    linear-gradient(#ff7a00,#ff7a00) right / 4mm 100% no-repeat,
                    #fff;
                overflow:hidden;
            }
            .pm-inner {
                position:absolute;
                left:5mm;
                right:5mm;
                top:3mm;
                bottom:3mm;
                border:2px solid #111827;
                border-radius:4mm;
                background:#fff;
                overflow:hidden;
                padding:3.5mm;
                z-index:2;
            }
            .pm-doc-header {
                display:grid;
                grid-template-columns:64mm 1fr 72mm;
                gap:2.5mm;
                align-items:start;
                min-height:31mm;
                margin-bottom:3mm;
            }
            .pm-doc-meta {
                display:grid;
                grid-template-columns:24mm 1fr;
                border:2px solid #111827;
            }
            .pm-meta-label {
                background:#173f68;
                color:#fff;
                font-weight:900;
                text-align:center;
                padding:5mm 2mm;
                border-bottom:1px solid #111827;
            }
            .pm-meta-label:nth-of-type(3) { border-bottom:0; }
            .pm-meta-value {
                padding:4mm 3mm;
                border-bottom:1px solid #111827;
                color:#334155;
            }
            .pm-title-block { text-align:center; }
            .pm-title-block h1 {
                margin:0;
                font-size:18mm;
                line-height:.9;
                letter-spacing:.08em;
                font-weight:1000;
            }
            .pm-title-block h2 {
                margin:2mm auto 0;
                padding:1mm 2mm;
                border:1px dashed #9ca3af;
                font-size:6mm;
                line-height:1.1;
                font-weight:900;
            }
            .pm-placeholder { color:#8b8b8b; font-weight:500; }
            .pm-approval {
                display:grid;
                grid-template-columns:10mm repeat(3,1fr);
                border:2px solid #111827;
                min-height:30mm;
            }
            .pm-approval-side {
                display:flex;
                align-items:center;
                justify-content:center;
                background:#000;
                color:#fff;
                font-weight:900;
                font-size:5mm;
                border-right:1px solid #111827;
            }
            .pm-approval-col { display:grid; grid-template-rows:8mm 1fr; border-right:1px solid #111827; }
            .pm-approval-col:last-child { border-right:0; }
            .pm-approval-col b {
                display:flex;
                align-items:center;
                justify-content:center;
                background:#000;
                color:#fff;
                border-bottom:1px solid #111827;
                font-size:4mm;
            }
            .pm-content {
                position:relative;
                height:${contentHeight};
                overflow:hidden;
            }
            .pm-scale {
                width:${sourceWidth}px;
                min-height:${sourceHeight}px;
                transform:scale(${printScale});
                transform-origin:left top;
            }
            @media print {
                .pm-scale {
                    transform:scale(${printScale});
                }
            }
            .pm-footer {
                position:absolute;
                left:0;
                right:0;
                bottom:1.5mm;
                display:flex;
                align-items:flex-end;
                justify-content:center;
                gap:2.2mm;
                color:#16237a;
                font-weight:900;
                pointer-events:none;
                z-index:5;
            }
            .pm-logo-mark { position:relative; width:11mm; height:9mm; }
            .pm-logo-kc {
                position:absolute;
                left:2.2mm;
                bottom:1.2mm;
                color:#143c96;
                font-weight:1000;
                font-size:5mm;
                line-height:1;
                z-index:2;
            }
            .pm-logo-arrow {
                position:absolute;
                left:3.5mm;
                top:0;
                width:0;
                height:0;
                border-left:2.3mm solid transparent;
                border-right:2.3mm solid transparent;
                border-bottom:5mm solid #ff7a00;
            }
            .pm-logo-green {
                position:absolute;
                left:.5mm;
                bottom:.7mm;
                width:5.5mm;
                height:4.5mm;
                background:#43ad35;
                border-radius:60% 20% 25% 40%;
                transform:skewX(-18deg);
            }
            .pm-logo-blue {
                position:absolute;
                right:.5mm;
                bottom:.7mm;
                width:5.5mm;
                height:4.5mm;
                background:#0d5da9;
                border-radius:20% 60% 40% 25%;
                transform:skewX(18deg);
            }
            .pm-logo-text div { font-size:4.5mm; line-height:1; }
            .pm-logo-text small { display:block; font-size:1.8mm; color:#475569; letter-spacing:.03em; }
            .pm-logo-mark-img { width:12mm; height:10mm; object-fit:contain; display:block; }
            .pm-logo-text-img { width:42mm; height:10mm; object-fit:contain; display:block; }
            [contenteditable] { outline:none !important; background:transparent !important; }
            .pts-photo-slot::after { display:none !important; }
            .pts-photo-slot, .pts-object { box-shadow:none !important; outline:none !important; }
            .pts-resize-handle, .pts-object-resize { display:none !important; }
        `;
    }

    function _openPrintWindow(html, options, sourceWidth, sourceHeight) {
        const win = window.open('', '_blank');
        if (!win) return null;
        win.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${_esc(options.title || '인쇄')}</title>
                <style>${_style(options, sourceWidth, sourceHeight)}</style>
            </head>
            <body>
                <section class="pm-page">
                    <div class="pm-inner">
                        ${_headerHtml(options)}
                        <div class="pm-content">
                            <div class="pm-scale">${html}</div>
                        </div>
                        ${options.footer ? `<div class="pm-footer">${_companyLogoHtml(options)}</div>` : ''}
                    </div>
                </section>
                ${options.autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>' : ''}
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        return win;
    }

    function printElement(element, opts = {}) {
        if (!element) return false;
        const options = { ...DEFAULTS, ...opts };
        const clone = _stripInteractive(element.cloneNode(true));
        const rect = element.getBoundingClientRect();
        const sourceWidth = Math.ceil(rect.width || options.sourceWidth || 1328);
        const sourceHeight = Math.ceil(rect.height || options.sourceHeight || 760);
        return !!_openPrintWindow(clone.outerHTML, options, sourceWidth, sourceHeight);
    }

    function printHtml(contentHtml, opts = {}) {
        const options = { ...DEFAULTS, header: true, ...opts };
        const sourceWidth = Number(options.sourceWidth || 1328);
        const sourceHeight = Number(options.sourceHeight || 760);
        return !!_openPrintWindow(contentHtml || '', options, sourceWidth, sourceHeight);
    }

    return { printElement, printHtml };
})();
