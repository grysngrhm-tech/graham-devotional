/**
 * Graham Devotion - Web Viewer App
 * ============================================================================
 * Static web application for browsing devotional spreads from Supabase
 * ============================================================================
 */

// Initialize Supabase client
const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
);

// Global state
let allSpreads = [];
let filteredSpreads = [];
let currentSpreadIndex = 0;
let spreadsMetadata = null; // From all-spreads.json

// Filter state
let currentFilters = {
    testament: 'all',
    book: 'all',
    status: 'all',
    search: ''
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const isSpreadPage = document.body.classList.contains('spread-page');
    
    if (isSpreadPage) {
        initSpreadPage();
    } else {
        initIndexPage();
    }
});

// ============================================================================
// Index Page
// ============================================================================

async function initIndexPage() {
    showSkeletonCards(12);
    
    // Load metadata and spreads in parallel
    await Promise.all([
        loadSpreadsMetadata(),
        loadAllSpreads()
    ]);
    
    populateBookDropdown();
    setupFilters();
    setupKeyboardShortcuts();
    applyFilters();
    updateStats();
}

function showSkeletonCards(count) {
    const grid = document.getElementById('spreadsGrid');
    const template = document.getElementById('skeletonTemplate');
    if (!template || !grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = template.content.cloneNode(true);
        grid.appendChild(skeleton);
    }
}

async function loadSpreadsMetadata() {
    try {
        const response = await fetch('./data/all-spreads.json');
        if (!response.ok) throw new Error('Failed to load metadata');
        spreadsMetadata = await response.json();
    } catch (err) {
        console.warn('Could not load spreads metadata:', err);
        spreadsMetadata = null;
    }
}

