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
// Story Page (stub for spread.html)
// ============================================================================

async function initStoryPage() {
    // Story page initialization handled in spread.html
}

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