/**
 * The GRACE Bible - Web Viewer App
 * ============================================================================
 * The Graham Reimagined Art & Canon Experience Bible
 * Static web application for browsing Biblical stories from Supabase
 * ============================================================================
 */

// Initialize Supabase client
const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
);

// Global state
let allStories = [];
let filteredStories = [];
let currentStoryIndex = 0;

// Filter state
let currentFilters = {
    testament: 'all',
    book: 'all',
    grouping: 'all',
    status: 'all',
    search: ''
};

// Biblical book order (canonical Protestant order)
const BIBLE_BOOK_ORDER = [
    // Old Testament
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
    'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
    'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
    'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
    // New Testament
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
    'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
    'Revelation'
];

// Create a lookup map for fast ordering
const BOOK_ORDER_MAP = BIBLE_BOOK_ORDER.reduce((map, book, index) => {
    map[book] = index;
    return map;
}, {});

// Book Groupings for filter options
const BOOK_GROUPINGS = {
    'Torah': ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'],
    'History': ['Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther'],
    'Poetry': ['Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'],
    'Prophets': ['Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'],
    'Gospels': ['Matthew', 'Mark', 'Luke', 'John'],
    'Acts': ['Acts'],
    'Epistles': ['Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'],
    'Revelation': ['Revelation']
};

// Sort stories in Biblical order (book → chapter → verse)
function sortStoriesChronologically(stories) {
    return stories.sort((a, b) => {
        // Get book order (unknown books go to end)
        const bookOrderA = BOOK_ORDER_MAP[a.book] ?? 999;
        const bookOrderB = BOOK_ORDER_MAP[b.book] ?? 999;
        
        if (bookOrderA !== bookOrderB) {
            return bookOrderA - bookOrderB;
        }
        
        // Same book - sort by chapter
        const chapterA = a.start_chapter || 0;
        const chapterB = b.start_chapter || 0;
        
        if (chapterA !== chapterB) {
            return chapterA - chapterB;
        }
        
        // Same chapter - sort by verse
        const verseA = a.start_verse || 0;
        const verseB = b.start_verse || 0;
        
        return verseA - verseB;
    });
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const isStoryPage = document.body.classList.contains('story-page');
    
    if (isStoryPage) {
        initStoryPage();
    } else {
        initIndexPage();
    }
});

// ============================================================================
// Index Page
// ============================================================================

async function initIndexPage() {
    showSkeletonCards(12);
    
    // Detect platform and update keyboard shortcut display
    updateKeyboardShortcutDisplay();
    
    // Load stories (testament/book now come from Supabase directly)
    await loadAllStories();
    
    populateBookDropdown();
    setupFilters();
    setupKeyboardShortcuts();
    setupAcronymExpansion();
    applyFilters();
    updateStats();
}

// Detect platform and show appropriate keyboard shortcut
function updateKeyboardShortcutDisplay() {
    const shortcut = document.querySelector('.search-shortcut');
    if (!shortcut) return;
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
                  navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    
    shortcut.textContent = isMac ? '⌘K' : 'Ctrl+K';
}

function showSkeletonCards(count) {
    const grid = document.getElementById('storiesGrid');
    const template = document.getElementById('skeletonTemplate');
    if (!template || !grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = template.content.cloneNode(true);
        grid.appendChild(skeleton);
    }
}

