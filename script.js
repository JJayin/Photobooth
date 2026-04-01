document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const videoElement = document.getElementById('video-stream');
    const captureCanvas = document.getElementById('capture-canvas');
    const bgLayer = document.getElementById('background-layer');
    const appMasterContainer = document.getElementById('app-master-container');
    const workspace = document.querySelector('.new-workspace');
    
    // New Elements
    const bgBtns = document.querySelectorAll('.bg-circle-btn');
    const colorChangerText = document.getElementById('color-changer-text');
    const draggableTemplates = document.querySelectorAll('.draggable-frame-template');
    const dropZone = document.getElementById('drop-zone');
    const dragPrompt = document.getElementById('drag-prompt');
    const nextSaveBtn = document.getElementById('next-save-btn');
    const restartBtn = document.getElementById('restart-btn');
    const startScreen = document.getElementById('start-screen');
    const loadingOverlay = document.getElementById('loading-overlay');
    const cameraContainer = document.getElementById('camera-container');
    const flashOverlay = document.getElementById('flash-overlay');
    
    // Sticker UI Elements
    const stickerPanel = document.getElementById('sticker-panel');
    const prevConceptBtn = document.getElementById('prev-concept-btn');
    const nextConceptBtn = document.getElementById('next-concept-btn');
    const conceptTitle = document.getElementById('current-concept-title');
    const stickerGrid = document.getElementById('sticker-grid');

    const frameColors = ['#ffb6c1', '#add8e6', '#e6e6fa', '#f5f5dc', '#888888', '#d3d3d3'];
    let currentColorIndex = 0;
    
    // Group stickers by concept
    const conceptsMap = {};
    if (typeof RAW_STICKERS !== 'undefined') {
        RAW_STICKERS.forEach(path => {
            if (path.includes('레이어-0.png') || path.includes('레이어-0.png')) return;
            const parts = path.split('/');
            if (parts.length >= 4) {
                const concept = parts[2];
                if (!conceptsMap[concept]) conceptsMap[concept] = [];
                conceptsMap[concept].push(path);
            }
        });
    }
    const conceptsList = Object.keys(conceptsMap).map(k => ({ name: k, stickers: conceptsMap[k] }));
    let currentConceptIndex = 0;
    
    let cameraStream = null;

    function adjustZoom() {
        const container = document.getElementById('app-master-container');
        if (!container) return;
        
        // Use true window dimensions
        const containerRatio = 4 / 3;
        const windowRatio = window.innerWidth / window.innerHeight;
        
        let scale = 1;
        const targetW = window.innerWidth;
        const targetH = window.innerHeight;
        
        if (windowRatio > containerRatio) {
            scale = targetH / 900;
        } else {
            scale = targetW / 1200;
        }
        
        container.style.transform = `scale(${scale})`;
        container.style.transformOrigin = 'center center';
    }

    async function init() {
        adjustZoom();
        window.addEventListener('resize', adjustZoom);

        setupBackgroundButtons();
        setupColorChanger();
        setupDragAndDrop();
        setupStickers();
        
        // Initial Background
        await setBackground('photobooth/BACKGROUND/1.png');
    }
    
    function setupStickers() {
        if (prevConceptBtn && nextConceptBtn) {
            prevConceptBtn.addEventListener('click', () => {
                currentConceptIndex = (currentConceptIndex > 0) ? currentConceptIndex - 1 : conceptsList.length - 1;
                renderStickerConcept();
            });
            nextConceptBtn.addEventListener('click', () => {
                currentConceptIndex = (currentConceptIndex + 1) % conceptsList.length;
                renderStickerConcept();
            });
        }
        renderStickerConcept();
    }
    
    function renderStickerConcept() {
        if (conceptsList.length === 0 || !conceptTitle || !stickerGrid) return;
        const concept = conceptsList[currentConceptIndex];
        
        const displayName = concept.name.replace(/_and_/g, ' & ').replace(/_/g, ' ');
        conceptTitle.innerText = displayName;
        
        stickerGrid.innerHTML = '';
        
        concept.stickers.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'sticker-item';
            img.draggable = true;
            img.dataset.url = url;
            
            img.addEventListener('dragstart', (e) => {
                // Ensure dragstart data is set
                e.dataTransfer.setData('text/plain', 'sticker');
                e.dataTransfer.setData('sticker-url', url);
                
                // For cross-browser, some require an effectAllowed
                e.dataTransfer.effectAllowed = 'copyMove';
            });
            
            stickerGrid.appendChild(img);
        });
    }

    async function setBackground(bgUrl) {
        try {
            // Convert to Data URL to prevent canvas tainting on file:// protocol
            const response = await fetch(bgUrl);
            const blob = await response.blob();
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            bgLayer.style.backgroundImage = `url('${dataUrl}')`;
        } catch (err) {
            console.error("Error loading background as data URL: ", err);
            bgLayer.style.backgroundImage = `url('${bgUrl}')`;
        }
    }

    startScreen.addEventListener('click', async () => {
        startScreen.classList.add('hidden');
        await showLoading(1500); // 1.5s loading transition
        await startCamera();
    });

    async function showLoading(duration) {
        loadingOverlay.classList.remove('hidden');
        return new Promise(resolve => {
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                resolve();
            }, duration);
        });
    }


    function setupBackgroundButtons() {
        bgBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.replaceWith(clone);
            clone.addEventListener('click', async () => {
                const bgUrl = clone.dataset.bg;
                showToast("Loading background...");
                await setBackground(bgUrl);
                showToast("Background updated!");
            });
        });
    }

    function setupColorChanger() {
        colorChangerText.addEventListener('click', () => {
            currentColorIndex = (currentColorIndex + 1) % frameColors.length;
            const newColor = frameColors[currentColorIndex];
            document.documentElement.style.setProperty('--frame-color', newColor);
        });
    }

    function setupDragAndDrop() {
        let draggedType = null;

        draggableTemplates.forEach(template => {
            template.addEventListener('dragstart', (e) => {
                draggedType = template.dataset.type;
                e.dataTransfer.setData('text/plain', draggedType);
            });
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault(); 
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dragPrompt.classList.add('hidden');
            
            const coords = getRelativeCoords(e.clientX, e.clientY);
            const dtType = e.dataTransfer.getData('text/plain');
            
            if (dtType === 'sticker') {
                const url = e.dataTransfer.getData('sticker-url');
                placeSticker(url, coords.x, coords.y);
            } else if (draggedType) {
                placeFrame(draggedType, coords.x, coords.y);
                draggedType = null;
            }
        });
    }

    function getRelativeCoords(clientX, clientY) {
        const rect = appMasterContainer.getBoundingClientRect();
        const scale = rect.width / appMasterContainer.offsetWidth;
        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    }

    function placeFrame(type, relativeX, relativeY) {
        const frame = document.createElement('div');
        frame.className = `placed-frame type-${type}`;
        
        let frameWidth = type === '1x4' ? 180 : 360;
        let frameHeight = type === '1x4' ? 540 : 360;

        const left = relativeX - (frameWidth / 2);
        const top = relativeY - (frameHeight / 2);
        
        frame.style.left = `${left}px`;
        frame.style.top = `${top}px`;

        if (type === '1x4') {
            for(let i=0; i<4; i++) {
                frame.appendChild(createPhotoSlot());
            }
        } else if (type === '2x2') {
            const row1 = document.createElement('div');
            row1.className = 'frame-row';
            row1.appendChild(createPhotoSlot());
            row1.appendChild(createPhotoSlot());
            
            const row2 = document.createElement('div');
            row2.className = 'frame-row';
            row2.appendChild(createPhotoSlot());
            row2.appendChild(createPhotoSlot());
            
            frame.appendChild(row1);
            frame.appendChild(row2);
        }
        
        // Add Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            frame.remove();
            
            // Show drag prompt again if no frames/stickers are left
            if (document.querySelectorAll('.placed-frame, .placed-sticker').length === 0) {
                dragPrompt.classList.remove('hidden');
            }
        });
        frame.appendChild(deleteBtn);

        // Add Rotate Handles
        addRotateHandles(frame);

        makeFrameMovable(frame);
        dropZone.appendChild(frame);
    }

    function placeSticker(url, relativeX, relativeY) {
        const sticker = document.createElement('div');
        sticker.className = 'placed-sticker';
        
        const defaultSize = 100;
        sticker.style.width = `${defaultSize}px`;
        sticker.style.height = `${defaultSize}px`;
        
        const left = relativeX - (defaultSize / 2);
        const top = relativeY - (defaultSize / 2);
        sticker.style.left = `${left}px`;
        sticker.style.top = `${top}px`;
        
        const img = document.createElement('img');
        img.src = url;
        img.draggable = false;
        sticker.appendChild(img);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sticker.remove();
            if (document.querySelectorAll('.placed-frame, .placed-sticker').length === 0) {
                dragPrompt.classList.remove('hidden');
            }
        });
        sticker.appendChild(deleteBtn);

        addRotateHandles(sticker);
        addResizeHandle(sticker);
        makeFrameMovable(sticker);

        dropZone.appendChild(sticker);
    }

    function addResizeHandle(element) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        element.appendChild(handle);
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const initialWidth = element.offsetWidth;
            const initialHeight = element.offsetHeight;
            const initialX = e.clientX;
            const initialY = e.clientY;
            
            function onMouseMove(ev) {
                const scale = appMasterContainer.getBoundingClientRect().width / appMasterContainer.offsetWidth;
                const dx = (ev.clientX - initialX) / scale;
                const dy = (ev.clientY - initialY) / scale;
                const dist = Math.max(dx, dy);
                
                let newWidth = initialWidth + dist;
                let newHeight = initialHeight + dist;
                
                if (newWidth > 30 && newHeight > 30) {
                    element.style.width = `${newWidth}px`;
                    element.style.height = `${newHeight}px`;
                }
            }
            
            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    function addRotateHandles(frame) {
        const positions = ['top-left', 'bottom-left', 'bottom-right'];
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `rotate-handle ${pos}`;
            frame.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startRotation(e, frame);
            });
        });
    }

    function startRotation(e, frame) {
        e.preventDefault();
        const rect = frame.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Extract current rotation
        let currentAngle = 0;
        const transform = window.getComputedStyle(frame).getPropertyValue('transform');
        if (transform !== 'none') {
            const values = transform.split('(')[1].split(')')[0].split(',');
            const a = values[0];
            const b = values[1];
            currentAngle = Math.round(Math.atan2(b, a) * (180/Math.PI));
        }

        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180/Math.PI);

        document.addEventListener('mousemove', rotateFrame);
        document.addEventListener('mouseup', stopRotation);

        function rotateFrame(ev) {
            const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * (180/Math.PI);
            const rotation = currentAngle + (angle - startAngle);
            frame.style.transform = `rotate(${rotation}deg)`;
        }

        function stopRotation() {
            document.removeEventListener('mousemove', rotateFrame);
            document.removeEventListener('mouseup', stopRotation);
        }
    }

    function createPhotoSlot() {
        const slot = document.createElement('div');
        slot.className = 'frame-slot';
        return slot;
    }

    async function captureSlotWithTimer(slot, seconds) {
        return new Promise((resolve) => {
            let count = seconds;
            let isCaptured = false;
            
            // Ensure absolute children are bound
            slot.style.position = 'relative'; 
            slot.style.overflow = 'hidden'; // Ensure rounded corners apply
            
            // Temporarily embed the live video directly into the slot for a seamless mirror
            videoElement.style.position = 'absolute';
            videoElement.style.top = '0';
            videoElement.style.left = '0';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.objectFit = 'cover';
            videoElement.style.zIndex = '100';
            videoElement.style.cursor = 'pointer'; // Indicates it's clickable
            slot.appendChild(videoElement);
            videoElement.play(); // Enforce playback
            
            const countdownOverlay = document.createElement('div');
            countdownOverlay.style.position = 'absolute';
            countdownOverlay.style.bottom = '40px'; 
            countdownOverlay.style.left = '50%';
            countdownOverlay.style.transform = 'translateX(-50%)';
            countdownOverlay.style.fontSize = '3.5rem'; 
            countdownOverlay.style.color = '#262626';
            countdownOverlay.style.fontFamily = 'var(--font-pixel)';
            countdownOverlay.style.zIndex = '10000';
            countdownOverlay.innerText = `TIME : ${count}`;
            countdownOverlay.style.pointerEvents = 'none'; // so clicks pass through to video
            
            // Apply outline via stroke to match the aesthetic (prevents shadow overlap)
            countdownOverlay.style.webkitTextStroke = '1.5px white';
            countdownOverlay.style.paintOrder = 'stroke fill';
            
            appMasterContainer.appendChild(countdownOverlay);
            
            function doCapture() {
                if (isCaptured) return;
                isCaptured = true;
                
                clearInterval(interval);
                countdownOverlay.remove();
                videoElement.removeEventListener('click', doCapture);
                videoElement.style.cursor = '';
                
                // Put videoElement back to its hidden container before overwriting innerHTML
                document.getElementById('camera-container').appendChild(videoElement);
                
                captureImgToSlot(slot).then(() => {
                    setTimeout(() => resolve(), 500); // 0.5s pause before next frame
                });
            }
            
            videoElement.addEventListener('click', doCapture);
            
            const interval = setInterval(() => {
                if (isCaptured) return;
                count--;
                if (count > 0) {
                    countdownOverlay.innerText = `TIME : ${count}`;
                } else {
                    doCapture();
                }
            }, 1000); // 1000ms = 1 second
        });
    }

    async function captureImgToSlot(slot) {
        if (!cameraStream) return;
        
        // Ensure flash overlay is detached from hidden camera container
        if (flashOverlay.parentNode === cameraContainer) {
            document.querySelector('.new-workspace').appendChild(flashOverlay);
            flashOverlay.style.position = 'absolute';
            flashOverlay.style.top = '0';
            flashOverlay.style.left = '0';
            flashOverlay.style.width = '100%';
            flashOverlay.style.height = '100%';
            flashOverlay.style.backgroundColor = 'white';
            flashOverlay.style.opacity = '0';
            flashOverlay.style.pointerEvents = 'none';
            flashOverlay.style.zIndex = '9999';
        }

        // Fast flash effect
        flashOverlay.style.transition = 'none';
        flashOverlay.style.opacity = '1';
        setTimeout(() => {
            flashOverlay.style.transition = 'opacity 0.15s ease-out';
            flashOverlay.style.opacity = '0';
        }, 50);

        const ctx = captureCanvas.getContext('2d');
        captureCanvas.width = videoElement.videoWidth || 1280;
        captureCanvas.height = videoElement.videoHeight || 720;
        // Reset context to ensure clean state before any transformation
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Mirror the image horizontally during capture matching the live video scaleX(-1) style.
        // This ensures the Live Preview, the User's Movements, and the Saved Photo all match 100%.
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, 0, 0, captureCanvas.width, captureCanvas.height);
        
        const dataUrl = captureCanvas.toDataURL('image/png');
        slot.style.backgroundImage = `url(${dataUrl})`;
    }

    function makeFrameMovable(frame) {
        let isDragging = false;
        let initialX;
        let initialY;
        let left;
        let top;

        frame.addEventListener('mousedown', dragStart);

        function dragStart(e) {
            // Prevent drag if locked
            if (frame.classList.contains('locked')) return;

            // Only drag if clicking the frame border directly, not the slot
            if (e.target !== frame && !e.target.classList.contains('frame-row')) return;

            initialX = e.clientX;
            initialY = e.clientY;
            
            left = parseInt(frame.style.left || 0, 10);
            top = parseInt(frame.style.top || 0, 10);
            
            isDragging = true;
            dropZone.appendChild(frame); // Bring to front

            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('mousemove', drag);

            function dragEnd(ev) {
                isDragging = false;
                document.removeEventListener('mouseup', dragEnd);
                document.removeEventListener('mousemove', drag);
                
                const trashCan = document.getElementById('trash-can');
                if (trashCan && !trashCan.classList.contains('hidden') && ev) {
                    trashCan.classList.remove('drag-over');
                    const rect = trashCan.getBoundingClientRect();
                    if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
                        ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                        frame.remove();
                        if (document.querySelectorAll('.placed-frame, .placed-sticker').length === 0) {
                            dragPrompt.classList.remove('hidden');
                        }
                    }
                }
            }

            function drag(ev) {
                if (isDragging) {
                    ev.preventDefault();
                    const dx = ev.clientX - initialX;
                    const dy = ev.clientY - initialY;
                    
                    const rect = appMasterContainer.getBoundingClientRect();
                    const scale = rect.width / appMasterContainer.offsetWidth;
                    
                    frame.style.left = `${left + (dx / scale)}px`;
                    frame.style.top = `${top + (dy / scale)}px`;
                    
                    const trashCan = document.getElementById('trash-can');
                    if (trashCan && !trashCan.classList.contains('hidden')) {
                        const tcRect = trashCan.getBoundingClientRect();
                        if (ev.clientX >= tcRect.left && ev.clientX <= tcRect.right &&
                            ev.clientY >= tcRect.top && ev.clientY <= tcRect.bottom) {
                            trashCan.classList.add('drag-over');
                        } else {
                            trashCan.classList.remove('drag-over');
                        }
                    }
                }
            }
        }
    }

    async function startCamera() {
        try {
            if (cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
            }
            cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 1280, height: 720, facingMode: "user" }, 
                audio: false 
            });
            videoElement.srcObject = cameraStream;
            videoElement.play();
        } catch (err) {
            console.error("Error accessing camera: ", err);
        }
    }

    nextSaveBtn.addEventListener('click', async () => {
        const frames = document.querySelectorAll('.placed-frame');
        if (frames.length === 0) {
            showToast("Please drag and drop a frame first!");
            return;
        }

        if (nextSaveBtn.innerText === "Save!") {
            saveCollage();
            return;
        }

        // Show loading screen before capture
        await showLoading(1000);

        // Start capture sequence
        nextSaveBtn.disabled = true;
        nextSaveBtn.style.opacity = '0.5';
        
        // Lock frames during shooting
        frames.forEach(f => f.classList.add('locked'));
        
        document.querySelectorAll('.hidden-during-capture').forEach(el => el.style.display = 'none');
        
        const allSlots = document.querySelectorAll('.placed-frame .frame-slot');
        
        for (let i = 0; i < allSlots.length; i++) {
            // 10 second timer per slot
            await captureSlotWithTimer(allSlots[i], 10);
        }
        
        showToast("All photos captured! Now decorate with stickers.");
        nextSaveBtn.innerText = 'Save!';
        nextSaveBtn.disabled = false;
        nextSaveBtn.style.opacity = '1';
        
        // Show the sticker panel and trash can for decoration phase
        const stickerPanel = document.getElementById('sticker-panel');
        if (stickerPanel) {
            stickerPanel.classList.remove('hidden');
        }
        
        const trashCan = document.getElementById('trash-can');
        if (trashCan) {
            trashCan.classList.remove('hidden');
        }
        
        if (restartBtn) {
            restartBtn.classList.remove('hidden');
        }
    });
    
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            startScreen.classList.remove('hidden');
            dropZone.innerHTML = '';
            
            dragPrompt.classList.remove('hidden');
            nextSaveBtn.innerText = 'Next!';
            
            restartBtn.classList.add('hidden');
            
            const stickerPanel = document.getElementById('sticker-panel');
            if (stickerPanel) {
                stickerPanel.classList.add('hidden');
            }
            
            const trashCan = document.getElementById('trash-can');
            if (trashCan) {
                trashCan.classList.add('hidden');
            }
            
            document.querySelectorAll('.hidden-during-capture').forEach(el => el.style.display = '');
        });
    }

    function saveCollage() {
        console.log("Starting collage save process...");
        if (window.location.protocol === 'file:') {
            showToast("⚠️ Security Error: Please run the app via a local server (e.g., http.server) to enable downloads!");
            console.warn("Canvas export is restricted on the file:// protocol. Please use a local web server.");
        }

        // Hide controls temporarily so they aren't saved in collage
        const am = document.getElementById('action-menu');
        const stickerPanel = document.getElementById('sticker-panel');
        const trashCan = document.getElementById('trash-can');
        
        if (stickerPanel) stickerPanel.style.opacity = '0';
        if (am) am.style.opacity = '0';
        if (restartBtn) restartBtn.style.opacity = '0';
        if (trashCan) trashCan.style.opacity = '0';
        
        showToast("Saving...");
        
        setTimeout(() => {
            console.log("Invoking html2canvas...");
            
            // Explicitly force html2canvas to render the unscaled base layout natively
            const prevTransform = appMasterContainer.style.transform;
            appMasterContainer.style.transform = 'none';
            
            html2canvas(appMasterContainer, {
                useCORS: true,
                backgroundColor: null,
                scale: 2,
                logging: true,
                allowTaint: true
            }).then(canvas => {
                appMasterContainer.style.transform = prevTransform;
                console.log("Canvas generated successfully. Size:", canvas.width, "x", canvas.height);
                
                // Restore controls
                if (stickerPanel) stickerPanel.style.opacity = '1';
                if (am) am.style.opacity = '1';
                if (restartBtn) restartBtn.style.opacity = '1';
                if (trashCan) trashCan.style.opacity = '1';
                
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    console.log("Data URL generated. length:", dataUrl.length);
                    
                    if (dataUrl.length < 100) {
                        throw new Error("Generated Data URL is too short, potential rendering issue.");
                    }

                    const link = document.createElement('a');
                    link.download = 'my_photobooth_collage.png';
                    link.href = dataUrl;
                    
                    // Append to body to ensure download triggers in all browsers
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    showToast("Collage Saved Successfully! ✨");
                    console.log("Download triggered successfully.");
                } catch (e) {
                    console.error("Error creating data URL or triggering download:", e);
                    showToast("❌ Failed to generate image. Check console for details.");
                }
            }).catch(err => {
                console.error("Error generating collage with html2canvas:", err);
                appMasterContainer.style.transform = prevTransform;
                // restore opacity
                if (stickerPanel) stickerPanel.style.opacity = '1';
                if (am) am.style.opacity = '1';
                if (restartBtn) restartBtn.style.opacity = '1';
                if (trashCan) trashCan.style.opacity = '1';
                showToast("❌ Error rendering collage.");
            });
        }, 500); 
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.innerText = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        toast.style.background = 'rgba(0,0,0,0.8)';
        toast.style.color = 'white';
        toast.style.padding = '15px 30px';
        toast.style.borderRadius = '30px';
        toast.style.fontFamily = 'var(--font-body)';
        toast.style.fontSize = '1rem';
        toast.style.zIndex = '10000';
        toast.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(() => {
                toast.style.transform = 'translateX(-50%) translateY(100px)';
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }, 100);
    }

    init();
});
