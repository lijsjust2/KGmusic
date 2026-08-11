import { defineStore } from 'pinia';

export const useSearchStore = defineStore('search', {
    state: () => ({
        searchQuery: '',
        searchResults: [],
        searchType: 'song',
        currentPage: 1,
        totalPages: 1,
        pageSize: 30,
        hasSearched: false,
        lastSearchTime: null,
    }),
    actions: {
        setSearchQuery(query) {
            this.searchQuery = query;
        },
        setSearchResults(results) {
            this.searchResults = results;
            this.hasSearched = true;
            this.lastSearchTime = Date.now();
        },
        setSearchType(type) {
            this.searchType = type;
        },
        setCurrentPage(page) {
            this.currentPage = page;
        },
        setTotalPages(total) {
            this.totalPages = total;
        },
        setPageSize(size) {
            this.pageSize = size;
        },
        clearSearch() {
            this.searchQuery = '';
            this.searchResults = [];
            this.hasSearched = false;
            this.currentPage = 1;
            this.totalPages = 1;
        },
    },
    persist: {
        enabled: true,
        strategies: [
            {
                key: 'searchState',
                storage: sessionStorage,
                paths: ['searchQuery', 'searchResults', 'searchType', 'currentPage', 'totalPages', 'pageSize', 'hasSearched', 'lastSearchTime'],
            },
        ],
    },
});