async function loadAllSpreads() {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, kjv_passage_ref, status_text, status_image, image_url, image_url_1')
            .order('spread_code', { ascending: true });
        
        if (error) throw error;
        
        // Merge with metadata to get testament/book info
        allSpreads = (data || []).map(spread => {
            const meta = spreadsMetadata?.spreads?.find(m => m.spread_code === spread.spread_code);
            return {
                ...spread,
                testament: meta?.testament || null,
                book: meta?.book || null
            };
        });
        
        filteredSpreads = [...allSpreads];
        
    } catch (err) {
        console.error('Error loading spreads:', err);
        const grid = document.getElementById('spreadsGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>Error loading spreads. Please check your connection and try again.</p>
                </div>
            `;
        }
    }
}

function populateBookDropdown() {
    const bookSelect = document.getElementById('bookFilter');
    if (!bookSelect || !spreadsMetadata?.spreads) return;
    
    // Count spreads per book and group by testament
    const bookCounts = {};
    const otBooks = [];
    const ntBooks = [];
    
    spreadsMetadata.spreads.forEach(spread => {
        const book = spread.book;
        const testament = spread.testament;
        
        if (!bookCounts[book]) {
            bookCounts[book] = { count: 0, testament };
            if (testament === 'OT') otBooks.push(book);
            else if (testament === 'NT') ntBooks.push(book);
        }
        bookCounts[book].count++;
    });
    
    // Build dropdown HTML
    let html = '<option value="all">All Books</option>';
    
    if (otBooks.length > 0) {
        html += '<optgroup label="Old Testament">';
        otBooks.forEach(book => {
            html += `<option value="${book}">${book} (${bookCounts[book].count})</option>`;
        });
        html += '</optgroup>';
    }
    
    if (ntBooks.length > 0) {
        html += '<optgroup label="New Testament">';
        ntBooks.forEach(book => {
            html += `<option value="${book}">${book} (${bookCounts[book].count})</option>`;
        });
        html += '</optgroup>';
    }
    
    bookSelect.innerHTML = html;
}

function setupFilters() {
    // Testament segment control
    const testamentBtns = document.querySelectorAll('#testamentFilter .segment');
    testamentBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            testamentBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters.testament = btn.dataset.value;
            
            // Reset book filter when testament changes
            currentFilters.book = 'all';
            document.getElementById('bookFilter').value = 'all';
            
            applyFilters();
        });
    });
    
    // Book dropdown
    const bookFilter = document.getElementById('bookFilter');
    if (bookFilter) {
        bookFilter.addEventListener('change', () => {
            currentFilters.book = bookFilter.value;
            applyFilters();
        });
    }
    
    // Status pills
    const statusBtns = document.querySelectorAll('#statusFilter .status-pill');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            statusBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters.status = btn.dataset.status;
            applyFilters();
        });
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            currentFilters.search = searchInput.value.toLowerCase().trim();
            applyFilters();
        }, 300));
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ⌘K or Ctrl+K or / to focus search
        if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/' && !e.target.matches('input, textarea'))) {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.focus();
        }
        
        // Escape to clear search
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.value = '';
                currentFilters.search = '';
                searchInput.blur();
                applyFilters();
            }
        }
    });
}

function applyFilters() {
    const { testament, book, status, search } = currentFilters;
    
    filteredSpreads = allSpreads.filter(spread => {
        // Testament filter
        if (testament !== 'all' && spread.testament !== testament) {
            return false;
        }
        
        // Book filter
        if (book !== 'all' && spread.book !== book) {
            return false;
        }
        
        // Status filter
        if (status !== 'all') {
            const isComplete = spread.status_text === 'done' && spread.status_image === 'done';
            if (status === 'complete' && !isComplete) return false;
            if (status === 'pending' && isComplete) return false;
        }
        
        // Search filter
        if (search) {
            const searchFields = [
                spread.title,
                spread.kjv_passage_ref,
                spread.spread_code,
                spread.book
            ].filter(Boolean).map(f => f.toLowerCase());
            
            if (!searchFields.some(field => field.includes(search))) {
                return false;
            }
        }
        
        return true;
    });
    
    renderSpreads();
    updateActiveFilters();
    updateResultsCount();
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    
    const tags = [];
    
    if (currentFilters.testament !== 'all') {
        const label = currentFilters.testament === 'OT' ? 'Old Testament' : 'New Testament';
        tags.push({ type: 'testament', label });
    }
    
    if (currentFilters.book !== 'all') {
        tags.push({ type: 'book', label: currentFilters.book });
    }
    
    if (currentFilters.status !== 'all') {
        const label = currentFilters.status === 'complete' ? 'Complete' : 'Pending';
        tags.push({ type: 'status', label });
    }
    
    if (currentFilters.search) {
        tags.push({ type: 'search', label: `"${currentFilters.search}"` });
    }
    
    container.innerHTML = tags.map(tag => `
        <span class="filter-tag">
            ${tag.label}
            <button onclick="clearFilter('${tag.type}')" aria-label="Remove filter">×</button>
        </span>
    `).join('');
}

function clearFilter(type) {
    if (type === 'testament') {
        currentFilters.testament = 'all';
        document.querySelectorAll('#testamentFilter .segment').forEach(b => b.classList.remove('active'));
        document.querySelector('#testamentFilter .segment[data-value="all"]')?.classList.add('active');
    } else if (type === 'book') {
        currentFilters.book = 'all';
        document.getElementById('bookFilter').value = 'all';
    } else if (type === 'status') {
        currentFilters.status = 'all';
        document.querySelectorAll('#statusFilter .status-pill').forEach(b => b.classList.remove('active'));
        document.querySelector('#statusFilter .status-pill[data-status="all"]')?.classList.add('active');
    } else if (type === 'search') {
        currentFilters.search = '';
        document.getElementById('searchInput').value = '';
    }
    
    applyFilters();
}

function updateResultsCount() {
    const countEl = document.getElementById('resultsCount');
    if (countEl) {
        countEl.textContent = filteredSpreads.length;
    }
}

function renderSpreads() {
    const grid = document.getElementById('spreadsGrid');
    if (!grid) return;
    
    if (filteredSpreads.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <p>No spreads found matching your filters.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredSpreads.map(spread => {
        const isComplete = spread.status_text === 'done' && spread.status_image === 'done';
        const statusClass = isComplete ? 'complete' : 'pending';
        const statusText = isComplete ? 'Complete' : 'Pending';
        const imageUrl = spread.image_url || spread.image_url_1;
        
        // Parse book and chapter from passage ref
        const passageRef = spread.kjv_passage_ref || '';
        const bookMatch = spread.book || passageRef.split(/\d/)[0]?.trim() || '';
        
        return `
            <a href="spread.html?id=${spread.spread_code}" class="spread-card">
                <div class="card-image">
                    ${imageUrl 
                        ? `<img src="${imageUrl}" alt="${spread.title}" loading="lazy">`
                        : `<div class="placeholder">No image yet</div>`
                    }
                    <span class="card-status ${statusClass}">${statusText}</span>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${spread.title || 'Untitled'}</h3>
                    <span class="card-book">
                        ${bookMatch}
                        ${passageRef ? `<span class="dot"></span>${passageRef}` : ''}
                    </span>
                </div>
            </a>
        `;
    }).join('');
}

function updateStats() {
    const total = allSpreads.length;
    const complete = allSpreads.filter(s => s.status_text === 'done' && s.status_image === 'done').length;
    const pending = total - complete;
    
    const completeEl = document.getElementById('completeCount');
    const pendingEl = document.getElementById('pendingCount');
    
    if (completeEl) completeEl.textContent = complete;
    if (pendingEl) pendingEl.textContent = pending;
}

// ============================================================================
// Spread Page
// ============================================================================

async function initSpreadPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const spreadId = urlParams.get('id');
    
    if (!spreadId) {
        showError();
        return;
    }
    
    // Load all spread codes for navigation
    await loadSpreadCodes();
    
    // Find current index
    currentSpreadIndex = allSpreads.findIndex(s => s.spread_code === spreadId);
    
    // Load and render spread
    await loadSpread(spreadId);
    
    // Setup navigation and scroll indicator
    setupNavigation();
    setupScrollIndicator();
}

async function loadSpreadCodes() {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('spread_code')
            .order('spread_code', { ascending: true });
        
        if (error) throw error;
        allSpreads = data || [];
    } catch (err) {
        console.error('Error loading spread codes:', err);
    }
}

async function loadSpread(spreadCode) {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('*')
            .eq('spread_code', spreadCode)
            .single();
        
        if (error || !data) {
            showError();
            return;
        }
        
        renderSpread(data);
        updateNavPosition();
        
    } catch (err) {
        console.error('Error loading spread:', err);
        showError();
    }
}

function renderSpread(spread) {
    const bookSpread = document.getElementById('bookSpread');
    const template = document.getElementById('spreadTemplate');
    const content = template.content.cloneNode(true);
    
    // Fill in text content
    content.getElementById('spreadTitle').textContent = spread.title || 'Untitled';
    content.getElementById('verseRange').textContent = spread.kjv_passage_ref || '';
    // Strip ** markdown from key verse text
    const keyVerseText = (spread.kjv_key_verse_text || '').replace(/\*\*/g, '');
    content.getElementById('keyVerseText').textContent = keyVerseText;
    content.getElementById('keyVerseRef').textContent = spread.kjv_key_verse_ref ? `— ${spread.kjv_key_verse_ref}` : '';
    content.getElementById('spreadCode').textContent = spread.spread_code;
    content.getElementById('batchInfo').textContent = spread.spread_code;
    
    // Format and render summary text
    const summaryEl = content.getElementById('summaryText');
    if (spread.paraphrase_text) {
        // Split into paragraphs if there are double line breaks
        const paragraphs = spread.paraphrase_text.split(/\n\n+/).filter(p => p.trim());
        // Convert **bold** markdown to KJV quote styling
        const formattedParagraphs = paragraphs.map(p => {
            const formatted = p.trim().replace(/\*\*(.+?)\*\*/g, '<span class="kjv-quote">$1</span>');
            return `<p>${formatted}</p>`;
        });
        summaryEl.innerHTML = formattedParagraphs.join('');
    } else {
        summaryEl.innerHTML = '<p class="placeholder"><em>Summary not yet generated</em></p>';
    }
    
    // Store current spread data for selection functionality
    currentSpreadData = spread;
    
    // Render images with selection functionality
    const imageContainer = content.getElementById('imageContainer');
    const candidateImages = [
        spread.image_url_1,
        spread.image_url_2,
        spread.image_url_3,
        spread.image_url_4
    ];
    const hasCandidates = candidateImages.some(url => url && url.trim());
    const hasPrimary = spread.image_url && spread.image_url.trim();
    
    if (hasPrimary && !isExpanded) {
        // Show single primary image with expand option
        const singleTemplate = document.getElementById('singleImageTemplate');
        const imageContent = singleTemplate.content.cloneNode(true);
        imageContent.getElementById('selectedImage').src = spread.image_url;
        imageContent.getElementById('selectedImage').alt = spread.title;
        
        // Setup expand button
        const expandBtn = imageContent.getElementById('expandOptionsBtn');
        if (expandBtn && hasCandidates) {
            expandBtn.addEventListener('click', expandImageOptions);
        } else if (expandBtn) {
            expandBtn.style.display = 'none';
        }
        
        imageContainer.appendChild(imageContent);
    } else if (hasCandidates) {
        // Show selection grid
        const gridTemplate = document.getElementById('gridImageTemplate');
        const gridContent = gridTemplate.content.cloneNode(true);
        
        // Update header based on whether we're expanding or selecting new
        const selectionHeader = gridContent.getElementById('selectionHeader');
        const collapseBtn = gridContent.getElementById('collapseBtn');
        const selectionTitle = selectionHeader.querySelector('.selection-title');
        
        if (hasPrimary && isExpanded) {
            selectionTitle.textContent = 'Change Primary Image';
            collapseBtn.style.display = 'flex';
            collapseBtn.addEventListener('click', collapseImageOptions);
        }
        
        const gridImages = gridContent.querySelectorAll('.grid-image');
        gridImages.forEach((div, index) => {
            const imageUrl = candidateImages[index];
            if (imageUrl && imageUrl.trim()) {
                const img = div.querySelector('img');
                img.src = imageUrl;
                img.alt = `${spread.title} - Option ${index + 1}`;
                
                // Mark current primary
                const isCurrentPrimary = hasPrimary && imageUrl === spread.image_url;
                if (isCurrentPrimary) {
                    div.classList.add('is-primary');
                }
                
                // Update overlay text for current primary
                const selectLabel = div.querySelector('.select-label');
                if (selectLabel && isCurrentPrimary) {
                    selectLabel.textContent = 'Keep as Primary';
                    selectLabel.style.display = 'block';
                }
                
                // Click to select as primary (on image, not regenerate button)
                const imgEl = div.querySelector('img');
                if (imgEl) {
                    imgEl.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectPrimaryImage(imageUrl, spread.spread_code);
                    });
                }
                
                // Regenerate button
                const regenBtn = div.querySelector('.regen-btn');
                if (regenBtn) {
                    regenBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerRegeneration(index + 1);
                    });
                }
            } else {
                div.style.display = 'none';
            }
        });
        
        imageContainer.appendChild(gridContent);
    } else {
        // No images at all
        imageContainer.innerHTML = `
            <div class="placeholder" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-charcoal-light);">
                <em>No images generated</em>
            </div>
        `;
    }
    
    // Clear and add to DOM
    bookSpread.innerHTML = '';
    bookSpread.appendChild(content);
    
    // Update page title
    document.title = `${spread.title || 'Spread'} — The Graham Devotional Bible`;
}

function setupNavigation() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.addEventListener('click', () => navigateSpread(-1));
    nextBtn.addEventListener('click', () => navigateSpread(1));
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') navigateSpread(-1);
        if (e.key === 'ArrowRight') navigateSpread(1);
    });
    
    // Touch swipe navigation
    setupSwipeNavigation();
    
    updateNavButtons();
}

function setupSwipeNavigation() {
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;
    
    const bookSpread = document.getElementById('bookSpread');
    if (!bookSpread) return;
    
    bookSpread.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    bookSpread.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) < minSwipeDistance) return;
        
        if (swipeDistance > 0) {
            // Swipe right = previous spread
            navigateSpread(-1);
        } else {
            // Swipe left = next spread
            navigateSpread(1);
        }
    }
}

function setupScrollIndicator() {
    const scrollIndicator = document.getElementById('scrollIndicator');
    if (!scrollIndicator) return;
    
    let lastScrollY = 0;
    
    function checkScroll() {
        const rightPage = document.querySelector('.right-page');
        if (!rightPage) return;
        
        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.body.scrollHeight;
        const isAtBottom = (scrollTop + windowHeight) >= (documentHeight - 100);
        
        // Show scroll indicator if there's more content to scroll
        if (!isAtBottom && documentHeight > windowHeight + 100) {
            scrollIndicator.classList.add('visible');
        } else {
            scrollIndicator.classList.remove('visible');
        }
        
        // Add scrolled class for top shadow
        if (scrollTop > 50) {
            rightPage.classList.add('scrolled');
        } else {
            rightPage.classList.remove('scrolled');
        }
        
        lastScrollY = scrollTop;
    }
    
    window.addEventListener('scroll', checkScroll, { passive: true });
    
    // Initial check
    setTimeout(checkScroll, 500);
}

function navigateSpread(direction) {
    const newIndex = currentSpreadIndex + direction;
    
    if (newIndex < 0 || newIndex >= allSpreads.length) return;
    
    const spreadLayout = document.querySelector('.spread-layout');
    
    // Reset expanded state for new spread
    isExpanded = false;
    
    // Fade out
    if (spreadLayout) {
        spreadLayout.classList.add('fade-out');
    }
    
    setTimeout(() => {
        currentSpreadIndex = newIndex;
        const newSpreadCode = allSpreads[newIndex].spread_code;
        
        // Update URL without reload
        window.history.pushState({}, '', `spread.html?id=${newSpreadCode}`);
        
        // Load new spread
        loadSpread(newSpreadCode);
        
        // Fade in after content loads
        setTimeout(() => {
            const newLayout = document.querySelector('.spread-layout');
            if (newLayout) {
                newLayout.classList.remove('fade-out');
            }
        }, 50);
    }, 200);
}

function updateNavPosition() {
    const position = document.getElementById('navPosition');
    position.textContent = `${currentSpreadIndex + 1} / ${allSpreads.length}`;
    updateNavButtons();
}

function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.disabled = currentSpreadIndex <= 0;
    nextBtn.disabled = currentSpreadIndex >= allSpreads.length - 1;
}

function showError() {
    const bookSpread = document.getElementById('bookSpread');
    const template = document.getElementById('errorTemplate');
    bookSpread.innerHTML = '';
    bookSpread.appendChild(template.content.cloneNode(true));
}

// ============================================================================
// Image Selection
// ============================================================================

let currentSpreadData = null;
let isExpanded = false;

async function selectPrimaryImage(imageUrl, spreadCode) {
    // Skip if this image is already the primary
    if (currentSpreadData && currentSpreadData.image_url === imageUrl) {
        showToast('This image is already selected');
        isExpanded = false;
        renderSpread(currentSpreadData);
        return;
    }
    
    try {
        // Update Supabase
        const { error } = await supabase
            .from('grahams_devotional_spreads')
            .update({ image_url: imageUrl })
            .eq('spread_code', spreadCode);
        
        if (error) throw error;
        
        // Update local data
        if (currentSpreadData) {
            currentSpreadData.image_url = imageUrl;
        }
        
        // Show toast notification
        showToast('✓ Primary image updated');
        
        // Re-render with new primary image (collapsed view)
        isExpanded = false;
        renderSpread(currentSpreadData);
        
    } catch (err) {
        console.error('Error updating primary image:', err);
        showToast('Error saving selection', true);
    }
}

function expandImageOptions() {
    isExpanded = true;
    renderSpread(currentSpreadData);
}

function collapseImageOptions() {
    isExpanded = false;
    renderSpread(currentSpreadData);
}

// ============================================================================
// Image Regeneration
// ============================================================================

let activeRegenerationRequest = null;
let regenerationPollInterval = null;

async function triggerRegeneration(slot) {
    if (!currentSpreadData) {
        showToast('No spread loaded', true);
        return;
    }
    
    const spreadCode = currentSpreadData.spread_code;
    
    // Show the regeneration modal
    showRegenerationModal(slot);
    
    try {
        // Get webhook URL from config
        const webhookUrl = window.N8N_CONFIG?.webhookUrl;
        if (!webhookUrl) {
            throw new Error('n8n webhook URL not configured');
        }
        
        // Trigger the n8n workflow
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                spread_code: spreadCode,
                slot: slot
            })
        });
        
        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status}`);
        }
        
        const result = await response.json();
        activeRegenerationRequest = result.request_id;
        
        // Start polling for results
        startRegenerationPolling(result.request_id, slot);
        
    } catch (err) {
        console.error('Error triggering regeneration:', err);
        showToast('Failed to start regeneration', true);
        hideRegenerationModal();
    }
}