async function loadAllStories() {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, kjv_passage_ref, status_text, status_image, image_url, image_url_1, testament, book, start_chapter, start_verse');
        
        if (error) throw error;
        
        // Sort in Biblical order (book → chapter → verse)
        allStories = sortStoriesChronologically(data || []);
        filteredStories = [...allStories];
        
    } catch (err) {
        console.error('Error loading stories:', err);
        const grid = document.getElementById('storiesGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>Error loading stories. Please check your connection and try again.</p>
                </div>
            `;
        }
    }
}

function populateBookDropdown() {
    const bookSelect = document.getElementById('bookFilter');
    if (!bookSelect) return;
    
    // Count stories per book from actual data
    const bookCounts = {};
    const booksWithData = new Set();
    
    allStories.forEach(story => {
        const book = story.book;
        if (!book) return; // Skip if no book set
        
        booksWithData.add(book);
        if (!bookCounts[book]) {
            bookCounts[book] = 0;
        }
        bookCounts[book]++;
    });
    
    // Get OT and NT books that have data, in Biblical order
    const otBooks = BIBLE_BOOK_ORDER.slice(0, 39).filter(book => booksWithData.has(book));
    const ntBooks = BIBLE_BOOK_ORDER.slice(39).filter(book => booksWithData.has(book));
    
    // Calculate grouping counts
    const groupingCounts = {};
    Object.entries(BOOK_GROUPINGS).forEach(([groupName, books]) => {
        groupingCounts[groupName] = books.reduce((sum, book) => {
            return sum + (bookCounts[book] || 0);
        }, 0);
    });
    
    // Build dropdown HTML
    let html = '<option value="all">All Books</option>';
    
    // Add groupings section
    html += '<optgroup label="Book Groupings">';
    Object.entries(BOOK_GROUPINGS).forEach(([groupName, books]) => {
        const count = groupingCounts[groupName];
        if (count > 0) {
            html += `<option value="group:${groupName}">${groupName} (${count})</option>`;
        }
    });
    html += '</optgroup>';
    
    // Add individual books by testament (in Biblical order)
    if (otBooks.length > 0) {
        html += '<optgroup label="Old Testament">';
        otBooks.forEach(book => {
            html += `<option value="${book}">${book} (${bookCounts[book]})</option>`;
        });
        html += '</optgroup>';
    }
    
    if (ntBooks.length > 0) {
        html += '<optgroup label="New Testament">';
        ntBooks.forEach(book => {
            html += `<option value="${book}">${book} (${bookCounts[book]})</option>`;
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
            currentFilters.grouping = 'all';
            document.getElementById('bookFilter').value = 'all';
            
            applyFilters();
        });
    });
    
    // Book dropdown (handles both individual books and groupings)
    const bookFilter = document.getElementById('bookFilter');
    if (bookFilter) {
        bookFilter.addEventListener('change', () => {
            const value = bookFilter.value;
            
            // Check if it's a grouping or individual book
            if (value.startsWith('group:')) {
                currentFilters.grouping = value.replace('group:', '');
                currentFilters.book = 'all';
            } else {
                currentFilters.book = value;
                currentFilters.grouping = 'all';
            }
            
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

// Setup GRACE acronym expansion interaction
function setupAcronymExpansion() {
    const toggle = document.getElementById('graceToggle');
    if (!toggle) return;
    
    let isExpanded = false;
    let hoverTimeout = null;
    
    // Desktop: hover to expand with slight delay for stability
    toggle.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            toggle.classList.add('expanded');
            isExpanded = true;
        }, 100);
    });
    
    toggle.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            toggle.classList.remove('expanded');
            isExpanded = false;
        }, 200);
    });
    
    // Mobile: tap to toggle
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isExpanded = !isExpanded;
        toggle.classList.toggle('expanded', isExpanded);
    });
}

function applyFilters() {
    const { testament, book, grouping, status, search } = currentFilters;
    
    filteredStories = allStories.filter(story => {
        // Testament filter
        if (testament !== 'all' && story.testament !== testament) {
            return false;
        }
        
        // Grouping filter (e.g., Torah, Gospels)
        if (grouping !== 'all') {
            const booksInGroup = BOOK_GROUPINGS[grouping] || [];
            if (!booksInGroup.includes(story.book)) {
                return false;
            }
        }
        
        // Book filter
        if (book !== 'all' && story.book !== book) {
            return false;
        }
        
        // Status filter
        if (status !== 'all') {
            const isComplete = story.status_text === 'done' && story.status_image === 'done';
            if (status === 'complete' && !isComplete) return false;
            if (status === 'pending' && isComplete) return false;
        }
        
        // Search filter
        if (search) {
            const searchFields = [
                story.title,
                story.kjv_passage_ref,
                story.spread_code,
                story.book
            ].filter(Boolean).map(f => f.toLowerCase());
            
            if (!searchFields.some(field => field.includes(search))) {
                return false;
            }
        }
        
        return true;
    });
    
    renderStories();
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
    
    if (currentFilters.grouping !== 'all') {
        tags.push({ type: 'grouping', label: currentFilters.grouping });
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
    } else if (type === 'grouping') {
        currentFilters.grouping = 'all';
        document.getElementById('bookFilter').value = 'all';
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
        countEl.textContent = filteredStories.length;
    }
}

function renderStories() {
    const grid = document.getElementById('storiesGrid');
    if (!grid) return;
    
    if (filteredStories.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <p>No stories found matching your filters.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredStories.map(story => {
        const isComplete = story.status_text === 'done' && story.status_image === 'done';
        const statusClass = isComplete ? 'complete' : 'pending';
        const statusText = isComplete ? 'Complete' : 'Pending';
        const imageUrl = story.image_url || story.image_url_1;
        
        // Parse book and chapter from passage ref
        const passageRef = story.kjv_passage_ref || '';
        const bookMatch = story.book || passageRef.split(/\d/)[0]?.trim() || '';
        
        return `
            <a href="spread.html?id=${story.spread_code}" class="story-card">
                <div class="card-image">
                    ${imageUrl 
                        ? `<img src="${imageUrl}" alt="${story.title}" loading="lazy">`
                        : `<div class="placeholder">No image yet</div>`
                    }
                    <span class="card-status ${statusClass}">${statusText}</span>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${story.title || 'Untitled'}</h3>
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
    const total = allStories.length;
    const complete = allStories.filter(s => s.status_text === 'done' && s.status_image === 'done').length;
    const pending = total - complete;
    
    const completeEl = document.getElementById('completeCount');
    const pendingEl = document.getElementById('pendingCount');
    
    if (completeEl) completeEl.textContent = complete;
    if (pendingEl) pendingEl.textContent = pending;
}

// ============================================================================
// Story Page
// ============================================================================

let currentStory = null;
let storyList = [];
let showingGrid = false;

async function initStoryPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const storyId = urlParams.get('id');
    
    if (!storyId) {
        showError();
        return;
    }
    
    // Load all stories for navigation
    await loadStoryList();
    
    // Load the specific story
    await loadStory(storyId);
    
    // Setup navigation
    setupStoryNavigation();
    setupKeyboardNavigation();
    setupScrollIndicator();
}

