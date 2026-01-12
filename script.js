document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let nodes = []; // { id, x, y, src }
    let connections = []; // { id, from: nodeId, to: nodeId }
    let nextId = 1;
    let selectedNodeId = null;
    
    // Canvas Pan/Zoom state (basic offset)
    let canvasOffset = { x: 0, y: 0 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    // DOM Elements
    const pictoList = document.getElementById('picto-list');
    const searchInput = document.getElementById('searchInput');
    const workspace = document.getElementById('workspace');
    const nodesLayer = document.getElementById('nodes-layer');
    const connectionsLayer = document.getElementById('connections-layer');
    const saveDialog = document.getElementById('saveDialog');
    const saveNameInput = document.getElementById('saveNameInput');
    
    // Sidebar Toggle (Mobile)
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
    }
    
    // Close sidebar when clicking workspace (if open on mobile)
    workspace.addEventListener('click', () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    // --- Initialization ---

    function init() {
        renderSidebar(PICTO_MANIFEST);
        loadSavedList();
        setupDragAndDrop(); // Sidebar to Canvas
        
        // Saved Chain Listeners
        const savedSelect = document.getElementById('savedSelect');
        const deleteSavedBtn = document.getElementById('deleteSavedBtn');

        if (savedSelect) {
            savedSelect.addEventListener('change', (e) => {
                const key = e.target.value;
                if (key) loadChain(key);
            });
        }

        if (deleteSavedBtn) {
            deleteSavedBtn.addEventListener('click', () => {
                const key = savedSelect.value;
                if (key) {
                    const name = savedSelect.options[savedSelect.selectedIndex].text;
                    if(confirm(`Verwijder "${name}"?`)) {
                        localStorage.removeItem(key);
                        loadSavedList();
                    }
                }
            });
        }
        
        // Text Tool Listeners
        const textBtn = document.getElementById('addTextBtn');
        if (textBtn) {
            textBtn.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', '::TEXT::');
            });
            textBtn.addEventListener('click', () => {
                const rect = workspace.getBoundingClientRect();
                const x = (rect.width / 2) - canvasOffset.x - 50;
                const y = (rect.height / 2) - canvasOffset.y - 50;
                addNode('', x, y, 'text');
            });
        }

        // Upload Tool Listeners
        const uploadBtn = document.getElementById('addUploadBtn');
        const uploadInput = document.getElementById('uploadInput');
        
        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => {
                uploadInput.click();
            });

            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const rect = workspace.getBoundingClientRect();
                        const x = (rect.width / 2) - canvasOffset.x - 50;
                        const y = (rect.height / 2) - canvasOffset.y - 50;
                        // Use the Data URL as content
                        addNode(evt.target.result, x, y, 'image');
                    };
                    reader.readAsDataURL(file);
                    // Reset value so same file can be selected again
                    uploadInput.value = '';
                }
            });
        }

        // Keyboard Deletion
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
                // Don't delete if typing in search or TEXTAREA
                if (document.activeElement.tagName === 'INPUT' || 
                    document.activeElement.tagName === 'TEXTAREA') return;
                deleteNode(selectedNodeId);
            }
        });
        
        render();
    }

    function selectNode(id) {
        if (selectedNodeId === id) return;

        // Deselect previous
        if (selectedNodeId) {
            const oldEl = document.querySelector(`.picto-node[data-id="${selectedNodeId}"]`);
            if (oldEl) {
                oldEl.classList.remove('selected');
                const btn = oldEl.querySelector('.delete-node-btn');
                if (btn) btn.remove();
            }
        }

        selectedNodeId = id;

        // Select new
        if (selectedNodeId) {
            const newEl = document.querySelector(`.picto-node[data-id="${selectedNodeId}"]`);
            if (newEl) {
                newEl.classList.add('selected');
                addDeleteBtn(newEl, selectedNodeId);
            }
        }
    }

    function addDeleteBtn(el, id) {
        if (el.querySelector('.delete-node-btn')) return;
        
        const delBtn = document.createElement('div');
        delBtn.className = 'delete-node-btn';
        delBtn.innerText = '×';
        delBtn.title = 'Verwijder';
        delBtn.style.zIndex = '1000';
        
        // No event listeners here. We handle it in the parent (Event Delegation)
        
        el.appendChild(delBtn);
    }

    function deleteNode(id) {
        nodes = nodes.filter(n => n.id !== id);
        connections = connections.filter(c => c.from !== id && c.to !== id);
        if (selectedNodeId === id) {
            selectedNodeId = null;
        }
        render();
    }

    // --- Sidebar & Search ---
    const DISPLAY_LIMIT = 60; // Only render this many at once to keep it fast

    function renderSidebar(items) {
        pictoList.innerHTML = '';
        
        // Optimize: Only take the top N items
        const visibleItems = items.slice(0, DISPLAY_LIMIT);
        
        visibleItems.forEach(filename => {
            const img = document.createElement('img');
            img.src = `picto_nl/${filename}`;
            img.classList.add('picto-thumb');
            img.draggable = true;
            img.loading = "lazy"; // Performance optimization
            img.dataset.src = filename;
            img.title = filename.replace('.png', '');
            
            // Drag Start (Desktop)
            img.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', filename);
            });

            // Click to Add (Mobile friendly)
            img.addEventListener('click', () => {
                // Add to center of visible workspace
                const rect = workspace.getBoundingClientRect();
                const x = (rect.width / 2) - canvasOffset.x - 50; 
                const y = (rect.height / 2) - canvasOffset.y - 50;
                addNode(filename, x, y);
                
                // Auto-close sidebar on mobile
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });

            pictoList.appendChild(img);
        });

        // Feedback if too many results
        if (items.length > DISPLAY_LIMIT) {
            const info = document.createElement('div');
            info.style.gridColumn = "1 / -1";
            info.style.textAlign = "center";
            info.style.padding = "10px";
            info.style.color = "#666";
            info.style.fontSize = "0.8rem";
            info.innerText = `...en nog ${items.length - DISPLAY_LIMIT} andere. Typ om te zoeken.`;
            pictoList.appendChild(info);
        } else if (items.length === 0) {
            pictoList.innerHTML = '<div style="padding:10px; color:#666;">Geen resultaten</div>';
        }
    }

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        // Filter the full list
        const filtered = term === '' 
            ? PICTO_MANIFEST 
            : PICTO_MANIFEST.filter(f => f.toLowerCase().includes(term));
        
        renderSidebar(filtered);
    });

    // --- Canvas Interactions (Node Creation & Moving) ---

    const GRID_SIZE = 20;

    function snapToGrid(val) {
        return Math.round(val / GRID_SIZE) * GRID_SIZE;
    }

    // 1. Drop from Sidebar
    function setupDragAndDrop() {
        workspace.addEventListener('dragover', (e) => e.preventDefault());
        workspace.addEventListener('drop', (e) => {
            e.preventDefault();
            const data = e.dataTransfer.getData('text/plain');
            if (data) {
                const rect = workspace.getBoundingClientRect();
                const x = e.clientX - rect.left - canvasOffset.x - 50; 
                const y = e.clientY - rect.top - canvasOffset.y - 50;
                
                if (data === '::TEXT::') {
                    addNode('', snapToGrid(x), snapToGrid(y), 'text');
                } else {
                    addNode(data, snapToGrid(x), snapToGrid(y), 'image');
                }
            }
        });
    }

    function addNode(content, x, y, type = 'image') {
        const id = 'node_' + Date.now() + '_' + nextId++;
        const node = { 
            id, 
            x: snapToGrid(x), 
            y: snapToGrid(y), 
            content, 
            type,
            width: 100, 
            height: 100,
            pinned: true // Default to pinned (typing mode)
        };
        nodes.push(node);
        render();
        selectNode(id);
        
        // Auto-focus if text
        if (type === 'text') {
            setTimeout(() => {
                const el = document.querySelector(`.picto-node[data-id="${id}"] textarea`);
                if(el) el.focus();
            }, 50);
        }
    }

    function render() {
        // Clear layers
        nodesLayer.innerHTML = '';
        connectionsLayer.innerHTML = '';

        // Draw Connections (SVG)
        connections.forEach(conn => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (fromNode && toNode) {
                drawConnection(conn.id, fromNode, toNode);
            }
        });

        // Draw Nodes
        nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = 'picto-node';
            if (node.type === 'text') {
                el.classList.add('text-node');
                if (node.pinned === false) el.classList.add('unpinned');
            }
            
            // Apply dimensions (default 100 if missing)
            const w = node.width || 100;
            const h = node.height || 100;
            el.style.width = w + 'px';
            el.style.height = h + 'px';

            if (node.id === selectedNodeId) {
                el.classList.add('selected');
                addDeleteBtn(el, node.id);
            }
            
            el.style.transform = `translate(${node.x}px, ${node.y}px)`;
            el.dataset.id = node.id;
            
            if (node.type === 'text') {
                const textarea = document.createElement('textarea');
                textarea.className = 'node-textarea';
                textarea.placeholder = 'Typ...';
                textarea.value = node.content;
                
                if (node.pinned !== false) {
                    // PINNED: Clicking edits text (stop drag)
                    textarea.addEventListener('pointerdown', e => {
                        e.stopPropagation(); 
                        selectNode(node.id); 
                    });
                } else {
                    // UNPINNED: Clicking drags the box (let it bubble)
                    textarea.style.pointerEvents = 'none'; // Pass through to container
                }
                
                textarea.addEventListener('input', (e) => {
                    node.content = e.target.value;
                });
                el.appendChild(textarea);

                // Pin/Unpin Button
                const pinBtn = document.createElement('div');
                pinBtn.className = 'pin-btn';
                pinBtn.innerHTML = node.pinned !== false ? '📌' : '✥';
                pinBtn.title = node.pinned !== false ? 'Losmaken (om te verplaatsen)' : 'Vastzetten (om te typen)';
                
                pinBtn.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    // Toggle state
                    node.pinned = (node.pinned === false) ? true : false;
                    render(); // Re-render to update listeners/styles
                });
                el.appendChild(pinBtn);

            } else {
                const img = document.createElement('img');
                // Check if content is a Data URL or local filename
                if (node.content && node.content.startsWith('data:')) {
                    img.src = node.content;
                } else {
                    img.src = `picto_nl/${node.content || node.src}`;
                }
                el.appendChild(img);
            }

            // Custom Resize Handle (For all nodes now)
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            setupResize(handle, node, el);
            el.appendChild(handle);

            // Node Interactions
            setupNodeInteractions(el, node);

            nodesLayer.appendChild(el);
        });
        
        // Apply Canvas Pan
        nodesLayer.style.transform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`;
        connectionsLayer.style.transform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`;
    }

    function setupResize(handle, node, el) {
        handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // Stop drag of node
            e.preventDefault(); // Stop text selection
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = node.width || 100;
            const startH = node.height || 100;

            function onResizeMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                
                const newW = Math.max(50, startW + dx);
                const newH = Math.max(50, startH + dy);
                
                node.width = newW;
                node.height = newH;
                
                el.style.width = newW + 'px';
                el.style.height = newH + 'px';
            }

            function onResizeUp() {
                document.removeEventListener('pointermove', onResizeMove);
                document.removeEventListener('pointerup', onResizeUp);
            }

            document.addEventListener('pointermove', onResizeMove);
            document.addEventListener('pointerup', onResizeUp);
        });
    }

    function drawConnection(id, from, to) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.id = id;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add('connection-line');
        
        // Center points (node is 100x100)
        const x1 = from.x + 50;
        const y1 = from.y + 50;
        const x2 = to.x + 50;
        const y2 = to.y + 50;

        // Bezier Curve Logic
        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const cpOffset = Math.min(dist * 0.5, 150);
        
        const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
        path.setAttribute("d", d);
        
        group.appendChild(path);
        connectionsLayer.appendChild(group);

        // Delete Button (HTML Element for reliable hit testing)
        // Midpoint of Cubic Bezier at t=0.5
        const midX = 0.125*x1 + 0.375*(x1+cpOffset) + 0.375*(x2-cpOffset) + 0.125*x2;
        const midY = 0.125*y1 + 0.375*y1 + 0.375*y2 + 0.125*y2;
        
        const delBtn = document.createElement('div');
        delBtn.className = 'connection-delete-btn-html';
        delBtn.innerText = '×';
        delBtn.style.left = midX + 'px';
        delBtn.style.top = midY + 'px';
        delBtn.title = 'Verbinding verwijderen';
        
        delBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // Stop panning
            e.preventDefault(); 
            connections = connections.filter(c => c.id !== id);
            render();
        });
        
        // Append to nodesLayer so it moves with the pan transform
        nodesLayer.appendChild(delBtn);
    }

    // --- Node Dragging & Selection Logic ---

    function setupNodeInteractions(el, node) {
        // Selection / Connection / DELETION Logic
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // Prevent panning
            
            // 1. Check for Delete Button Click (Delegation with closest)
            if (e.target.closest('.delete-node-btn')) {
                deleteNode(node.id);
                return; // Stop here, don't drag
            }

            // 2. Check for Resize Handle (Delegation fallback if needed, but handle has its own listener)
            if (e.target.classList.contains('resize-handle')) {
                return; // Resize logic handles this
            }
            
            // 3. Check for Connection attempt
            if (selectedNodeId && selectedNodeId !== node.id) {
                // ... connection logic ...
            }
            
            startDrag(e, node);
        });
    }

    function startDrag(e, node) {
        const startX = e.clientX;
        const startY = e.clientY;
        const initialNodeX = node.x;
        const initialNodeY = node.y;
        let isDragging = false;

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (dx*dx + dy*dy > 25) isDragging = true; // threshold

            // SNAP TO GRID
            node.x = snapToGrid(initialNodeX + dx);
            node.y = snapToGrid(initialNodeY + dy);
            
            // Update UI immediately for performance (bypass full render)
            const el = document.querySelector(`.picto-node[data-id="${node.id}"]`);
            if(el) el.style.transform = `translate(${node.x}px, ${node.y}px)`;
            
            // Update connected lines immediately
            updateLinesForNode(node);
        }

        function onUp(ev) {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);

            if (!isDragging) {
                handleNodeClick(node.id);
            }
            render(); // Final snap render
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    function updateLinesForNode(node) {
        // Simple re-render of lines logic is complex to do purely via DOM updates
        // because of the midpoint button. Easier to just re-draw the affected connections.
        // Or we can just call render()? It might be too heavy on drag.
        // Let's do a targeted DOM update for performance.
        
        const lines = connections.filter(c => c.from === node.id || c.to === node.id);
        lines.forEach(conn => {
            // Find existing group
            const group = document.querySelector(`g[data-id="${conn.id}"]`);
            if (!group) return;
            
            const from = nodes.find(n => n.id === conn.from);
            const to = nodes.find(n => n.id === conn.to);
            
            const x1 = from.x + 50;
            const y1 = from.y + 50;
            const x2 = to.x + 50;
            const y2 = to.y + 50;
            const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const cpOffset = Math.min(dist * 0.5, 150);
            
            const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
            
            const path = group.querySelector('path');
            if(path) path.setAttribute("d", d);
            
            // Update button pos
            const midX = 0.125*x1 + 0.375*(x1+cpOffset) + 0.375*(x2-cpOffset) + 0.125*x2;
            const midY = 0.125*y1 + 0.375*y1 + 0.375*y2 + 0.125*y2;
            
            const circle = group.querySelector('circle');
            const text = group.querySelector('text');
            if(circle) {
                circle.setAttribute("cx", midX);
                circle.setAttribute("cy", midY);
            }
            if(text) {
                text.setAttribute("x", midX);
                text.setAttribute("y", midY);
            }
        });
    }

    function handleNodeClick(id) {
        if (selectedNodeId === null) {
            // Select first
            selectedNodeId = id;
        } else if (selectedNodeId === id) {
            // Deselect
            selectedNodeId = null;
        } else {
            // Connect previous to current
            // Check if exists
            const exists = connections.some(c => 
                (c.from === selectedNodeId && c.to === id) || 
                (c.from === id && c.to === selectedNodeId)
            );
            
            if (!exists) {
                connections.push({
                    id: 'conn_' + Date.now(),
                    from: selectedNodeId,
                    to: id
                });
            }
            // Move selection to new node? Or keep?
            // Usually keeping selection allows chaining A->B->C
            selectedNodeId = id; 
        }
        render();
    }

    // --- Canvas Panning ---
    // Allow dragging background to pan
    workspace.addEventListener('pointerdown', (e) => {
        if(e.target === workspace || e.target === nodesLayer) {
            isPanning = true;
            panStart = { x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y };
            workspace.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('pointermove', (e) => {
        if (!isPanning) return;
        canvasOffset.x = e.clientX - panStart.x;
        canvasOffset.y = e.clientY - panStart.y;
        render(); // Efficient enough for this scale
    });

    document.addEventListener('pointerup', () => {
        isPanning = false;
        workspace.style.cursor = 'grab';
    });


    // --- Saving & Loading ---

    document.getElementById('saveBtn').addEventListener('click', () => {
        saveDialog.showModal();
    });

    document.getElementById('confirmSaveBtn').addEventListener('click', (e) => {
        e.preventDefault(); // Handle form manually
        const name = saveNameInput.value.trim();
        if (!name) return;

        const data = { nodes, connections, canvasOffset };
        localStorage.setItem('picto_chain_' + name, JSON.stringify(data));
        saveDialog.close();
        saveNameInput.value = '';
        loadSavedList();
        alert('Opgeslagen!');
    });

    document.querySelector('button[value="cancel"]').addEventListener('click', (e) => {
        e.preventDefault();
        saveDialog.close();
    });

    function loadSavedList() {
        const select = document.getElementById('savedSelect');
        if (!select) return;
        
        // Keep the first default option
        select.innerHTML = '<option value="">-- Kies opgeslagen ketting --</option>';
        
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('picto_chain_')) {
                const name = key.replace('picto_chain_', '');
                const option = document.createElement('option');
                option.value = key;
                option.textContent = name;
                select.appendChild(option);
            }
        });
    }

    function loadChain(key) {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            nodes = data.nodes || [];
            connections = data.connections || [];
            canvasOffset = data.canvasOffset || {x:0, y:0};
            render();
        } catch(e) {
            console.error('Save file corrupt', e);
        }
    }

    document.getElementById('clearBtn').addEventListener('click', () => {
        if(confirm('Alles wissen?')) {
            nodes = [];
            connections = [];
            render();
        }
    });

    // --- Printing ---
    
    document.getElementById('printBtn').addEventListener('click', () => {
        if (nodes.length === 0) {
            window.print();
            return;
        }

        // Deselect everything for a clean print
        selectedNodeId = null;
        render();

        // 1. Find bounds of the content
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            const w = n.width || 100;
            const h = n.height || 100;
            if(n.x < minX) minX = n.x;
            if(n.y < minY) minY = n.y;
            if(n.x + w > maxX) maxX = n.x + w;
            if(n.y + h > maxY) maxY = n.y + h;
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        // 2. Define A4 Landscape dimensions (96 DPI)
        const PAGE_W = 1122; 
        const PAGE_H = 793;
        const MARGIN = 40; // Increased safety margin for mobile printing

        const safeW = PAGE_W - (MARGIN * 2);
        const safeH = PAGE_H - (MARGIN * 2);

        // 3. Calculate Scale to fit
        const scaleX = safeW / contentW;
        const scaleY = safeH / contentH;
        // Fit within page, uncapped
        const finalScale = Math.min(scaleX, scaleY); 

        // 4. Calculate Centering Offsets
        const finalW = contentW * finalScale;
        const finalH = contentH * finalScale;
        
        const offsetX = MARGIN + ((safeW - finalW) / 2);
        const offsetY = MARGIN + ((safeH - finalH) / 2);

        // 5. Store current state
        const oldNodesTransform = nodesLayer.style.transform;
        const oldConnTransform = connectionsLayer.style.transform;

        // 6. Apply Print Transformation
        // Logic: 
        // 1. Translate(-minX, -minY) -> Moves content top-left to (0,0)
        // 2. Scale(finalScale) -> Scales it up
        // 3. Translate(offsetX, offsetY) -> Moves it to the calculated center position
        // CSS transform applies from left to right visually (or right to left mathematically).
        // Standard syntax: translate(tx, ty) scale(s) translate(tx, ty)
        
        const printTransform = `translate(${offsetX}px, ${offsetY}px) scale(${finalScale}) translate(${-minX}px, ${-minY}px)`;
        
        nodesLayer.style.transform = printTransform;
        connectionsLayer.style.transform = printTransform;
        
        // This class now hides the sidebar ON SCREEN too
        document.body.classList.add('is-printing');

        // Give the user a moment to see the preview on screen before the dialog pops up
        setTimeout(() => {
            window.print();
            
            // 7. Restore UI after the print dialog is closed
            document.body.classList.remove('is-printing');
            nodesLayer.style.transform = oldNodesTransform;
            connectionsLayer.style.transform = oldConnTransform;
            render(); 
        }, 1000);
    });

    init();
});
