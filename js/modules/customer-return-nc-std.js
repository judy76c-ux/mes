/**
 * 고객 반송품 부적합품 처리 기준서
 * 이미지 기준서 1장을 업로드/붙여넣기 후 인쇄하는 페이지
 */
var CustomerReturnNcStdModule = (function() {
    'use strict';

    const CONFIG_KEY = 'customer_return_nc_standard_image';
    let _imageData = null;

    async function _loadImage() {
        try {
            _imageData = await Storage.getConfigValue(CONFIG_KEY) || null;
        } catch (e) {
            console.warn('[CustomerReturnNcStd] image load failed:', e);
            _imageData = null;
        }
    }

    async function _saveImage(dataUrl) {
        _imageData = dataUrl || null;
        await Storage.setConfigValue(CONFIG_KEY, _imageData);
    }

    function _readImageFile(file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            UIUtils.toast('이미지 파일을 선택하거나 이미지가 복사된 상태에서 붙여넣어 주세요.', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                await _saveImage(String(reader.result || ''));
                UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
                _renderBody();
            } catch (e) {
                console.warn('[CustomerReturnNcStd] image save failed:', e);
                UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('이미지를 읽을 수 없습니다.', 'error');
        reader.readAsDataURL(file);
    }

    function uploadImage(input) {
        const file = input && input.files && input.files[0];
        if (input) input.value = '';
        _readImageFile(file);
    }

    function handlePaste(event) {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
        if (!imageItem) return;
        event.preventDefault();
        _readImageFile(imageItem.getAsFile());
    }

    function focusUploadArea() {
        const zone = document.getElementById('crncPasteZone');
        if (zone) zone.focus();
        const input = document.getElementById('crncFileInput');
        if (input) input.click();
    }

    function printStandard() {
        const src = _imageData || '';
        if (!src) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드하세요.', 'warning');
            return;
        }
        const win = window.open('', 'customer_return_nc_standard_print', 'width=1200,height=850');
        if (!win) {
            UIUtils.toast('인쇄 창을 열 수 없습니다.', 'warning');
            return;
        }
        win.document.open();
        win.document.write(`
            <!doctype html>
            <html lang="ko">
            <head>
                <meta charset="utf-8">
                <title>고객 반송품 부적합품 처리 기준서</title>
                <style>
                    @page { size: A4 landscape; margin: 8mm; }
                    html, body { margin:0; padding:0; background:#fff; width:100%; min-height:100%; }
                    body { display:flex; justify-content:center; align-items:center; }
                    .page {
                        width: 281mm;
                        height: 194mm;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        overflow:hidden;
                    }
                    img {
                        max-width:100%;
                        max-height:100%;
                        width:auto;
                        height:auto;
                        display:block;
                        object-fit:contain;
                    }
                </style>
            </head>
            <body>
                <div class="page">
                    <img src="${src}" alt="고객 반송품 부적합품 처리 기준서">
                </div>
                <script>
                    window.onload = function(){ window.focus(); window.print(); };
                <\/script>
            </body>
            </html>
        `);
        win.document.close();
    }

    function _renderBody() {
        const body = document.getElementById('crncBody');
        if (!body) return;
        body.innerHTML = `
            <div id="crncPasteZone" tabindex="0" onpaste="CustomerReturnNcStdModule.handlePaste(event)"
                style="outline:none;display:flex;justify-content:center;align-items:flex-start;min-height:calc(100vh - 190px);padding:18px;background:#eef2f7;">
                <div style="width:min(1120px,100%);aspect-ratio:297/210;background:#fff;border:1px solid #cbd5e1;
                            box-shadow:0 18px 42px rgba(15,23,42,.12);display:flex;align-items:center;justify-content:center;">
                    ${_imageData
                        ? `<img src="${_imageData}" alt="고객 반송품 부적합품 처리 기준서" style="max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;">`
                        : `<div style="color:#94a3b8;text-align:center;font-size:.95rem;line-height:1.7;">
                            등록된 기준서 이미지가 없습니다.<br>
                            업로드 버튼으로 이미지 파일을 선택하거나, 이미지를 복사한 뒤 이 영역에 Ctrl+V 하세요.
                           </div>`}
                </div>
            </div>
        `;
    }

    async function render(container) {
        if (window.Router && typeof Router.setPageTitle === 'function') {
            Router.setPageTitle(`<button class="topbar-back-link" onclick="Router.navigate('prod-standards')"><span class="material-symbols-outlined">arrow_back</span> 제조 관리 표준 돌아가기</button>`);
        }
        await _loadImage();
        container.innerHTML = `
            <div class="fade-in-up">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:#fff;border-bottom:1px solid var(--border-color);">
                    <div>
                        <div style="font-size:1rem;font-weight:900;color:var(--text-primary);">고객 반송품 부적합품 처리 기준서</div>
                        <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;">이미지 기준서 업로드 및 인쇄</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <button class="btn btn-outline" onclick="CustomerReturnNcStdModule.focusUploadArea()">
                            <span class="material-symbols-outlined" style="font-size:16px;">upload_file</span>
                            업로드
                        </button>
                        <button class="btn btn-outline" onclick="CustomerReturnNcStdModule.printStandard()">
                            <span class="material-symbols-outlined" style="font-size:16px;">print</span>
                            인쇄
                        </button>
                        <input type="file" id="crncFileInput" accept="image/*" style="display:none;"
                            onchange="CustomerReturnNcStdModule.uploadImage(this)">
                    </div>
                </div>
                <div id="crncBody"></div>
            </div>
        `;
        _renderBody();
    }

    return {
        render,
        focusUploadArea,
        uploadImage,
        handlePaste,
        printStandard
    };
})();