async function loadStoryList() {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, book, start_chapter, start_verse');
        
        if (error) throw error;
        
        storyList = sortStoriesChronologically(data || []);
    } catch (err) {
        console.error('Error loading story list:', err);
        storyList = [];
    }
}

async function loadStory(storyId) {
    try {
        const { data, error } = await supabase
            .from('grahams_devotional_spreads')
            .select('*')
            .eq('spread_code', storyId)
            .single();
        
        if (error || !data) {
            showError();
            return;
        }
        
        currentStory = data;
        currentStoryIndex = storyList.findIndex(s => s.spread_code === storyId);
        
        renderStory(data);
        updateNavPosition();
        
    } catch (err) {
        console.error('Error loading story:', err);
        showError();
    }
}

function renderStory(story) {
    const container = document.getElementById('bookStory');
    const template = document.getElementById('storyTemplate');
    
    if (!container || !template) return;
    
    // Clone and populate template
    const content = template.content.cloneNode(true);
    
    // Set title
    content.getElementById('storyTitle').textContent = story.title || 'Untitled Story';
    
    // Set verse range with Bible Gateway link
    const verseRangeEl = content.getElementById('verseRange');
    verseRangeEl.textContent = story.kjv_passage_ref || '';
    const bibleGatewayUrl = getBibleGatewayUrl(story.kjv_passage_ref);
    if (bibleGatewayUrl) {
        verseRangeEl.href = bibleGatewayUrl;
    }
    
    // Set key verse (use correct database field names)
    const keyVerseTextEl = content.getElementById('keyVerseText');
    const keyVerseRefEl = content.getElementById('keyVerseRef');
    // Strip ** markdown from key verse text
    const keyVerseText = (story.kjv_key_verse_text || '').replace(/\*\*/g, '');
    if (keyVerseText) {
        keyVerseTextEl.textContent = keyVerseText;
        keyVerseRefEl.textContent = story.kjv_key_verse_ref ? `— ${story.kjv_key_verse_ref}` : '';
    } else {
        keyVerseTextEl.parentElement.style.display = 'none';
    }
    
    // Set summary text (use correct database field name: paraphrase_text)
    const summaryEl = content.getElementById('summaryText');
    if (story.paraphrase_text) {
        // Split into paragraphs if there are double line breaks
        const paragraphs = story.paraphrase_text.split(/\n\n+/).filter(p => p.trim());
        // Convert **bold** markdown to KJV quote styling
        const formattedParagraphs = paragraphs.map(p => {
            const formatted = p.trim().replace(/\*\*(.+?)\*\*/g, '<span class="kjv-quote">$1</span>');
            return `<p>${formatted}</p>`;
        });
        summaryEl.innerHTML = formattedParagraphs.join('');
    } else {
        summaryEl.innerHTML = '<p class="placeholder"><em>Summary not yet generated</em></p>';
    }
    
    // Set footer info
    content.getElementById('storyCode').textContent = story.spread_code || '';
    content.getElementById('batchInfo').textContent = story.spread_code || '';
    
    // Clear and render
    container.innerHTML = '';
    container.appendChild(content);
    
    // Render images
    renderImages(story);
    
    // Update page title
    document.title = `${story.title || 'Story'} | The GRACE Bible`;
}