function startRegenerationPolling(requestId, slot) {
    // Poll every 3 seconds for up to 5 minutes
    let pollCount = 0;
    const maxPolls = 100; // 5 minutes at 3 second intervals
    
    regenerationPollInterval = setInterval(async () => {
        pollCount++;
        
        if (pollCount > maxPolls) {
            clearInterval(regenerationPollInterval);
            showToast('Regeneration timed out', true);
            hideRegenerationModal();
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('regeneration_requests')
                .select('status, option_urls')
                .eq('id', requestId)
                .single();
            
            if (error) throw error;
            
            if (data.status === 'ready' && data.option_urls?.length > 0) {
                clearInterval(regenerationPollInterval);
                showRegenerationOptions(data.option_urls, slot, requestId);
            } else if (data.status === 'cancelled' || data.status === 'error') {
                clearInterval(regenerationPollInterval);
                showToast('Regeneration failed', true);
                hideRegenerationModal();
            }
            // Continue polling if status is still 'processing'
            
        } catch (err) {
            console.error('Error polling regeneration status:', err);
            // Continue polling on error
        }
    }, 3000);
}

function showRegenerationModal(slot) {
    const modalTemplate = document.getElementById('regenerationModalTemplate');
    if (!modalTemplate) return;
    
    const modalContent = modalTemplate.content.cloneNode(true);
    
    // Set the slot number in the modal
    const slotSpan = modalContent.getElementById('regenSlotNumber');
    if (slotSpan) slotSpan.textContent = slot;
    
    // Setup cancel button
    const cancelBtn = modalContent.getElementById('cancelRegenBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelRegeneration);
    }
    
    // Add modal to page
    document.body.appendChild(modalContent);
}

function showRegenerationOptions(optionUrls, slot, requestId) {
    const optionsGrid = document.getElementById('newImageOptionsGrid');
    if (!optionsGrid) return;
    
    // Clear skeleton loaders and add actual images
    optionsGrid.innerHTML = optionUrls.map((url, index) => `
        <div class="new-image-option" data-url="${url}" data-index="${index + 1}">
            <img src="${url}" alt="Option ${index + 1}">
            <span class="option-number">${index + 1}</span>
        </div>
    `).join('');
    
    // Add click handlers to select an option
    let selectedUrl = null;
    optionsGrid.querySelectorAll('.new-image-option').forEach(div => {
        div.addEventListener('click', () => {
            // Remove selection from all
            optionsGrid.querySelectorAll('.new-image-option').forEach(d => d.classList.remove('selected'));
            // Add selection to clicked
            div.classList.add('selected');
            selectedUrl = div.dataset.url;
            
            // Show the select button
            const selectBtn = document.getElementById('selectNewImageBtn');
            if (selectBtn) {
                selectBtn.style.display = 'inline-flex';
                selectBtn.onclick = () => confirmRegeneration(selectedUrl, slot, requestId);
            }
        });
    });
    
    // Update modal text
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        const heading = modalContent.querySelector('h2');
        const desc = modalContent.querySelector('p');
        if (heading) heading.textContent = 'Select New Image';
        if (desc) desc.textContent = `Choose one of the 4 newly generated images to replace slot ${slot}.`;
    }
}