function renderImages(story) {
    const container = document.getElementById('imageContainer');
    if (!container) return;
    
    // Collect available candidate images
    const candidateImages = [
        story.image_url_1,
        story.image_url_2,
        story.image_url_3,
        story.image_url_4
    ];
    const hasCandidates = candidateImages.some(url => url && url.trim());
    const hasPrimary = story.image_url && story.image_url.trim();
    
    // Check if we should show grid or single image
    if (!hasPrimary && !hasCandidates) {
        container.innerHTML = `
            <div class="placeholder" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-charcoal-light);">
                <em>No images generated</em>
            </div>
        `;
        return;
    }
    
    // Default to single image view if there's a primary selected
    if (hasPrimary && !showingGrid) {
        renderSingleImage(container, story.image_url, story.title, hasCandidates);
    } else if (hasCandidates) {
        renderImageGrid(container, candidateImages, story.image_url);
    } else {
        renderSingleImage(container, story.image_url, story.title, false);
    }
}

function renderSingleImage(container, imageUrl, title, canExpand) {
    const template = document.getElementById('singleImageTemplate');
    if (!template) {
        container.innerHTML = `<div class="single-image"><img src="${imageUrl}" alt="${title}"></div>`;
        return;
    }
    
    const content = template.content.cloneNode(true);
    const img = content.getElementById('selectedImage');
    img.src = imageUrl;
    img.alt = title || 'Story illustration';
    
    container.innerHTML = '';
    container.appendChild(content);
    
    // Setup expand button
    const expandBtn = document.getElementById('expandOptionsBtn');
    if (expandBtn && canExpand) {
        expandBtn.style.display = 'flex';
        expandBtn.addEventListener('click', () => {
            showingGrid = true;
            renderImages(currentStory);
        });
    } else if (expandBtn) {
        expandBtn.style.display = 'none';
    }
}