async function confirmRegeneration(imageUrl, slot, requestId) {
    if (!currentSpreadData || !imageUrl) return;
    
    const spreadCode = currentSpreadData.spread_code;
    
    try {
        // Update the specific image_url_X slot in the spreads table
        const updateField = `image_url_${slot}`;
        const { error: updateError } = await supabase
            .from('grahams_devotional_spreads')
            .update({ [updateField]: imageUrl })
            .eq('spread_code', spreadCode);
        
        if (updateError) throw updateError;
        
        // Update regeneration request status
        await supabase
            .from('regeneration_requests')
            .update({ 
                status: 'selected',
                selected_url: imageUrl 
            })
            .eq('id', requestId);
        
        // Update local data
        currentSpreadData[updateField] = imageUrl;
        
        showToast(`✓ Image ${slot} replaced`);
        hideRegenerationModal();
        
        // Re-render the spread
        isExpanded = true;
        renderSpread(currentSpreadData);
        
    } catch (err) {
        console.error('Error confirming regeneration:', err);
        showToast('Error saving new image', true);
    }
}

function cancelRegeneration() {
    if (regenerationPollInterval) {
        clearInterval(regenerationPollInterval);
    }
    
    // Update request status to cancelled if we have one
    if (activeRegenerationRequest) {
        supabase
            .from('regeneration_requests')
            .update({ status: 'cancelled' })
            .eq('id', activeRegenerationRequest)
            .then(() => {})
            .catch(err => console.warn('Could not cancel request:', err));
    }
    
    activeRegenerationRequest = null;
    hideRegenerationModal();
}

function hideRegenerationModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    activeRegenerationRequest = null;
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('.toast-icon');
    
    if (!toast) return;
    
    toastMessage.textContent = message;
    toastIcon.textContent = isError ? '✕' : '✓';
    toastIcon.style.background = isError ? '#F44336' : '#4CAF50';
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================================
// Lightbox
// ============================================================================

function openLightbox(src, alt) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');
    
    if (!lightbox) return;
    
    lightboxImage.src = src;
    lightboxImage.alt = alt;
    lightboxCaption.textContent = alt;
    lightbox.classList.add('active');
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;
    
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

// Setup lightbox event listeners
document.addEventListener('DOMContentLoaded', () => {
    const lightbox = document.getElementById('lightbox');
    const lightboxClose = document.getElementById('lightboxClose');
    
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }
    
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });
});

// ============================================================================
// Utilities
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