function renderImageGrid(container, candidateImages, primaryImageUrl) {
    const template = document.getElementById('gridImageTemplate');
    if (!template) return;
    
    const content = template.content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(content);
    
    // Update header text if we have a primary already
    const selectionTitle = container.querySelector('.selection-title');
    const collapseBtn = document.getElementById('collapseBtn');
    
    if (primaryImageUrl && selectionTitle) {
        selectionTitle.textContent = 'Change Primary Image';
        if (collapseBtn) {
            collapseBtn.style.display = 'flex';
            collapseBtn.addEventListener('click', () => {
                showingGrid = false;
                renderImages(currentStory);
            });
        }
    }
    
    // Populate images
    const gridImages = container.querySelectorAll('.grid-image');
    gridImages.forEach((gridImage, index) => {
        const img = gridImage.querySelector('img');
        const imageUrl = candidateImages[index];
        
        if (imageUrl && imageUrl.trim()) {
            img.src = imageUrl;
            img.alt = `${currentStory?.title || 'Story'} - Option ${index + 1}`;
            
            // Mark current primary
            const isCurrentPrimary = primaryImageUrl && imageUrl === primaryImageUrl;
            if (isCurrentPrimary) {
                gridImage.classList.add('is-primary');
            }
            
            // Update overlay text for current primary
            const selectLabel = gridImage.querySelector('.select-label');
            if (selectLabel && isCurrentPrimary) {
                selectLabel.textContent = 'Keep as Primary';
            }
            
            // Click to select as primary (on the whole card, but not the regen button)
            gridImage.addEventListener('click', (e) => {
                if (!e.target.closest('.regen-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    selectPrimaryImage(imageUrl);
                }
            });
        } else {
            gridImage.style.display = 'none';
        }
    });
    
    // Setup regeneration buttons
    setupRegenerationButtons();
}

async function selectPrimaryImage(imageUrl) {
    if (!currentStory) return;
    
    // Skip if this image is already the primary
    if (currentStory.image_url === imageUrl) {
        showToast('This image is already selected');
        showingGrid = false;
        renderImages(currentStory);
        return;
    }
    
    try {
        const { error } = await supabase
            .from('grahams_devotional_spreads')
            .update({ image_url: imageUrl })
            .eq('spread_code', currentStory.spread_code);
        
        if (error) throw error;
        
        // Update local state
        currentStory.image_url = imageUrl;
        
        // Show toast
        showToast('✓ Primary image updated');
        
        // Switch to single view
        showingGrid = false;
        renderImages(currentStory);
        
    } catch (err) {
        console.error('Error saving primary image:', err);
        showToast('Error saving selection', true);
    }
}

function setupRegenerationButtons() {
    const regenBtns = document.querySelectorAll('.regen-btn');
    regenBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(btn.dataset.slot);
            triggerRegeneration(slot);
        });
    });
}

// ============================================================================
// Image Regeneration
// ============================================================================

let activeRegenerationRequest = null;
let regenerationPollInterval = null;
let countdownInterval = null;
let countdownStartTime = null;

// Estimated regeneration time in seconds (based on execution 815: 86s, rounded up)
const ESTIMATED_REGEN_TIME = 90;

// Stage definitions for countdown display
const REGEN_STAGES = [
    { maxSeconds: 15, text: 'Analyzing passage...' },
    { maxSeconds: 30, text: 'Generating prompts...' },
    { maxSeconds: 80, text: 'Creating images...' },
    { maxSeconds: 90, text: 'Finalizing...' }
];

async function triggerRegeneration(slot) {
    if (!currentStory) {
        showToast('No story loaded', true);
        return;
    }
    
    const spreadCode = currentStory.spread_code;
    
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
    
    // Start the countdown timer
    startCountdown();
}

function startCountdown() {
    countdownStartTime = Date.now();
    const circumference = 2 * Math.PI * 45; // radius = 45
    
    // Update immediately, then every second
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
    
    function updateCountdown() {
        const elapsed = (Date.now() - countdownStartTime) / 1000;
        const remaining = Math.max(0, ESTIMATED_REGEN_TIME - elapsed);
        const progress = Math.min(1, elapsed / ESTIMATED_REGEN_TIME);
        
        // Update progress ring
        const ring = document.getElementById('progressRingFill');
        if (ring) {
            ring.style.strokeDashoffset = circumference * (1 - progress);
        }
        
        // Update countdown text
        const countdownText = document.getElementById('countdownText');
        if (countdownText) {
            if (remaining > 0) {
                const mins = Math.floor(remaining / 60);
                const secs = Math.ceil(remaining % 60);
                countdownText.textContent = `~${mins}:${secs.toString().padStart(2, '0')}`;
            } else {
                countdownText.textContent = '...';
            }
        }
        
        // Update stage text
        const stageText = document.getElementById('stageText');
        if (stageText) {
            if (elapsed > ESTIMATED_REGEN_TIME) {
                stageText.textContent = 'Almost ready...';
                stageText.classList.add('overtime');
            } else {
                const stage = REGEN_STAGES.find(s => elapsed < s.maxSeconds) || REGEN_STAGES[REGEN_STAGES.length - 1];
                stageText.textContent = stage.text;
                stageText.classList.remove('overtime');
            }
        }
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

function showRegenerationOptions(optionUrls, slot, requestId) {
    // Stop the countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Hide countdown container, show options grid
    const countdownContainer = document.getElementById('countdownContainer');
    const optionsGrid = document.getElementById('newImageOptionsGrid');
    
    if (countdownContainer) countdownContainer.style.display = 'none';
    if (!optionsGrid) return;
    
    optionsGrid.style.display = 'grid';
    
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
    if (!currentStory || !imageUrl) return;
    
    const spreadCode = currentStory.spread_code;
    
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
        currentStory[updateField] = imageUrl;
        
        showToast(`✓ Image ${slot} replaced`);
        hideRegenerationModal();
        
        // Re-render the images
        showingGrid = true;
        renderImages(currentStory);
        
    } catch (err) {
        console.error('Error confirming regeneration:', err);
        showToast('Error saving new image', true);
    }
}

function cancelRegeneration() {
    // Clear all intervals
    if (regenerationPollInterval) {
        clearInterval(regenerationPollInterval);
        regenerationPollInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
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
    // Clear countdown interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    activeRegenerationRequest = null;
}

function showError() {
    const container = document.getElementById('bookStory');
    const template = document.getElementById('errorTemplate');
    
    if (container && template) {
        container.innerHTML = '';
        container.appendChild(template.content.cloneNode(true));
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast?.querySelector('.toast-icon');
    
    if (!toast) return;
    
    if (toastMessage) toastMessage.textContent = message;
    if (toastIcon) {
        toastIcon.textContent = isError ? '✕' : '✓';
        toastIcon.style.background = isError ? '#F44336' : '#4CAF50';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function setupStoryNavigation() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateStory(-1));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateStory(1));
    }
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            navigateStory(-1);
        } else if (e.key === 'ArrowRight') {
            navigateStory(1);
        } else if (e.key === 'Escape') {
            window.location.href = 'index.html';
        }
    });
}

function navigateStory(direction) {
    const newIndex = currentStoryIndex + direction;
    
    if (newIndex >= 0 && newIndex < storyList.length) {
        const newStory = storyList[newIndex];
        window.location.href = `spread.html?id=${newStory.spread_code}`;
    }
}

function updateNavPosition() {
    const posEl = document.getElementById('navPosition');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (posEl && storyList.length > 0) {
        posEl.textContent = `${currentStoryIndex + 1} / ${storyList.length}`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = currentStoryIndex <= 0;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentStoryIndex >= storyList.length - 1;
    }
}

function setupScrollIndicator() {
    const rightPage = document.getElementById('rightPage');
    const indicator = document.getElementById('scrollIndicator');
    
    if (!rightPage || !indicator) return;
    
    // Show indicator if content is scrollable
    const checkScroll = () => {
        const isScrollable = rightPage.scrollHeight > rightPage.clientHeight;
        const isAtBottom = rightPage.scrollTop + rightPage.clientHeight >= rightPage.scrollHeight - 20;
        
        indicator.classList.toggle('visible', isScrollable && !isAtBottom);
        rightPage.classList.toggle('scrolled', rightPage.scrollTop > 10);
    };
    
    rightPage.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    
    // Initial check
    setTimeout(checkScroll, 100);
}

// ============================================================================
// Utilities
// ============================================================================

function getBibleGatewayUrl(passageRef) {
    if (!passageRef) return null;
    const encoded = encodeURIComponent(passageRef);
    return `https://www.biblegateway.com/passage/?search=${encoded}&version=NIV`;
}

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